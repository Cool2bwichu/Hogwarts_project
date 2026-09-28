// Terrain: a warped grid that is dense at the castle and coarse at the
// horizon, an outer mountain ring, painted path masks and a loch depth map.

import * as THREE from 'three';
import {
  heightAt, forestDensity, boxDist, PATHS, PLOTS, PITCH, LAKE, lakeSDF,
} from './layout.js';
import { U, GLSL_COMMON } from '../engine/shared.js';
import { smoothstep } from '../engine/noise.js';

export const TERRAIN_HALF = 2300;
export const MASK_NEAR = { x0: -820, z0: -820, size: 1640, res: 2048 };
export const MASK_FAR = { x0: -2600, z0: -2600, size: 5200, res: 1024 };
export const LAKE_DEPTH = { x0: -1150, z0: 30, w: 2300, h: 1420, resX: 384, resZ: 240 };

function warp(u) {
  // Linear near the centre, cubic toward the edges.
  const a = 0.075;
  return TERRAIN_HALF * (a * u + (1 - a) * Math.sign(u) * Math.abs(u) ** 3);
}

// ─── Path masks ───────────────────────────────────────────────────────────
// One RGB canvas: R = gravel and roads, G = dirt paths, B = cultivated soil.
// Worn grass around them comes from a blurred mip level in the shader.
function paintMask(rect) {
  const { x0, z0, size, res } = rect;
  const s = res / size;
  const toPx = ([x, z]) => [(x - x0) * s, (z - z0) * s];
  const c = document.createElement('canvas');
  c.width = c.height = res;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, res, res);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (color, pts, width) => {
    // A soft edge: a wide faint pass under a narrower strong one.
    for (const [w, a] of [[width + 1.2, 0.35], [width, 0.75]]) {
      g.strokeStyle = color.replace('A', a);
      g.lineWidth = Math.max(1, w * s);
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(...toPx(p)) : g.moveTo(...toPx(p))));
      g.stroke();
    }
  };
  for (const p of PATHS) {
    if (p.kind === 'gravel' || p.kind === 'road') stroke('rgba(255,0,0,A)', p.pts, p.width);
    else stroke('rgba(0,255,0,A)', p.pts, p.width);
  }
  for (const pl of PLOTS) {
    g.save();
    const [px, pz] = toPx([pl.x, pl.z]);
    g.translate(px, pz);
    g.rotate(pl.rot);
    g.fillStyle = 'rgb(0,0,255)';
    g.fillRect((-pl.w / 2) * s, (-pl.d / 2) * s, pl.w * s, pl.d * s);
    g.restore();
  }
  const d = g.getImageData(0, 0, res, res).data;
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), res, res, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// ─── Material ─────────────────────────────────────────────────────────────
const TERRAIN_FRAG = /* glsl */ `
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
vec3 terrainAlbedo(out float rough, out float bumpH) {
  vec3 grassA = srgb(vec3(0.33, 0.44, 0.19));
  vec3 grassB = srgb(vec3(0.46, 0.49, 0.26));
  vec3 lawn   = srgb(vec3(0.30, 0.46, 0.18));
  vec3 floorC = srgb(vec3(0.22, 0.2, 0.13));
  vec3 moss   = srgb(vec3(0.23, 0.28, 0.14));
  vec3 heath  = srgb(vec3(0.40, 0.33, 0.30));
  vec3 bloom  = srgb(vec3(0.46, 0.32, 0.43));
  vec3 bracken= srgb(vec3(0.52, 0.34, 0.17));
  vec3 rockA  = srgb(vec3(0.46, 0.45, 0.42));
  vec3 rockB  = srgb(vec3(0.31, 0.31, 0.3));
  vec3 shingle= srgb(vec3(0.53, 0.5, 0.44));
  vec3 sand   = srgb(vec3(0.6, 0.55, 0.45));
  vec3 gravel = srgb(vec3(0.52, 0.49, 0.43));
  vec3 dirt   = srgb(vec3(0.42, 0.34, 0.25));
  vec3 soil   = srgb(vec3(0.36, 0.27, 0.18));
  vec3 snowC  = vec3(0.86, 0.9, 0.95);

  vec2 xz = vWPos.xz;
  float h = vWPos.y;
  float slope = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
  float nL = texture2D(uNoise, xz * 0.0019).g;
  float nM = texture2D(uNoise, xz * 0.013).b;
  float nS = texture2D(uNoise, xz * 0.085).r;
  float nX = texture2D(uNoise, xz * 0.41).a;

  vec3 grass = mix(grassA, grassB, smoothstep(0.35, 0.72, nL * 0.7 + nM * 0.3));
  grass *= 0.84 + 0.3 * nS;
  // Fine detail that only shows up close: clumps, dry stems, clover.
  float nF = texture2D(uNoise, xz * 0.9).r;
  float nG = texture2D(uNoise, xz * 3.7 + 0.37).g;
  float fine = 1.0 - smoothstep(30.0, 140.0, length(vWPos - cameraPosition));
  grass *= mix(1.0, 0.8 + 0.34 * nF, fine);
  grass = mix(grass, grass * vec3(1.25, 1.12, 0.7), smoothstep(0.62, 0.8, nG) * 0.5 * fine);
  float moor = smoothstep(95.0, 200.0, h + (nL - 0.5) * 90.0);
  vec3 moorC = mix(heath, bracken, smoothstep(0.42, 0.62, nM));
  moorC = mix(moorC, bloom, smoothstep(0.6, 0.78, nL) * 0.45);
  moorC *= 0.85 + 0.3 * nS;
  vec3 col = mix(grass, moorC, moor);
  col = mix(col, lawn * (0.9 + 0.14 * nS), vLawn);

  float forest = smoothstep(0.15, 0.85, vForest);
  col = mix(col, mix(floorC, moss, nM) * (0.78 + 0.35 * nS), forest);

  float rockAmt = smoothstep(0.4, 0.62, slope + (nM - 0.5) * 0.3);
  rockAmt = max(rockAmt, smoothstep(560.0, 820.0, h + (nL - 0.5) * 180.0) * smoothstep(0.08, 0.3, slope + 0.1));
  // Sample rock across the face, not from above, so cliffs don't streak.
  vec2 rp = abs(vWNorm.x) > abs(vWNorm.z) ? vec2(xz.y, h) : vec2(xz.x, h);
  rp = mix(xz, rp, smoothstep(0.25, 0.55, slope));
  float rS = texture2D(uNoise, rp * 0.09).r;
  float rM = texture2D(uNoise, rp * 0.023).b;
  float rX = texture2D(uNoise, rp * 0.37).a;
  vec3 rockC = mix(rockB, rockA, smoothstep(0.3, 0.7, rS)) * (0.8 + 0.3 * rM) * (0.9 + 0.2 * rX);
  rockC *= 0.88 + 0.14 * sin(h * 1.7 + rM * 9.0);
  // Lichen and damp on the crags.
  rockC = mix(rockC, srgb(vec3(0.5, 0.5, 0.36)), smoothstep(0.62, 0.78, rM) * 0.35);
  col = mix(col, rockC, rockAmt);

  float shore = 1.0 - smoothstep(0.7, 2.8, h + (nS - 0.5) * 1.1);
  col = mix(col, mix(shingle, sand, nM) * (0.85 + 0.25 * nX), shore * (1.0 - rockAmt * 0.6));

  vec4 mk;
  float worn;
  vec2 un = (xz - uMaskNearRect.xy) / uMaskNearRect.z;
  if (un.x > 0.002 && un.y > 0.002 && un.x < 0.998 && un.y < 0.998) {
    mk = texture2D(uMaskNear, un);
    vec4 blur = textureLod(uMaskNear, un, 4.2);
    worn = clamp((blur.r + blur.g) * 2.2, 0.0, 1.0);
  } else {
    vec2 uf = (xz - uMaskFarRect.xy) / uMaskFarRect.z;
    mk = texture2D(uMaskFar, uf);
    vec4 blur = textureLod(uMaskFar, uf, 2.0);
    worn = clamp((blur.r + blur.g) * 2.0, 0.0, 1.0);
  }
  col = mix(col, col * 0.78 + dirt * 0.22, worn * 0.7);
  col = mix(col, gravel * (0.82 + 0.3 * nX), mk.r * 0.9);
  col = mix(col, dirt * (0.78 + 0.35 * nS), mk.g);
  vec3 rows = soil * (0.85 + 0.25 * smoothstep(0.3, 0.7, fract(xz.y * 0.34 + nS * 0.3))) * (0.9 + 0.2 * nX);
  col = mix(col, rows, mk.b);

  // The pitch: mown in bands, with a chalk boundary.
  vec2 pq = (xz - uPitch.xy) / uPitch.zw;
  float pe = length(pq);
  if (pe < 1.08) {
    float band = step(0.5, fract((xz.y - uPitch.y) / 7.62));
    vec3 turf = lawn * (0.9 + 0.12 * band) * (0.95 + 0.08 * nS);
    col = mix(col, turf, 1.0 - smoothstep(0.98, 1.06, pe));
    float fw = fwidth(pe);
    float line = 1.0 - smoothstep(0.0, fw * 1.5 + 0.002, abs(pe - 1.0));
    float mid = 1.0 - smoothstep(0.0, fwidth(pq.y) * 1.5 + 0.002, abs(pq.y));
    col = mix(col, vec3(0.8), max(line, mid * step(pe, 1.0)) * 0.7);
  }

  float snowAmt = uSnow * smoothstep(0.22, 0.5, vWNorm.y - 0.45 + nS * 0.25) * (1.0 - forest * 0.55);
  col = mix(col, snowC * (0.95 + 0.05 * nS), snowAmt);
  float wet = uWet * (1.0 - snowAmt);
  col *= 1.0 - 0.26 * wet;
  rough = mix(0.96, 0.28, wet * clamp(mk.r + mk.g + shore, 0.0, 1.0) * smoothstep(0.45, 0.62, nS));
  rough = mix(rough, 0.7, snowAmt);
  bumpH = (nS * 0.6 + nX * 0.4 + (nF * 0.5 + nG * 0.5) * fine) * (1.0 - snowAmt) + rockAmt * (rS * 1.4 + rX * 0.8);
  return col;
}
`;

