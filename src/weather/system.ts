import type { Group } from 'three';
import type { AppState } from '../app/types';
import { AudioEngine } from '../audio/audioEngine';
import { GridWorld } from '../world/grid';
import { CloudSystem } from './cloudSystem';
import { LightningSystem } from './lightningSystem';
import { RainSystem } from './rainSystem';
import { TornadoSystem, type TornadoView } from './tornadoSystem';

const SIREN_RADIUS_TILES = 8;
const GAME_HOURS_PER_SECOND = 0.35;

export interface DestructionTile {
  x: number;
  z: number;
}

export interface WeatherUpdateResult {
  tornadoes: TornadoView[];
  sirenActive: boolean;
  dayTimeHours: number;
  destructionPath: DestructionTile[];
  destructionChanged: boolean;
  treesChanged: boolean;
  buildingsChanged: boolean;
}

export class WeatherSystem {
  private readonly rain: RainSystem;
  private readonly clouds: CloudSystem;
  private readonly lightning: LightningSystem;
  private readonly tornadoes: TornadoSystem;

  private sirenHold = 0;
  private dayTimeHours = 9;

  private readonly destroyedTileSet = new Set<number>();
  private readonly destroyedTiles: DestructionTile[] = [];

  constructor(
    private readonly world: GridWorld,
    parent: Group,
    private readonly audio: AudioEngine,
    private readonly onToast: (message: string) => void,
    private readonly onLightningFlash: (durationSeconds: number) => void
  ) {
    this.rain = new RainSystem(parent);
    this.clouds = new CloudSystem(world, parent);
    this.lightning = new LightningSystem();
    this.tornadoes = new TornadoSystem(world, parent);
  }

  spawnManualTornado(x?: number, z?: number): void {
    this.tornadoes.spawnManual(x, z);
    this.onToast('Tornado warning!');
  }

  reset(): void {
    this.tornadoes.clear();
    this.destroyedTileSet.clear();
    this.destroyedTiles.length = 0;
    this.sirenHold = 0;
    this.audio.setRainIntensity(0);
    this.audio.setSirenActive(false);
  }

  update(dt: number, state: Readonly<AppState>, centerX: number, centerZ: number): WeatherUpdateResult {
    const scaledDt = dt * state.timeScale;

    const cloudDt = state.playing ? dt : 0;
    this.clouds.update(cloudDt, this.dayTimeHours, state.intensity);

    if (!state.playing) {
      this.audio.setRainIntensity(0);
      this.audio.setSirenActive(false);
      return {
        tornadoes: [],
        sirenActive: false,
        dayTimeHours: this.dayTimeHours,
        destructionPath: this.destroyedTiles,
        destructionChanged: false,
        treesChanged: false,
        buildingsChanged: false
      };
    }

    this.dayTimeHours = (this.dayTimeHours + scaledDt * GAME_HOURS_PER_SECOND) % 24;

    const rainIntensity = state.intensity;

    this.rain.update({
      centerX,
      centerZ,
      areaSize: 18,
      intensity: rainIntensity,
      dt: scaledDt,
      sampleGroundHeight: (x, z) => this.world.sampleHeightAtWorld(x, z)
    });

    this.lightning.update(scaledDt, true, state.intensity, {
      onFlash: (duration) => {
        this.onLightningFlash(duration);
      },
      onThunder: (strength) => {
        this.audio.triggerThunder(strength);
      }
    });

    const tornadoViews = this.tornadoes.update(scaledDt, state.intensity, true, () => {
      this.onToast('Tornado warning!');
    });

    const destruction = this.markDestructionPath(tornadoViews);
    const nearTown = this.isAnyTornadoNearTown(tornadoViews);

    if (nearTown) {
      this.sirenHold = 3;
    } else {
      this.sirenHold = Math.max(0, this.sirenHold - scaledDt);
    }

    const sirenActive = this.sirenHold > 0;

    this.audio.setRainIntensity(rainIntensity);
    this.audio.setSirenActive(sirenActive);

    return {
      tornadoes: tornadoViews,
      sirenActive,
      dayTimeHours: this.dayTimeHours,
      destructionPath: this.destroyedTiles,
      destructionChanged: destruction.changed,
      treesChanged: destruction.treesChanged,
      buildingsChanged: destruction.buildingsChanged
    };
  }

  dispose(): void {
    this.rain.dispose();
    this.clouds.dispose();
    this.tornadoes.clear();
  }

  private markDestructionPath(tornadoViews: TornadoView[]): {
    changed: boolean;
    treesChanged: boolean;
    buildingsChanged: boolean;
  } {
    let changed = false;
    let treesChanged = false;
    let buildingsChanged = false;
    const destroyedBuildingIds = new Set<string>();

    for (const tornado of tornadoViews) {
      const centerTile = this.world.worldToTile(tornado.x, tornado.z);
      if (!centerTile) {
        continue;
      }

      const radiusTiles = Math.max(1, Math.ceil((tornado.radius * 0.72) / this.world.tileSize));

      for (let dz = -radiusTiles; dz <= radiusTiles; dz += 1) {
        for (let dx = -radiusTiles; dx <= radiusTiles; dx += 1) {
          const tx = centerTile.x + dx;
          const tz = centerTile.z + dz;
          if (!this.world.inBounds(tx, tz)) {
            continue;
          }

          const tileWorld = this.world.tileToWorld(tx, tz);
          const ddx = tileWorld.x - tornado.x;
          const ddz = tileWorld.z - tornado.z;
          const distance = Math.sqrt(ddx * ddx + ddz * ddz);
          if (distance > tornado.radius * 0.78) {
            continue;
          }

          const idx = this.world.index(tx, tz);
          if (!this.destroyedTileSet.has(idx)) {
            this.destroyedTileSet.add(idx);
            this.destroyedTiles.push({ x: tx, z: tz });
            changed = true;
          }

          if (this.world.removeTreeAt(tx, tz)) {
            treesChanged = true;
          }

          const occupantId = this.world.getTile(tx, tz)?.occupantId;
          if (occupantId) {
            destroyedBuildingIds.add(occupantId);
          }
        }
      }
    }

    for (const buildingId of destroyedBuildingIds) {
      if (!this.world.buildings.has(buildingId)) {
        continue;
      }
      this.world.clearOccupant(buildingId);
      this.world.buildings.delete(buildingId);
      buildingsChanged = true;
    }

    return { changed, treesChanged, buildingsChanged };
  }

  private isAnyTornadoNearTown(tornadoViews: TornadoView[]): boolean {
    if (tornadoViews.length === 0 || this.world.buildings.size === 0) {
      return false;
    }

    const radiusWorld = SIREN_RADIUS_TILES * this.world.tileSize;

    for (const tornado of tornadoViews) {
      for (const building of this.world.buildings.values()) {
        const center = this.world.tileToWorld(
          building.originX + building.width * 0.5 - 0.5,
          building.originZ + building.depth * 0.5 - 0.5
        );

        const dx = center.x - tornado.x;
        const dz = center.z - tornado.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= radiusWorld + tornado.radius) {
          return true;
        }
      }
    }

    return false;
  }
}
