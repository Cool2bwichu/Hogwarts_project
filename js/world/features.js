// Living details: the Whomping Willow, boulders, chimney smoke and the owls
// that come and go from the Owlery.

import * as THREE from 'three';
import { U, PROV_COLORS, makeSurface } from '../engine/shared.js';
import { mulberry32, noise2, fbm, smoothstep } from '../engine/noise.js';
import { heightAt, SITES, lakeSDF, cliffZone, slopeAt, isBuiltUp, forestDensity, PROV } from './layout.js';

// ─── The Whomping Willow ──────────────────────────────────────────────────
export function buildWillow() {
  const rand = mulberry32(1971); // planted the year Lupin started school
  const s = SITES.willow;
  const y0 = heightAt(s.x, s.z) - 0.4;
  const pos = [], nor = [], col = [], sway = [], idx = [];
  let count = 0;
  const addGeo = (geo, color, swayFn, phase) => {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      const shade = 0.75 + 0.25 * Math.min(1, p.getY(i) / 14);
      col.push(c.r * shade, c.g * shade, c.b * shade);
      sway.push(swayFn(p.getX(i), p.getY(i), p.getZ(i)), phase);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx.push(geo.index.getX(i) + count);
    else for (let i = 0; i < p.count; i++) idx.push(i + count);
    count += p.count;
  };
  // Gnarled trunk.
  const trunk = new THREE.CylinderGeometry(0.9, 1.7, 7.5, 12, 8);
  trunk.translate(0, 3.75, 0);
  {
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.22 * noise2(a * 1.7, y * 0.5) + 0.12 * Math.sin(a * 5 + y);
      const tw = y * 0.12;
      const nx = (x * Math.cos(tw) - z * Math.sin(tw)) * k, nz = (x * Math.sin(tw) + z * Math.cos(tw)) * k;
      p.setXYZ(i, nx, y, nz);
    }
    trunk.computeVertexNormals();
  }
  addGeo(trunk, '#3b3027', () => 0, 0);
  // Limbs and whips.
  const limbs = 10;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + rand() * 0.4;
    const reach = 7 + rand() * 5;
    const pts = [
      new THREE.Vector3(Math.cos(a) * 0.6, 6.5, Math.sin(a) * 0.6),
      new THREE.Vector3(Math.cos(a) * reach * 0.35, 10 + rand() * 2, Math.sin(a) * reach * 0.35),
      new THREE.Vector3(Math.cos(a) * reach * 0.75, 11.5 + rand() * 2, Math.sin(a) * reach * 0.75),
      new THREE.Vector3(Math.cos(a) * reach, 9 + rand() * 2, Math.sin(a) * reach),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 16, 0.35, 6, false);
    {
      const p = tube.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = Math.floor(i / 7) / 16;
        const c = curve.getPoint(t);
        const taper = 1 - t * 0.75;
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * taper, c.y + (p.getY(i) - c.y) * taper, c.z + (p.getZ(i) - c.z) * taper);
      }
      tube.computeVertexNormals();
    }
    const phase = rand() * Math.PI * 2;
    addGeo(tube, '#46392d', (x, y, z) => Math.min(1, Math.hypot(x, z) / 12), phase);
    // Whips hanging from the limb.
    for (let w = 0; w < 7; w++) {
      const t = 0.45 + (w / 7) * 0.55;
      const o = curve.getPoint(t);
      const drop = 4 + rand() * 5;
      const wc = new THREE.CatmullRomCurve3([
        o.clone(),
        o.clone().add(new THREE.Vector3(Math.cos(a) * 0.8, -drop * 0.4, Math.sin(a) * 0.8)),
        o.clone().add(new THREE.Vector3(Math.cos(a) * 1.4 + (rand() - 0.5), -drop, Math.sin(a) * 1.4 + (rand() - 0.5))),
      ]);
      const wt = new THREE.TubeGeometry(wc, 8, 0.07, 4, false);
      addGeo(wt, '#55503a', (x, y, z) => Math.min(1, Math.hypot(x, z) / 12) + 0.2, phase + w * 0.3);
      // Sparse willow leaves along the whip.
      for (let k = 0; k < 3; k++) {
        const q = wc.getPoint(0.3 + k * 0.3);
        const leaf = new THREE.IcosahedronGeometry(1, 0);
        leaf.scale(0.7, 1.4, 0.7);
        leaf.translate(q.x, q.y, q.z);
        addGeo(leaf, '#6f7d4a', (x, y, z) => Math.min(1.2, Math.hypot(x, z) / 12 + 0.2), phase + w * 0.3);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const uniforms = { uWhomp: { value: 0.15 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, uniforms, { uProv: { value: new THREE.Color(PROV_COLORS[PROV.author]) } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWhomp;
        attribute vec2 aSway;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float k = aSway.x * aSway.x;
          float ph = aSway.y;
          float whip = sin(uTime * (1.3 + uWhomp * 4.0) + ph) * (0.25 + uWhomp * 1.6);
          float twist = sin(uTime * (0.9 + uWhomp * 2.5) + ph * 1.7) * (0.12 + uWhomp * 0.9);
          vec2 xz = transformed.xz;
          float ang = twist * k;
          transformed.xz = vec2(xz.x * cos(ang) - xz.y * sin(ang), xz.x * sin(ang) + xz.y * cos(ang));
          vec2 dir = normalize(xz + 1e-4);
          transformed.xz += dir * whip * k * 2.2;
          transformed.y += -abs(whip) * k * 1.6;
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLens; uniform vec3 uProv;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uLens > 0.001) gl_FragColor.rgb = mix(gl_FragColor.rgb, uProv * (0.3 + 1.2 * sqrt(dot(gl_FragColor.rgb, vec3(0.3, 0.6, 0.1)))), uLens * 0.8);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(s.x, y0, s.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'whomping-willow';
  return { mesh, uniforms, position: new THREE.Vector3(s.x, y0, s.z) };
}

// ─── Boulders ─────────────────────────────────────────────────────────────
export function buildRocks({ amount = 1 } = {}) {
  const rand = mulberry32(55);
  const geos = [0, 1, 2].map((k) => {
    // Angular, fractured blocks rather than river pebbles.
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.32 * noise2(x * 1.3 + k * 7, z * 1.3 + y) + 0.12 * noise2(x * 3.1 - k, y * 3.1);
      const cut = y > 0.35 ? 0.35 + (y - 0.35) * 0.3 : y;
      p.setXYZ(i, x * n, Math.max(-0.4, cut * n * 0.8), z * n);
    }
    g.computeVertexNormals();
    const uv = new Float32Array(p.count * 2);
    const prov = new Float32Array(p.count).fill(PROV.author);
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = (p.getX(i) + p.getZ(i)) * 2;
      uv[i * 2 + 1] = p.getY(i) * 2;
      const shade = 0.72 + 0.28 * Math.max(0, p.getY(i) + 0.4);
      col.set([shade, shade, shade], i * 3);
    }
    g.setAttribute('aUvm', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aProv', new THREE.BufferAttribute(prov, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const mat = makeSurface({ color: '#77736a', pattern: 'none', roughness: 0.92, grime: 1.4, bump: 0.03 });
  const spots = [[], [], []];
  const tryPlace = (x, z, s) => {
    const h = heightAt(x, z);
    spots[Math.floor(rand() * 3)].push({ x, y: h - s * 0.25, z, s, r: rand() * Math.PI * 2, t: rand() });
  };
  // Scree at the foot of the castle cliff and along the shore.
  for (let i = 0; i < 700 * amount; i++) {
    const x = (rand() - 0.5) * 900, z = 60 + rand() * 120;
    const ld = lakeSDF(x, z);
    if (ld < -3 || ld > 10) continue;
    const cz = cliffZone(x, z);
    tryPlace(x, z, (cz > 0.3 ? 1.5 + rand() * 3.5 : 0.5 + rand() * 1.4));
  }
  // Outcrops set into the castle cliff, breaking up the face.
  for (let i = 0; i < 90 * amount; i++) {
    const x = (rand() - 0.5) * 560;
    let z = 50;
    while (z < 130 && heightAt(x, z) > 44) z += 1;
    const top = heightAt(x, z);
    if (top < 20) continue;
    const cz = cliffZone(x, z);
    if (cz < 0.2) continue;
    const zz = z + 2 + rand() * 6;
    const sc = 3 + rand() * 5;
    const y = heightAt(x, zz) - sc * 0.45 + (rand() - 0.5) * 6;
    if (y < 1) continue;
    spots[Math.floor(rand() * 3)].push({ x, y, z: zz, s: sc, r: rand() * Math.PI * 2, t: rand() });
  }
  // Boulders on the moors and in the forest.
  for (let i = 0; i < 2600 * amount; i++) {
    const x = (rand() - 0.5) * 3200, z = (rand() - 0.5) * 3200;
    if (lakeSDF(x, z) < 2 || isBuiltUp(x, z, 6)) continue;
    const h = heightAt(x, z);
    const moor = smoothstep(60, 160, h) + forestDensity(x, z) * 0.4;
    if (rand() > 0.12 + moor * 0.6) continue;
    tryPlace(x, z, 0.6 + rand() * rand() * 4);
  }
  const group = new THREE.Group();
  group.name = 'rocks';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach((list, k) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geos[k], mat, list.length);
    list.forEach((r, i) => {
      q.setFromEuler(e.set((r.t - 0.5) * 0.4, r.r, (r.t - 0.5) * 0.3));
      mesh.setMatrixAt(i, m.compose(v.set(r.x, r.y, r.z), q, sc.set(r.s * (0.8 + r.t * 0.5), r.s, r.s * (1.2 - r.t * 0.4))));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `rocks-${k}`;
    group.add(mesh);
  });
  return { group };
}

// ─── Smoke (Hagrid's chimney, the Hogwarts Express) ───────────────────────
export function buildSmoke(sources) {
  const perSource = 26;
  const n = sources.length * perSource;
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(n * 4);
  const pos = new Float32Array(n * 3);
  sources.forEach((src, si) => {
    for (let i = 0; i < perSource; i++) {
      const k = si * perSource + i;
      pos.set([src.pos.x, src.pos.y, src.pos.z], k * 3);
      seed.set([i / perSource, Math.random(), src.scale, src.dark ? 1 : 0], k * 4);
    }
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uPixel: { value: 1 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uWind, uPixel;
      attribute vec4 aSeed;
      varying float vAlpha;
      varying float vDark;
      void main() {
        float life = fract(aSeed.x + uTime * 0.07 * (0.8 + aSeed.y * 0.4));
        vec3 p = position;
        float s = aSeed.z;
        p.y += life * 22.0 * s;
        p.x += life * life * (8.0 + uWind * 30.0) * s + sin(uTime * 0.7 + aSeed.y * 9.0) * life * 2.0 * s;
        p.z += life * life * (3.0 + uWind * 10.0) * s;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + life * 9.0) * s * 60.0 * uPixel / max(-mv.z, 1.0);
        vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - life) * 0.55;
        vDark = aSeed.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      varying float vAlpha;
      varying float vDark;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        if (d > 1.0) discard;
        vec3 col = mix(vec3(0.72, 0.72, 0.7), vec3(0.3, 0.3, 0.3), vDark) * (0.4 + 0.6 * uFogColor);
        gl_FragColor = vec4(col, (1.0 - d) * vAlpha);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'smoke';
  pts.renderOrder = 6;
  return { points: pts, material: mat };
}

// ─── Owls around the Owlery ───────────────────────────────────────────────
export function buildOwls(center, count = 9) {
  const g = new THREE.BufferGeometry();
  // A body and two wings; wing tips carry aFlap = ±1.
  const v = [
    0, 0, 0.35, 0, 0, -0.35, 0, 0.06, 0,          // body
    0, 0, 0.18, 0, 0, -0.12, -0.9, 0, 0.02,        // left wing
    0, 0, -0.12, 0, 0, 0.18, 0.9, 0, 0.02,         // right wing
  ];
  const flap = [0, 0, 0, 0, 0, -1, 0, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uCenter: { value: center.clone() } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCenter;
      attribute float aFlap;
      void main() {
        float id = float(gl_InstanceID);
        float r = 26.0 + mod(id * 7.3, 22.0);
        float sp = 0.18 + mod(id * 0.13, 0.12);
        float a = uTime * sp + id * 2.1;
        float h = 6.0 * sin(uTime * 0.23 + id) + mod(id * 3.7, 14.0) - 4.0;
        vec3 pos = uCenter + vec3(cos(a) * r, h, sin(a) * r);
        vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a)));
        vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 p = position * 1.4;
        p.y += aFlap * aFlap * sin(uTime * 9.0 + id) * 0.6;
        vec3 world = pos + right * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFogColor;
      void main() { gl_FragColor = vec4(mix(vec3(0.05, 0.045, 0.04), uFogColor * 0.35, 0.3), 1.0); }`,
  });
  const mesh = new THREE.InstancedMesh(g, mat, count);
  mesh.frustumCulled = false;
  mesh.name = 'owls';
  return mesh;
}
