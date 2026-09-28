// Geometry builder. Everything is appended into one buffer per material, so
// the whole castle draws in a handful of calls. Each vertex carries:
//   aUvm  — surface coordinates in metres (for procedural masonry)
//   color — tint × baked ambient occlusion
//   aProv — the evidence tier behind the element (for the accuracy lens)

import * as THREE from 'three';
import { mulberry32 } from '../engine/noise.js';

const TAU = Math.PI * 2;

class Group {
  constructor(glass) {
    this.pos = []; this.nor = []; this.uvm = []; this.col = []; this.prov = []; this.idx = [];
    this.lit = glass ? [] : null;
    this.count = 0;
  }
}

export class Builder {
  constructor(seed = 7) {
    this.groups = new Map();
    this.rand = mulberry32(seed);
    this.prov = 3;
    this.tint = [1, 1, 1];
    this.aoBase = 46;       // ground level used for baked occlusion
    this.aoDepth = 7;
    this.litValue = [0, 0];
  }

  g(key) {
    let grp = this.groups.get(key);
    if (!grp) { grp = new Group(key === 'glass'); this.groups.set(key, grp); }
    return grp;
  }

  ao(y) {
    const t = Math.min(1, Math.max(0, (y - this.aoBase) / this.aoDepth));
    return 0.62 + 0.38 * t * t * (3 - 2 * t);
  }

  vert(grp, x, y, z, nx, ny, nz, u, v, shade = 1) {
    grp.pos.push(x, y, z);
    grp.nor.push(nx, ny, nz);
    grp.uvm.push(u, v);
    const a = this.ao(y) * shade;
    grp.col.push(this.tint[0] * a, this.tint[1] * a, this.tint[2] * a);
    grp.prov.push(this.prov);
    if (grp.lit) grp.lit.push(this.litValue[0], this.litValue[1]);
    return grp.count++;
  }

  /** Planar polygon (convex or fan-able from its first point). */
  poly(key, pts, n, uvFn, shade = 1) {
    const grp = this.g(key);
    const base = grp.count;
    for (const p of pts) {
      const [u, v] = uvFn(p);
      this.vert(grp, p.x, p.y, p.z, n.x, n.y, n.z, u, v, shade);
    }
    for (let i = 1; i < pts.length - 1; i++) grp.idx.push(base, base + i, base + i + 1);
  }

