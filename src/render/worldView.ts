import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3,
  type Material
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createHouseMesh, shakeHouseMesh } from '../buildings/houseGenerator';
import { GridWorld } from '../world/grid';

interface BuildingVisual {
  group: Group;
  basePosition: Vector3;
}

export class WorldView {
  readonly root = new Group();
  readonly terrainMesh: Mesh;

  private roadMesh: Mesh | null = null;
  private waterMesh: Mesh | null = null;
  private destructionMesh: Mesh | null = null;
  private treeTrunkMesh: Mesh | null = null;
  private treeCrownMesh: Mesh | null = null;

  private readonly roadMaterial = new MeshLambertMaterial({
    color: new Color('#4f5155'),
    flatShading: true
  });

  private readonly waterMaterial = new MeshLambertMaterial({
    color: new Color('#62a9cf'),
    transparent: true,
    opacity: 0.88,
    flatShading: true
  });
  private readonly destructionMaterial = new MeshLambertMaterial({
    color: new Color('#66543e'),
    transparent: true,
    opacity: 0.58,
    flatShading: true
  });

  private readonly treeTrunkMaterial = new MeshLambertMaterial({
    color: new Color('#6d533b'),
    flatShading: true
  });

  private readonly treeCrownMaterial = new MeshLambertMaterial({
    color: new Color('#6ea85d'),
    vertexColors: true,
    flatShading: true
  });

  private readonly buildingVisuals = new Map<string, BuildingVisual>();

  private readonly hoverMesh: Mesh;
  private readonly hoverMaterial = new MeshLambertMaterial({
    color: new Color('#f2bb4a'),
    transparent: true,
    opacity: 0.48,
    flatShading: true,
    depthWrite: false
  });

  private readonly invalidHoverColor = new Color('#ef6e62');
  private readonly validHoverColor = new Color('#9ddc76');

  constructor(private readonly world: GridWorld) {
    this.terrainMesh = this.createTerrainMesh();
    this.root.add(this.terrainMesh);

    this.hoverMesh = new Mesh(
      new BoxGeometry(this.world.tileSize * 0.9, 0.06, this.world.tileSize * 0.9),
      this.hoverMaterial
    );
    this.hoverMesh.visible = false;
    this.root.add(this.hoverMesh);

    this.rebuildRoads();
    this.rebuildWater();
    this.syncTrees();
    this.syncBuildings();
  }

  dispose(): void {
    this.terrainMesh.geometry.dispose();
    (this.terrainMesh.material as Material).dispose();

    if (this.roadMesh) {
      this.roadMesh.geometry.dispose();
      this.root.remove(this.roadMesh);
      this.roadMesh = null;
    }

    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.root.remove(this.waterMesh);
      this.waterMesh = null;
    }
    if (this.destructionMesh) {
      this.destructionMesh.geometry.dispose();
      this.root.remove(this.destructionMesh);
      this.destructionMesh = null;
    }

    if (this.treeTrunkMesh) {
      this.treeTrunkMesh.geometry.dispose();
      this.root.remove(this.treeTrunkMesh);
      this.treeTrunkMesh = null;
    }

    if (this.treeCrownMesh) {
      this.treeCrownMesh.geometry.dispose();
      this.root.remove(this.treeCrownMesh);
      this.treeCrownMesh = null;
    }

