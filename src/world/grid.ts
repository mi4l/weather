import { hashSeed, SeededRng } from '../utils/random';
import type { BuildingRecord, Tile, TileType, TreeRecord, WorldSnapshot } from './types';

export interface GridConfig {
  width: number;
  depth: number;
  tileSize: number;
  seed: number;
}

interface HillFeature {
  x: number;
  z: number;
  radius: number;
  height: number;
}

const HEIGHT_AMPLITUDE = 0.32;
const HEIGHT_MIN = -0.62;
const HEIGHT_MAX = 1.2;
const WATER_LEVEL = -0.18;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashNoise2d(seed: number, x: number, z: number): number {
  const value = hashSeed(seed, x, z);
  return (value & 0xfffffff) / 0xfffffff;
}

function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;

  const n00 = hashNoise2d(seed, x0, z0);
  const n10 = hashNoise2d(seed, x0 + 1, z0);
  const n01 = hashNoise2d(seed, x0, z0 + 1);
  const n11 = hashNoise2d(seed, x0 + 1, z0 + 1);

  const sx = smoothstep(xf);
  const sz = smoothstep(zf);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;

  return ix0 + (ix1 - ix0) * sz;
}

function layeredNoise(seed: number, x: number, z: number): number {
  const frequencyA = 0.21;
  const frequencyB = 0.53;
  const frequencyC = 1.19;

  const a = valueNoise(seed, x * frequencyA, z * frequencyA) * 0.62;
  const b = valueNoise(seed ^ 0x9e3779b9, x * frequencyB, z * frequencyB) * 0.28;
  const c = valueNoise(seed ^ 0x7f4a7c15, x * frequencyC, z * frequencyC) * 0.1;

  const normalized = a + b + c;
  const shifted = normalized - 0.5;
  return shifted * HEIGHT_AMPLITUDE * 2;
}

export class GridWorld {
  readonly width: number;
  readonly depth: number;
  readonly tileSize: number;
  readonly seed: number;

  readonly tiles: Tile[];
  readonly heightField: Float32Array;
  readonly buildings = new Map<string, BuildingRecord>();
  readonly trees = new Map<string, TreeRecord>();

  private readonly treeByTile = new Map<number, string>();
  private readonly baseTileTypes: TileType[] = [];
  private readonly baseTrees: TreeRecord[] = [];

  private readonly streamBaseZ: number;
  private readonly streamAmplitude: number;
  private readonly streamFrequency: number;
  private readonly streamPhase: number;
  private readonly streamHalfWidth: number;
  private readonly hills: HillFeature[];

  constructor(config: GridConfig) {
    this.width = config.width;
    this.depth = config.depth;
    this.tileSize = config.tileSize;
    this.seed = config.seed;

    const featureRng = new SeededRng(hashSeed(this.seed, 0x29f3a6d1));
    this.streamBaseZ = this.depth * featureRng.range(0.35, 0.62);
    this.streamAmplitude = this.depth * featureRng.range(0.09, 0.16);
    this.streamFrequency = featureRng.range(0.95, 1.55);
    this.streamPhase = featureRng.range(0, Math.PI * 2);
    this.streamHalfWidth = featureRng.range(0.85, 1.45);
    this.hills = this.createHillFeatures(featureRng);

    this.heightField = new Float32Array((this.width + 1) * (this.depth + 1));
    this.fillHeightField();
    this.tiles = new Array(this.width * this.depth);
    this.fillTiles();
    this.applyStreamWater();
    this.generateTrees();
    this.captureBaseState();
  }

  private createHillFeatures(rng: SeededRng): HillFeature[] {
    const hills: HillFeature[] = [];

    const hillCount = rng.int(3, 5);
    for (let i = 0; i < hillCount; i += 1) {
      let attempts = 0;
      while (attempts < 8) {
        attempts += 1;
        const x = rng.range(this.width * 0.1, this.width * 0.9);
        const z = rng.range(this.depth * 0.1, this.depth * 0.9);
        if (Math.abs(z - this.streamCenterAt(x)) < this.depth * 0.12) {
          continue;
        }

        hills.push({
          x,
          z,
          radius: rng.range(4.5, 9.8),
          height: rng.range(0.22, 0.55)
        });
        break;
      }
    }

    return hills;
  }

  private streamCenterAt(gridX: number): number {
    const normalizedX = gridX / this.width;

    const majorWave =
      Math.sin(normalizedX * Math.PI * this.streamFrequency + this.streamPhase) * this.streamAmplitude;
    const minorWave =
      Math.sin(normalizedX * Math.PI * this.streamFrequency * 2.8 + this.streamPhase * 0.68) *
      this.depth *
      0.035;

    return this.streamBaseZ + majorWave + minorWave;
  }

