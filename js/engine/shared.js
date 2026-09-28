// Shared uniforms, GLSL helpers and material factories.
// Every surface in the atlas reads the same small set of uniforms, so a change
// of weather or light is a handful of number writes, never a shader rebuild.

import * as THREE from 'three';
import { createNoise2D, mulberry32 } from './noise.js';

// ─── Tiling noise texture ─────────────────────────────────────────────────
function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const seeds = [11, 23, 37];
  const bases = [4, 8, 32];
  const layers = seeds.map((seed, c) => {
    const n = createNoise2D(seed);
    const base = bases[c];
    const out = new Float32Array(size * size);
    // Tileable fBm: sample 4D-ish torus by blending wrapped offsets.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0, amp = 0.5, norm = 0;
        for (let o = 0, f = base; o < 4; o++, f *= 2) {
          const u = x / size, v = y / size;
          const a = n(u * f, v * f);
          const b = n((u - 1) * f, v * f);
          const c2 = n(u * f, (v - 1) * f);
          const d = n((u - 1) * f, (v - 1) * f);
          const sx = u, sy = v;
          const val = a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c2 * (1 - sx) * sy + d * sx * sy;
          sum += val * amp;
          norm += amp;
          amp *= 0.5;
        }
        out[y * size + x] = sum / norm;
      }
    }
    return out;
  });
  const rand = mulberry32(99);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((layers[c][i] * 0.9 + 0.5) * 255)));
    }
    data[i * 4 + 3] = Math.floor(rand() * 256);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export const noiseTexture = makeNoiseTexture();

// ─── Shared uniforms ──────────────────────────────────────────────────────
export const U = {
  uTime: { value: 0 },
  uNoise: { value: noiseTexture },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: 0.35 },
  uLens: { value: 0 },           // accuracy lens: 0 off … 1 on
  uLensFocus: { value: -1 },     // provenance tier to spotlight, −1 = all
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, 0.4).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uFogDensity: { value: 0.00018 },
  uFogFalloff: { value: 0.0022 },
  uFogBase: { value: 0 },
  uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
  uFogSunColor: { value: new THREE.Color(1, 0.85, 0.7) },
  uZenith: { value: new THREE.Color(0.3, 0.45, 0.7) },
  uWindowGlow: { value: new THREE.Color(1.0, 0.22, 0.045) }, // candle flame, linear
  uGrade: { value: new THREE.Color(1, 1, 1) },   // the frame's colour filter
  uHighlight: { value: new THREE.Vector4(0, 0, 0, 0) }, // xz centre, radius, strength
};

// Accuracy lens palette (linear), indexed by PROV tier.
export const PROV_COLORS = ['#d9b25f', '#5fb3a3', '#a08fd8', '#8d8b84', '#d0806f'];
const provLinear = PROV_COLORS.map((h) => new THREE.Color(h));

// ─── GLSL snippets ────────────────────────────────────────────────────────
export const GLSL_COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

// Height fog with sun in-scattering; shared by every material via ShaderChunk.
const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
#endif
`;
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vec4 fogWp = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    fogWp = batchingMatrix * fogWp;
  #endif
  #ifdef USE_INSTANCING
    fogWp = instanceMatrix * fogWp;
  #endif
  vFogWorld = (modelMatrix * fogWp).xyz;
#endif
`;
export const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWorld;
  uniform float uFogDensity;
  uniform float uFogFalloff;
  uniform float uFogBase;
  uniform vec3 uFogColor;
  uniform vec3 uFogSunColor;
  uniform vec3 uSunDir;
  vec3 applyAtmosphere(vec3 col, vec3 wp) {
    vec3 ray = wp - cameraPosition;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-4);
    float fh = uFogFalloff;
    float camH = max(cameraPosition.y - uFogBase, 0.0);
    float dy = ray.y;
    float k = abs(fh * dy) > 1e-4 ? (1.0 - exp(-fh * dy)) / (fh * dy) : 1.0;
    float amt = uFogDensity * exp(-fh * camH) * dist * k;
    float f = 1.0 - exp(-max(amt, 0.0));
    float sunAmt = pow(max(dot(dir, uSunDir), 0.0), 5.0);
    vec3 fc = mix(uFogColor, uFogSunColor, sunAmt);
    return mix(col, fc, f);
  }
#endif
`;
const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vFogWorld);
#endif
`;

THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
THREE.ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;