export function makeTerrainMaterial({ discardInner = 0, masks }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, envMapIntensity: 0.35 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, {
      uMaskNear: { value: masks.near },
      uMaskFar: { value: masks.far },
      uMaskNearRect: { value: new THREE.Vector3(MASK_NEAR.x0, MASK_NEAR.z0, MASK_NEAR.size) },
      uMaskFarRect: { value: new THREE.Vector3(MASK_FAR.x0, MASK_FAR.z0, MASK_FAR.size) },
      uPitch: { value: new THREE.Vector4(PITCH.x, PITCH.z, PITCH.rx, PITCH.rz) },
      uDiscardInner: { value: discardInner },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aForest;
        attribute float aLawn;
        varying float vForest;
        varying float vLawn;
        varying vec3 vWPos;
        varying vec3 vWNorm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vForest = aForest; vLawn = aLawn;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNoise, uMaskNear, uMaskFar;
        uniform vec3 uMaskNearRect, uMaskFarRect;
        uniform vec4 uPitch;
        uniform float uSnow, uWet, uLens, uDiscardInner;
        varying float vForest;
        varying float vLawn;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        ${GLSL_COMMON}
        ${TERRAIN_FRAG}
        float gRough; float gBump;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uDiscardInner > 0.0 && abs(vWPos.x) < uDiscardInner && abs(vWPos.z) < uDiscardInner) discard;
        diffuseColor.rgb = terrainAlbedo(gRough, gBump);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gRough;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(gBump) * r1 + dFdy(gBump) * r2) * 0.05;
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uLens > 0.001) {
          float l = luma(gl_FragColor.rgb);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(l * 0.55 + 0.01), uLens * 0.75);
        }`);
  };
  mat.customProgramCacheKey = () => `terrain-${discardInner > 0}`;
  return mat;
}

// ─── Geometry ─────────────────────────────────────────────────────────────
function buildGrid(N) {
  const n = N + 1;
  const xs = new Float32Array(n);
  for (let i = 0; i < n; i++) xs[i] = warp(-1 + (2 * i) / N);
  const H = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = heightAt(xs[i], xs[j]);

  const skirt = 4 * N;
  const vcount = n * n + skirt;
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const forest = new Float32Array(vcount);
  const lawn = new Float32Array(vcount);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = xs[i], z = xs[j];
      pos[k * 3] = x;
      pos[k * 3 + 1] = H[k];
      pos[k * 3 + 2] = z;
      const il = Math.max(0, i - 1), ir = Math.min(N, i + 1);
      const jl = Math.max(0, j - 1), jr = Math.min(N, j + 1);
      const dhx = (H[j * n + ir] - H[j * n + il]) / (xs[ir] - xs[il]);
      const dhz = (H[jr * n + i] - H[jl * n + i]) / (xs[jr] - xs[jl]);
      const len = Math.hypot(dhx, 1, dhz);
      nor[k * 3] = -dhx / len;
      nor[k * 3 + 1] = 1 / len;
      nor[k * 3 + 2] = -dhz / len;
      const r = Math.hypot(x, z);
      const fd = r < 2400 ? forestDensity(x, z) : 0.4;
      forest[k] = fd;
      const cb = boxDist(x, z, -18, -10, 186, 94);
      const pe = Math.hypot((x - PITCH.x) / 70, (z - PITCH.z) / 125);
      lawn[k] = Math.max((1 - smoothstep(40, 170, cb)), 1 - smoothstep(0.9, 1.5, pe)) * (1 - fd) * (H[k] > 2.5 ? 1 : 0);
    }
  }
  const idx = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // Alternate the diagonal to avoid a directional grain.
      if ((i + j) & 1) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  // Skirts hide hairline cracks where the grid meets the mountain ring.
  let v = n * n;
  const edge = [];
  for (let i = 0; i < N; i++) edge.push(i);                       // north row
  for (let j = 0; j < N; j++) edge.push(j * n + N);                // east col
  for (let i = N; i > 0; i--) edge.push(N * n + i);                // south row
  for (let j = N; j > 0; j--) edge.push(j * n);                    // west col
  const skirtStart = v;
  for (const e of edge) {
    pos[v * 3] = pos[e * 3];
    pos[v * 3 + 1] = pos[e * 3 + 1] - 90;
    pos[v * 3 + 2] = pos[e * 3 + 2];
    nor[v * 3 + 1] = 1;
    forest[v] = forest[e];
    v++;
  }
  for (let q = 0; q < edge.length; q++) {
    const a = edge[q], b = edge[(q + 1) % edge.length];
    const sa = skirtStart + q, sb = skirtStart + ((q + 1) % edge.length);
    idx.push(a, sa, b, b, sa, sb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  g.setAttribute('aLawn', new THREE.BufferAttribute(lawn, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function buildRing() {
  const seg = 440, rings = 76;
  const r0 = 2100, r1 = 11000;
  const w = seg + 1;
  const P = new Float32Array(w * (rings + 1) * 3);
  for (let j = 0; j <= rings; j++) {
    const r = r0 * Math.pow(r1 / r0, j / rings);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const k = (j * w + i) * 3;
      P[k] = x; P[k + 1] = heightAt(x, z); P[k + 2] = z;
    }
  }
  // Normals from the grid itself: cross of the two neighbour differences.
  const nor = new Float32Array(P.length);
  const at = (i, j) => ((Math.min(rings, Math.max(0, j)) * w + ((i + seg) % seg)) * 3);
  for (let j = 0; j <= rings; j++) {
    for (let i = 0; i <= seg; i++) {
      const a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
      const tx = P[a] - P[b], ty = P[a + 1] - P[b + 1], tz = P[a + 2] - P[b + 2];
      const bx = P[c] - P[d], by = P[c + 1] - P[d + 1], bz = P[c + 2] - P[d + 2];
      let nx = ty * bz - tz * by, ny = tz * bx - tx * bz, nz = tx * by - ty * bx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const k = (j * w + i) * 3;
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
    }
  }
  const count = w * (rings + 1);
  const forest = new Float32Array(count), lawn = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const r = Math.hypot(P[v * 3], P[v * 3 + 2]);
    forest[v] = r < 4200 && P[v * 3 + 1] < 380 ? 0.55 : 0;
  }
  const idx = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  g.setAttribute('aLawn', new THREE.BufferAttribute(lawn, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Loch bed heights for the water shader (R8: −50 … +50 m). */
function buildLakeDepth() {
  const { x0, z0, w, h, resX, resZ } = LAKE_DEPTH;
  const data = new Uint8Array(resX * resZ * 4);
  for (let j = 0; j < resZ; j++) {
    for (let i = 0; i < resX; i++) {
      const x = x0 + ((i + 0.5) / resX) * w;
      const z = z0 + ((j + 0.5) / resZ) * h;
      const ld = lakeSDF(x, z);
      const hh = ld > 40 ? 20 : heightAt(x, z);
      const v = Math.max(0, Math.min(255, Math.round(((hh + 50) / 100) * 255)));
      const k = (j * resX + i) * 4;
      data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, resX, resZ, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrain({ resolution = 480 } = {}) {
  const masks = { near: paintMask(MASK_NEAR), far: paintMask(MASK_FAR) };
  const material = makeTerrainMaterial({ masks });
  const mesh = new THREE.Mesh(buildGrid(resolution), material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';

  const ringMat = makeTerrainMaterial({ masks, discardInner: TERRAIN_HALF - 1 });
  const ring = new THREE.Mesh(buildRing(), ringMat);
  ring.receiveShadow = false;
  ring.name = 'mountains';

  const lakeDepth = buildLakeDepth();
  return { mesh, ring, masks, lakeDepth };
}

export { LAKE };
