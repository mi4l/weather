import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, type Group } from 'three';

export interface RainContext {
  centerX: number;
  centerZ: number;
  areaSize: number;
  intensity: number;
  dt: number;
  sampleGroundHeight: (x: number, z: number) => number;
}

export class RainSystem {
  readonly points: Points;

  private readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;

  private readonly maxDrops: number;
  private readonly parent: Group;

  constructor(parent: Group, maxDrops = 2800) {
    this.parent = parent;
    this.maxDrops = maxDrops;

    this.geometry = new BufferGeometry();
    this.positions = new Float32Array(this.maxDrops * 3);
    this.speeds = new Float32Array(this.maxDrops);

    for (let i = 0; i < this.maxDrops; i += 1) {
      this.positions[i * 3 + 0] = 0;
      this.positions[i * 3 + 1] = -999;
      this.positions[i * 3 + 2] = 0;
      this.speeds[i] = 7 + Math.random() * 6;
    }

    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);

    const material = new PointsMaterial({
      color: new Color('#b8d4ff'),
      size: 0.1,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    });

    this.points = new Points(this.geometry, material);
    this.points.visible = false;
    parent.add(this.points);
  }

  update(context: RainContext): void {
    const intensity = Math.max(0, Math.min(1, context.intensity));
    if (intensity <= 0.01) {
      this.points.visible = false;
      this.geometry.setDrawRange(0, 0);
      return;
    }

    this.points.visible = true;

    const activeDrops = Math.floor(this.maxDrops * (0.2 + intensity * 0.8));
    this.geometry.setDrawRange(0, activeDrops);

    for (let i = 0; i < activeDrops; i += 1) {
      const p = i * 3;
      let x = this.positions[p + 0];
      let y = this.positions[p + 1];
      let z = this.positions[p + 2];

      if (y < -100) {
        x = context.centerX + (Math.random() * 2 - 1) * context.areaSize;
        z = context.centerZ + (Math.random() * 2 - 1) * context.areaSize;
        y = 8 + Math.random() * 8;
      }

      x += 0.06 * context.dt;
      z += 0.03 * context.dt;
      y -= this.speeds[i] * context.dt * (0.7 + intensity * 0.6);

      const ground = context.sampleGroundHeight(x, z);
      if (y <= ground + 0.1) {
        x = context.centerX + (Math.random() * 2 - 1) * context.areaSize;
        z = context.centerZ + (Math.random() * 2 - 1) * context.areaSize;
        y = 8 + Math.random() * 8;
      }

      this.positions[p + 0] = x;
      this.positions[p + 1] = y;
      this.positions[p + 2] = z;
    }

    const attr = this.geometry.attributes.position as BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.parent.remove(this.points);
    this.geometry.dispose();
    if (Array.isArray(this.points.material)) {
      for (const material of this.points.material) {
        material.dispose();
      }
    } else {
      this.points.material.dispose();
    }
  }
}
