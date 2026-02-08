import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  TorusGeometry,
  Vector2
} from 'three';
import { GridWorld } from '../world/grid';

export interface TornadoView {
  x: number;
  z: number;
  radius: number;
}

interface DebrisParticle {
  mesh: Mesh;
  angle: number;
  radius: number;
  height: number;
  speed: number;
}

interface TornadoEntity {
  id: number;
  group: Group;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  lifetime: number;
  segments: Mesh[];
  dust: Mesh;
  debris: DebrisParticle[];
}

export class TornadoSystem {
  private readonly tornadoes: TornadoEntity[] = [];
  private idCounter = 0;

  constructor(private readonly world: GridWorld, private readonly root: Group) {}

  clear(): void {
    for (const tornado of this.tornadoes) {
      tornado.group.traverse((obj) => {
        const mesh = obj as Mesh;
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
      this.root.remove(tornado.group);
    }

    this.tornadoes.length = 0;
  }

  spawnManual(worldX?: number, worldZ?: number): TornadoView {
    const spawnX = worldX ?? (Math.random() * 2 - 1) * (this.world.width * this.world.tileSize * 0.45);
    const spawnZ = worldZ ?? (Math.random() * 2 - 1) * (this.world.depth * this.world.tileSize * 0.45);

    const tornado = this.createEntity(spawnX, spawnZ, 3 + Math.random() * 1.8);
    this.tornadoes.push(tornado);
    this.root.add(tornado.group);

    return {
      x: tornado.position.x,
      z: tornado.position.y,
      radius: tornado.radius
    };
  }

  update(
    dt: number,
    intensity: number,
    allowAutoSpawns: boolean,
    onSpawn: (view: TornadoView) => void
  ): TornadoView[] {
    const intensityClamped = Math.max(0, Math.min(1, intensity));

    if (allowAutoSpawns && Math.random() < intensityClamped * dt * 0.006) {
      onSpawn(this.spawnManual());
    }

    const halfW = (this.world.width * this.world.tileSize) / 2;
    const halfD = (this.world.depth * this.world.tileSize) / 2;

    const results: TornadoView[] = [];

    for (let i = this.tornadoes.length - 1; i >= 0; i -= 1) {
      const tornado = this.tornadoes[i];

      tornado.lifetime -= dt;
      if (tornado.lifetime <= 0) {
        this.destroyByIndex(i);
        continue;
      }

      const steering = (Math.random() * 2 - 1) * 0.6;
      tornado.velocity.rotateAround(new Vector2(0, 0), steering * dt * 0.2);

      tornado.position.x += tornado.velocity.x * dt;
      tornado.position.y += tornado.velocity.y * dt;

      if (tornado.position.x < -halfW || tornado.position.x > halfW) {
        tornado.velocity.x *= -1;
        tornado.position.x = Math.max(-halfW, Math.min(halfW, tornado.position.x));
      }

      if (tornado.position.y < -halfD || tornado.position.y > halfD) {
        tornado.velocity.y *= -1;
        tornado.position.y = Math.max(-halfD, Math.min(halfD, tornado.position.y));
      }

      const ground = this.world.sampleHeightAtWorld(tornado.position.x, tornado.position.y);
      tornado.group.position.set(tornado.position.x, ground + 0.1, tornado.position.y);

      const spinRate = 3.4 + intensityClamped * 4;
      for (let s = 0; s < tornado.segments.length; s += 1) {
        tornado.segments[s].rotation.y += dt * spinRate * (1 + s * 0.15);
      }

      tornado.dust.rotation.z += dt * 1.2;
      const pulse = 1 + Math.sin(performance.now() * 0.006 + tornado.id) * 0.08;
      tornado.dust.scale.setScalar(pulse);

      for (const particle of tornado.debris) {
        particle.angle += dt * particle.speed;
        const x = Math.cos(particle.angle) * particle.radius;
        const z = Math.sin(particle.angle) * particle.radius;
        particle.mesh.position.set(x, particle.height + Math.sin(particle.angle * 1.4) * 0.12, z);
        particle.mesh.rotation.y += dt * 4;
      }

      results.push({
        x: tornado.position.x,
        z: tornado.position.y,
        radius: tornado.radius
      });
    }

    return results;
  }

  private destroyByIndex(index: number): void {
    const tornado = this.tornadoes[index];

    tornado.group.traverse((obj) => {
      const mesh = obj as Mesh;
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

    this.root.remove(tornado.group);
    this.tornadoes.splice(index, 1);
  }

  private createEntity(worldX: number, worldZ: number, radius: number): TornadoEntity {
    this.idCounter += 1;

    const group = new Group();

    const segments: Mesh[] = [];
    const segmentCount = 6;
    const segmentHeight = 0.62;

    for (let i = 0; i < segmentCount; i += 1) {
      const t = i / (segmentCount - 1);
      const topRadius = 0.18 + t * radius * 0.34;
      const bottomRadius = 0.12 + t * radius * 0.24;

      const geometry = new CylinderGeometry(topRadius, bottomRadius, segmentHeight, 8, 1, true);
      const material = new MeshLambertMaterial({
        color: new Color('#8b8d95'),
        transparent: true,
        opacity: 0.22 + t * 0.18,
        flatShading: true
      });
      const segment = new Mesh(geometry, material);
      segment.position.y = 0.36 + i * segmentHeight * 0.52;
      group.add(segment);
      segments.push(segment);
    }

    const dust = new Mesh(
      new TorusGeometry(radius * 0.48, 0.1, 6, 18),
      new MeshLambertMaterial({
        color: new Color('#9e917f'),
        transparent: true,
        opacity: 0.35,
        flatShading: true
      })
    );
    dust.rotation.x = Math.PI / 2;
    dust.position.y = 0.08;
    group.add(dust);

    const debris: DebrisParticle[] = [];
    for (let i = 0; i < 18; i += 1) {
      const mesh = new Mesh(
        new BoxGeometry(0.08 + Math.random() * 0.14, 0.08 + Math.random() * 0.14, 0.08 + Math.random() * 0.14),
        new MeshLambertMaterial({
          color: new Color('#5c5249'),
          flatShading: true
        })
      );

      group.add(mesh);
      debris.push({
        mesh,
        angle: Math.random() * Math.PI * 2,
        radius: 0.4 + Math.random() * (radius * 0.5),
        height: 0.25 + Math.random() * 1.6,
        speed: 1.8 + Math.random() * 2.8
      });
    }

    const speed = 0.4 + Math.random() * 0.7;
    const heading = Math.random() * Math.PI * 2;

    return {
      id: this.idCounter,
      group,
      position: new Vector2(worldX, worldZ),
      velocity: new Vector2(Math.cos(heading) * speed, Math.sin(heading) * speed),
      radius,
      lifetime: 20 + Math.random() * 70,
      segments,
      dust,
      debris
    };
  }
}
