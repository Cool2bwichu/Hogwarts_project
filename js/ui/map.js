// The parchment survey. Drawn from the same geography as the 3D world:
// hill-shading, contours, water-lining on the loch, stippled forest, paths,
// the castle plan in hatched ink, and the rooms of each floor.

import {
  heightAt, lakeSDF, forestDensity, PATHS, PLOTS, PITCH, SITES, RANGES, PAVILIONS, TOWERS,
  GREAT_HALL, ENTRANCE, WEST_TOWER, FORECOURT, COURTS,
} from '../world/layout.js';
import { mulberry32 } from '../engine/noise.js';
import { ROOMS, FLOORS } from '../data/floors.js';
import { PROV_COLORS } from '../engine/shared.js';
import { TIER_INDEX } from '../data/places.js';

const B = { x0: -1300, x1: 1300, z0: -1300, z1: 1560 };
const CELL = 7;
const PAPER = '#eadfc1';
const INK = '#3a2e21';
const SEPIA = 'rgba(92, 70, 45, 0.55)';
const WATER_INK = '#51706c';

export class ParchmentMap {
  constructor(canvas, { places, resolveAnchor, onSelect }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.places = places;
    this.resolveAnchor = resolveAnchor;
    this.onSelect = onSelect;
    this.view = { cx: -10, cz: -150, s: 1.0 };
    this.floor = null;
    this.ready = false;
    this.hits = [];
    this.bind();
  }