  quad(key, a, b, c, d, n, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], shade = 1) {
    const grp = this.g(key);
    const i0 = this.vert(grp, a.x, a.y, a.z, n.x, n.y, n.z, uv[0][0], uv[0][1], shade);
    this.vert(grp, b.x, b.y, b.z, n.x, n.y, n.z, uv[1][0], uv[1][1], shade);
    this.vert(grp, c.x, c.y, c.z, n.x, n.y, n.z, uv[2][0], uv[2][1], shade);
    this.vert(grp, d.x, d.y, d.z, n.x, n.y, n.z, uv[3][0], uv[3][1], shade);
    grp.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  /**
   * Box centred on (cx, cz) with bottom at y0. rot turns it about y.
   * faces: string of which faces to emit, from 'nsewtb' (north −z, south +z, east +x, west −x, top, bottom).
   * bands: split tall side faces into horizontal bands for smoother occlusion.
   */
  box(key, cx, y0, cz, sx, sy, sz, rot = 0, { faces = 'nsewt', bands = 1, uvOff = 0 } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, y, lz) => new THREE.Vector3(cx + lx * c + lz * s, y, cz - lx * s + lz * c);
    const N = (lx, ly, lz) => new THREE.Vector3(lx * c + lz * s, ly, -lx * s + lz * c);
    const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const side = (ax, az, bx, bz, n, len) => {
      for (let b = 0; b < bands; b++) {
        const ya = y0 + (sy * b) / bands, yb = y0 + (sy * (b + 1)) / bands;
        this.quad(key, P(ax, ya, az), P(bx, ya, bz), P(bx, yb, bz), P(ax, yb, az), n,
          [[uvOff, ya], [uvOff + len, ya], [uvOff + len, yb], [uvOff, yb]]);
      }
    };
    if (faces.includes('s')) side(-hx, hz, hx, hz, N(0, 0, 1), sx);
    if (faces.includes('n')) side(hx, -hz, -hx, -hz, N(0, 0, -1), sx);
    if (faces.includes('e')) side(hx, hz, hx, -hz, N(1, 0, 0), sz);
    if (faces.includes('w')) side(-hx, -hz, -hx, hz, N(-1, 0, 0), sz);
    if (faces.includes('t')) this.quad(key, P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), P(-hx, y1, -hz), N(0, 1, 0),
      [[cx - hx, cz + hz], [cx + hx, cz + hz], [cx + hx, cz - hz], [cx - hx, cz - hz]]);
    if (faces.includes('b')) this.quad(key, P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), N(0, -1, 0));
  }

  /** Vertical prism/cylinder with smooth sides. r0 at y0, r1 at y1. */
  cyl(key, cx, cz, y0, y1, r0, r1, sides = 24, { top = false, bottom = false, bands = 1, phase = 0, smooth = true } = {}) {
    const grp = this.g(key);
    const slopeN = (r0 - r1) / (y1 - y0);
    for (let b = 0; b < bands; b++) {
      const ya = y0 + ((y1 - y0) * b) / bands, yb = y0 + ((y1 - y0) * (b + 1)) / bands;
      const ra = r0 + (r1 - r0) * (b / bands), rb = r0 + (r1 - r0) * ((b + 1) / bands);
      if (smooth) {
        const base = grp.count;
        for (let i = 0; i <= sides; i++) {
          const a = phase + (i / sides) * TAU;
          const ca = Math.cos(a), sa = Math.sin(a);
          const nl = Math.hypot(1, slopeN);
          const u = a * (ra + rb) * 0.5;
          this.vert(grp, cx + ca * ra, ya, cz + sa * ra, ca / nl, slopeN / nl, sa / nl, u, ya);
          this.vert(grp, cx + ca * rb, yb, cz + sa * rb, ca / nl, slopeN / nl, sa / nl, u, yb);
        }
        for (let i = 0; i < sides; i++) {
          const k = base + i * 2;
          grp.idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
        }
      } else {
        for (let i = 0; i < sides; i++) {
          const a0 = phase + (i / sides) * TAU, a1 = phase + ((i + 1) / sides) * TAU;
          const am = (a0 + a1) / 2;
          const n = new THREE.Vector3(Math.cos(am), slopeN, Math.sin(am)).normalize();
          const w = 2 * Math.sin(Math.PI / sides);
          this.quad(key,
            new THREE.Vector3(cx + Math.cos(a1) * ra, ya, cz + Math.sin(a1) * ra),
            new THREE.Vector3(cx + Math.cos(a0) * ra, ya, cz + Math.sin(a0) * ra),
            new THREE.Vector3(cx + Math.cos(a0) * rb, yb, cz + Math.sin(a0) * rb),
            new THREE.Vector3(cx + Math.cos(a1) * rb, yb, cz + Math.sin(a1) * rb),
            n, [[i * w * ra, ya], [(i + 1) * w * ra, ya], [(i + 1) * w * rb, yb], [i * w * rb, yb]]);
        }
      }
    }
    if (top) this.disc(key, cx, cz, y1, r1, sides, 1, phase);
    if (bottom) this.disc(key, cx, cz, y0, r0, sides, -1, phase);
  }

  disc(key, cx, cz, y, r, sides, dir = 1, phase = 0) {
    const grp = this.g(key);
    const base = this.vert(grp, cx, y, cz, 0, dir, 0, cx, cz);
    for (let i = 0; i <= sides; i++) {
      const a = phase + (i / sides) * TAU;
      this.vert(grp, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, dir, 0, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
    for (let i = 0; i < sides; i++) {
      if (dir > 0) grp.idx.push(base, base + i + 2, base + i + 1);
      else grp.idx.push(base, base + i + 1, base + i + 2);
    }
  }

  /** Cone (slate "candle-snuffer" roof) with a slight bell at the eaves. */
  cone(key, cx, cz, y0, r, h, sides = 24, { bell = 0.12, phase = 0 } = {}) {
    const grp = this.g(key);
    const rings = [
      [0, r * (1 + bell)], [0.08, r * (1 + bell * 0.25)], [0.22, r * 0.84], [1, 0],
    ];
    const slant = Math.hypot(r, h);
    for (let k = 0; k < rings.length - 1; k++) {
      const [ta, ra] = rings[k];
      const [tb, rb] = rings[k + 1];
      const ya = y0 + ta * h, yb = y0 + tb * h;
      const dn = (ra - rb) / Math.max(yb - ya, 1e-3);
      const base = grp.count;
      for (let i = 0; i <= sides; i++) {
        const a = phase + (i / sides) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nl = Math.hypot(1, dn);
        const u = a * r;
        this.vert(grp, cx + ca * ra, ya, cz + sa * ra, ca / nl, dn / nl, sa / nl, u, ta * slant);
        this.vert(grp, cx + ca * rb, yb, cz + sa * rb, ca / nl, dn / nl, sa / nl, u * (rb / Math.max(ra, 1e-3)), tb * slant);
      }
      for (let i = 0; i < sides; i++) {
        const q = base + i * 2;
        grp.idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);
      }
    }
  }

  /** Four-sided pyramid (spire, pinnacle, hipped cap). */
  pyramid(key, cx, cz, y0, hx, hz, h, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, y, lz) => new THREE.Vector3(cx + lx * c + lz * s, y, cz - lx * s + lz * c);
    const apex = P(0, y0 + h, 0);
    const corners = [P(-hx, y0, hz), P(hx, y0, hz), P(hx, y0, -hz), P(-hx, y0, -hz)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(apex, a)).normalize();
      const len = a.distanceTo(b);
      this.poly(key, [a, b, apex], n, (p) => [p === a ? 0 : p === b ? len : len / 2, p === apex ? Math.hypot(h, len / 2) : 0]);
    }
  }

  /**
   * Gable roof over a rectangle. axis 'x' runs the ridge east–west.
   * Gable ends are filled with `wallKey`.
   */
  gableRoof(key, wallKey, x0, x1, z0, z1, yEave, yRidge, axis = 'x', { overhang = 0.6, ends = true, hip = false } = {}) {
    const ex = axis === 'x';
    const L0 = ex ? x0 : z0, L1 = ex ? x1 : z1;
    const W0 = ex ? z0 : x0, W1 = ex ? z1 : x1;
    const wm = (W0 + W1) / 2;
    const P = (l, y, w) => (ex ? new THREE.Vector3(l, y, w) : new THREE.Vector3(w, y, l));
    const o = overhang;
    const half = (W1 - W0) / 2 + o;
    const drop = (o / ((W1 - W0) / 2)) * (yRidge - yEave);
    const yE = yEave - drop;
    const slant = Math.hypot(half, yRidge - yE);
    const inset = hip ? (yRidge - yE) * 0.9 : 0;
    // Two slopes.
    for (const side of [-1, 1]) {
      const wEdge = wm + side * half;
      const nrm = ex ? new THREE.Vector3(0, half, side * (yRidge - yE)).normalize() : new THREE.Vector3(side * (yRidge - yE), half, 0).normalize();
      const a = P(L0 - o, yE, wEdge), b = P(L1 + o, yE, wEdge);
      const c = P(L1 + o - inset, yRidge, wm), d = P(L0 - o + inset, yRidge, wm);
      const fwd = (side > 0) === ex;
      const pts = fwd ? [a, b, c, d] : [b, a, d, c];
      const uv = fwd
        ? [[L0 - o, 0], [L1 + o, 0], [L1 + o - inset, slant], [L0 - o + inset, slant]]
        : [[L1 + o, 0], [L0 - o, 0], [L0 - o + inset, slant], [L1 + o - inset, slant]];
      this.quad(key, pts[0], pts[1], pts[2], pts[3], nrm, uv);
    }
    if (hip) {
      for (const [lEnd, dir] of [[L0 - o, -1], [L1 + o, 1]]) {
        const a = P(lEnd, yE, wm - half), b = P(lEnd, yE, wm + half), apex = P(lEnd - dir * inset, yRidge, wm);
        const n = ex ? new THREE.Vector3(dir * (yRidge - yE), inset, 0).normalize() : new THREE.Vector3(0, inset, dir * (yRidge - yE)).normalize();
        const tri = (dir > 0) === ex ? [b, a, apex] : [a, b, apex];
        this.poly(key, tri, n, (p) => [ex ? p.z : p.x, p === apex ? slant : 0]);
      }
    } else if (ends) {
      for (const [lEnd, dir] of [[L0, -1], [L1, 1]]) {
        const a = P(lEnd, yEave, W0), b = P(lEnd, yEave, W1), apex = P(lEnd, yRidge, wm);
        const n = ex ? new THREE.Vector3(dir, 0, 0) : new THREE.Vector3(0, 0, dir);
        const tri = (dir > 0) === ex ? [b, a, apex] : [a, b, apex];
        this.poly(wallKey, tri, n, (p) => [ex ? p.z : p.x, p.y]);
      }
    }
    // Ridge capping.
    const rl = L1 - L0 + 2 * o - 2 * inset;
    const rc = (L0 + L1) / 2;
    if (ex) this.box('lead', rc, yRidge - 0.15, wm, rl, 0.45, 0.5);
    else this.box('lead', wm, yRidge - 0.15, rc, 0.5, 0.45, rl);
  }

  /**
   * Pointed-arch window on a wall plane. (cx, cz) is the wall point, rot the
   * outward facing angle (0 = facing +z/south). Returns nothing; adds glass,
   * a stone surround and a sill.
   */
  archWindow(cx, y0, cz, rot, w, h, { frame = 0.24, depth = 0.14, lit = true, mullion = false, openKey = 'glass', surround = true, offset = 0.04 } = {}) {
    const s = Math.sin(rot), c = Math.cos(rot);
    const n = new THREE.Vector3(s, 0, c);
    const tx = c, tz = -s; // wall tangent (to the viewer's right when facing the wall)
    const outline = archOutline(w, h, 7);
    const P = (lx, ly, out) => new THREE.Vector3(cx + tx * lx + n.x * out, y0 + ly, cz + tz * lx + n.z * out);
    if (openKey === 'glass') {
      this.litValue = lit ? [this.rand(), this.rand()] : [0, 0];
    }
    // Opening.
    const center = { x: 0, y: h * 0.45 };
    const pts = [P(center.x, center.y, offset), ...outline.map(([x, y]) => P(x, y, offset)), P(outline[0][0], outline[0][1], offset)];
    const grp = this.g(openKey);
    const base = grp.count;
    for (const p of pts) this.vert(grp, p.x, p.y, p.z, n.x, n.y, n.z, 0, 0, 0.9);
    for (let i = 1; i < pts.length - 1; i++) grp.idx.push(base, base + i, base + i + 1);
    if (mullion) {
      this.box('trim', cx + n.x * (offset + 0.03), y0, cz + n.z * (offset + 0.03), 0.16, h * 0.86, 0.12, rot);
      const tr = h * 0.72;
      this.box('trim', cx + n.x * (offset + 0.03), y0 + tr, cz + n.z * (offset + 0.03), w * 0.9, 0.12, 0.12, rot);
    }
    if (!surround) return;
    // Surround: a strip between the outline and an outset outline.
    const outer = archOutline(w + frame * 2, h + frame * 1.15, 7).map(([x, y]) => [x, y - frame * 0.05]);
    for (let i = 0; i < outline.length - 1; i++) {
      const a = outline[i], b = outline[i + 1];
      const A = outer[i], B = outer[i + 1];
      const pa = P(a[0], a[1], depth), pb = P(b[0], b[1], depth);
      const PA = P(A[0], A[1], depth), PB = P(B[0], B[1], depth);
      this.quad('trim', pa, PA, PB, pb, n, [[a[0], a[1]], [A[0], A[1]], [B[0], B[1]], [b[0], b[1]]]);
      // Reveal (inner return) gives the opening depth.
      const qa = P(a[0], a[1], offset), qb = P(b[0], b[1], offset);
      const mid = new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5);
      const inward = new THREE.Vector3(cx + n.x * depth, y0 + center.y, cz + n.z * depth).sub(mid).normalize();
      this.quad('trim', pa, pb, qb, qa, inward, [[0, 0], [1, 0], [1, 1], [0, 1]], 0.7);
    }
    // Sill.
    this.box('trim', cx + n.x * (depth * 0.5 + 0.08), y0 - 0.22, cz + n.z * (depth * 0.5 + 0.08), w + frame * 2.4, 0.22, depth + 0.3, rot, { faces: 'nsewt' });
  }

  /** Battlemented parapet along a segment (outward normal to the left of a→b). */
  battlement(x0, z0, x1, z1, y, { height = 1.1, thick = 0.6, merlon = 1.1, gap = 0.75, mh = 0.95, key = 'trim', inner = true } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.5) return;
    const rot = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box(key, cx, y, cz, len, height, thick, rot, { faces: inner ? 'nsewt' : 'nswet' });
    const step = merlon + gap;
    const count = Math.max(1, Math.floor((len + gap) / step));
    const used = count * step - gap;
    const start = -used / 2 + merlon / 2;
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    for (let i = 0; i < count; i++) {
      const t = start + i * step;
      this.box(key, cx + dx * t, y + height, cz + dz * t, merlon, mh, thick, rot, { faces: 'nsewt' });
    }
  }

  build() {
    const out = new Map();
    for (const [key, grp] of this.groups) {
      if (!grp.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(grp.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(grp.nor, 3));
      g.setAttribute('aUvm', new THREE.Float32BufferAttribute(grp.uvm, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(grp.col, 3));
      g.setAttribute('aProv', new THREE.Float32BufferAttribute(grp.prov, 1));
      if (grp.lit) g.setAttribute('aLit', new THREE.Float32BufferAttribute(grp.lit, 2));
      g.setIndex(grp.count > 65535 ? new THREE.Uint32BufferAttribute(grp.idx, 1) : new THREE.Uint16BufferAttribute(grp.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out.set(key, g);
    }
    return out;
  }
}

/** Outline of a two-centred pointed arch, anticlockwise from bottom-left. */
export function archOutline(w, h, seg = 6) {
  const R = w * 0.78;
  const half = w / 2;
  const cxL = -half + R;
  const tA = Math.acos(Math.min(1, cxL / R));
  const rise = R * Math.sin(tA);
  const hs = Math.max(0, h - rise);
  const pts = [[-half, 0], [half, 0], [half, hs]];
  for (let i = 1; i <= seg; i++) {
    const t = (i / seg) * tA;
    pts.push([-(cxL - R * Math.cos(t)) , hs + R * Math.sin(t)]);
  }
  for (let i = seg - 1; i >= 1; i--) {
    const t = (i / seg) * tA;
    pts.push([cxL - R * Math.cos(t), hs + R * Math.sin(t)]);
  }
  pts.push([-half, hs]);
  return pts;
}
