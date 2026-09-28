// Grass blades around the camera. A fixed grid of instances follows the
// camera in whole-cell steps, so blades stay put in the world; the field
// texture says how much grass grows where, and at what height.

import * as THREE from 'three';
import { U } from '../engine/shared.js';

const FIELD = { x0: -600, z0: -600, size: 1200, res: 768 };

export class Grass {
  constructor({ count = 90000, radius = 40 } = {}) {
    const G = Math.floor(Math.sqrt(count));
    this.G = G;
    this.radius = radius;
    this.cell = (radius * 2) / G;
    // A clump of three blades, each two tapering segments and a tip.
    const geo = new THREE.InstancedBufferGeometry();
    const pos = [], idx = [];
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 0.3, c = Math.cos(a), sn = Math.sin(a);
      const ox = Math.cos(a + 1) * 0.35, oz = Math.sin(a + 1) * 0.35;
      const hs = [1, 0.8, 0.65][k];
      const blade = [[-0.5, 0], [0.5, 0], [-0.33, 0.5], [0.33, 0.5], [0, 1]];
      const base = pos.length / 3;
      for (const [bx, by] of blade) pos.push(ox + bx * c, by * hs, oz + bx * sn);
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3, base + 2, base + 3, base + 4);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.instanceCount = G * G;
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...U,
      uField: { value: null },
      uFieldRect: { value: new THREE.Vector3(FIELD.x0, FIELD.z0, FIELD.size) },
      uOrigin: { value: new THREE.Vector2() },
      uCell: { value: this.cell },
      uGrid: { value: G },
      uRadius: { value: radius },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uHemiSky: { value: new THREE.Color(0.5, 0.6, 0.7) },
      uHemiGround: { value: new THREE.Color(0.2, 0.2, 0.15) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform sampler2D uField, uNoise;
        uniform vec3 uFieldRect;
        uniform vec2 uOrigin;
        uniform float uCell, uGrid, uRadius, uTime, uWind, uSnow;
        varying float vH;
        varying vec3 vCol;
        varying vec3 vN;
        #include <fog_pars_vertex>
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          float id = float(gl_InstanceID);
          vec2 g = vec2(mod(id, uGrid), floor(id / uGrid));
          vec2 cellW = floor(uOrigin / uCell) + g - uGrid * 0.5;
          float r1 = hash(cellW), r2 = hash(cellW + 17.1), r3 = hash(cellW + 41.7), r4 = hash(cellW + 3.3);
          vec2 xz = (cellW + vec2(r1, r2)) * uCell;
          vec2 fuv = (xz - uFieldRect.xy) / uFieldRect.z;
          vec4 f = texture2D(uField, fuv);
          float inside = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
          float dist = length(xz - cameraPosition.xz);
          float fade = 1.0 - smoothstep(uRadius * 0.6, uRadius * 0.98, dist);
          float grow = step(r3, f.g) * inside * fade * (1.0 - uSnow * 0.85);
          float lawn = f.b;
          float h = mix(0.22 + r4 * 0.24, 0.08 + r4 * 0.08, lawn) * grow;
          float w = mix(0.12, 0.09, lawn) * (0.8 + r1 * 0.5);
          float ang = r3 * 6.2831;
          vec2 dir = vec2(cos(ang), sin(ang));
          vec3 p = position;
          // Turn the clump to its own angle.
          p.xz = vec2(p.x * dir.x - p.z * dir.y, p.x * dir.y + p.z * dir.x);
          float t = p.y;
          // Wind: a travelling gust plus a small flutter.
          float gust = sin(dot(xz, vec2(0.08, 0.05)) - uTime * (1.2 + uWind * 1.6)) * 0.5 + 0.5;
          vec2 bend = vec2(0.8, 0.35) * (0.15 + uWind) * gust * 0.55 + vec2(sin(uTime * 3.1 + r1 * 20.0), cos(uTime * 2.7 + r2 * 20.0)) * 0.05;
          bend += dir * 0.18;
          vec3 world = vec3(xz.x, f.r, xz.y);
          world.xz += p.xz * w + bend * t * t * h;
          world.y += t * h * (1.0 - 0.25 * dot(bend, bend));
          vH = t;
          vN = normalize(vec3(bend.x * 0.6 + p.x * 0.3, 1.0, bend.y * 0.6 + p.z * 0.3));
          // Colour follows the terrain's grass so blades melt into the ground.
          float nL = texture2D(uNoise, xz * 0.0019).g;
          float nM = texture2D(uNoise, xz * 0.013).b;
          vec3 a = pow(vec3(0.33, 0.44, 0.19), vec3(2.2));
          vec3 b = pow(vec3(0.46, 0.49, 0.26), vec3(2.2));
          vec3 lawnC = pow(vec3(0.30, 0.46, 0.18), vec3(2.2));
          vec3 base = mix(mix(a, b, smoothstep(0.35, 0.72, nL * 0.7 + nM * 0.3)), lawnC, lawn);
          vCol = base * (0.75 + 0.5 * r2);
          vec4 mv = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mv;
          vec3 transformed = world;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLightDir, uLightColor, uHemiSky, uHemiGround;
        uniform float uWet;
        varying float vH;
        varying vec3 vCol;
        varying vec3 vN;
        #include <fog_pars_fragment>
        void main() {
          vec3 n = normalize(vN);
          float ndl = max(dot(n, uLightDir), 0.0) * 0.8 + 0.2;
          vec3 V = normalize(vFogWorld - cameraPosition);
          float back = pow(max(dot(V, uLightDir), 0.0), 4.0) * 0.6 * vH;
          vec3 amb = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * n.y);
          float ao = 0.45 + 0.55 * vH;
          vec3 col = vCol * (amb * ao + uLightColor * (ndl * ao + back)) * (1.0 - uWet * 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'grass';
    this.ready = false;
    this.startWorker();
  }

  startWorker() {
    try {
      const w = new Worker(new URL('../workers/field.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        const tex = new THREE.DataTexture(ev.data.data, FIELD.res, FIELD.res, THREE.RGBAFormat, THREE.HalfFloatType);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        this.uniforms.uField.value = tex;
        this.ready = true;
        w.terminate();
      };
      w.onerror = () => { this.failed = true; };
      w.postMessage(FIELD);
    } catch {
      this.failed = true;
    }
  }

  update(camera, renderer, enabled, groundY) {
    // Only worth drawing when the camera is low enough to see blades.
    this.mesh.visible = enabled && this.ready && camera.position.y - groundY < 45;
    if (!this.mesh.visible) return;
    this.uniforms.uOrigin.value.set(camera.position.x, camera.position.z);
    this.uniforms.uLightDir.value.copy(renderer.sun.position).sub(renderer.sun.target.position).normalize();
    this.uniforms.uLightColor.value.copy(renderer.sun.color).multiplyScalar(renderer.sun.intensity);
    this.uniforms.uHemiSky.value.copy(renderer.hemi.color).multiplyScalar(renderer.hemi.intensity);
    this.uniforms.uHemiGround.value.copy(renderer.hemi.groundColor).multiplyScalar(renderer.hemi.intensity);
  }
}
