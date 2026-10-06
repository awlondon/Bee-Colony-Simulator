import * as THREE from 'three';
import type { WorldState } from '../sim/types';
import { BeeRenderer } from './BeeRenderer';
import { BeekeeperRenderer } from './BeekeeperRenderer';
import { windUniforms } from './BeeVision';
import { CameraRig } from './CameraRig';
import { FlowerRenderer } from './FlowerRenderer';
import { HiveRenderer } from './HiveRenderer';
import { Sky } from './Sky';
import { Terrain } from './Terrain';
import { WeatherFX } from './WeatherFX';

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly sky: Sky;
  readonly terrain = new Terrain();
  readonly flowers = new FlowerRenderer();
  readonly bees = new BeeRenderer();
  readonly hive = new HiveRenderer();
  readonly keeper = new BeekeeperRenderer();
  readonly weatherFx = new WeatherFX();
  private fog = new THREE.Fog(0xbfd8f0, 80, 260);
  private ghost: THREE.Mesh;
  private beacon: THREE.Mesh;
  private clockTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.rig = new CameraRig(1);
    this.scene.fog = this.fog;
    this.sky = new Sky(this.scene);
    this.ghost = new THREE.Mesh(
      new THREE.RingGeometry(4.2, 4.7, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }),
    );
    this.ghost.visible = false;
    this.ghost.renderOrder = 5;
    this.scene.add(this.ghost);
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 18, 12, 1, true).translate(0, 9, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.scene.add(this.terrain.group, this.flowers.group, this.bees.group, this.hive.group, this.keeper.group, this.keeper.smoke.points, this.weatherFx.lines);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** While the player dances, mark the patch the dance advertises so the code is easy to read. */
  private updateBeacon(world: WorldState): void {
    const bee = world.bees.find((b) => b.possessed && b.state === 'waggleDance' && b.dance);
    const patch = bee?.dance ? world.patches.find((p) => p.id === bee.dance!.patchId) : undefined;
    this.beacon.visible = !!patch;
    if (!patch) return;
    this.beacon.position.set(patch.pos.x, patch.pos.y, patch.pos.z);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(this.clockTime * 4);
  }

  /** Show or hide the planting cursor on the ground. */
  setGhost(pos: { x: number; y: number; z: number } | null, ok: boolean): void {
    this.ghost.visible = pos !== null;
    if (!pos) return;
    this.ghost.position.set(pos.x, pos.y + 0.15, pos.z);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(ok ? 0x66ff88 : 0xff6655);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setSize(w, h, false);
    this.rig.setAspect(w / Math.max(1, h));
  }

  /** Sync all sub-renderers with the sim and draw. Returns the number of visible bees. */
  render(world: WorldState, alpha: number, dt: number): number {
    this.clockTime += dt;
    windUniforms.uTime.value = this.clockTime;
    windUniforms.uWind.value = world.weather.wind;
    const cam = this.rig.camera.position;
    this.sky.update(world, cam);
    const cloud = world.weather.cloud;
    this.fog.color.copy(this.sky.horizon);
    this.fog.near = 70 - 30 * cloud - 25 * world.weather.rain;
    this.fog.far = 250 - 90 * cloud - 80 * world.weather.rain;
    this.flowers.sync(world);
    const visible = this.bees.sync(world, alpha, this.clockTime, cam);
    this.hive.sync(world, dt);
    this.keeper.smoke.setView(this.canvas.height || 720, this.rig.camera.fov);
    this.keeper.sync(world, alpha, dt, this.clockTime, cam);
    this.updateBeacon(world);
    this.weatherFx.update(world, cam, dt);
    this.gl.render(this.scene, this.rig.camera);
    return visible;
  }
}