// ─── Surface patterns ─────────────────────────────────────────────────────
// Patterns are procedural in metres (the builder writes metre UVs to aUvm),
// fade out with fwidth() so they never shimmer, and feed a bump normal.
const PATTERNS = /* glsl */ `
// returns vec3(albedo multiplier, height, pattern visibility)
vec3 patAshlar(vec2 m, float course) {
  vec2 bs = vec2(1.2, course);
  vec2 q = m / bs;
  float row = floor(q.y);
  q.x += hash12(vec2(row, 3.7)) * 0.7 + mod(row, 2.0) * 0.5;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  vec2 fw = fwidth(q);
  float vis = clamp(1.4 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
  vec2 e = min(f, 1.0 - f);
  float mx = smoothstep(0.035 - fw.x, 0.035 + fw.x, e.x);
  float my = smoothstep(0.075 - fw.y, 0.075 + fw.y, e.y);
  float stone = mx * my;
  float hb = hash12(cell);
  float face = 0.86 + 0.26 * hb;
  float alb = mix(1.0, mix(0.62, face, stone), vis);
  float h = stone * (0.55 + 0.25 * hb);
  return vec3(alb, h, vis);
}
vec3 patSlate(vec2 m) {
  vec2 q = m / vec2(0.34, 0.22);
  float row = floor(q.y);
  q.x += mod(row, 2.0) * 0.5 + hash12(vec2(row, 1.3)) * 0.2;
  vec2 cell = floor(q);
  vec2 f = fract(q);
  vec2 fw = fwidth(q);
  float vis = clamp(1.4 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);
  float hb = hash12(cell);
  float lap = smoothstep(0.62, 1.0, f.y);
  float gap = 1.0 - smoothstep(0.05 - fw.x, 0.05 + fw.x, min(f.x, 1.0 - f.x));
  float alb = mix(1.0, (0.78 + 0.32 * hb) * (1.0 - 0.28 * lap) * (1.0 - 0.35 * gap), vis);
  return vec3(alb, (1.0 - f.y) * 0.7 - gap * 0.3, vis);
}
vec3 patPlanks(vec2 m) {
  vec2 q = m / vec2(0.24, 3.1);
  float col = floor(q.x);
  q.y += hash12(vec2(col, 5.1)) * 3.0;
  vec2 f = fract(q);
  vec2 fw = fwidth(q);
  float vis = clamp(1.4 - max(fw.x, fw.y) * 2.5, 0.0, 1.0);
  float hb = hash12(vec2(col, floor(q.y)));
  float seam = 1.0 - smoothstep(0.04 - fw.x, 0.04 + fw.x, min(f.x, 1.0 - f.x));
  float grain = 0.9 + 0.1 * sin((m.x * 40.0 + hb * 20.0) + sin(m.y * 3.0) * 2.0);
  float alb = mix(1.0, (0.8 + 0.35 * hb) * grain * (1.0 - 0.45 * seam), vis);
  return vec3(alb, 1.0 - seam, vis);
}
vec3 patDressed(vec2 m) {
  vec2 q = m / vec2(0.9, 0.42);
  float row = floor(q.y);
  q.x += mod(row, 2.0) * 0.5;
  vec2 f = fract(q);
  vec2 fw = fwidth(q);
  float vis = clamp(1.4 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
  vec2 e = min(f, 1.0 - f);
  float joint = 1.0 - smoothstep(0.02 - fw.x, 0.02 + fw.x, e.x) * smoothstep(0.04 - fw.y, 0.04 + fw.y, e.y);
  float hb = hash12(floor(q));
  return vec3(mix(1.0, (0.93 + 0.12 * hb) * (1.0 - 0.3 * joint), vis), 1.0 - joint, vis);
}
`;

// Bump from a procedural height (Mikkelsen's surface-gradient method).
const BUMP = /* glsl */ `
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, float h, float scale) {
  vec3 vSigmaX = dFdx(surfPos);
  vec3 vSigmaY = dFdy(surfPos);
  vec3 vN = surfNorm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1);
  float dBs = dFdx(h) * scale;
  float dBt = dFdy(h) * scale;
  vec3 vGrad = sign(fDet) * (dBs * R1 + dBt * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}
`;

/**
 * A MeshStandardMaterial with procedural masonry, weather response and the
 * accuracy lens. `pattern` is one of ashlar | dressed | slate | planks | none.
 */
