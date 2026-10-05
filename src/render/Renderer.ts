import * as THREE from 'three';
import type { WorldState } from '../sim/types';
import { BeeRenderer } from './BeeRenderer';
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
  readonly weatherFx = new WeatherFX();
  private fog = new THREE.Fog(0xbfd8f0, 80, 260);
  private clockTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.rig = new CameraRig(1);
    this.scene.fog = this.fog;
    this.sky = new Sky(this.scene);
    this.scene.add(this.terrain.group, this.flowers.group, this.bees.group, this.hive.group, this.weatherFx.lines);
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
    const cam = this.rig.camera.position;
    this.sky.update(world, cam);
    const cloud = world.weather.cloud;
    this.fog.color.copy(this.sky.horizon);
    this.fog.near = 70 - 30 * cloud - 25 * world.weather.rain;
    this.fog.far = 250 - 90 * cloud - 80 * world.weather.rain;
    this.flowers.sync(world);
    const visible = this.bees.sync(world, alpha, this.clockTime, cam);
    this.hive.sync(world, dt);
    this.weatherFx.update(world, cam, dt);
    this.gl.render(this.scene, this.rig.camera);
    return visible;
  }
}
