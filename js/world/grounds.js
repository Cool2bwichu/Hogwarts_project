// The grounds: every landmark placed where Rowling's sketch and the novels
// put it. All static pieces merge into one draw per material.

import * as THREE from 'three';
import { Builder, archOutline } from './builder.js';
import {
  heightAt, SITES, PITCH, PITCH_LEVEL, PROV, PATHS,
} from './layout.js';
import { makeSurface, makeGlass } from '../engine/shared.js';
import { mulberry32 } from '../engine/noise.js';

const H = (x, z) => heightAt(x, z);

export function buildGrounds({ detail = 1 } = {}) {
  const B = new Builder(1473);
  const rand = mulberry32(88);
  const markers = {};
  const colliders = [];
  B.aoDepth = 2.5;

  // ── Quidditch stadium (PS10: raised stands; three 50 ft hoops each end) ──
  {
    const { x: px, z: pz, rx, rz } = PITCH;
    const y0 = PITCH_LEVEL;
    B.aoBase = y0;
    B.prov = PROV.author;
    const seg = 44;
    const houses = ['#7a1f1f', '#1d4f86', '#c8a23a', '#1f5a36'];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      // Leave gaps at the two ends behind the hoops.
      if (Math.abs(Math.sin(am)) > 0.985) continue;
      for (let tier = 0; tier < 4; tier++) {
        const off = 5 + tier * 2.2;
        const yb = y0 + 2.2 + tier * 1.55;
        const p = (a, o) => new THREE.Vector3(px + Math.cos(a) * (rx + o), yb, pz + Math.sin(a) * (rz + o));
        const a = p(a0, off), b = p(a1, off), c = p(a1, off + 2.2), d = p(a0, off + 2.2);
        const up = new THREE.Vector3(0, 1, 0);
        B.quad('wood', a, b, c, d, up, [[0, 0], [3, 0], [3, 2.2], [0, 2.2]]);
        // Riser.
        const ra = a.clone().setY(yb - 1.55), rb = b.clone().setY(yb - 1.55);
        const nOut = new THREE.Vector3(-Math.cos(am), 0, -Math.sin(am));
        B.quad('wood', ra, rb, b, a, nOut);
      }
      // Back wall and a canopy on every other bay, in house colours.
      const outer = 5 + 4 * 2.2;
      const bx = px + Math.cos(am) * (rx + outer), bz = pz + Math.sin(am) * (rz + outer);
      const len = Math.hypot(Math.cos(a1) * (rx + outer) - Math.cos(a0) * (rx + outer), Math.sin(a1) * (rz + outer) - Math.sin(a0) * (rz + outer));
      // Tangent of the ellipse at am; box local x follows it.
      const rot = Math.atan2(-(rz + outer) * Math.cos(am), -(rx + outer) * Math.sin(am));
      B.box('wood', bx, y0, bz, len + 0.3, 12.5, 0.5, rot, { faces: 'nsewt', bands: 2 });
      for (let k = 0; k < 3; k++) {
        const t = (k + 0.5) / 3;
        const a = a0 + (a1 - a0) * t;
        B.box('wood', px + Math.cos(a) * (rx + 5.2), y0, pz + Math.sin(a) * (rz + 5.2), 0.3, 2.2, 0.3);
      }
      if (i % 2 === 0) {
        B.tint = new THREE.Color(houses[(i / 2) % 4]).toArray();
        B.prov = PROV.interpreted;
        const cy = y0 + 13;
        const p = (a, o, y) => new THREE.Vector3(px + Math.cos(a) * (rx + o), y, pz + Math.sin(a) * (rz + o));
        const n = new THREE.Vector3(-Math.cos(am) * 0.4, 1, -Math.sin(am) * 0.4).normalize();
        B.quad('cloth', p(a0, outer + 0.5, cy), p(a0, 4.5, cy - 2.2), p(a1, 4.5, cy - 2.2), p(a1, outer + 0.5, cy), n);
        B.quad('cloth', p(a1, outer + 0.5, cy), p(a1, 4.5, cy - 2.2), p(a0, 4.5, cy - 2.2), p(a0, outer + 0.5, cy), n.clone().negate());
        B.tint = [1, 1, 1];
        B.prov = PROV.author;
        for (const a of [a0 + 0.01, a1 - 0.01]) B.cyl('wood', px + Math.cos(a) * (rx + 4.8), pz + Math.sin(a) * (rz + 4.8), y0, y0 + 11, 0.18, 0.18, 6);
      }
    }
    // Hoops: fifty feet high (PS10), three at each end.
    B.prov = PROV.book;
    for (const end of [-1, 1]) {
      const zc = pz + end * (rz - 7);
      [-7, 0, 7].forEach((dx, k) => {
        const hh = PITCH.hoopHeight + (k === 1 ? 0 : -0.0);
        B.cyl('gold', px + dx, zc, y0, y0 + hh - 1.3, 0.14, 0.12, 8);
        const tor = new THREE.TorusGeometry(1.25, 0.1, 6, 20);
        const pos = tor.attributes.position;
        const grp = B.g('gold');
        const base = grp.count;
        for (let i = 0; i < pos.count; i++) {
          B.vert(grp, px + dx + pos.getX(i), y0 + hh + pos.getY(i), zc + pos.getZ(i), tor.attributes.normal.getX(i), tor.attributes.normal.getY(i), tor.attributes.normal.getZ(i), 0, 0);
        }
        for (let i = 0; i < tor.index.count; i++) grp.idx.push(base + tor.index.getX(i));
      });
    }
    markers.hoops = new THREE.Vector3(px, y0 + 18, pz - rz + 7);
    // Changing rooms, west and east (Rowling's sketch).
    B.prov = PROV.author;
    for (const s of [SITES.changingW, SITES.changingE]) {
      const y = H(s.x, s.z) - 0.5;
      B.aoBase = y;
      B.box('stone', s.x, y, s.z, 9, 4.2, 14, 0, { faces: 'nsewt' });
      B.gableRoof('slate', 'stone', s.x - 4.5, s.x + 4.5, s.z - 7, s.z + 7, y + 4.2, y + 8, 'z', { overhang: 0.5 });
      B.archWindow(s.x + (s.x < PITCH.x ? 4.52 : -4.52), y + 0.5, s.z, s.x < PITCH.x ? Math.PI / 2 : -Math.PI / 2, 1.3, 2.4, { openKey: 'wood', frame: 0.15 });
      colliders.push({ type: 'rect', x0: s.x - 4.5, x1: s.x + 4.5, z0: s.z - 7, z1: s.z + 7 });
    }
    colliders.push({ type: 'ring', x: px, z: pz, rx: rx + 5, rz: rz + 5, w: 9 });
  }

  // ── Hagrid's hut: a small wooden house at the forest's edge (PS8) ─────────
  {
    const s = SITES.hagrid;
    const y = H(s.x, s.z) - 0.4;
    B.aoBase = y;
    B.prov = PROV.book;
    const rot = -0.35;
    B.box('stoneDark', s.x, y - 0.5, s.z, 10, 1.3, 8.4, rot, { faces: 'nsewt' });
    B.box('wood', s.x, y + 0.8, s.z, 9.4, 3.8, 7.8, rot, { faces: 'nsew', bands: 2 });
    // Gable roof, turned with the hut.
    const c = Math.cos(rot), sn = Math.sin(rot);
    const loc = (lx, ly, lz) => new THREE.Vector3(s.x + lx * c + lz * sn, y + ly, s.z - lx * sn + lz * c);
    const ridge = 7.8, eave = 4.4, hw = 4.9, hl = 5.6;
    for (const side of [-1, 1]) {
      const a = loc(-hl, eave, side * hw), b = loc(hl, eave, side * hw), cc = loc(hl, ridge, 0), d = loc(-hl, ridge, 0);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize().multiplyScalar(side);
      if (n.y < 0) n.negate();
      if (side > 0) B.quad('shingle', a, b, cc, d, n, [[0, 0], [11, 0], [11, 5], [0, 5]]);
      else B.quad('shingle', b, a, d, cc, n, [[0, 0], [11, 0], [11, 5], [0, 5]]);
    }
    for (const end of [-1, 1]) {
      const a = loc(end * 4.7, eave, -3.9), b = loc(end * 4.7, eave, 3.9), apex = loc(end * 4.7, ridge - 0.2, 0);
      const n = loc(end, 0, 0).sub(loc(0, 0, 0)).normalize();
      B.poly('wood', end > 0 ? [b, a, apex] : [a, b, apex], n, (p) => [p.x, p.y]);
    }
    // Chimney, a door fit for a half-giant, windows.
    const ch = loc(-3.2, 0, 2.2);
    B.box('stone', ch.x, y, ch.z, 1.6, 9.2, 1.6, rot, { faces: 'nsewt' });
    markers.chimney = new THREE.Vector3(ch.x, y + 9.4, ch.z);
    const door = loc(0, 0, -3.92);
    B.archWindow(door.x, y + 0.8, door.z, rot + Math.PI, 2.2, 3.1, { openKey: 'woodDark', frame: 0.18 });
    for (const lx of [-2.8, 2.8]) {
      const w = loc(lx, 0, -3.92);
      B.archWindow(w.x, y + 2.1, w.z, rot + Math.PI, 0.9, 1.2, { frame: 0.12 });
    }
    const side = loc(4.72, 0, 0);
    B.archWindow(side.x, y + 2.1, side.z, rot + Math.PI / 2, 0.9, 1.2, { frame: 0.12 });
    // A crossbow and a pair of galoshes outside the front door (PS8).
    const g1 = loc(1.7, 0, -4.4);
    B.box('rubber', g1.x, y + 0.8, g1.z, 0.35, 0.45, 0.6, rot);
    B.box('rubber', g1.x + 0.45 * c, y + 0.8, g1.z - 0.45 * sn, 0.35, 0.45, 0.6, rot + 0.2);
    const cb = loc(-1.7, 0, -4.2);
    B.box('wood', cb.x, y + 0.8, cb.z, 0.12, 1.3, 0.12, rot + 0.3);
    B.box('wood', cb.x, y + 1.55, cb.z, 1.1, 0.08, 0.08, rot + 0.3);
    markers.hagrid = new THREE.Vector3(s.x, y + 9, s.z);
    colliders.push({ type: 'circle', x: s.x, z: s.z, r: 6 });
    // Garden fence.
    B.prov = PROV.interpreted;
    let prev = null;
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 1.5 + 0.9;
      const fx = s.x + Math.cos(a) * 13, fz = s.z + Math.sin(a) * 11;
      const fy = H(fx, fz);
      B.box('wood', fx, fy - 0.3, fz, 0.16, 1.5, 0.16, a);
      if (prev) {
        const len = Math.hypot(fx - prev[0], fz - prev[1]);
        const rot = Math.atan2(fx - prev[0], fz - prev[1]) - Math.PI / 2;
        for (const h of [0.55, 1.05]) B.box('wood', (fx + prev[0]) / 2, (fy + prev[2]) / 2 + h, (fz + prev[1]) / 2, len, 0.08, 0.06, rot);
      }
      prev = [fx, fz, fy];
    }
  }

  // ── Pumpkin patch behind the hut (CS7, PA16; Rowling's sketch) ───────────
  {
    const s = SITES.pumpkins;
    B.prov = PROV.author;
    for (let i = 0; i < 42; i++) {
      const lx = (rand() - 0.5) * 24, lz = (rand() - 0.5) * 14;
      const x = s.x + lx * Math.cos(0.2) + lz * Math.sin(0.2), z = s.z - lx * Math.sin(0.2) + lz * Math.cos(0.2);
      const giant = rand() < 0.12;
      const r = giant ? 1.2 + rand() * 0.7 : 0.35 + rand() * 0.35;
      const y = H(x, z) - r * 0.25;
      B.aoBase = y;
      const g = new THREE.SphereGeometry(1, 14, 8);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
        const ang = Math.atan2(vz, vx);
        const rib = 1 + 0.07 * Math.cos(ang * 10);
        p.setXYZ(k, x + vx * r * rib, y + r * 0.8 + vy * r * 0.8, z + vz * r * rib);
      }
      g.computeVertexNormals();
      const grp = B.g('pumpkin');
      const base = grp.count;
      for (let k = 0; k < p.count; k++) B.vert(grp, p.getX(k), p.getY(k), p.getZ(k), g.attributes.normal.getX(k), g.attributes.normal.getY(k), g.attributes.normal.getZ(k), 0, 0);
      for (let k = 0; k < g.index.count; k++) grp.idx.push(base + g.index.getX(k));
      B.cyl('leaf', x, z, y + r * 1.5, y + r * 1.75, 0.07, 0.05, 5);
    }
    markers.pumpkins = new THREE.Vector3(s.x, H(s.x, s.z) + 5, s.z);
  }

  // ── Vegetable garden and greenhouses (Rowling's sketch; CS6) ─────────────
  {
    const g = SITES.garden;
    B.prov = PROV.author;
    const gy = H(g.x, g.z);
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k < 14; k++) {
        if (rand() < 0.2) continue;
        const x = g.x - 16 + k * 2.4 + (rand() - 0.5) * 0.8, z = g.z - 9 + row * 3 + (rand() - 0.5) * 0.5;
        const y = H(x, z);
        const r = 0.45 + rand() * 0.35;
        addScaled(B, row % 3 === 0 ? 'leafPale' : 'leaf', new THREE.IcosahedronGeometry(1, 1), x, y + r * 0.35, z, r, r * 0.6, r);
      }
    }
    // Low stone wall around the garden.
    const wall = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rot = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      B.box('stoneDark', mx, H(mx, mz) - 0.6, mz, len, 1.8, 0.6, rot, { faces: 'nsewt' });
    };
    wall(g.x - 20, g.z - 14, g.x + 20, g.z - 14);
    wall(g.x + 20, g.z - 14, g.x + 20, g.z + 14);
    wall(g.x - 20, g.z + 14, g.x + 20, g.z + 14);
    markers.garden = new THREE.Vector3(g.x, gy + 4, g.z);

    const gh = SITES.greenhouses;
    const houses = [[-18, -10, 0.35], [2, -16, 0.35], [-10, 12, 0.5], [14, 6, 0.55]];
    houses.forEach(([ox, oz, rot], k) => {
      const x = gh.x + ox, z = gh.z + oz;
      const y = H(x, z) - 0.2;
      B.aoBase = y;
      const L = k === 2 ? 22 : 18, W = 8, wallH = 3, ridge = 5.8;
      const c = Math.cos(rot), s = Math.sin(rot);
      const loc = (lx, ly, lz) => new THREE.Vector3(x + lx * c + lz * s, y + ly, z - lx * s + lz * c);
      B.box('stoneDark', x, y - 0.4, z, L + 0.4, 1.2, W + 0.4, rot, { faces: 'nsewt' });
      // Glass skin.
      const glassBox = [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
      for (let e = 0; e < 4; e++) {
        const [ax, az] = glassBox[e], [bx, bz] = glassBox[(e + 1) % 4];
        const n = loc(az === bz ? 0 : Math.sign(ax), 0, az === bz ? Math.sign(az) : 0).sub(loc(0, 0, 0)).normalize();
        B.quad('ghglass', loc(ax, 0.8, az), loc(bx, 0.8, bz), loc(bx, wallH, bz), loc(ax, wallH, az), n);
      }
      for (const side of [-1, 1]) {
        const a = loc(-L / 2, wallH, side * W / 2), b = loc(L / 2, wallH, side * W / 2), cc = loc(L / 2, ridge, 0), d = loc(-L / 2, ridge, 0);
        const nn = loc(0, W / 2, side * (ridge - wallH)).sub(loc(0, 0, 0)).normalize();
        if (side > 0) B.quad('ghglass', a, b, cc, d, nn); else B.quad('ghglass', b, a, d, cc, nn);
      }
      for (const end of [-1, 1]) {
        const a = loc(end * L / 2, wallH, -W / 2), b = loc(end * L / 2, wallH, W / 2), apex = loc(end * L / 2, ridge, 0);
        const n = loc(end, 0, 0).sub(loc(0, 0, 0)).normalize();
        B.poly('ghglass', end > 0 ? [b, a, apex] : [a, b, apex], n, () => [0, 0]);
      }
      // White-painted frames.
      for (let f = -L / 2; f <= L / 2 + 0.01; f += 2) {
        for (const side of [-1, 1]) {
          const p0 = loc(f, 0.8, side * W / 2);
          B.box('frame', p0.x, p0.y, p0.z, 0.12, wallH - 0.8, 0.12, rot);
        }
        const r0 = loc(f, wallH, 0);
        B.box('frame', r0.x, r0.y, r0.z, 0.1, ridge - wallH, 0.1, rot);
      }
      const rr = loc(0, ridge, 0);
      B.box('frame', rr.x, rr.y - 0.1, rr.z, L, 0.2, 0.2, rot);
      // Plants inside, faintly luminous at night (Herbology is not ordinary gardening).
      for (let p = 0; p < 8; p++) {
        const q = loc(-L / 2 + 1.5 + p * (L - 3) / 7, 0, (p % 2 ? 1.8 : -1.8));
        B.cyl('plant', q.x, q.z, y + 0.8, y + 1.3 + rand() * 1.2, 0.8, 0.3, 7, { top: true });
      }
      colliders.push({ type: 'circle', x, z, r: L / 2 + 1 });
    });
    markers.greenhouses = new THREE.Vector3(gh.x, H(gh.x, gh.z) + 9, gh.z);
  }

  // ── Winged-boar gates and the boundary wall (PA5) ───────────────────────
  {
    const s = SITES.gates;
    const y = H(s.x, s.z) - 0.3;
    B.aoBase = y;
    B.prov = PROV.book;
    for (const side of [-1, 1]) {
      const x = s.x + side * 6.5;
      B.box('stone', x, y, s.z, 1.9, 6.2, 1.9, 0, { faces: 'nsewt', bands: 2 });
      B.box('trim', x, y + 6.2, s.z, 2.3, 0.45, 2.3, 0, { faces: 'nsewt' });
      // The boar: body, head, legs, and swept wings.
      const by = y + 6.65;
      B.cyl('stone', x, s.z, by + 0.2, by + 0.9, 0.5, 0.5, 10, { top: true });
      const body = new THREE.SphereGeometry(1, 12, 8);
      addScaled(B, 'stone', body, x, by + 1.25, s.z, 0.55, 0.5, 0.95);
      addScaled(B, 'stone', new THREE.SphereGeometry(1, 10, 6), x, by + 1.35, s.z - 0.95, 0.34, 0.34, 0.45);
      addScaled(B, 'stone', new THREE.ConeGeometry(1, 1, 8), x, by + 1.25, s.z - 1.45, 0.16, 0.3, 0.16, [Math.PI / 2, 0, 0]);
      for (const ws of [-1, 1]) {
        const root = new THREE.Vector3(x + ws * 0.4, by + 1.6, s.z - 0.2);
        const tip = new THREE.Vector3(x + ws * 1.9, by + 2.9, s.z + 0.5);
        const back = new THREE.Vector3(x + ws * 0.35, by + 1.55, s.z + 0.75);
        const n = new THREE.Vector3().subVectors(tip, root).cross(new THREE.Vector3().subVectors(back, root)).normalize();
        B.poly('stone', [root, tip, back], n.y < 0 ? n.negate() : n, () => [0, 0]);
        B.poly('stone', [root, back, tip], n.clone().negate(), () => [0, 0]);
      }
    }
    // Wrought-iron gates.
    for (let k = -5; k <= 5; k++) {
      if (k === 0) continue;
      const x = s.x + k * 0.52;
      const top = y + 3.6 + Math.cos((k / 5.5) * Math.PI * 0.5) * 1.1;
      B.box('iron', x, y, s.z, 0.06, top - y, 0.06);
      B.cyl('gold', x, s.z, top, top + 0.25, 0.05, 0.0, 6);
    }
    for (const yy of [y + 0.5, y + 2.4]) B.box('iron', s.x, yy, s.z, 11, 0.08, 0.06);
    markers.gates = new THREE.Vector3(s.x, y + 10, s.z);
    colliders.push({ type: 'rect', x0: -8, x1: -5.5, z0: s.z - 1, z1: s.z + 1 }, { type: 'rect', x0: 5.5, x1: 8, z0: s.z - 1, z1: s.z + 1 });
    // Boundary wall running along the road either side of the gates.
    B.prov = PROV.book;
    const road = PATHS.find((p) => p.id === 'road').pts;
    for (let x = -420; x <= 420; x += 3) {
      if (Math.abs(x) < 8) continue;
      const z = roadZ(road, x) + 7.5;
      const yy = H(x, z);
      B.box('stoneDark', x, yy - 0.8, z, 3.05, 2.3, 0.75, Math.atan2(roadZ(road, x + 1) - roadZ(road, x - 1), 2) * -1, { faces: 'nsewt' });
    }
  }

  // ── The underground harbour: boats pass through a curtain of ivy (PS6) ──
  {
    const s = SITES.harbour;
    B.prov = PROV.book;
    B.aoBase = 0;
    // Stand the mouth just proud of the cliff face across its whole width;
    // set any deeper, the terrain's coarse slope buries it.
    const cy = 0.4;
    let z = 60;
    for (let lx = -5; lx <= 5; lx += 1) {
      let zz = 60;
      while (zz < 110 && heightAt(s.x + lx, zz) > cy + 11) zz += 0.25;
      z = Math.max(z, zz);
    }
    z += 2.4;
    const o = archOutline(9, 10, 8);
    const nrm = new THREE.Vector3(0, 0, 1);
    const P = (lx, ly, off) => new THREE.Vector3(s.x + lx, cy + ly, z - 1.2 + off);
    const pts = [P(0, 4, 0), ...o.map(([x, y]) => P(x, y, 0)), P(o[0][0], o[0][1], 0)];
    B.poly('void', pts, nrm, () => [0, 0]);
    // Ivy strands hanging across the mouth.
    for (let k = 0; k < 34; k++) {
      const lx = -4.3 + (k / 33) * 8.6 + (rand() - 0.5) * 0.3;
      const top = Math.min(10.2, o.reduce((m, [x, y]) => (Math.abs(x - lx) < 0.7 ? Math.max(m, y) : m), 6));
      const len = top - 0.8 - rand() * 3.2;
      const w = 0.28 + rand() * 0.25;
      const a = P(lx - w / 2, top - len, 0.25 + rand() * 0.3), b = P(lx + w / 2, top - len, 0.25), c = P(lx + w / 2, top, 0.3), d = P(lx - w / 2, top, 0.3);
      B.quad('ivy', a, b, c, d, nrm);
    }
    // Ivy draped over the rock around the mouth.
    for (let k = 0; k < 60; k++) {
      const a = rand() * Math.PI, rr = 5.5 + rand() * 4;
      const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr * 1.1;
      const q = P(lx, ly, 0.6 + rand() * 0.6);
      addScaled(B, 'ivy', new THREE.IcosahedronGeometry(1, 0), q.x, q.y, q.z, 1.2 + rand(), 0.9 + rand() * 0.6, 0.6);
    }
    // The little fleet of boats, each with a lantern.
    for (let k = 0; k < 5; k++) {
      const bx = s.x - 10 + k * 5.2 + (rand() - 0.5) * 2, bz = z + 6 + (k % 2) * 5 + rand() * 4;
      const rot = 0.2 * (rand() - 0.5);
      addBoat(B, bx, bz, rot);
      markers[`lantern${k}`] = new THREE.Vector3(bx, 1.7, bz - 1.3);
    }
    markers.harbour = new THREE.Vector3(s.x, 12, z);
  }

  // ── The white marble tomb beside the lake (HBP30) ───────────────────────
  {
    const s = SITES.tomb;
    const y = H(s.x, s.z) - 0.2;
    B.aoBase = y;
    B.prov = PROV.book;
    B.box('marble', s.x, y, s.z, 3.8, 0.45, 6.2, 0.3, { faces: 'nsewt' });
    B.box('marble', s.x, y + 0.45, s.z, 3.1, 1.1, 5.4, 0.3, { faces: 'nsewt' });
    B.box('marble', s.x, y + 1.55, s.z, 3.4, 0.28, 5.7, 0.3, { faces: 'nsewt' });
    markers.tomb = new THREE.Vector3(s.x, y + 5, s.z);
    colliders.push({ type: 'circle', x: s.x, z: s.z, r: 3.5 });
  }

  // ── Hogsmeade station on the far shore (Rowling: station's on the other side) ──
  {
    const s = SITES.station;
    const y = H(s.x, s.z) + 0.2;
    B.aoBase = y;
    B.prov = PROV.author;
    B.box('stone', s.x, y - 1, s.z, 90, 1.9, 7, 0, { faces: 'nsewt' });
    B.box('stone', s.x - 8, y + 0.9, s.z + 7, 16, 5, 7, 0, { faces: 'nsewt' });
    B.gableRoof('slate', 'stone', s.x - 16, s.x, s.z + 3.5, s.z + 10.5, y + 5.9, y + 9, 'x', { overhang: 0.6 });
    for (let k = 0; k < 4; k++) B.archWindow(s.x - 14 + k * 4, y + 1.6, s.z + 3.48, Math.PI, 1.3, 2.3, { frame: 0.14 });
    // The scarlet engine and its carriages.
    const ty = y - 0.4;
    B.tint = [1, 1, 1];
    B.box('iron', s.x, ty - 0.4, s.z - 6, 110, 0.3, 3.2);
    B.box('scarlet', s.x + 32, ty, s.z - 6, 12, 3.1, 3.0, 0, { faces: 'nsewt' });
    B.cyl('scarlet', s.x + 30, s.z - 6, ty + 3.1, ty + 4.6, 0.55, 0.62, 10, { top: true });
    B.box('iron', s.x + 37, ty, s.z - 6, 3.4, 4.3, 3.1, 0, { faces: 'nsewt' });
    for (let k = 0; k < 5; k++) {
      const cx = s.x + 18 - k * 13.5;
      B.box('scarlet', cx, ty, s.z - 6, 12.5, 3.6, 3.0, 0, { faces: 'nsewt' });
      B.box('iron', cx, ty + 3.6, s.z - 6, 12.5, 0.35, 3.1, 0, { faces: 'nsewt' });
      for (let w = 0; w < 5; w++) B.archWindow(cx - 5 + w * 2.5, ty + 1.5, s.z - 7.52, Math.PI, 1.2, 1.2, { frame: 0.08 });
    }
    markers.station = new THREE.Vector3(s.x, y + 12, s.z);
    markers.steam = new THREE.Vector3(s.x + 30, ty + 5, s.z - 6);
  }

  // ── Hogsmeade village and the Shrieking Shack ───────────────────────────
  {
    B.prov = PROV.interpreted;
    const s = SITES.hogsmeade;
    const lots = [];
    for (let k = 0, tries = 0; k < 46 && tries < 400; tries++) {
      const along = (rand() - 0.5) * 220;
      const off = (rand() < 0.5 ? -1 : 1) * (9 + rand() * 18);
      const x = s.x + off + along * 0.12, z = s.z + along;
      const w = 6 + rand() * 4, d = 7 + rand() * 5, hh = 4.5 + rand() * 3.5;
      // Every cottage on its own plot: no walls running through each other.
      if (lots.some((l) => Math.abs(l.x - x) < (l.w + w) / 2 + 1.5 && Math.abs(l.z - z) < (l.d + d) / 2 + 1.5)) continue;
      lots.push({ x, z, w, d });
      k++;
      const y = H(x, z) - 0.3;
      B.aoBase = y;
      setTint(B, k);
      B.box(rand() < 0.3 ? 'plaster' : 'stone', x, y, z, w, hh, d, 0, { faces: 'nsewt' });
      B.gableRoof('slate', 'stone', x - w / 2, x + w / 2, z - d / 2, z + d / 2, y + hh, y + hh + w * 0.75, 'z', { overhang: 0.5 });
      B.box('stone', x + w * 0.3, y + hh, z + d * 0.3, 0.9, w * 0.7 + 1.5, 0.9);
      for (let f = 0; f < 2; f++) B.archWindow(x + (off > 0 ? -w / 2 - 0.02 : w / 2 + 0.02), y + 1.2 + f * 2.2, z, off > 0 ? -Math.PI / 2 : Math.PI / 2, 0.9, 1.3, { frame: 0.1 });
    }
    B.tint = [1, 1, 1];
    markers.hogsmeade = new THREE.Vector3(s.x, H(s.x, s.z) + 30, s.z);
    const sh = SITES.shack;
    const y = H(sh.x, sh.z) - 0.3;
    B.aoBase = y;
    B.prov = PROV.book;
    B.box('woodDark', sh.x, y, sh.z, 8, 6, 7, 0.25, { faces: 'nsew', bands: 2 });
    B.gableRoof('woodDark', 'woodDark', sh.x - 4, sh.x + 4, sh.z - 3.5, sh.z + 3.5, y + 6, y + 9.5, 'x', { overhang: 0.4 });
    markers.shack = new THREE.Vector3(sh.x, y + 13, sh.z);
  }

  // ── Lamps along the drive ──────────────────────────────────────────────
  const lampPositions = [];
  {
    B.prov = PROV.interpreted;
    for (let z = -120; z > -390; z -= 31) {
      for (const side of [-1, 1]) {
        const x = side * 6.2, y = H(x, z);
        B.aoBase = y;
        B.cyl('iron', x, z, y, y + 3.6, 0.08, 0.06, 6);
        B.box('iron', x, y + 3.6, z, 0.5, 0.08, 0.5);
        lampPositions.push(new THREE.Vector3(x, y + 3.95, z));
      }
    }
  }

  // ── Materials ──────────────────────────────────────────────────────────
  const materials = {
    stone: makeSurface({ color: '#8b867b', pattern: 'ashlar', course: 0.4, bump: 0.02 }),
    stoneDark: makeSurface({ color: '#6c6860', pattern: 'ashlar', course: 0.35, bump: 0.03, grime: 1.3 }),
    trim: makeSurface({ color: '#aaa495', pattern: 'dressed', grime: 0.6 }),
    slate: makeSurface({ color: '#3b444e', pattern: 'slate', roughness: 0.7, bump: 0.05, grime: 0.45 }),
    wood: makeSurface({ color: '#5a4230', pattern: 'planks', roughness: 0.88, bump: 0.025, grime: 0.9 }),
    woodDark: makeSurface({ color: '#3e2f24', pattern: 'planks', roughness: 0.9, bump: 0.02, grime: 1 }),
    shingle: makeSurface({ color: '#3f3a30', pattern: 'slate', roughness: 0.92, bump: 0.06, grime: 1.4, side: THREE.DoubleSide }),
    plaster: makeSurface({ color: '#cfc7b4', pattern: 'none', roughness: 0.92, grime: 1.1 }),
    marble: makeSurface({ color: '#eeebe4', pattern: 'dressed', roughness: 0.35, grime: 0.25, envMapIntensity: 0.8 }),
    gold: makeSurface({ color: '#c9a24e', pattern: 'none', roughness: 0.3, metalness: 1, grime: 0, weather: false }),
    iron: makeSurface({ color: '#26282a', pattern: 'none', roughness: 0.55, metalness: 0.6, grime: 0.2 }),
    scarlet: makeSurface({ color: '#8c1c17', pattern: 'none', roughness: 0.45, metalness: 0.2, grime: 0.3 }),
    rubber: makeSurface({ color: '#2f3a2a', pattern: 'none', roughness: 0.6, grime: 0 }),
    cloth: makeSurface({ color: '#ffffff', pattern: 'none', roughness: 0.9, grime: 0.2, side: THREE.FrontSide }),
    pumpkin: makeSurface({ color: '#c8641c', pattern: 'none', roughness: 0.6, grime: 0.4 }),
    leaf: makeSurface({ color: '#4d7a2c', pattern: 'none', roughness: 0.85, grime: 0.3 }),
    leafPale: makeSurface({ color: '#8aa556', pattern: 'none', roughness: 0.85, grime: 0.3 }),
    ivy: makeSurface({ color: '#2c4a22', pattern: 'none', roughness: 0.85, grime: 0.2, side: THREE.DoubleSide }),
    plant: makeSurface({ color: '#3b6a2a', pattern: 'none', roughness: 0.8, grime: 0 }),
    frame: makeSurface({ color: '#dcd8cc', pattern: 'none', roughness: 0.6, grime: 0.5 }),
    void: makeSurface({ color: '#060708', pattern: 'none', roughness: 1, grime: 0, weather: false, envMapIntensity: 0 }),
    glass: makeGlass(),
    ghglass: new THREE.MeshStandardMaterial({ color: '#b9cbc4', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.2, side: THREE.DoubleSide }),
  };
  materials.plant.emissive = new THREE.Color('#1a4a22');
  materials.plant.emissiveIntensity = 0;
  const group = new THREE.Group();
  group.name = 'grounds';
  for (const [key, geo] of B.build()) {
    const mesh = new THREE.Mesh(geo, materials[key] || materials.stone);
    mesh.castShadow = !['glass', 'void', 'ghglass', 'ivy'].includes(key);
    mesh.receiveShadow = key !== 'ghglass';
    mesh.name = `grounds-${key}`;
    if (key === 'ghglass') mesh.renderOrder = 5;
    group.add(mesh);
  }

  // Lamp glows: tiny emissive spheres, bloomed at night.
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.2) });
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 6), lampMat, lampPositions.length + 5);
  const m = new THREE.Matrix4();
  lampPositions.forEach((p, i) => lamps.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  for (let k = 0; k < 5; k++) {
    const p = markers[`lantern${k}`];
    lamps.setMatrixAt(lampPositions.length + k, m.makeTranslation(p.x, p.y, p.z));
  }
  lamps.name = 'lamps';
  group.add(lamps);

  return { group, materials, markers, colliders, lampMat };
}