  private fillHeightField(): void {
    const streamInfluenceWidth = this.streamHalfWidth * 3.4;

    for (let z = 0; z <= this.depth; z += 1) {
      for (let x = 0; x <= this.width; x += 1) {
        let height = layeredNoise(this.seed, x, z);

        for (const hill of this.hills) {
          const dx = x - hill.x;
          const dz = z - hill.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          if (distance >= hill.radius) {
            continue;
          }
          const influence = 1 - distance / hill.radius;
          height += hill.height * influence * influence;
        }

        const streamDistance = Math.abs(z - this.streamCenterAt(x));
        if (streamDistance < streamInfluenceWidth) {
          const influence = 1 - streamDistance / streamInfluenceWidth;
          height -= 0.56 * influence * influence;
        }

        const idx = this.vertexIndex(x, z);
        this.heightField[idx] = clamp(height, HEIGHT_MIN, HEIGHT_MAX);
      }
    }
  }

  private fillTiles(): void {
    for (let z = 0; z < this.depth; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const idx = this.index(x, z);
        const h =
          (this.vertexHeight(x, z) +
            this.vertexHeight(x + 1, z) +
            this.vertexHeight(x, z + 1) +
            this.vertexHeight(x + 1, z + 1)) /
          4;

        this.tiles[idx] = {
          type: 'grass',
          height: h,
          occupantId: null,
          treeId: null
        };
      }
    }
  }

  private applyStreamWater(): void {
    for (let z = 0; z < this.depth; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const tile = this.getTile(x, z);
        if (!tile) {
          continue;
        }

        const centerX = x + 0.5;
        const centerZ = z + 0.5;
        const streamDistance = Math.abs(centerZ - this.streamCenterAt(centerX));

        const bankJitter = hashNoise2d(hashSeed(this.seed, 0x734a5f1), x, z) * 0.34;
        const localWidth = this.streamHalfWidth + bankJitter;

        if (streamDistance <= localWidth && tile.height < WATER_LEVEL + 0.22) {
          tile.type = 'water';
        }
      }
    }
  }

  private generateTrees(): void {
    this.clearTrees();

    const rng = new SeededRng(hashSeed(this.seed, 0x51d3ac9));

    for (let z = 0; z < this.depth; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const tile = this.getTile(x, z);
        if (!tile || tile.type !== 'grass') {
          continue;
        }

        const streamDistance = Math.abs(z + 0.5 - this.streamCenterAt(x + 0.5));
        if (streamDistance < this.streamHalfWidth + 1.4) {
          continue;
        }

        const slope = this.estimateTileSlope(x, z);
        if (slope > 0.34) {
          continue;
        }

        const elevationBias = Math.max(0, tile.height + 0.08) * 0.12;
        const chance = 0.075 + elevationBias - slope * 0.11;

        if (rng.next() > chance) {
          continue;
        }

        const tree: TreeRecord = {
          id: `t-${x}-${z}`,
          x,
          z,
          trunkHeight: rng.range(0.3, 0.56),
          crownHeight: rng.range(0.52, 0.96),
          crownRadius: rng.range(0.34, 0.58),
          hueOffset: rng.range(-0.09, 0.09)
        };

        this.addTree(tree);
      }
    }
  }

  private estimateTileSlope(x: number, z: number): number {
    const center = this.getTile(x, z)?.height ?? 0;

    const neighbors: Array<[number, number]> = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1]
    ];

    let maxDiff = 0;
    for (const [nx, nz] of neighbors) {
      const neighbor = this.getTile(nx, nz);
      if (!neighbor) {
        continue;
      }
      maxDiff = Math.max(maxDiff, Math.abs(center - neighbor.height));
    }

    return maxDiff;
  }

  private cloneTree(tree: TreeRecord): TreeRecord {
    return { ...tree };
  }

  private captureBaseState(): void {
    this.baseTileTypes.length = 0;
    this.baseTileTypes.push(...this.tiles.map((tile) => tile.type));

    this.baseTrees.length = 0;
    for (const tree of this.trees.values()) {
      this.baseTrees.push(this.cloneTree(tree));
    }
  }

  private addTree(tree: TreeRecord): void {
    if (!this.inBounds(tree.x, tree.z)) {
      return;
    }

    const tile = this.getTile(tree.x, tree.z);
    if (!tile || tile.type !== 'grass' || tile.occupantId) {
      return;
    }

    const idx = this.index(tree.x, tree.z);
    const existingId = this.treeByTile.get(idx);
    if (existingId) {
      this.trees.delete(existingId);
      this.treeByTile.delete(idx);
    }

    tile.treeId = tree.id;
    this.treeByTile.set(idx, tree.id);
    this.trees.set(tree.id, tree);
  }

  private clearTrees(): void {
    for (const tile of this.tiles) {
      tile.treeId = null;
    }
    this.trees.clear();
    this.treeByTile.clear();
  }

  index(x: number, z: number): number {
    return z * this.width + x;
  }

  vertexIndex(x: number, z: number): number {
    return z * (this.width + 1) + x;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.depth;
  }

  getTile(x: number, z: number): Tile | null {
    if (!this.inBounds(x, z)) {
      return null;
    }
    return this.tiles[this.index(x, z)];
  }

  setTileType(x: number, z: number, type: TileType): void {
    const tile = this.getTile(x, z);
    if (!tile) {
      return;
    }
    tile.type = type;
  }

  removeTreeAt(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) {
      return false;
    }

    const idx = this.index(x, z);
    const treeId = this.treeByTile.get(idx);
    if (!treeId) {
      return false;
    }

    this.treeByTile.delete(idx);
    this.trees.delete(treeId);

    const tile = this.tiles[idx];
    tile.treeId = null;

    return true;
  }

  vertexHeight(x: number, z: number): number {
    const clampedX = Math.max(0, Math.min(this.width, x));
    const clampedZ = Math.max(0, Math.min(this.depth, z));
    return this.heightField[this.vertexIndex(clampedX, clampedZ)];
  }

  sampleHeightAtWorld(worldX: number, worldZ: number): number {
    const gx = worldX / this.tileSize + this.width / 2;
    const gz = worldZ / this.tileSize + this.depth / 2;

    const x0 = Math.max(0, Math.min(this.width, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(this.depth, Math.floor(gz)));
    const x1 = Math.max(0, Math.min(this.width, x0 + 1));
    const z1 = Math.max(0, Math.min(this.depth, z0 + 1));

    const tx = Math.min(1, Math.max(0, gx - x0));
    const tz = Math.min(1, Math.max(0, gz - z0));

    const h00 = this.vertexHeight(x0, z0);
    const h10 = this.vertexHeight(x1, z0);
    const h01 = this.vertexHeight(x0, z1);
    const h11 = this.vertexHeight(x1, z1);

    const hx0 = h00 + (h10 - h00) * tx;
    const hx1 = h01 + (h11 - h01) * tx;

    return hx0 + (hx1 - hx0) * tz;
  }

  tileToWorld(x: number, z: number): { x: number; y: number; z: number } {
    const worldX = (x - this.width / 2 + 0.5) * this.tileSize;
    const worldZ = (z - this.depth / 2 + 0.5) * this.tileSize;
    const tile = this.getTile(x, z);
    return {
      x: worldX,
      y: tile?.height ?? 0,
      z: worldZ
    };
  }

  worldToTile(worldX: number, worldZ: number): { x: number; z: number } | null {
    const x = Math.floor(worldX / this.tileSize + this.width / 2);
    const z = Math.floor(worldZ / this.tileSize + this.depth / 2);
    if (!this.inBounds(x, z)) {
      return null;
    }

    return { x, z };
  }

  clearOccupant(buildingId: string): void {
    for (const tile of this.tiles) {
      if (tile.occupantId === buildingId) {
        tile.occupantId = null;
        if (tile.type === 'foundation') {
          tile.type = 'grass';
        }
      }
    }
  }

  toSnapshot(): WorldSnapshot {
    return {
      width: this.width,
      depth: this.depth,
      seed: this.seed,
      tileTypes: this.tiles.map((tile) => tile.type),
      trees: [...this.trees.values()].map((tree) => this.cloneTree(tree)),
      buildings: [...this.buildings.values()]
    };
  }

  applySnapshot(snapshot: WorldSnapshot): void {
    if (snapshot.width !== this.width || snapshot.depth !== this.depth) {
      return;
    }

    this.buildings.clear();
    this.clearTrees();

    for (let i = 0; i < this.tiles.length; i += 1) {
      const tile = this.tiles[i];
      tile.type = snapshot.tileTypes[i] ?? this.baseTileTypes[i] ?? 'grass';
      tile.occupantId = null;
      tile.treeId = null;
    }

    const hasWaterInSnapshot = snapshot.tileTypes.some((type) => type === 'water');
    if (!hasWaterInSnapshot) {
      for (let i = 0; i < this.tiles.length; i += 1) {
        if (this.tiles[i].type === 'grass' && this.baseTileTypes[i] === 'water') {
          this.tiles[i].type = 'water';
        }
      }
    }

    if (snapshot.trees && snapshot.trees.length > 0) {
      for (const tree of snapshot.trees) {
        this.addTree(this.cloneTree(tree));
      }
    } else {
      this.generateTrees();
    }

    for (const building of snapshot.buildings) {
      this.buildings.set(building.id, building);
      for (let dz = 0; dz < building.depth; dz += 1) {
        for (let dx = 0; dx < building.width; dx += 1) {
          const tx = building.originX + dx;
          const tz = building.originZ + dz;
          if (!this.inBounds(tx, tz)) {
            continue;
          }

          this.removeTreeAt(tx, tz);

          const tile = this.tiles[this.index(tx, tz)];
          tile.type = 'foundation';
          tile.occupantId = building.id;
        }
      }
    }
  }

  resetTiles(): void {
    for (let i = 0; i < this.tiles.length; i += 1) {
      const tile = this.tiles[i];
      tile.type = this.baseTileTypes[i] ?? 'grass';
      tile.occupantId = null;
      tile.treeId = null;
    }

    this.clearTrees();
    for (const tree of this.baseTrees) {
      this.addTree(this.cloneTree(tree));
    }

    this.buildings.clear();
  }
}
