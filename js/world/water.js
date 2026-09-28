// The Great Lake. A single shader: depth-tinted peaty water, layered ripples,
// sky reflections that match the dome, sun glints, shore foam and rain rings.
// An optional reduced-resolution planar reflection adds the castle.

import * as THREE from 'three';
import { U } from '../engine/shared.js';
import { SKY_UNIFORMS, SKY_FN } from '../engine/sky.js';
import { LAKE_DEPTH } from './terrain.js';

function makeWaveNormals(size = 256) {
  // Integer wave numbers keep the texture perfectly tileable.
  const waves = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 28; i++) {
    const ang = -0.6 + (rnd() - 0.5) * 2.2;
    const f = 2 + Math.floor(rnd() * rnd() * 22);
    const kx = Math.round(Math.cos(ang) * f), kz = Math.round(Math.sin(ang) * f);
    if (!kx && !kz) continue;
    waves.push({ kx, kz, a: 1 / (Math.hypot(kx, kz) ** 1.15), p: rnd() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dz = 0;
      const u = x / size, v = y / size;
      for (const w of waves) {
        const ph = 2 * Math.PI * (w.kx * u + w.kz * v) + w.p;
        const c = Math.cos(ph) * w.a * 2 * Math.PI;
        dx += c * w.kx;
        dz += c * w.kz;
      }
      dx *= 0.012; dz *= 0.012;
      const len = Math.hypot(dx, 1, dz);
      const k = (y * size + x) * 4;
      data[k] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[k + 1] = ((-dz / len) * 0.5 + 0.5) * 255;
      data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
uniform mat4 uTexMatrix;
varying vec3 vWPos;
varying vec4 vReflCoord;
#include <fog_pars_vertex>
void main() {
  vec3 transformed = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vReflCoord = uTexMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uWaveMap, uDepthMap, uReflect, uNoise;
uniform vec4 uDepthRect;
uniform float uReflectOn, uRain, uTime, uWind, uNight, uSnow, uLens;
uniform vec3 uAmbient;
varying vec3 vWPos;
varying vec4 vReflCoord;
#include <fog_pars_fragment>
${SKY_FN}

float hash12w(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 rainRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    vec2 q = p * (layer == 0 ? 0.9 : 1.7);
    vec2 cell = floor(q);
    vec2 f = fract(q);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(i, j);
      float h = hash12w(c + float(layer) * 17.0);
      vec2 o = vec2(hash12w(c + 3.1), hash12w(c + 7.7));
      vec2 d = f - vec2(i, j) - o;
      float life = fract(t * 0.9 + h);
      float r = life * 0.6;
      float dist = length(d);
      float ring = sin((dist - r) * 42.0) * smoothstep(0.08, 0.0, abs(dist - r)) * (1.0 - life);
      acc += d / max(dist, 1e-3) * ring;
    }
  }
  return acc;
}

void main() {
  vec3 V = cameraPosition - vWPos;
  float dist = length(V);
  V /= dist;
  float speed = 0.5 + uWind;
  vec2 w1 = vWPos.xz * 0.019 + uTime * vec2(0.010, 0.005) * speed;
  vec2 w2 = vWPos.xz * 0.061 + uTime * vec2(-0.009, 0.014) * speed;
  vec2 w3 = vWPos.xz * 0.0042 + uTime * vec2(0.002, 0.0015);
  vec2 s = (texture2D(uWaveMap, w1).xy * 2.0 - 1.0) * 0.55
         + (texture2D(uWaveMap, w2).xy * 2.0 - 1.0) * 0.32
         + (texture2D(uWaveMap, w3).xy * 2.0 - 1.0) * 0.5;
  float strength = mix(0.28, 1.35, clamp(uWind, 0.0, 1.2)) * mix(1.0, 0.3, smoothstep(120.0, 1500.0, dist));
  s *= strength;
  if (uRain > 0.01) s += rainRipples(vWPos.xz * 0.6, uTime) * 0.25 * uRain * (1.0 - smoothstep(30.0, 160.0, dist));
  vec3 N = normalize(vec3(s.x, 1.0, s.y));

  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyGradient(normalize(R), uFogColor, uFogSunColor, uSunDir);
  if (uReflectOn > 0.5) {
    vec2 ruv = vReflCoord.xy / vReflCoord.w + N.xz * 0.045;
    refl = texture2D(uReflect, ruv).rgb;
  }

  vec2 duv = (vWPos.xz - uDepthRect.xy) / uDepthRect.zw;
  float bed = texture2D(uDepthMap, duv).r * 100.0 - 50.0;
  float depth = max(0.0, -bed);
  vec3 shallow = vec3(0.075, 0.07, 0.035);
  vec3 deep = vec3(0.003, 0.009, 0.013);
  vec3 light = uAmbient + uSunColor * max(uSunDir.y, 0.0) * 0.35;
  vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.4)) * light;
  vec3 col = mix(body, refl, fres);

  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(N, H), 0.0);
  // Sun glints by day; after dark uSunDir is the moon, laying a silver path.
  col += uSunColor * (pow(nh, 420.0) * 7.0 + pow(nh, 55.0) * 0.12) * max(uSunVis, uNight);

  float fn = texture2D(uNoise, vWPos.xz * 0.11 + uTime * 0.015).r;
  float foam = smoothstep(1.4, 0.05, depth) * smoothstep(0.42, 0.72, fn + 0.25 * sin(uTime * 1.2 + depth * 7.0));
  col = mix(col, vec3(0.7, 0.72, 0.72) * light * 1.3, foam * 0.42);
  if (uLens > 0.001) col = mix(col, vec3(0.03, 0.05, 0.07), uLens * 0.6);

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