function setTint(B, k) {
  const t = [[1, 1, 1], [1.05, 1.0, 0.94], [0.94, 0.95, 1.0], [1.03, 1.02, 0.98]];
  B.tint = t[k % t.length];
}

function roadZ(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    if (x >= ax && x <= bx) return az + (bz - az) * ((x - ax) / (bx - ax));
  }
  return pts[0][1];
}

function addScaled(B, key, geo, x, y, z, sx, sy, sz, rot) {
  if (rot) geo.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  const p = geo.attributes.position, n = geo.attributes.normal;
  const grp = B.g(key);
  const base = grp.count;
  for (let i = 0; i < p.count; i++) {
    const nx = n.getX(i) / sx, ny = n.getY(i) / sy, nz = n.getZ(i) / sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    B.vert(grp, x + p.getX(i) * sx, y + p.getY(i) * sy, z + p.getZ(i) * sz, nx / l, ny / l, nz / l, p.getX(i) * sx, p.getY(i) * sy);
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i++) grp.idx.push(base + geo.index.getX(i));
  else for (let i = 0; i < p.count; i++) grp.idx.push(base + i);
}

function addBoat(B, x, z, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const L = 4.2, W = 1.4;
  // Simple hull: two planks meeting at a keel, pointed ends.
  const pts = [];
  const seg = 8;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const lz = (t - 0.5) * L;
    const w = W * 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.02)) ** 0.7;
    pts.push([lz, w]);
  }
  const P = (lx, ly, lz) => new THREE.Vector3(x + lx * c + lz * s, ly, z - lx * s + lz * c);
  for (const side of [-1, 1]) {
    for (let i = 0; i < seg; i++) {
      const [z0, w0] = pts[i], [z1, w1] = pts[i + 1];
      const a = P(side * w0, 0.9, z0), b = P(side * w1, 0.9, z1), cc = P(0, 0.15, z1), d = P(0, 0.15, z0);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      if (n.x * side * c + n.z * side * -s < 0) n.negate();
      if (side > 0) B.quad('wood', a, d, cc, b, n); else B.quad('wood', a, b, cc, d, n);
    }
  }
  B.box('wood', x, 0.6, z, 1.0, 0.1, 0.35, rot);
  B.box('iron', x + s * -1.3, 0.8, z + c * -1.3, 0.05, 0.9, 0.05, rot);
}
