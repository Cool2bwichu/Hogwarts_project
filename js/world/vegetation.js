// Trees. Four Highland species, two levels of detail each, stored in spatial
// chunks. Each frame the visible chunks are packed into one instanced draw per
// species and detail level, so tens of thousands of trees cost ~10 draw calls.
// A separate low-detail set casts shadows, so shadows stay correct off-screen.

import * as THREE from 'three';
import { U, PROV_COLORS } from '../engine/shared.js';
import { mulberry32, fbm, noise2, smoothstep } from '../engine/noise.js';
import {
  heightAt, forestDensity, isBuiltUp, lakeSDF, slopeAt, SITES, COURTS, CASTLE_FLOOR, PROV,
} from './layout.js';

// ─── Species geometry ─────────────────────────────────────────────────────
function makeParts() {
  const pos = [], nor = [], col = [], wind = [], idx = [];
  let count = 0;
  const api = {
    add(geo, color, windFn, normalFn, shadeFn) {
      const p = geo.attributes.position, n = geo.attributes.normal;
      const c = new THREE.Color(color);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        pos.push(x, y, z);
        const nn = normalFn ? normalFn(x, y, z, n.getX(i), n.getY(i), n.getZ(i)) : [n.getX(i), n.getY(i), n.getZ(i)];
        nor.push(...nn);
        const s = shadeFn ? shadeFn(x, y, z) : 1;
        col.push(c.r * s, c.g * s, c.b * s);
        wind.push(windFn(x, y, z));
      }
      const gi = geo.index;
      if (gi) for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + count);
      else for (let i = 0; i < p.count; i++) idx.push(i + count);
      count += p.count;
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 1));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    },
  };
  return api;
}

function trunk(parts, h, r0, r1, color, sides = 6, lean = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 2, true);
  g.translate(0, h / 2, 0);
  if (lean) g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, lean, 0, 0, 0));
  parts.add(g, color, (x, y) => Math.max(0, y / 22) ** 2 * 0.5);
}

function blob(parts, cx, cy, cz, rx, ry, rz, color, detail, rand, crown, height) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.22 * noise2(x * 2.1 + cx, y * 2.3 + cz) + (rand() - 0.5) * 0.08;
    p.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rz * k);
  }
  g.computeVertexNormals();
  parts.add(g, color,
    (x, y) => Math.min(1, y / height),
    // Normals blended toward the crown centre: soft, rounded foliage light.
    (x, y, z, nx, ny, nz) => {
      const dx = x - crown.x, dy = y - crown.y, dz = z - crown.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const mx = nx * 0.35 + (dx / l) * 0.65, my = ny * 0.35 + (dy / l) * 0.65, mz = nz * 0.35 + (dz / l) * 0.65;
      const ml = Math.hypot(mx, my, mz) || 1;
      return [mx / ml, my / ml, mz / ml];
    },
    // Darker toward the inside and bottom of the crown.
    (x, y, z) => {
      const dx = x - crown.x, dy = y - crown.y, dz = z - crown.z;
      const out = Math.min(1, Math.hypot(dx / crown.rx, dy / crown.ry, dz / crown.rx));
      return 0.55 + 0.45 * out * (0.75 + 0.25 * smoothstep(-crown.ry, crown.ry, dy));
    });
}

function tierCone(parts, y0, r, h, color, sides, shadeTop = 1.15, rows = 2) {
  const g = new THREE.ConeGeometry(r, h, sides, rows, true);
  g.translate(0, y0 + h / 2, 0);
  // Droop the skirt.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const rr = Math.hypot(x, z);
    p.setY(i, y - (rr / r) ** 2 * h * 0.18);
  }
  g.computeVertexNormals();
  parts.add(g, color, (x, y) => Math.min(1, y / 28), (x, y, z, nx, ny, nz) => {
    const l = Math.hypot(x, z) || 1;
    const mx = nx * 0.5 + (x / l) * 0.5, mz = nz * 0.5 + (z / l) * 0.5, my = ny * 0.5 + 0.35;
    const ml = Math.hypot(mx, my, mz);
    return [mx / ml, my / ml, mz / ml];
  }, (x, y, z) => 0.62 + 0.38 * Math.min(1, Math.hypot(x, z) / r) * shadeTop / 1.15);
}