class PlanarReflection {
  constructor() {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.set(0);
    this.cam.layers.enable(1);
    this.texMatrix = new THREE.Matrix4();
    this._v = {
      normal: new THREE.Vector3(0, 1, 0), pos: new THREE.Vector3(), camPos: new THREE.Vector3(),
      rot: new THREE.Matrix4(), look: new THREE.Vector3(0, 0, -1), view: new THREE.Vector3(),
      target: new THREE.Vector3(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
    };
    this.frame = 0;
  }

  render(renderer, scene, camera, hide, scale, every = 1) {
    const w = Math.max(4, Math.floor(renderer.domElement.width * scale));
    const h = Math.max(4, Math.floor(renderer.domElement.height * scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    this.frame++;
    const v = this._v;
    v.pos.set(0, 0, 0);
    v.camPos.setFromMatrixPosition(camera.matrixWorld);
    v.view.subVectors(v.pos, v.camPos);
    if (v.view.dot(v.normal) > 0) return false; // camera under water
    v.view.reflect(v.normal).negate().add(v.pos);
    v.rot.extractRotation(camera.matrixWorld);
    v.look.set(0, 0, -1).applyMatrix4(v.rot).add(v.camPos);
    v.target.subVectors(v.pos, v.look).reflect(v.normal).negate().add(v.pos);
    const cam = this.cam;
    cam.position.copy(v.view);
    cam.up.set(0, 1, 0).applyMatrix4(v.rot).reflect(v.normal);
    cam.lookAt(v.target);
    cam.far = camera.far;
    cam.near = camera.near;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    if (this.frame % every !== 0) return true;

    v.plane.setFromNormalAndCoplanarPoint(v.normal, v.pos).applyMatrix4(cam.matrixWorldInverse);
    v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
    const pm = cam.projectionMatrix.elements;
    v.q.x = (Math.sign(v.clip.x) + pm[8]) / pm[0];
    v.q.y = (Math.sign(v.clip.y) + pm[9]) / pm[5];
    v.q.z = -1;
    v.q.w = (1 + pm[10]) / pm[14];
    v.clip.multiplyScalar(2 / v.clip.dot(v.q));
    pm[2] = v.clip.x; pm[6] = v.clip.y; pm[10] = v.clip.z + 1 - 0.003; pm[14] = v.clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    hide.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, cam);
    hide.visible = true;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
    return true;
  }
}

export class Lake {
  constructor(depthTexture) {
    this.reflection = new PlanarReflection();
    this.uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...U,
      ...SKY_UNIFORMS,
      uWaveMap: { value: makeWaveNormals() },
      uDepthMap: { value: depthTexture },
      uDepthRect: { value: new THREE.Vector4(LAKE_DEPTH.x0, LAKE_DEPTH.z0, LAKE_DEPTH.w, LAKE_DEPTH.h) },
      uReflect: { value: this.reflection.rt.texture },
      uReflectOn: { value: 0 },
      uTexMatrix: { value: this.reflection.texMatrix },
      uRain: { value: 0 },
      uAmbient: { value: new THREE.Color(0.3, 0.35, 0.4) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true,
    });
    const geo = new THREE.PlaneGeometry(2500, 1560, 80, 50);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(0, 0, 740);
    this.mesh.name = 'lake';
    this.mesh.receiveShadow = false;
    this.reflectScale = 0;
    this.reflectEvery = 1;
  }

  setQuality({ reflection, every = 1 }) {
    this.reflectScale = reflection;
    this.reflectEvery = every;
    this.uniforms.uReflectOn.value = reflection > 0 ? 1 : 0;
  }

  beforeRender(renderer, scene, camera) {
    if (this.reflectScale <= 0) return;
    const ok = this.reflection.render(renderer, scene, camera, this.mesh, this.reflectScale, this.reflectEvery);
    this.uniforms.uReflectOn.value = ok ? 1 : 0;
  }
}