export function makeSurface({
  color = '#8f8a80',
  roughness = 0.9,
  metalness = 0,
  pattern = 'ashlar',
  course = 0.5,
  bump = 0.012,
  grime = 1,
  envMapIntensity = 0.55,
  side = THREE.FrontSide,
  weather = true,
} = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness, metalness, vertexColors: true, side, envMapIntensity,
  });
  const patFn = {
    ashlar: `patAshlar(vUvm, ${course.toFixed(3)})`,
    dressed: 'patDressed(vUvm)',
    slate: 'patSlate(vUvm)',
    planks: 'patPlanks(vUvm)',
    none: 'vec3(1.0, 0.0, 0.0)',
  }[pattern];

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.uniforms.uProvColors = { value: provLinear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aUvm;
        attribute float aProv;
        varying vec2 vUvm;
        varying float vProv;
        varying vec3 vWPos;
        varying vec3 vWNorm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vUvm = aUvm;
        vProv = aProv;
        vec4 wpS = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpS = instanceMatrix * wpS;
        #endif
        vWPos = (modelMatrix * wpS).xyz;
        vec3 wnS = objectNormal;
        #ifdef USE_INSTANCING
          wnS = mat3(instanceMatrix) * wnS;
        #endif
        vWNorm = normalize(mat3(modelMatrix) * wnS);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise;
        uniform float uTime, uSnow, uWet, uLens, uLensFocus;
        uniform vec3 uProvColors[5];
        uniform vec4 uHighlight;
        varying vec2 vUvm;
        varying float vProv;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        ${GLSL_COMMON}
        ${PATTERNS}
        ${BUMP}
        vec3 gPat;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gPat = ${patFn};
        diffuseColor.rgb *= gPat.x;
        {
          // Weathering: broad tonal drift, rain streaks and damp at the base.
          float big = texture2D(uNoise, vWPos.xz * 0.0035 + vWPos.y * 0.001).g;
          float streak = texture2D(uNoise, vec2((vWPos.x + vWPos.z) * 0.06, vWPos.y * 0.006)).b;
          float vertical = 1.0 - abs(vWNorm.y);
          diffuseColor.rgb *= mix(1.0, 0.86 + 0.28 * big, ${grime.toFixed(2)});
          diffuseColor.rgb *= 1.0 - ${grime.toFixed(2)} * vertical * 0.22 * smoothstep(0.45, 0.8, streak);
          float moss = smoothstep(0.55, 0.8, texture2D(uNoise, vWPos.xz * 0.02 + vWPos.y * 0.03).r) * smoothstep(0.1, 0.9, vWNorm.y + 0.2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.07), moss * 0.35 * ${grime.toFixed(2)});
        }
        ${weather ? `
        float gSnow = uSnow * smoothstep(0.5, 0.85, vWNorm.y + (texture2D(uNoise, vWPos.xz * 0.05).r - 0.5) * 0.4);
        float gWet = uWet * (1.0 - gSnow);
        diffuseColor.rgb *= 1.0 - 0.32 * gWet;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), gSnow);` : 'float gSnow = 0.0; float gWet = 0.0;'}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.22, gWet * 0.75);
        roughnessFactor = mix(roughnessFactor, 0.7, gSnow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = bumpNormal(-vViewPosition, normal, gPat.y * gPat.z * (1.0 - gSnow), ${bump.toFixed(4)});`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uLens > 0.001) {
          int pi = int(vProv + 0.5);
          vec3 pc = uProvColors[0];
          if (pi == 1) pc = uProvColors[1];
          else if (pi == 2) pc = uProvColors[2];
          else if (pi == 3) pc = uProvColors[3];
          else if (pi == 4) pc = uProvColors[4];
          float shade = 0.3 + 1.1 * sqrt(luma(gl_FragColor.rgb));
          float dim = (uLensFocus >= 0.0 && abs(vProv - uLensFocus) > 0.5) ? 0.25 : 1.0;
          vec3 lensCol = pc * shade * dim;
          // Hatch interpreted forms so they read as "our reading", not fact.
          if (pi == 3) lensCol *= 0.82 + 0.18 * step(0.5, fract((vWPos.x + vWPos.y + vWPos.z) * 0.35));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, lensCol, uLens * 0.85);
        }
        if (uHighlight.w > 0.001) {
          float d = length(vWPos.xz - uHighlight.xy);
          float ring = smoothstep(uHighlight.z, uHighlight.z * 0.6, d);
          gl_FragColor.rgb += vec3(1.0, 0.8, 0.45) * ring * uHighlight.w * 0.12;
        }`);
  };
  mat.customProgramCacheKey = () => `surf-${pattern}-${course}-${bump}-${grime}-${weather}`;
  return mat;
}

/** Window glass: reflective by day, lit by candles at night. */
export function makeGlass() {
  const mat = new THREE.MeshStandardMaterial({
    color: '#1b232b', roughness: 0.12, metalness: 0.2, vertexColors: true, envMapIntensity: 1.1,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.uniforms.uProvColors = { value: provLinear };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aLit;
        attribute float aProv;
        varying vec2 vLit;
        varying float vProv;
        varying vec3 vWPosG;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vLit = aLit; vProv = aProv;
        vWPosG = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uNight, uLens, uLensFocus;
        uniform vec3 uWindowGlow, uGrade;
        uniform vec3 uProvColors[5];
        varying vec2 vLit;
        varying float vProv;
        varying vec3 vWPosG;
        ${GLSL_COMMON}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float on = smoothstep(0.0, 0.25, uNight - (1.0 - vLit.x) * 0.9);
          float flick = 0.86 + 0.14 * sin(uTime * (2.0 + vLit.y * 5.0) + vLit.y * 40.0) * sin(uTime * 3.1 + vLit.y * 17.0);
          vec3 tint = mix(uWindowGlow, vec3(1.0, 0.36, 0.1), vLit.y);
          // Candlelight is not moonlight: undo the night grade so it stays amber.
          tint *= luma(uGrade) / max(uGrade, vec3(0.05));
          totalEmissiveRadiance += tint * on * flick * 2.4 * step(0.58, vLit.x);
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uLens > 0.001) {
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.08, 0.09, 0.1), uLens * 0.6);
        }`);
  };
  mat.customProgramCacheKey = () => 'glass';
  return mat;
}

/** Give any other material the shared fog uniforms. */
export function withSharedUniforms(mat, extra) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    Object.assign(shader.uniforms, U);
    if (extra) extra(shader, r);
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(shader, r);
  };
  return mat;
}
