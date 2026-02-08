import type { Intersection, Object3D } from 'three';
import { AudioEngine } from '../audio/audioEngine';
import { SceneRig } from '../render/scene';
import { WorldView } from '../render/worldView';
import { OverlayUI } from '../ui/overlay';
import { ToastManager } from '../ui/toast';
import { GridWorld } from '../world/grid';
import { PlacementController } from '../world/placement';
import { WeatherSystem } from '../weather/system';
import { AppStore } from './store';
import type { BuildTool } from './types';
import { loadFromStorage, saveToStorage } from './storage';

const WORLD_WIDTH = 32;
const WORLD_DEPTH = 32;
const TILE_SIZE = 1;

interface HoveredTile {
  x: number;
  z: number;
}

export class GameApp {
  private readonly store = new AppStore();
  private readonly audio = new AudioEngine();
  private readonly sceneRig: SceneRig;

  private world: GridWorld;
  private placement: PlacementController;
  private worldView: WorldView;
  private weather: WeatherSystem;

  private readonly toast: ToastManager;
  private readonly ui: OverlayUI;

  private hoveredTile: HoveredTile | null = null;
  private pointerDown = false;
  private dragged = false;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerLastX = 0;
  private pointerLastY = 0;

  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private lastPinchDistance = 0;

  private frameHandle = 0;
  private lastFrameTime = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, toastRoot: HTMLElement) {
    this.sceneRig = new SceneRig(canvas);
    this.toast = new ToastManager(toastRoot);
    const saved = loadFromStorage();
    const worldSeed = saved?.world.seed ?? Math.floor(Math.random() * 1000000);

    this.world = new GridWorld({
      width: WORLD_WIDTH,
      depth: WORLD_DEPTH,
      tileSize: TILE_SIZE,
      seed: worldSeed
    });

    this.placement = new PlacementController(this.world);
    this.worldView = new WorldView(this.world);
    this.sceneRig.worldRoot.add(this.worldView.root);

    this.weather = new WeatherSystem(
      this.world,
      this.sceneRig.weatherRoot,
      this.audio,
      (message) => this.toast.show(message),
      (duration) => this.sceneRig.triggerLightningFlash(duration)
    );

    this.restoreWorld(saved);

    this.ui = new OverlayUI(uiRoot, {
      onPlayPause: () => {
        const nextPlaying = !this.store.getState().playing;
        this.store.update({ playing: nextPlaying });
        if (nextPlaying) {
          void this.audio.ensureReady();
        }
      },
      onVolumeChange: (volumePercent) => {
        const clampedPercent = Math.max(0, Math.min(100, volumePercent));
        this.store.update({ masterVolume: clampedPercent / 100 });
      },
      onNewWorld: () => {
        this.createNewWorld();
      },
      onSpawnTornado: () => {
        if (this.hoveredTile) {
          const pos = this.world.tileToWorld(this.hoveredTile.x, this.hoveredTile.z);
          this.weather.spawnManualTornado(pos.x, pos.z);
        } else {
          this.weather.spawnManualTornado();
        }
      }
    });

    this.bindStore();
    this.bindInteractions(canvas);

    this.sceneRig.setTarget(0, 0, 0);
    this.onResize();

    window.addEventListener('resize', this.onResize);

    this.lastFrameTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  destroy(): void {
    cancelAnimationFrame(this.frameHandle);

    window.removeEventListener('resize', this.onResize);

    this.worldView.dispose();
    this.weather.dispose();
    this.audio.dispose();
  }

  private bindStore(): void {
    this.store.subscribe((state) => {
      this.ui.update(state);
      this.audio.setEnabled(state.audioEnabled);
      this.audio.setPaused(!state.playing);
      this.audio.setMasterVolume(state.masterVolume);
      this.audio.setSirenMode(state.sirenMode);

      if (state.mode !== 'build') {
        this.hoveredTile = null;
        this.worldView.clearHover();
      }
    });
  }

  private bindInteractions(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.sceneRig.zoomBy(event.deltaY);
    });

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);

      this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.touchPoints.size >= 2) {
        this.lastPinchDistance = this.computePinchDistance();
      }

      this.pointerDown = true;
      this.dragged = false;
      this.pointerStartX = event.clientX;
      this.pointerStartY = event.clientY;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;

      this.updateHoverFromPointer(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (this.touchPoints.has(event.pointerId)) {
        this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (this.touchPoints.size >= 2) {
        const pinchDistance = this.computePinchDistance();
        if (this.lastPinchDistance > 0) {
          const delta = pinchDistance - this.lastPinchDistance;
          if (Math.abs(delta) > 1) {
            this.sceneRig.zoomBy(delta > 0 ? -1 : 1);
          }
        }
        this.lastPinchDistance = pinchDistance;
        this.dragged = true;
        return;
      }

      const movedX = event.clientX - this.pointerStartX;
      const movedY = event.clientY - this.pointerStartY;
      const moveLength = Math.hypot(movedX, movedY);

      if (this.pointerDown && moveLength > 5) {
        const deltaX = event.clientX - this.pointerLastX;
        const deltaY = event.clientY - this.pointerLastY;
        this.sceneRig.panByScreenDelta(deltaX, deltaY);
        this.dragged = true;
      }

      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;

      this.updateHoverFromPointer(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointerup', (event) => {
      this.touchPoints.delete(event.pointerId);
      if (this.touchPoints.size < 2) {
        this.lastPinchDistance = 0;
      }

      const shouldPlace =
        !this.dragged &&
        this.store.getState().mode === 'build' &&
        this.hoveredTile !== null &&
        event.button === 0;

      if (shouldPlace && this.hoveredTile) {
        this.applyPlacement(this.store.getState().buildTool, this.hoveredTile.x, this.hoveredTile.z);
      }

      this.pointerDown = false;
      this.dragged = false;
    });

    canvas.addEventListener('pointercancel', (event) => {
      this.touchPoints.delete(event.pointerId);
      this.pointerDown = false;
      this.dragged = false;
      this.lastPinchDistance = 0;
    });
  }

  private updateHoverFromPointer(clientX: number, clientY: number): void {
    const state = this.store.getState();
    if (state.mode !== 'build') {
      this.hoveredTile = null;
      this.worldView.clearHover();
      return;
    }

    const hit = this.sceneRig.raycast(clientX, clientY, this.worldView.terrainMesh as Object3D);
    if (!hit) {
      this.hoveredTile = null;
      this.worldView.clearHover();
      return;
    }

    const tile = this.pickTileFromIntersection(hit);
    if (!tile) {
      this.hoveredTile = null;
      this.worldView.clearHover();
      return;
    }

    this.hoveredTile = tile;
    const valid = this.isValidForTool(state.buildTool, tile.x, tile.z);
    this.worldView.setHoverTile(tile.x, tile.z, valid);
  }

  private pickTileFromIntersection(hit: Intersection<Object3D>): HoveredTile | null {
    const point = hit.point;
    return this.world.worldToTile(point.x, point.z);
  }

  private isValidForTool(tool: BuildTool, x: number, z: number): boolean {
    const tile = this.world.getTile(x, z);
    if (!tile) {
      return false;
    }

    if (tool === 'house') {
      return tile.type === 'grass' && !tile.occupantId;
    }

    if (tool === 'road') {
      return tile.type === 'grass' && !tile.occupantId;
    }

    if (tool === 'erase') {
      return tile.type === 'road' || !!tile.occupantId;
    }

    return false;
  }

  private applyPlacement(tool: BuildTool, x: number, z: number): void {
    const result = this.placement.apply(tool, x, z);
    if (result.message) {
      this.toast.show(result.message);
    }

    if (!result.changed) {
      return;
    }

    this.worldView.rebuildRoads();
    this.worldView.syncTrees();
    this.worldView.syncBuildings();
    this.persistWorld();
  }

  private createNewWorld(): void {
    const oldRoot = this.worldView.root;
    this.sceneRig.worldRoot.remove(oldRoot);
    this.worldView.dispose();

    this.weather.dispose();

    this.world = new GridWorld({
      width: WORLD_WIDTH,
      depth: WORLD_DEPTH,
      tileSize: TILE_SIZE,
      seed: Math.floor(Math.random() * 1000000)
    });

    this.placement = new PlacementController(this.world);
    this.worldView = new WorldView(this.world);
    this.sceneRig.worldRoot.add(this.worldView.root);

    this.weather = new WeatherSystem(
      this.world,
      this.sceneRig.weatherRoot,
      this.audio,
      (message) => this.toast.show(message),
      (duration) => this.sceneRig.triggerLightningFlash(duration)
    );

    this.hoveredTile = null;
    this.persistWorld();
    this.toast.show('Generated a new world.');
  }

  private persistWorld(): void {
    saveToStorage({ world: this.world.toSnapshot() });
  }

  private restoreWorld(saved: ReturnType<typeof loadFromStorage>): void {
    if (!saved) {
      return;
    }

    this.world.applySnapshot(saved.world);
    this.worldView.rebuildRoads();
    this.worldView.rebuildWater();
    this.worldView.syncTrees();
    this.worldView.syncBuildings();
  }

  private computePinchDistance(): number {
    const values = [...this.touchPoints.values()];
    if (values.length < 2) {
      return 0;
    }

    const a = values[0];
    const b = values[1];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private readonly onFrame = (time: number): void => {
    const dt = Math.min(0.05, (time - this.lastFrameTime) * 0.001);
    this.lastFrameTime = time;

    const state = this.store.getState();

    const target = this.sceneRig.getTarget();
    const weatherResult = this.weather.update(dt, state, target.x, target.z);

    if (weatherResult.destructionChanged) {
      this.worldView.setDestructionPath(weatherResult.destructionPath);
    }

    if (weatherResult.treesChanged) {
      this.worldView.syncTrees();
    }
    if (weatherResult.buildingsChanged) {
      this.worldView.syncBuildings();
    }
    if (weatherResult.treesChanged || weatherResult.buildingsChanged) {
      this.persistWorld();
    }

    this.sceneRig.setTimeOfDay(weatherResult.dayTimeHours);
    this.ui.setClock(weatherResult.dayTimeHours);

    this.worldView.applyBuildingShake(weatherResult.tornadoes, dt);

    this.audio.update(dt);
    this.sceneRig.update(dt);
    this.sceneRig.render();

    this.frameHandle = requestAnimationFrame(this.onFrame);
  };

  private readonly onResize = (): void => {
    this.sceneRig.resize(window.innerWidth, window.innerHeight);
  };
}

export function boot(canvas: HTMLCanvasElement, uiRoot: HTMLElement, toastRoot: HTMLElement): GameApp {
  return new GameApp(canvas, uiRoot, toastRoot);
}