  // ── Survey (computed once) ──────────────────────────────────────────────
  survey() {
    if (this.ready) return;
    const nx = Math.ceil((B.x1 - B.x0) / CELL), nz = Math.ceil((B.z1 - B.z0) / CELL);
    const H = new Float32Array((nx + 1) * (nz + 1));
    const L = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = B.x0 + i * CELL, z = B.z0 + j * CELL;
      H[j * (nx + 1) + i] = heightAt(x, z);
      L[j * (nx + 1) + i] = lakeSDF(x, z);
    }
    this.grid = { nx, nz, H, L };
    // Wash: paper tinted by hill-shade, loch and moor.
    const wash = document.createElement('canvas');
    wash.width = nx; wash.height = nz;
    const g = wash.getContext('2d');
    const img = g.createImageData(nx, nz);
    const lx = -0.55, ly = 0.62, lz = -0.55;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * (nx + 1) + i;
      const h = H[k];
      const dx = (H[k + 1] - H[k]) / CELL, dz = (H[k + nx + 1] - H[k]) / CELL;
      const len = Math.hypot(dx, 1, dz);
      const shade = Math.max(0, (-dx * lx + ly - dz * lz) / len);
      let r = 234, gg = 223, b = 193;
      const hs = (shade - 0.62) * 70;
      r += hs; gg += hs; b += hs * 0.8;
      const moor = Math.min(1, Math.max(0, (h - 110) / 300));
      r -= moor * 16; gg -= moor * 14; b -= moor * 22;
      if (L[k] < 0 && h < 0.5) {
        const depth = Math.min(1, -h / 40);
        r = 186 - depth * 34; gg = 199 - depth * 30; b = 190 - depth * 22;
      }
      const o = (j * nx + i) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.wash = wash;
    // Contours every 10 m above the water; the loch's water-lining below it.
    this.contours = this.march(H, nx, nz, (lvl) => lvl, [...Array(90)].map((_, k) => 10 + k * 10));
    this.shore = this.march(L, nx, nz, (lvl) => lvl, [0, -9, -20, -34]);
    // Forest glyphs.
    const rand = mulberry32(3);
    this.trees = [];
    for (let z = B.z0; z < B.z1; z += 15) for (let x = B.x0; x < B.x1; x += 15) {
      const px = x + rand() * 12, pz = z + rand() * 12;
      const d = forestDensity(px, pz);
      if (d < 0.45 || rand() > d * 0.9 || lakeSDF(px, pz) < 5 || heightAt(px, pz) > 420) continue;
      this.trees.push([px, pz, 3.2 + rand() * 2.4, rand()]);
    }
    this.paper = this.makePaper();
    this.ready = true;
  }

  march(F, nx, nz, _, levels) {
    const out = new Map();
    const W = nx + 1;
    for (const lvl of levels) {
      const segs = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = F[j * W + i] - lvl, b = F[j * W + i + 1] - lvl, c = F[(j + 1) * W + i + 1] - lvl, d = F[(j + 1) * W + i] - lvl;
        const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = B.x0 + i * CELL, z = B.z0 + j * CELL;
        const e = [
          [x + CELL * (a / (a - b)), z],
          [x + CELL, z + CELL * (b / (b - c))],
          [x + CELL * (d / (d - c)), z + CELL],
          [x, z + CELL * (a / (a - d))],
        ];
        const T = {
          1: [[2, 3]], 2: [[1, 2]], 3: [[1, 3]], 4: [[0, 1]], 5: [[0, 3], [1, 2]], 6: [[0, 2]], 7: [[0, 3]],
          8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[0, 1]], 12: [[1, 3]], 13: [[1, 2]], 14: [[2, 3]],
        }[idx];
        for (const [p, q] of T) segs.push(e[p][0], e[p][1], e[q][0], e[q][1]);
      }
      out.set(lvl, new Float32Array(segs));
    }
    return out;
  }

  makePaper() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    const rand = mulberry32(12);
    for (let i = 0; i < 256 * 256; i++) {
      const n = (rand() - 0.5) * 16;
      img.data[i * 4] = 234 + n; img.data[i * 4 + 1] = 223 + n; img.data[i * 4 + 2] = 193 + n * 0.8; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return this.ctx.createPattern(c, 'repeat');
  }

  // ── View ────────────────────────────────────────────────────────────────
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.w = w; this.h = h;
  }

  fit(x0, x1, z0, z1, { right = 0, bottom = 0 } = {}) {
    const w = Math.max(200, this.w - right), h = Math.max(200, this.h - bottom);
    this.view.s = Math.min(w / (x1 - x0), h / (z1 - z0));
    // Centre the region in the space left of any side panel.
    this.view.cx = (x0 + x1) / 2 + right / 2 / this.view.s;
    this.view.cz = (z0 + z1) / 2 + bottom / 2 / this.view.s;
  }

  toScreen(x, z) {
    return [(x - this.view.cx) * this.view.s + this.w / 2, (z - this.view.cz) * this.view.s + this.h / 2];
  }
  toWorld(px, py) {
    return [(px - this.w / 2) / this.view.s + this.view.cx, (py - this.h / 2) / this.view.s + this.view.cz];
  }

  open() {
    this.resize();
    if (!this.ready) this.survey();
    if (!this.opened) { this.fit(-340, 340, -470, 170); this.opened = true; }
    this.draw();
  }

  setFloor(id) {
    this.floor = id;
    const wide = this.w > 760;
    if (id) this.fit(-175, 165, -110, 100, { right: wide ? 440 : 0, bottom: wide ? 60 : this.h * 0.55 });
    this.draw();
  }

  bind() {
    const c = this.canvas;
    const ptrs = new Map();
    let pinch = null, moved = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) { this.hover(e); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        return;
      }
      this.view.cx -= dx / this.view.s;
      this.view.cz -= dy / this.view.s;
      this.clamp();
      this.request();
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      pinch = null;
      c.style.cursor = 'grab';
      if (moved < 6 && e.type === 'pointerup') this.click(e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      const r = c.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, 2);
    });
  }

  zoomAt(px, py, f) {
    const [wx, wz] = this.toWorld(px, py);
    this.view.s = Math.min(14, Math.max(0.12, this.view.s * f));
    this.view.cx = wx - (px - this.w / 2) / this.view.s;
    this.view.cz = wz - (py - this.h / 2) / this.view.s;
    this.clamp();
    this.request();
  }

  clamp() {
    this.view.cx = Math.min(B.x1, Math.max(B.x0, this.view.cx));
    this.view.cz = Math.min(B.z1, Math.max(B.z0, this.view.cz));
  }

  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.draw(); });
  }

  hitAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return this.hits.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
  }
  hover(e) {
    this.canvas.style.cursor = this.hitAt(e) ? 'pointer' : 'grab';
  }
  click(e) {
    const hit = this.hitAt(e);
    if (hit) this.onSelect(hit.id);
  }

  // ── Drawing ─────────────────────────────────────────────────────────────
  draw() {
    if (!this.ready) return;
    const g = this.ctx, s = this.view.s, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.paper;
    g.fillRect(0, 0, this.w, this.h);
    const W = (x, z) => this.toScreen(x, z);
    const inFloor = !!this.floor;

    // Wash.
    const [wx0, wz0] = W(B.x0, B.z0);
    g.save();
    g.globalAlpha = inFloor ? 0.35 : 1;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.wash, wx0, wz0, this.grid.nx * CELL * s, this.grid.nz * CELL * s);
    g.restore();

    // Contours.
    g.save();
    g.globalAlpha = inFloor ? 0.25 : 1;
    for (const [lvl, segs] of this.contours) {
      const major = lvl % 50 === 0;
      if (!major && s < 0.35) continue;
      g.strokeStyle = major ? 'rgba(110, 80, 48, 0.55)' : 'rgba(110, 80, 48, 0.28)';
      g.lineWidth = major ? 1.1 : 0.6;
      this.segments(segs);
    }
    // Water-lining: the loch's edge in ink, then fading offset lines.
    [[0, 1.6, 1], [-9, 0.8, 0.6], [-20, 0.7, 0.4], [-34, 0.6, 0.25]].forEach(([lvl, lw, a]) => {
      g.strokeStyle = `rgba(66, 96, 92, ${a})`;
      g.lineWidth = lw;
      this.segments(this.shore.get(lvl));
    });
    g.restore();

    // Forest.
    g.save();
    g.globalAlpha = inFloor ? 0.2 : 1;
    const [vx0, vz0] = this.toWorld(-20, -20), [vx1, vz1] = this.toWorld(this.w + 20, this.h + 20);
    const step = s < 0.25 ? 3 : s < 0.5 ? 2 : 1;
    for (let i = 0; i < this.trees.length; i += step) {
      const [x, z, r, t] = this.trees[i];
      if (x < vx0 || x > vx1 || z < vz0 || z > vz1) continue;
      const [px, py] = W(x, z);
      const rr = Math.max(1.1, r * s * step * 0.8);
      g.fillStyle = t < 0.5 ? 'rgba(74, 90, 58, 0.55)' : 'rgba(88, 98, 60, 0.5)';
      g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(52, 58, 36, 0.55)';
      g.lineWidth = 0.6;
      g.beginPath(); g.arc(px - rr * 0.2, py - rr * 0.2, rr, Math.PI * 0.1, Math.PI * 1.1); g.stroke();
    }
    g.restore();

    // Paths and roads.
    g.save();
    g.globalAlpha = inFloor ? 0.3 : 1;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of PATHS) {
      const pts = p.pts.map(([x, z]) => W(x, z));
      const wpx = Math.max(p.kind === 'dirt' ? 1 : 2.4, p.width * s);
      if (p.kind === 'dirt') {
        g.setLineDash([Math.max(3, 4 * s), Math.max(2, 3 * s)]);
        g.strokeStyle = 'rgba(110, 80, 48, 0.8)';
        g.lineWidth = Math.max(1, wpx * 0.4);
        this.poly(pts);
        g.setLineDash([]);
      } else {
        g.strokeStyle = INK; g.lineWidth = wpx + 1.6; this.poly(pts);
        g.strokeStyle = '#efe4c7'; g.lineWidth = wpx; this.poly(pts);
      }
    }
    // Plots.
    for (const pl of PLOTS) {
      g.save();
      const [px, py] = W(pl.x, pl.z);
      g.translate(px, py); g.rotate(pl.rot);
      g.fillStyle = 'rgba(120, 90, 55, 0.25)';
      g.strokeStyle = SEPIA;
      g.lineWidth = 0.8;
      g.fillRect(-pl.w / 2 * s, -pl.d / 2 * s, pl.w * s, pl.d * s);
      g.strokeRect(-pl.w / 2 * s, -pl.d / 2 * s, pl.w * s, pl.d * s);
      for (let k = -pl.d / 2 + 3; k < pl.d / 2; k += 3) { g.beginPath(); g.moveTo(-pl.w / 2 * s, k * s); g.lineTo(pl.w / 2 * s, k * s); g.stroke(); }
      g.restore();
    }
    // Pitch.
    {
      const [px, py] = W(PITCH.x, PITCH.z);
      g.strokeStyle = INK; g.lineWidth = 1.2;
      g.beginPath(); g.ellipse(px, py, PITCH.rx * s, PITCH.rz * s, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = SEPIA; g.lineWidth = Math.max(1, 8 * s);
      g.beginPath(); g.ellipse(px, py, (PITCH.rx + 10) * s, (PITCH.rz + 10) * s, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = INK;
      for (const end of [-1, 1]) for (const dx of [-7, 0, 7]) {
        const [hx, hy] = W(PITCH.x + dx, PITCH.z + end * (PITCH.rz - 7));
        g.beginPath(); g.arc(hx, hy, Math.max(1.4, 1.2 * s), 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();

    // The castle plan.
    this.drawCastle(g, W, s, inFloor);
    // Small buildings.
    if (!inFloor) this.drawGrounds(g, W, s);

    // Rooms of the chosen floor.
    this.hits = [];
    if (inFloor) this.drawRooms(g, W, s);
    else this.drawNames(g, W, s);

    this.drawFurniture(g);
  }

  segments(segs) {
    if (!segs) return;
    const g = this.ctx, s = this.view.s, cx = this.view.cx, cz = this.view.cz, hw = this.w / 2, hh = this.h / 2;
    g.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      const x0 = (segs[i] - cx) * s + hw, y0 = (segs[i + 1] - cz) * s + hh;
      const x1 = (segs[i + 2] - cx) * s + hw, y1 = (segs[i + 3] - cz) * s + hh;
      if ((x0 < -5 && x1 < -5) || (x0 > this.w + 5 && x1 > this.w + 5) || (y0 < -5 && y1 < -5) || (y0 > this.h + 5 && y1 > this.h + 5)) continue;
      g.moveTo(x0, y0); g.lineTo(x1, y1);
    }
    g.stroke();
  }

  poly(pts) {
    const g = this.ctx;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }

  hatch(g, draw, s, dense = 5) {
    g.save();
    draw();
    g.clip();
    g.strokeStyle = 'rgba(58, 46, 33, 0.5)';
    g.lineWidth = 0.7;
    const step = Math.max(3, dense);
    g.beginPath();
    for (let k = -this.h; k < this.w + this.h; k += step) { g.moveTo(k, 0); g.lineTo(k + this.h, this.h); }
    g.stroke();
    g.restore();
  }

  drawCastle(g, W, s, inFloor) {
    const rects = [...RANGES, ...PAVILIONS, GREAT_HALL, ENTRANCE, WEST_TOWER];
    const fill = inFloor ? 'rgba(239, 230, 205, 0.95)' : 'rgba(58, 46, 33, 0.12)';
    // Courts first.
    for (const c of COURTS) {
      const [x0, y0] = W(c.x0, c.z0), [x1, y1] = W(c.x1, c.z1);
      g.fillStyle = c.kind === 'lawn' || c.kind === 'garden' ? 'rgba(110, 130, 80, 0.22)' : 'rgba(120, 100, 70, 0.12)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    {
      const f = FORECOURT;
      const [x0, y0] = W(f.x0, f.z0), [x1, y1] = W(f.x1, f.z1);
      g.fillStyle = 'rgba(120, 100, 70, 0.14)';
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = INK; g.lineWidth = 0.9;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    const shape = () => {
      g.beginPath();
      for (const r of rects) {
        const [x0, y0] = W(r.x0, r.z0), [x1, y1] = W(r.x1, r.z1);
        g.rect(x0, y0, x1 - x0, y1 - y0);
      }
      for (const t of TOWERS) {
        const [x, y] = W(t.x, t.z);
        g.moveTo(x + t.r * s, y);
        g.arc(x, y, t.r * s, 0, Math.PI * 2);
      }
    };
    g.save();
    shape();
    g.fillStyle = fill;
    g.fill('nonzero');
    g.restore();
    if (!inFloor) this.hatch(g, shape, s, Math.max(3, 2.2 * s));
    g.strokeStyle = INK;
    g.lineWidth = inFloor ? 1.6 : 1.2;
    for (const r of rects) {
      const [x0, y0] = W(r.x0, r.z0), [x1, y1] = W(r.x1, r.z1);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    for (const t of TOWERS) {
      const [x, y] = W(t.x, t.z);
      g.fillStyle = inFloor ? 'rgba(239, 230, 205, 1)' : 'rgba(224, 212, 182, 1)';
      g.beginPath(); g.arc(x, y, t.r * s, 0, Math.PI * 2); g.fill(); g.stroke();
      if (!inFloor && s > 0.6) {
        g.beginPath(); g.arc(x, y, t.r * s * 0.45, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  drawGrounds(g, W, s) {
    g.fillStyle = 'rgba(58, 46, 33, 0.75)';
    const dot = (x, z, w, d, rot = 0) => {
      const [px, py] = W(x, z);
      g.save(); g.translate(px, py); g.rotate(-rot);
      g.fillRect(-w / 2 * s, -d / 2 * s, Math.max(2, w * s), Math.max(2, d * s));
      g.restore();
    };
    dot(SITES.hagrid.x, SITES.hagrid.z, 10, 8, -0.35);
    dot(SITES.changingW.x, SITES.changingW.z, 9, 14);
    dot(SITES.changingE.x, SITES.changingE.z, 9, 14);
    [[-18, -10, 0.35, 18], [2, -16, 0.35, 18], [-10, 12, 0.5, 22], [14, 6, 0.55, 18]].forEach(([ox, oz, r, L]) => {
      g.fillStyle = 'rgba(80, 110, 100, 0.55)';
      dot(SITES.greenhouses.x + ox, SITES.greenhouses.z + oz, L, 8, r);
    });
    g.fillStyle = 'rgba(58, 46, 33, 0.8)';
    dot(SITES.tomb.x, SITES.tomb.z, 4, 6, 0.3);
    dot(SITES.station.x, SITES.station.z, 90, 7);
    dot(SITES.shack.x, SITES.shack.z, 8, 7);
    for (const s2 of [-6.5, 6.5]) dot(SITES.gates.x + s2, SITES.gates.z, 2, 2);
    // The Whomping Willow, drawn as Rowling drew it: a lone, wild tree.
    const [wx, wy] = W(SITES.willow.x, SITES.willow.z);
    g.strokeStyle = INK; g.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      g.beginPath(); g.moveTo(wx, wy);
      g.quadraticCurveTo(wx + Math.cos(a) * 9 * s, wy + Math.sin(a) * 9 * s - 4 * s, wx + Math.cos(a) * 12 * s, wy + Math.sin(a) * 12 * s + 4 * s);
      g.stroke();
    }
    // Avenue along the drive.
    g.fillStyle = 'rgba(74, 90, 58, 0.7)';
    for (let z = -112; z > -392; z -= 15.5) for (const x of [-12.5, 12.5]) {
      const [px, py] = W(x, z);
      g.beginPath(); g.arc(px, py, Math.max(1.4, 4 * s), 0, Math.PI * 2); g.fill();
    }
  }

  label(g, text, px, py, { size = 14, italic = true, color = INK, id = null, align = 'center' } = {}) {
    g.font = `${italic ? 'italic ' : ''}${size}px 'IM Fell English', Georgia, serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    const w = g.measureText(text).width;
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(234, 223, 193, 0.9)';
    g.strokeText(text, px, py);
    g.fillStyle = color;
    g.fillText(text, px, py);
    if (id) {
      const x0 = align === 'center' ? px - w / 2 : px;
      this.hits.push({ id, x0: x0 - 4, x1: x0 + w + 4, y0: py - size * 0.7, y1: py + size * 0.7 });
    }
  }

  drawNames(g, W, s) {
    const placed = [];
    const list = [...this.places].sort((a, b) => (b.major ? 1 : 0) - (a.major ? 1 : 0));
    for (const p of list) {
      const a = this.resolveAnchor(p);
      const [px, py] = W(a.x, a.z);
      if (px < -50 || px > this.w + 50 || py < -20 || py > this.h + 20) continue;
      const size = p.major ? Math.min(20, 13 + s * 3) : 13;
      if (!p.major && s < 0.45) continue;
      g.font = `italic ${size}px 'IM Fell English', Georgia, serif`;
      const w = g.measureText(p.name).width;
      const oy = p.id === 'castle' ? -Math.max(40, 90 * s) : -12;
      const box = { x0: px - w / 2, x1: px + w / 2, y0: py + oy - size, y1: py + oy + size * 0.4 };
      if (placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue;
      placed.push(box);
      g.fillStyle = INK;
      if (p.id !== 'castle' && p.id !== 'lake' && p.id !== 'forest') { g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill(); }
      this.label(g, p.name, px, py + oy, { size, id: p.id });
    }
  }

  drawRooms(g, W, s) {
    const rooms = ROOMS.filter((r) => r.floor === this.floor);
    const colors = PROV_COLORS;
    rooms.forEach((r, i) => {
      const [px, py] = W(r.pos[0], r.pos[1]);
      const c = colors[TIER_INDEX[r.tier]];
      g.fillStyle = c;
      g.strokeStyle = INK;
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(px, py, 11, 0, Math.PI * 2); g.fill();
      if (!r.exact) g.setLineDash([3, 3]);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#1b1408';
      g.font = `700 12px 'Alegreya Sans', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), px, py + 0.5);
      this.label(g, r.name, px, py + 22, { size: 14 });
    });
    const fl = FLOORS.find((f) => f.id === this.floor);
    this.label(g, fl.label, this.w / 2, 96, { size: 26, italic: false });
  }

  drawFurniture(g) {
    // Compass rose.
    const cx = 64, cy = this.h - 150;
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 4; k++) {
      g.rotate(Math.PI / 2);
      g.beginPath(); g.moveTo(0, -34); g.lineTo(5, -5); g.lineTo(-5, -5); g.closePath();
      if (k === 3) g.fill(); else g.stroke();
    }
    g.restore();
    this.label(g, 'N', cx, cy - 44, { size: 15, italic: false });
    // Scale bar.
    const s = this.view.s;
    const nice = [10, 20, 50, 100, 200, 250, 500, 1000];
    const m = nice.find((n) => n * s > 90) || 1000;
    const x0 = this.w / 2 - (m * s) / 2, y = this.h - 104;
    g.fillStyle = INK;
    g.fillRect(x0, y, (m * s) / 2, 4);
    g.strokeStyle = INK; g.lineWidth = 1;
    g.strokeRect(x0, y, m * s, 4);
    this.label(g, `${m} metres`, this.w / 2, y + 16, { size: 13 });
    // Cartouche.
    if (this.w > 700) {
      this.label(g, 'Hogwarts & its Grounds', this.w - 34, this.h - 150, { size: 24, italic: false, align: 'right' });
      this.label(g, 'Laid out from J.K. Rowling’s annotated sketch and the novels', this.w - 34, this.h - 126, { size: 13, align: 'right' });
    }
  }
}