function buildSpecies(rand) {
  const S = {};
  // Scots pine: tall orange upper trunk, flat-topped dark crown.
  {
    const hi = makeParts(), lo = makeParts();
    trunk(hi, 17, 0.42, 0.18, '#6b4a36', 7);
    trunk(hi, 5, 0.2, 0.08, '#a0603a', 6);
    const crown = { x: 0, y: 17.5, z: 0, rx: 4.2, ry: 2.8 };
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rand();
      const d = k === 0 ? 0 : 2.2 + rand() * 1.4;
      blob(hi, Math.cos(a) * d, 16.2 + rand() * 3.2, Math.sin(a) * d, 2.6, 1.5, 2.6, '#2e4a2d', 1, rand, crown, 21);
    }
    trunk(lo, 17, 0.4, 0.15, '#6b4a36', 4);
    blob(lo, 0, 17.3, 0, 4.4, 2.6, 4.4, '#2c472b', 0, rand, crown, 21);
    S.pine = { hi: hi.build(), lo: lo.build(), height: 21 };
  }
  // Spruce: stacked drooping tiers.
  {
    const hi = makeParts(), lo = makeParts();
    trunk(hi, 6, 0.4, 0.3, '#4a3a2c', 6);
    const tiers = 7;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers;
      const y0 = 2.8 + t * 19;
      const r = 4.6 * (1 - t * 0.86);
      tierCone(hi, y0, r, 5.2 - t * 1.8, k % 2 ? '#20382a' : '#243f2e', 10);
    }
    trunk(lo, 4, 0.4, 0.3, '#4a3a2c', 4);
    tierCone(lo, 2.5, 4.6, 12, '#213a2b', 6, 1.15, 1);
    tierCone(lo, 12, 2.9, 12, '#243f2e', 6, 1.15, 1);
    S.spruce = { hi: hi.build(), lo: lo.build(), height: 26 };
  }
  // Oak / beech: broad rounded crown on a short trunk with limbs.
  {
    const hi = makeParts(), lo = makeParts();
    trunk(hi, 7, 0.75, 0.45, '#56483a', 8);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const g = new THREE.CylinderGeometry(0.16, 0.36, 6.5, 5, 1, true);
      g.translate(0, 3.25, 0);
      g.rotateZ(0.75);
      g.rotateY(a);
      g.translate(0, 6, 0);
      hi.add(g, '#56483a', (x, y) => Math.min(1, y / 18) * 0.6);
    }
    const crown = { x: 0, y: 12, z: 0, rx: 7.5, ry: 5.2 };
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + rand() * 0.6;
      const d = k < 2 ? rand() * 1.5 : 3.6 + rand() * 2.2;
      blob(hi, Math.cos(a) * d, 10.5 + rand() * 4.5 - (d > 3 ? 1 : -1.5), Math.sin(a) * d, 3.6 + rand(), 2.9 + rand() * 0.6, 3.6 + rand(), '#4a6a2d', 1, rand, crown, 17);
    }
    trunk(lo, 7, 0.7, 0.45, '#56483a', 4);
    blob(lo, 0, 12, 0, 7.4, 5.2, 7.4, '#476629', 0, rand, crown, 17);
    S.oak = { hi: hi.build(), lo: lo.build(), height: 17 };
  }
  // Birch: slim pale trunk, small airy crown.
  {
    const hi = makeParts(), lo = makeParts();
    trunk(hi, 12, 0.22, 0.08, '#d9d4c6', 6, 0.02);
    const crown = { x: 0, y: 10.5, z: 0, rx: 3.2, ry: 4 };
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand();
      blob(hi, Math.cos(a) * 1.5, 8 + rand() * 5, Math.sin(a) * 1.5, 1.9, 2.3, 1.9, '#6c8a38', 1, rand, crown, 14);
    }
    trunk(lo, 12, 0.22, 0.08, '#d9d4c6', 3);
    blob(lo, 0, 10.5, 0, 3.1, 4.2, 3.1, '#688636', 0, rand, crown, 14);
    S.birch = { hi: hi.build(), lo: lo.build(), height: 14 };
  }
  return S;
}

