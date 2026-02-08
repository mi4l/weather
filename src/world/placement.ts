import { hashSeed, SeededRng } from '../utils/random';
import type { BuildingRecord } from './types';
import { GridWorld } from './grid';

export type BuildTool = 'house' | 'road' | 'erase';

export interface PlacementResult {
  changed: boolean;
  addedBuilding?: BuildingRecord;
  removedBuildingId?: string;
  message?: string;
}

export class PlacementController {
  private placementCounter = 0;

  constructor(private readonly world: GridWorld) {}

  apply(tool: BuildTool, x: number, z: number): PlacementResult {
    if (!this.world.inBounds(x, z)) {
      return { changed: false };
    }

    switch (tool) {
      case 'house':
        return this.placeHouse(x, z);
      case 'road':
        return this.placeRoad(x, z);
      case 'erase':
        return this.erase(x, z);
      default:
        return { changed: false };
    }
  }

  private placeRoad(x: number, z: number): PlacementResult {
    const tile = this.world.getTile(x, z);
    if (!tile) {
      return { changed: false };
    }

    if (tile.occupantId) {
      return { changed: false, message: 'Cannot place road on building.' };
    }

    if (tile.type === 'road') {
      return { changed: false };
    }

    if (tile.type !== 'grass') {
      return { changed: false, message: 'Road requires an empty grass tile.' };
    }

    this.world.removeTreeAt(x, z);
    tile.type = 'road';
    return { changed: true };
  }

  private placeHouse(x: number, z: number): PlacementResult {
    const tile = this.world.getTile(x, z);
    if (!tile) {
      return { changed: false };
    }

    if (tile.type !== 'grass' || tile.occupantId) {
      return { changed: false, message: 'House requires empty grass tile.' };
    }

    this.placementCounter += 1;
    const seed = hashSeed(this.world.seed, x, z, this.placementCounter);
    const rng = new SeededRng(seed);

    let width = 1;
    let depth = 1;
    let originX = x;
    let originZ = z;
    let found = false;

    for (let i = 0; i < 8; i += 1) {
      width = rng.int(1, 3);
      depth = rng.int(1, 3);

      const offsetX = rng.int(0, width - 1);
      const offsetZ = rng.int(0, depth - 1);

      originX = x - offsetX;
      originZ = z - offsetZ;

      if (this.isFootprintFree(originX, originZ, width, depth)) {
        found = true;
        break;
      }
    }

    if (!found && !this.isFootprintFree(x, z, 1, 1)) {
      return { changed: false, message: 'No room for house footprint.' };
    }

    if (!found) {
      width = 1;
      depth = 1;
      originX = x;
      originZ = z;
    }

    const baseHeight = rng.range(0.6, 1.4);
    const roofHeight = rng.range(0.35, 0.95);
    const roofStyle = rng.chance(0.5) ? 'gabled' : 'hip';
    const wallColors = ['#c8cfb2', '#d8cab4', '#c0d2d8', '#e4d4b9', '#d6d0be'];
    const roofColors = ['#b64d3f', '#7b8c99', '#5f697f', '#9a5c4f', '#5d4e46'];

    const building: BuildingRecord = {
      id: `b-${seed.toString(16)}`,
      seed,
      originX,
      originZ,
      width,
      depth,
      baseHeight,
      roofHeight,
      roofStyle,
      wallColor: wallColors[rng.int(0, wallColors.length - 1)],
      roofColor: roofColors[rng.int(0, roofColors.length - 1)],
      hasChimney: rng.chance(0.18)
    };

    this.world.buildings.set(building.id, building);

    for (let dz = 0; dz < depth; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        const tx = originX + dx;
        const tz = originZ + dz;
        const footprintTile = this.world.getTile(tx, tz);
        if (!footprintTile) {
          continue;
        }
        this.world.removeTreeAt(tx, tz);
        footprintTile.type = 'foundation';
        footprintTile.occupantId = building.id;
      }
    }

    return { changed: true, addedBuilding: building };
  }

  private erase(x: number, z: number): PlacementResult {
    const tile = this.world.getTile(x, z);
    if (!tile) {
      return { changed: false };
    }

    if (tile.occupantId) {
      const buildingId = tile.occupantId;
      this.world.clearOccupant(buildingId);
      this.world.buildings.delete(buildingId);
      return { changed: true, removedBuildingId: buildingId };
    }

    if (tile.type === 'road') {
      tile.type = 'grass';
      return { changed: true };
    }

    return { changed: false };
  }

  private isFootprintFree(originX: number, originZ: number, width: number, depth: number): boolean {
    for (let dz = 0; dz < depth; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        const tx = originX + dx;
        const tz = originZ + dz;
        const tile = this.world.getTile(tx, tz);
        if (!tile) {
          return false;
        }
        if (tile.type !== 'grass' || tile.occupantId) {
          return false;
        }
      }
    }

    return true;
  }
}
