import {
  AmbientLight,
  Color,
  Group,
  Object3D,
  OrthographicCamera,
  Raycaster,
  Scene,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection
} from 'three';

const CAMERA_DISTANCE = 32;

export class SceneRig {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly camera: OrthographicCamera;
  readonly raycaster = new Raycaster();

  readonly worldRoot = new Group();
  readonly weatherRoot = new Group();

  readonly ambientLight: AmbientLight;
  readonly sunLight: SpotLight;
  readonly moonLight: SpotLight;

  private readonly ndc = new Vector2();
  private readonly cameraDir = new Vector3(1, 1.15, 1).normalize();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  private readonly skyNight = new Color('#2a3852');
  private readonly skyDay = new Color('#cbe0c6');

  private readonly sunTarget = new Object3D();
  private readonly moonTarget = new Object3D();

  private readonly target = new Vector3();
  private flashTimer = 0;
  private flashPeak = 0;

  private baseAmbientIntensity = 0.8;
  private baseSunIntensity = 0.9;
  private baseMoonIntensity = 0.1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.scene = new Scene();
    this.scene.background = this.skyDay.clone();

    this.camera = new OrthographicCamera(-18, 18, 18, -18, 0.1, 220);

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.ambientLight = new AmbientLight('#cfdcc8', 0.8);

    this.sunLight = new SpotLight('#ffe3a6', 1.2, 0, Math.PI * 0.33, 0.34, 1.25);
    this.sunLight.position.set(22, 30, 15);
    this.sunLight.target = this.sunTarget;

    this.moonLight = new SpotLight('#f3cc9f', 0.22, 0, Math.PI * 0.39, 0.45, 1.1);
    this.moonLight.position.set(-19, 24, -13);
    this.moonLight.target = this.moonTarget;

    this.sunTarget.position.set(0, 0, 0);
    this.moonTarget.position.set(0, 0, 0);

    this.scene.add(this.ambientLight, this.sunLight, this.moonLight, this.sunTarget, this.moonTarget);

    this.scene.add(this.worldRoot);
    this.scene.add(this.weatherRoot);

    this.camera.zoom = 1.35;
    this.updateCamera();
    this.setTimeOfDay(9);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const aspect = width / Math.max(1, height);
    const viewSize = 24;

    this.camera.left = -viewSize * aspect;
    this.camera.right = viewSize * aspect;
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      const decay = Math.max(0, this.flashTimer) / Math.max(0.0001, this.flashPeak);
      const flashBoost = decay * 1.7;

      this.sunLight.intensity = this.baseSunIntensity + flashBoost;
      this.moonLight.intensity = this.baseMoonIntensity + flashBoost * 0.42;
      this.ambientLight.intensity = this.baseAmbientIntensity + flashBoost * 0.48;

      if (this.flashTimer <= 0) {
        this.sunLight.intensity = this.baseSunIntensity;
        this.moonLight.intensity = this.baseMoonIntensity;
        this.ambientLight.intensity = this.baseAmbientIntensity;
      }
      return;
    }

    this.sunLight.intensity = this.baseSunIntensity;
    this.moonLight.intensity = this.baseMoonIntensity;
    this.ambientLight.intensity = this.baseAmbientIntensity;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  triggerLightningFlash(durationSeconds: number): void {
    this.flashPeak = durationSeconds;
    this.flashTimer = durationSeconds;
  }

  setTimeOfDay(hours: number): void {
    const wrapped = ((hours % 24) + 24) % 24;
    const nightBlend = this.computeNightBlend(wrapped);
    const daylight = 1 - nightBlend;

    this.scene.background = this.skyNight.clone().lerp(this.skyDay, daylight);

    this.sunLight.color.setHSL(0.1, 0.72, 0.58 + daylight * 0.1);
    this.moonLight.color.setHSL(0.085, 0.52, 0.58);

    this.baseSunIntensity = 0.12 + daylight * 1.56;
    this.baseMoonIntensity = 0.06 + nightBlend * 0.4;
    this.baseAmbientIntensity = 0.43 + daylight * 0.35;
  }

  private computeNightBlend(hours: number): number {
    const nightStart = 22;
    const nightEnd = 5;
    const transition = 1;

    if (hours >= nightStart && hours < nightStart + transition) {
      return (hours - nightStart) / transition;
    }
    if (hours >= nightEnd && hours < nightEnd + transition) {
      return 1 - (hours - nightEnd) / transition;
    }
    if (hours >= nightStart + transition || hours < nightEnd) {
      return 1;
    }
    return 0;
  }

  panByScreenDelta(deltaX: number, deltaY: number): void {
    this.camera.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward, this.up).normalize();

    const rightXZ = this.right.set(this.right.x, 0, this.right.z).normalize();
    const forwardXZ = this.forward.set(this.forward.x, 0, this.forward.z).normalize();

    const speed = 0.06 / this.camera.zoom;

    this.target.addScaledVector(rightXZ, -deltaX * speed);
    this.target.addScaledVector(forwardXZ, deltaY * speed);

    this.updateCamera();
  }

  zoomBy(delta: number): void {
    const next = this.camera.zoom * (delta > 0 ? 0.92 : 1.08);
    this.camera.zoom = Math.min(12, Math.max(0.6, next));
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }

  setTarget(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    this.updateCamera();
  }

  getTarget(): Vector3 {
    return this.target.clone();
  }

  private updateCamera(): void {
    const offset = this.cameraDir.clone().multiplyScalar(CAMERA_DISTANCE);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  raycast(clientX: number, clientY: number, target: Object3D): Intersection<Object3D> | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const intersections = this.raycaster.intersectObject(target, true);
    return intersections[0] ?? null;
  }
}