    for (const visual of this.buildingVisuals.values()) {
      visual.group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const mat of material) {
            mat.dispose();
          }
        } else if (material) {
          material.dispose();
        }
      });
      this.root.remove(visual.group);
    }

    this.hoverMesh.geometry.dispose();
    this.hoverMaterial.dispose();
    this.roadMaterial.dispose();
    this.waterMaterial.dispose();
    this.destructionMaterial.dispose();
    this.treeTrunkMaterial.dispose();
    this.treeCrownMaterial.dispose();
  }

  refreshTerrainHeights(): void {
    this.terrainMesh.geometry.dispose();
    this.terrainMesh.geometry = this.createTerrainGeometry();
  }

  rebuildRoads(): void {
    if (this.roadMesh) {
      this.roadMesh.geometry.dispose();
      this.root.remove(this.roadMesh);
      this.roadMesh = null;
    }

    const pieces: BufferGeometry[] = [];
    const tile = this.world.tileSize;

    const centerGeometry = new BoxGeometry(tile * 0.72, 0.06, tile * 0.72);
    const northGeometry = new BoxGeometry(tile * 0.3, 0.06, tile * 0.54);
    const eastGeometry = new BoxGeometry(tile * 0.54, 0.06, tile * 0.3);

    for (let z = 0; z < this.world.depth; z += 1) {
      for (let x = 0; x < this.world.width; x += 1) {
        const roadTile = this.world.getTile(x, z);
        if (!roadTile || roadTile.type !== 'road') {
          continue;
        }

        const worldPos = this.world.tileToWorld(x, z);
        const y = worldPos.y + 0.04;

        const centerPiece = centerGeometry.clone();
        centerPiece.translate(worldPos.x, y, worldPos.z);
        pieces.push(centerPiece);

        const north = this.world.getTile(x, z - 1)?.type === 'road';
        const east = this.world.getTile(x + 1, z)?.type === 'road';
        const south = this.world.getTile(x, z + 1)?.type === 'road';
        const west = this.world.getTile(x - 1, z)?.type === 'road';

        if (north) {
          const segment = northGeometry.clone();
          segment.translate(worldPos.x, y, worldPos.z - tile * 0.28);
          pieces.push(segment);
        }
        if (south) {
          const segment = northGeometry.clone();
          segment.translate(worldPos.x, y, worldPos.z + tile * 0.28);
          pieces.push(segment);
        }
        if (east) {
          const segment = eastGeometry.clone();
          segment.translate(worldPos.x + tile * 0.28, y, worldPos.z);
          pieces.push(segment);
        }
        if (west) {
          const segment = eastGeometry.clone();
          segment.translate(worldPos.x - tile * 0.28, y, worldPos.z);
          pieces.push(segment);
        }
      }
    }

    centerGeometry.dispose();
    northGeometry.dispose();
    eastGeometry.dispose();

    if (pieces.length === 0) {
      return;
    }

    const merged = mergeGeometries(pieces, false);
    for (const part of pieces) {
      part.dispose();
    }

    if (!merged) {
      return;
    }

    merged.computeVertexNormals();
    this.roadMesh = new Mesh(merged, this.roadMaterial);
    this.root.add(this.roadMesh);
  }

  rebuildWater(): void {
    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      this.root.remove(this.waterMesh);
      this.waterMesh = null;
    }

    const pieces: BufferGeometry[] = [];
    const tileSize = this.world.tileSize;

    for (let z = 0; z < this.world.depth; z += 1) {
      for (let x = 0; x < this.world.width; x += 1) {
        const tile = this.world.getTile(x, z);
        if (!tile || tile.type !== 'water') {
          continue;
        }

        const worldPos = this.world.tileToWorld(x, z);
        const geometry = new BoxGeometry(tileSize * 0.88, 0.045, tileSize * 0.88);
        geometry.translate(worldPos.x, worldPos.y + 0.03, worldPos.z);
        pieces.push(geometry);
      }
    }

    if (pieces.length === 0) {
      return;
    }

    const merged = mergeGeometries(pieces, false);
    for (const part of pieces) {
      part.dispose();
    }

    if (!merged) {
      return;
    }

    merged.computeVertexNormals();
    this.waterMesh = new Mesh(merged, this.waterMaterial);
    this.root.add(this.waterMesh);
  }

  setDestructionPath(path: Array<{ x: number; z: number }>): void {
    if (this.destructionMesh) {
      this.destructionMesh.geometry.dispose();
      this.root.remove(this.destructionMesh);
      this.destructionMesh = null;
    }

    if (path.length === 0) {
      return;
    }

    const pieces: BufferGeometry[] = [];
    const tileSize = this.world.tileSize;

    for (const tilePos of path) {
      const worldPos = this.world.tileToWorld(tilePos.x, tilePos.z);
      const geometry = new BoxGeometry(tileSize * 0.72, 0.02, tileSize * 0.72);
      geometry.translate(worldPos.x, worldPos.y + 0.015, worldPos.z);
      pieces.push(geometry);
    }

    const merged = mergeGeometries(pieces, false);
    for (const part of pieces) {
      part.dispose();
    }

    if (!merged) {
      return;
    }

    merged.computeVertexNormals();
    this.destructionMesh = new Mesh(merged, this.destructionMaterial);
    this.root.add(this.destructionMesh);
  }

  syncTrees(): void {
    if (this.treeTrunkMesh) {
      this.treeTrunkMesh.geometry.dispose();
      this.root.remove(this.treeTrunkMesh);
      this.treeTrunkMesh = null;
    }

    if (this.treeCrownMesh) {
      this.treeCrownMesh.geometry.dispose();
      this.root.remove(this.treeCrownMesh);
      this.treeCrownMesh = null;
    }

    const trunkPieces: BufferGeometry[] = [];
    const crownPieces: BufferGeometry[] = [];

    for (const tree of this.world.trees.values()) {
      const worldPos = this.world.tileToWorld(tree.x, tree.z);

      const trunkSize = this.world.tileSize * 0.13;
      const trunk = new BoxGeometry(trunkSize, tree.trunkHeight, trunkSize);
      trunk.translate(worldPos.x, worldPos.y + tree.trunkHeight * 0.5, worldPos.z);
      trunkPieces.push(trunk);

      const crownRadius = tree.crownRadius * this.world.tileSize;
      const crown = new ConeGeometry(crownRadius, tree.crownHeight, 6);
      const crownColor = new Color();
      crownColor.setHSL(0.26 + tree.hueOffset, 0.36, 0.43);
      const crownColors = new Float32Array(crown.attributes.position.count * 3);
      for (let i = 0; i < crown.attributes.position.count; i += 1) {
        crownColors[i * 3 + 0] = crownColor.r;
        crownColors[i * 3 + 1] = crownColor.g;
        crownColors[i * 3 + 2] = crownColor.b;
      }
      crown.setAttribute('color', new BufferAttribute(crownColors, 3));
      crown.translate(worldPos.x, worldPos.y + tree.trunkHeight + tree.crownHeight * 0.45, worldPos.z);
      crownPieces.push(crown);
    }

    if (trunkPieces.length > 0) {
      const trunkMerged = mergeGeometries(trunkPieces, false);
      for (const part of trunkPieces) {
        part.dispose();
      }

      if (trunkMerged) {
        trunkMerged.computeVertexNormals();
        this.treeTrunkMesh = new Mesh(trunkMerged, this.treeTrunkMaterial);
        this.root.add(this.treeTrunkMesh);
      }
    }

    if (crownPieces.length > 0) {
      const crownMerged = mergeGeometries(crownPieces, false);
      for (const part of crownPieces) {
        part.dispose();
      }

      if (crownMerged) {
        crownMerged.computeVertexNormals();

        this.treeCrownMesh = new Mesh(crownMerged, this.treeCrownMaterial);
        this.root.add(this.treeCrownMesh);
      }
    }
  }

  syncBuildings(): void {
    const activeIds = new Set<string>();

    for (const building of this.world.buildings.values()) {
      activeIds.add(building.id);
      if (!this.buildingVisuals.has(building.id)) {
        const visual = createHouseMesh(building, this.world);
        this.buildingVisuals.set(building.id, visual);
        this.root.add(visual.group);
      }
    }

    for (const [id, visual] of this.buildingVisuals) {
      if (activeIds.has(id)) {
        continue;
      }
      visual.group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        const material = mesh.material;
        if (Array.isArray(material)) {
          for (const mat of material) {
            mat.dispose();
          }
        } else if (material) {
          material.dispose();
        }
      });
      this.root.remove(visual.group);
      this.buildingVisuals.delete(id);
    }
  }

  setHoverTile(tileX: number, tileZ: number, valid: boolean): void {
    const worldPos = this.world.tileToWorld(tileX, tileZ);
    this.hoverMesh.position.set(worldPos.x, worldPos.y + 0.05, worldPos.z);
    this.hoverMaterial.color.copy(valid ? this.validHoverColor : this.invalidHoverColor);
    this.hoverMesh.visible = true;
  }

  clearHover(): void {
    this.hoverMesh.visible = false;
  }

  applyBuildingShake(tornadoes: Array<{ x: number; z: number; radius: number }>, dt: number): void {
    const damping = MathUtils.clamp(dt * 8, 0, 1);

    for (const building of this.world.buildings.values()) {
      const visual = this.buildingVisuals.get(building.id);
      if (!visual) {
        continue;
      }

      const center = this.world.tileToWorld(
        building.originX + building.width * 0.5 - 0.5,
        building.originZ + building.depth * 0.5 - 0.5
      );

      let shakeStrength = 0;
      for (const tornado of tornadoes) {
        const dx = center.x - tornado.x;
        const dz = center.z - tornado.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const triggerRadius = tornado.radius + this.world.tileSize * 1.3;
        if (distance < triggerRadius) {
          const influence = 1 - distance / triggerRadius;
          shakeStrength = Math.max(shakeStrength, influence);
        }
      }

      if (shakeStrength > 0) {
        shakeHouseMesh(visual.group, visual.basePosition, shakeStrength);
      } else {
        visual.group.position.lerp(visual.basePosition, damping);
        visual.group.rotation.y *= 1 - damping;
      }
    }
  }

  private createTerrainMesh(): Mesh {
    const geometry = this.createTerrainGeometry();
    const material = new MeshLambertMaterial({
      color: new Color('#8ebd79'),
      flatShading: true,
      side: DoubleSide
    });
    return new Mesh(geometry, material);
  }

  private createTerrainGeometry(): PlaneGeometry {
    const geometry = new PlaneGeometry(
      this.world.width * this.world.tileSize,
      this.world.depth * this.world.tileSize,
      this.world.width,
      this.world.depth
    );
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const xWorld = positions.getX(i);
      const zWorld = positions.getZ(i);

      const vx = Math.round(xWorld / this.world.tileSize + this.world.width / 2);
      const vz = Math.round(zWorld / this.world.tileSize + this.world.depth / 2);

      positions.setY(i, this.world.vertexHeight(vx, vz));
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }
}
