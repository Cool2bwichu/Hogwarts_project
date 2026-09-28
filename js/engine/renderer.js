// Renderer, lights and the frame budget. Quality tiers set the ceiling; an
// adaptive resolution scale keeps frames smooth underneath it. Shadows and
// reflections of the sky are only recomputed when the light actually moves.

import * as THREE from 'three';
import { U } from './shared.js';
import { PostPipeline } from './post.js';

export const TIERS = {
  smooth:    { label: 'Smooth', note: 'Lighter on your device', dpr: 1.0, msaa: 0, bloom: false, shadow: 1024, reflection: 0, trees: 0.45, terrain: 320, grass: 0 },
  balanced:  { label: 'Balanced', note: 'Detail and pace in balance', dpr: 1.5, msaa: 2, bloom: true, shadow: 2048, reflection: 0.34, reflectEvery: 2, trees: 0.8, terrain: 448, grass: 60000 },
  cinematic: { label: 'Cinematic', note: 'Castle reflections and sharper shadows', dpr: 2.0, msaa: 2, bloom: true, shadow: 4096, reflection: 0.5, reflectEvery: 1, trees: 1.0, terrain: 512, grass: 90000 },
  maximum:   { label: 'Maximum', note: 'Full resolution everywhere', dpr: 3.0, msaa: 4, bloom: true, shadow: 4096, reflection: 0.75, reflectEvery: 1, trees: 1.2, terrain: 640, grass: 130000 },
};

export function detectTier() {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  if (mobile || cores <= 4 || mem <= 4) return 'smooth';
  return 'balanced';
}

export class Renderer {
  constructor(container, tierId) {
    this.container = container;
    const r = new THREE.WebGLRenderer({
      antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    r.domElement.setAttribute('aria-label', 'Three-dimensional view of Hogwarts and its grounds');
    r.domElement.tabIndex = 0;
    this.gl = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9aa8b8, 0.0001); // switches on USE_FOG; colours come from U
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 30000);
    this.camera.layers.enableAll();

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.45;
    this.sun.shadow.radius = 2.5;
    this.shadowCenter = new THREE.Vector3(40, 60, -110);
    this.shadowHalf = 390;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb0c4de, 0x3a3a2a, 0.8);
    this.scene.add(this.hemi);

    this.post = new PostPipeline(r);
    this.adaptive = 1;
    this.frameTimes = [];
    this.lastLightDir = new THREE.Vector3();
    this.lastShadowCenter = new THREE.Vector3(1e9, 0, 0);
    this.shadowDirty = true;
    this.setTier(tierId);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  setTier(id) {
    this.tierId = id;
    this.tier = TIERS[id];
    this.post.configure({ samples: this.tier.msaa, bloom: this.tier.bloom });
    const s = this.tier.shadow;
    if (this.sun.shadow.mapSize.x !== s) {
      this.sun.shadow.mapSize.set(s, s);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.adaptive = 1;
    this.shadowDirty = true;
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, this.tier.dpr) * this.adaptive;
    this.pixelRatio = pr;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.gl.domElement.style.width = '100%';
    this.gl.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w * pr, h * pr);
  }

  /** Light the scene from the atmosphere model. */
  applyLight(atmo, focus) {
    const o = atmo.out;
    this.sun.color.copy(o.lightColor);
    this.sun.intensity = atmo.lightIntensity;
    this.hemi.color.copy(o.hemiSky);
    this.hemi.groundColor.copy(o.hemiGround);
    this.hemi.intensity = atmo.hemiIntensity;

    if (focus) {
      // Tighter, sharper shadows while walking.
      const moved = focus.distanceTo(this.lastShadowCenter) > 40;
      if (moved) {
        this.shadowCenter.copy(focus);
        this.shadowHalf = 130;
      }
    } else if (this.shadowHalf !== 390) {
      this.shadowCenter.set(40, 60, -110);
      this.shadowHalf = 390;
      this.shadowDirty = true;
    }
    const cam = this.sun.shadow.camera;
    if (cam.right !== this.shadowHalf) {
      cam.left = -this.shadowHalf; cam.right = this.shadowHalf;
      cam.top = this.shadowHalf; cam.bottom = -this.shadowHalf;
      cam.near = 10; cam.far = 1800;
      cam.updateProjectionMatrix();
      this.shadowDirty = true;
    }
    const dir = atmo.lightDir;
    if (dir.angleTo(this.lastLightDir) > 0.004 || !this.shadowCenter.equals(this.lastShadowCenter)) this.shadowDirty = true;
    if (this.shadowDirty) {
      this.sun.target.position.copy(this.shadowCenter);
      this.sun.position.copy(this.shadowCenter).addScaledVector(dir, 900);
      this.sun.target.updateMatrixWorld();
      this.sun.updateMatrixWorld();
      this.gl.shadowMap.needsUpdate = true;
      this.lastLightDir.copy(dir);
      this.lastShadowCenter.copy(this.shadowCenter);
      this.shadowDirty = false;
      this.shadowRendered = true;
    }
    U.uSunDir.value.copy(atmo.sunDir.y > -0.05 ? atmo.sunDir : atmo.moonDir);
    U.uSunColor.value.copy(o.sun).multiplyScalar(atmo.sunVisible > 0.01 ? 1 : 0);
    if (atmo.sunDir.y <= -0.05) U.uSunColor.value.copy(o.moonColor).multiplyScalar(0.18);
  }

  /** Adaptive resolution: trade pixels for pace, never the other way round. */
  track(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    this.frameTimes.length = 0;
    const min = 0.55;
    if (p80 > 1 / 42 && this.adaptive > min) {
      this.adaptive = Math.max(min, this.adaptive * 0.86);
      this.resize();
    } else if (p80 < 1 / 58 && this.adaptive < 1) {
      this.adaptive = Math.min(1, this.adaptive * 1.08);
      this.resize();
    }
  }

  render(params) {
    this.gl.info.reset();
    this.post.render(this.scene, this.camera, params);
  }
}