// ─── Material ─────────────────────────────────────────────────────────────
function makeFoliageMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.4 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, { uProvColors: { value: PROV_COLORS.map((h) => new THREE.Color(h)) } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind;
        attribute float aWind;
        attribute float iProv;
        varying float vWindH;
        varying float vProvT;
        varying vec3 vWPosT;
        varying vec3 vWNormT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3]);
          float ph = dot(ip.xz, vec2(0.043, 0.061));
          float gust = 0.6 + 0.4 * sin(uTime * 0.35 + ip.x * 0.004);
          float w = aWind * aWind * (0.25 + uWind) * gust;
          transformed.x += (sin(uTime * 1.25 + ph) * 0.55 + sin(uTime * 2.9 + ph * 1.7) * 0.18) * w;
          transformed.z += (cos(uTime * 1.05 + ph * 1.3) * 0.4) * w;
          vWindH = aWind;
          vProvT = iProv;
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPosT = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vWNormT = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSnow, uLens, uLensFocus;
        uniform vec3 uProvColors[5];
        uniform vec3 uSunColor;
        varying float vWindH;
        varying float vProvT;
        varying vec3 vWPosT;
        varying vec3 vWNormT;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float snow = uSnow * smoothstep(0.35, 0.8, vWNormT.y) * smoothstep(0.1, 0.4, vWindH);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.9), snow * 0.85);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 V = normalize(vWPosT - cameraPosition);
          float back = pow(max(dot(V, uSunDir), 0.0), 5.0) * smoothstep(0.2, 0.7, vWindH);
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * 0.55;
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uLens > 0.001) {
          int pi = int(vProvT + 0.5);
          vec3 pc = pi == 1 ? uProvColors[1] : pi == 2 ? uProvColors[2] : pi == 0 ? uProvColors[0] : uProvColors[3];
          float l = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float dim = (uLensFocus >= 0.0 && abs(vProvT - uLensFocus) > 0.5) ? 0.25 : 1.0;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, pc * (0.25 + 1.3 * sqrt(l)) * dim, uLens * 0.7);
        }`);
  };
  mat.customProgramCacheKey = () => 'foliage';
  return mat;
}

// ─── Placement ────────────────────────────────────────────────────────────
function place(amount) {
  const rand = mulberry32(2024);
  const out = []; // {x, y, z, species, s, rot, tint, prov}
  const cell = 6.5;
  const push = (x, z, species, s, prov, y) => {
    out.push({ x, y: y ?? heightAt(x, z), z, species, s, rot: rand() * Math.PI * 2, tint: rand(), prov });
  };

  for (let gz = -1750; gz < 1850; gz += cell) {
    for (let gx = -1750; gx < 1950; gx += cell) {
      const x = gx + rand() * cell, z = gz + rand() * cell;
      const u = rand();
      const r = Math.hypot(x, z);
      const spacing = r < 650 ? 7 : r < 1150 ? 9.8 : 13.5;
      const keep = (cell / spacing) ** 2 * amount;
      if (u > keep) continue; // cheap rejection before any noise is evaluated
      const ld = lakeSDF(x, z);
      if (ld < 4) continue;
      let d = forestDensity(x, z);
      // Sparse trees on the open lawns and hillsides.
      if (d < 0.05) d = r > 260 ? 0.012 + 0.04 * smoothstep(0.55, 0.75, fbm(x / 120, z / 120 + 3, 2)) : 0;
      // The far shore of the loch is wooded too.
      if (z > 1150) d = Math.max(d, 0.55 * smoothstep(0.35, 0.6, fbm(x / 300 + 9, z / 300, 3)));
      if (u > d * keep) continue;
      const h = heightAt(x, z);
      if (h > 420 || h < 1.4) continue;
      if (isBuiltUp(x, z, 3)) continue;
      if (slopeAt(x, z, 3) > 0.85) continue;
      const n = fbm(x / 170 + 2, z / 170 - 4, 3);
      const edge = d < 0.6;
      let species;
      const roll = rand();
      if (ld < 40) species = roll < 0.6 ? 'birch' : 'oak';
      else if (h > 250) species = roll < 0.7 ? 'pine' : 'birch';
      else if (edge) species = roll < 0.4 ? 'oak' : roll < 0.62 ? 'birch' : roll < 0.82 ? 'pine' : 'spruce';
      else species = n > 0.12 ? (roll < 0.7 ? 'spruce' : 'pine') : n < -0.15 ? (roll < 0.55 ? 'oak' : 'spruce') : (roll < 0.45 ? 'spruce' : roll < 0.75 ? 'pine' : 'oak');
      const s = 0.72 + rand() * 0.55;
      push(x, z, species, s, PROV.author, h - 0.3);
    }
  }
  // Rowling's sketch: the drive to the gates is lined with trees.
  for (let z = -112; z > -392; z -= 15.5) {
    for (const side of [-1, 1]) push(side * 12.5 + (rand() - 0.5) * 0.8, z + (rand() - 0.5) * 1.5, 'oak', 0.95 + rand() * 0.12, PROV.author);
  }
  // The beech by the lake (Order of the Phoenix).
  push(SITES.beech.x, SITES.beech.z, 'oak', 1.45, PROV.book);
  // A few trees in the lawned courts.
  for (const c of COURTS) {
    if (c.kind !== 'lawn' && c.kind !== 'garden') continue;
    for (const [fx, fz] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) {
      push(c.x0 + (c.x1 - c.x0) * fx, c.z0 + (c.z1 - c.z0) * fz, c.kind === 'garden' ? 'birch' : 'oak', 0.6 + rand() * 0.15, PROV.interpreted, CASTLE_FLOOR - 0.2);
    }
  }
  return out;
}

// ─── Chunked instancing ───────────────────────────────────────────────────
const SPECIES = ['pine', 'spruce', 'oak', 'birch'];
const CHUNK = 160;

export class Vegetation {
  constructor({ amount = 1, lodDistance = 260, shadowBox }) {
    const rand = mulberry32(77);
    this.geos = buildSpecies(rand);
    this.material = makeFoliageMaterial();
    this.lodDistance = lodDistance;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.trees = place(amount);

    const tint = new THREE.Color();
    const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const chunks = new Map();
    const counts = Object.fromEntries(SPECIES.map((s) => [s, 0]));
    for (const t of this.trees) {
      const key = `${Math.floor(t.x / CHUNK)},${Math.floor(t.z / CHUNK)}`;
      let ch = chunks.get(key);
      if (!ch) {
        ch = { key, cx: (Math.floor(t.x / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(t.z / CHUNK) + 0.5) * CHUNK, minY: Infinity, maxY: -Infinity, lists: {} };
        chunks.set(key, ch);
      }
      (ch.lists[t.species] ||= []).push(t);
      ch.minY = Math.min(ch.minY, t.y);
      ch.maxY = Math.max(ch.maxY, t.y + 32 * t.s);
      counts[t.species]++;
    }
    // Pack each chunk's instances into typed arrays once.
    for (const ch of chunks.values()) {
      ch.box = new THREE.Box3(new THREE.Vector3(ch.cx - CHUNK / 2 - 10, ch.minY - 2, ch.cz - CHUNK / 2 - 10), new THREE.Vector3(ch.cx + CHUNK / 2 + 10, ch.maxY, ch.cz + CHUNK / 2 + 10));
      ch.packed = {};
      for (const sp of SPECIES) {
        const list = ch.lists[sp];
        if (!list) continue;
        const m = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3), pv = new Float32Array(list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          const lean = 0.03;
          sc.set(t.s * (0.92 + t.tint * 0.16), t.s, t.s * (0.92 + (1 - t.tint) * 0.16));
          p.set(t.x, t.y, t.z);
          tmpM.compose(p, q, sc);
          if (lean) tmpM.multiply(new THREE.Matrix4().makeRotationX((t.tint - 0.5) * lean));
          tmpM.toArray(m, i * 16);
          // Instance tint: early-autumn variety for the broadleaves.
          if (sp === 'oak' || sp === 'birch') {
            const autumn = smoothstep(0.62, 0.95, t.tint) * 0.85;
            tint.setRGB(1 + autumn * 0.55, 1 + autumn * 0.05, 1 - autumn * 0.55);
          } else tint.setRGB(0.9 + t.tint * 0.2, 0.92 + t.tint * 0.16, 0.9 + t.tint * 0.2);
          tint.toArray(c, i * 3);
          pv[i] = t.prov;
        });
        ch.packed[sp] = { m, c, p: pv, n: list.length };
      }
    }
    this.chunks = [...chunks.values()];

    // One instanced mesh per species × detail level, sized to the whole set.
    this.meshes = {};
    for (const sp of SPECIES) {
      const n = Math.max(1, counts[sp]);
      this.meshes[sp] = { hi: this.makeMesh(this.geos[sp].hi, n, `${sp}-hi`), lo: this.makeMesh(this.geos[sp].lo, n, `${sp}-lo`) };
    }
    // Shadow casters: everything inside the shadow region, low detail, never culled.
    this.shadowMeshes = [];
    const casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    for (const sp of SPECIES) {
      const list = this.trees.filter((t) => t.species === sp && Math.abs(t.x - shadowBox.x) < shadowBox.half + 60 && Math.abs(t.z - shadowBox.z) < shadowBox.half + 60);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(this.geos[sp].lo, casterMat, list.length);
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        mesh.setMatrixAt(i, tmpM.compose(p.set(t.x, t.y, t.z), q, sc.set(t.s, t.s, t.s)));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = -10;
      mesh.name = `${sp}-shadow`;
      this.shadowMeshes.push(mesh);
      this.group.add(mesh);
    }
    this.frustum = new THREE.Frustum();
    this.projView = new THREE.Matrix4();
    this.lastCam = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3();
    this.lastUpdate = 0;
    this.stats = { total: this.trees.length, drawn: 0 };
  }

  makeMesh(geo, capacity, name) {
    const mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const prov = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    prov.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iProv', prov);
    mesh.userData.prov = prov;
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = name.endsWith('-hi');
    mesh.frustumCulled = false;
    mesh.name = name;
    this.group.add(mesh);
    return mesh;
  }

  update(camera, now, force = false) {
    const pos = camera.position;
    camera.getWorldDirection(this._dir ||= new THREE.Vector3());
    const moved = pos.distanceTo(this.lastCam) > 8 || this._dir.angleTo(this.lastDir) > 0.05;
    if (!force && (!moved || now - this.lastUpdate < 90)) return;
    this.lastUpdate = now;
    this.lastCam.copy(pos);
    this.lastDir.copy(this._dir);
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const fill = {};
    for (const sp of SPECIES) fill[sp] = { hi: 0, lo: 0 };
    const lod2 = this.lodDistance * this.lodDistance;
    let drawn = 0;
    // Nearest chunks first, so the depth test rejects the trees behind them.
    const visible = [];
    for (const ch of this.chunks) {
      if (!this.frustum.intersectsBox(ch.box)) continue;
      const dx = ch.cx - pos.x, dz = ch.cz - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 4200 * 4200) continue;
      visible.push([d2, ch]);
    }
    visible.sort((a, b) => a[0] - b[0]);
    for (const [d2, ch] of visible) {
      const level = d2 < lod2 ? 'hi' : 'lo';
      // Beyond ~1.4 km every other tree is enough; the forest floor carries the rest.
      const thin = d2 > 1400 * 1400 ? 2 : 1;
      for (const sp of SPECIES) {
        const pk = ch.packed[sp];
        if (!pk) continue;
        const mesh = this.meshes[sp][level];
        const o = fill[sp][level];
        if (thin === 1) {
          mesh.instanceMatrix.array.set(pk.m, o * 16);
          mesh.instanceColor.array.set(pk.c, o * 3);
          mesh.userData.prov.array.set(pk.p, o);
          fill[sp][level] += pk.n;
          drawn += pk.n;
        } else {
          let k = o;
          for (let i = 0; i < pk.n; i += thin, k++) {
            mesh.instanceMatrix.array.set(pk.m.subarray(i * 16, i * 16 + 16), k * 16);
            mesh.instanceColor.array.set(pk.c.subarray(i * 3, i * 3 + 3), k * 3);
            mesh.userData.prov.array[k] = pk.p[i];
          }
          fill[sp][level] = k;
          drawn += k - o;
        }
      }
    }
    for (const sp of SPECIES) {
      for (const level of ['hi', 'lo']) {
        const mesh = this.meshes[sp][level];
        const n = fill[sp][level];
        mesh.count = n;
        if (!n) continue;
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, n * 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, n * 3);
        mesh.instanceColor.needsUpdate = true;
        mesh.userData.prov.clearUpdateRanges();
        mesh.userData.prov.addUpdateRange(0, n);
        mesh.userData.prov.needsUpdate = true;
      }
    }
    this.stats.drawn = drawn;
  }
}
