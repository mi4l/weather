export type TileType = 'grass' | 'road' | 'foundation' | 'water';

export interface Tile {
  type: TileType;
  height: number;
  occupantId: string | null;
  treeId: string | null;
}

export interface TreeRecord {
  id: string;
  x: number;
  z: number;
  trunkHeight: number;
  crownHeight: number;
  crownRadius: number;
  hueOffset: number;
}

export interface BuildingRecord {
  id: string;
  seed: number;
  originX: number;
  originZ: number;
  width: number;
  depth: number;
  baseHeight: number;
  roofHeight: number;
  roofStyle: 'gabled' | 'hip';
  wallColor: string;
  roofColor: string;
  hasChimney: boolean;
}

export interface WorldSnapshot {
  width: number;
  depth: number;
  seed: number;
  tileTypes: TileType[];
  trees?: TreeRecord[];
  buildings: BuildingRecord[];
}
