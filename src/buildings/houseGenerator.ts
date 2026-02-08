import {
  BoxGeometry,
  Color,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3
} from 'three';
import type { BuildingRecord } from '../world/types';
import { GridWorld } from '../world/grid';

interface HouseMeshBundle {
  group: Group;
  basePosition: Vector3;
}

function makeMaterial(color: string): Material {
  return new MeshLambertMaterial({
    color: new Color(color),
    flatShading: true
  });
}

function createGabledRoof(width: number, depth: number, roofHeight: number, material: Material): Group {
  const roof = new Group();

  const panelGeometry = new PlaneGeometry(width * 0.55, depth + 0.14);
  const left = new Mesh(panelGeometry, material);
  left.rotation.x = Math.PI / 2;
  left.rotation.z = Math.PI / 4;
  left.position.x = -width * 0.23;

  const right = new Mesh(panelGeometry, material);
  right.rotation.x = Math.PI / 2;
  right.rotation.z = -Math.PI / 4;
  right.position.x = width * 0.23;

  const lift = roofHeight * 0.42;
  left.position.y = lift;
  right.position.y = lift;

  roof.add(left, right);
  return roof;
}

function createHipRoof(width: number, depth: number, roofHeight: number, material: Material): Mesh {
  const geometry = new BoxGeometry(width * 1.04, roofHeight, depth * 1.04);
  const roof = new Mesh(geometry, material);
  roof.scale.set(1, 0.85, 1);
  roof.position.y = roofHeight * 0.5;
  return roof;
}

function alignGroupToFootprint(group: Group, world: GridWorld, building: BuildingRecord): Vector3 {
  const centerX = building.originX + building.width / 2;
  const centerZ = building.originZ + building.depth / 2;

  const worldX = (centerX - world.width / 2) * world.tileSize;
  const worldZ = (centerZ - world.depth / 2) * world.tileSize;

  let accumulatedHeight = 0;
  let count = 0;

  for (let dz = 0; dz < building.depth; dz += 1) {
    for (let dx = 0; dx < building.width; dx += 1) {
      const tile = world.getTile(building.originX + dx, building.originZ + dz);
      if (!tile) {
        continue;
      }
      accumulatedHeight += tile.height;
      count += 1;
    }
  }

  const groundY = count > 0 ? accumulatedHeight / count : 0;
  group.position.set(worldX, groundY, worldZ);
  return group.position.clone();
}

export function createHouseMesh(building: BuildingRecord, world: GridWorld): HouseMeshBundle {
  const group = new Group();

  const baseWidth = building.width * world.tileSize * 0.86;
  const baseDepth = building.depth * world.tileSize * 0.86;

  const wallMaterial = makeMaterial(building.wallColor);
  const roofMaterial = makeMaterial(building.roofColor);

  const baseGeometry = new BoxGeometry(baseWidth, building.baseHeight, baseDepth);
  const baseMesh = new Mesh(baseGeometry, wallMaterial);
  baseMesh.position.y = building.baseHeight * 0.5;

  group.add(baseMesh);

  const roofLift = building.baseHeight;

  if (building.roofStyle === 'gabled') {
    const gabled = createGabledRoof(baseWidth, baseDepth, building.roofHeight, roofMaterial);
    gabled.position.y = roofLift;
    group.add(gabled);
  } else {
    const hip = createHipRoof(baseWidth, baseDepth, building.roofHeight, roofMaterial);
    hip.position.y = roofLift;
    group.add(hip);
  }

  if (building.hasChimney) {
    const chimneyGeometry = new BoxGeometry(baseWidth * 0.1, building.baseHeight * 0.55, baseDepth * 0.1);
    const chimney = new Mesh(chimneyGeometry, makeMaterial('#6d665f'));
    chimney.position.set(baseWidth * 0.18, roofLift + building.roofHeight * 0.5, -baseDepth * 0.16);
    group.add(chimney);
  }

  const basePosition = alignGroupToFootprint(group, world, building);
  return { group, basePosition };
}

export function shakeHouseMesh(group: Group, basePosition: Vector3, amount: number): void {
  if (amount <= 0) {
    group.position.copy(basePosition);
    group.rotation.set(0, 0, 0);
    return;
  }

  const jitterX = (Math.random() * 2 - 1) * amount * 0.05;
  const jitterY = Math.random() * amount * 0.03;
  const jitterZ = (Math.random() * 2 - 1) * amount * 0.05;

  group.position.set(basePosition.x + jitterX, basePosition.y + jitterY, basePosition.z + jitterZ);
  group.rotation.y = (Math.random() * 2 - 1) * amount * 0.04;
}

export function createRoadGeometryMask(mask: number, tileSize: number): BoxGeometry[] {
  const geometries: BoxGeometry[] = [];

  const center = new BoxGeometry(tileSize * 0.72, 0.06, tileSize * 0.72);
  geometries.push(center);

  if (mask & 1) {
    geometries.push(new BoxGeometry(tileSize * 0.3, 0.06, tileSize * 0.54));
  }
  if (mask & 2) {
    geometries.push(new BoxGeometry(tileSize * 0.54, 0.06, tileSize * 0.3));
  }
  if (mask & 4) {
    geometries.push(new BoxGeometry(tileSize * 0.3, 0.06, tileSize * 0.54));
  }
  if (mask & 8) {
    geometries.push(new BoxGeometry(tileSize * 0.54, 0.06, tileSize * 0.3));
  }

  return geometries;
}

export function roadArmTransforms(tileSize: number): Matrix4[] {
  const transforms: Matrix4[] = [];

  transforms.push(new Matrix4().makeTranslation(0, 0, -tileSize * 0.28));
  transforms.push(new Matrix4().makeTranslation(tileSize * 0.28, 0, 0));
  transforms.push(new Matrix4().makeTranslation(0, 0, tileSize * 0.28));
  transforms.push(new Matrix4().makeTranslation(-tileSize * 0.28, 0, 0));

  return transforms;
}
