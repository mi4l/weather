import {
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  type Group
} from 'three';
import { GridWorld } from '../world/grid';

interface CloudCluster {
  x: number;
  y: number;
  z: number;
  speedX: number;
  speedZ: number;
  wobble: number;
  phase: number;
}

interface CloudPuff {
  clusterIndex: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  baseScale: number;
  driftPhase: number;
  driftScale: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomCentered(radius: number): number {
  const a = Math.random() * 2 - 1;
  const b = Math.random() * 2 - 1;
  return (a + b) * 0.5 * radius;
}

export class CloudSystem {
  readonly mesh: InstancedMesh;

  private readonly parent: Group;
  private readonly material: MeshLambertMaterial;
  private readonly geometry: IcosahedronGeometry;

  private readonly clusters: CloudCluster[];
  private readonly puffs: CloudPuff[];

  private readonly boundsX: number;
  private readonly boundsZ: number;

  private readonly dummy = new Object3D();
  private readonly tempMatrix = new Matrix4();

  constructor(world: GridWorld, parent: Group, cloudCount = 22, puffsPerCloud = 16) {
    this.parent = parent;

    this.boundsX = world.width * world.tileSize * 0.98;
    this.boundsZ = world.depth * world.tileSize * 0.98;

    this.clusters = new Array(cloudCount);
    for (let i = 0; i < cloudCount; i += 1) {
      this.clusters[i] = this.createCluster();
    }

    this.puffs = [];
    for (let clusterIndex = 0; clusterIndex < cloudCount; clusterIndex += 1) {
      for (let i = 0; i < puffsPerCloud; i += 1) {
        this.puffs.push(this.createPuff(clusterIndex));
      }
    }

    this.geometry = new IcosahedronGeometry(1, 1);
    this.material = new MeshLambertMaterial({
      color: new Color('#f3f7fd'),
      flatShading: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });

    this.mesh = new InstancedMesh(this.geometry, this.material, this.puffs.length);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);

    this.parent.add(this.mesh);
    this.rebuildMatrices(performance.now());
  }

  update(dt: number, timeOfDayHours: number, weatherIntensity: number): void {
    const now = performance.now();

    const stormFactor = clamp(weatherIntensity, 0, 1);
    const driftFactor = 0.82 + stormFactor * 0.52;

    for (const cluster of this.clusters) {
      cluster.x += cluster.speedX * dt * driftFactor;
      cluster.z += cluster.speedZ * dt;

      if (cluster.x > this.boundsX + 8) {
        cluster.x = -this.boundsX - 8;
        cluster.z = randomCentered(this.boundsZ);
        cluster.y = 8.6 + Math.random() * 6;
      }

      if (cluster.z > this.boundsZ + 4) {
        cluster.z = -this.boundsZ - 4;
      }
      if (cluster.z < -this.boundsZ - 4) {
        cluster.z = this.boundsZ + 4;
      }
    }

    this.rebuildMatrices(now);

    const solarPhase = ((timeOfDayHours - 6) / 24) * Math.PI * 2;
    const daylight = clamp((Math.sin(solarPhase) + 0.25) / 1.25, 0, 1);

    const stormDarkening = stormFactor * 0.24;
    const lightness = 0.6 + daylight * 0.3 - stormDarkening;
    const saturation = 0.12 + daylight * 0.06;

    this.material.color.setHSL(0.58, saturation, clamp(lightness, 0.32, 0.95));
    this.material.opacity = clamp(0.18 + daylight * 0.18, 0.14, 0.42);
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  private createCluster(): CloudCluster {
    return {
      x: randomCentered(this.boundsX),
      y: 8.6 + Math.random() * 6,
      z: randomCentered(this.boundsZ),
      speedX: 0.16 + Math.random() * 0.24,
      speedZ: (Math.random() * 2 - 1) * 0.03,
      wobble: 0.08 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2
    };
  }

  private createPuff(clusterIndex: number): CloudPuff {
    return {
      clusterIndex,
      offsetX: randomCentered(3.5),
      offsetY: randomCentered(1.35),
      offsetZ: randomCentered(2.4),
      baseScale: 0.85 + Math.random() * 1.4,
      driftPhase: Math.random() * Math.PI * 2,
      driftScale: 0.05 + Math.random() * 0.12
    };
  }

  private rebuildMatrices(timeMs: number): void {
    for (let i = 0; i < this.puffs.length; i += 1) {
      const puff = this.puffs[i];
      const cluster = this.clusters[puff.clusterIndex];

      const wobble = Math.sin(timeMs * 0.00035 + puff.driftPhase) * puff.driftScale;
      const vertical = Math.sin(timeMs * 0.00022 + cluster.phase) * cluster.wobble;

      const x = cluster.x + puff.offsetX + wobble;
      const y = cluster.y + puff.offsetY + vertical;
      const z = cluster.z + puff.offsetZ;

      const squash = 0.64 + Math.sin(timeMs * 0.00028 + puff.driftPhase) * 0.05;

      this.dummy.position.set(x, y, z);
      this.dummy.scale.set(puff.baseScale * 1.5, puff.baseScale * squash, puff.baseScale);
      this.dummy.rotation.set(0, puff.driftPhase, 0);
      this.dummy.updateMatrix();

      this.tempMatrix.copy(this.dummy.matrix);
      this.mesh.setMatrixAt(i, this.tempMatrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
