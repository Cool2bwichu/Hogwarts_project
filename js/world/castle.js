// Hogwarts Castle, generated from Rowling's plan (see layout.js). The plan,
// the named places and the floor count follow the sources; the Scottish
// Gothic detailing is the atlas's architectural reading and is tagged as such.

import * as THREE from 'three';
import { Builder, archOutline } from './builder.js';
import {
  RANGES, TOWERS, GREAT_HALL, ENTRANCE, WEST_TOWER, FORECOURT, COURTS, PAVILIONS, BARTIZANS,
  PLATEAU, CASTLE_FLOOR, FLOOR_Y, PROV, heightAt,
} from './layout.js';
import { makeSurface, makeGlass } from '../engine/shared.js';

// Centuries of building campaigns: slightly different stone from range to range.
const TINTS = [
  [1, 1, 1], [1.06, 1.0, 0.92], [0.92, 0.95, 1.0], [1.03, 1.01, 0.96], [0.88, 0.87, 0.86], [1.08, 1.03, 0.95], [0.96, 0.98, 0.94],
];

// Floor lines above the seventh floor continue every four metres.
function floorLines(yTop) {
  const out = [...FLOOR_Y];
  let y = FLOOR_Y[FLOOR_Y.length - 1] + 4;
  while (y < yTop - 3.5) { out.push(y); y += 4; }
  return out.filter((v) => v < yTop - 3.5);
}

export function buildCastle({ detail = 1 } = {}) {
  const B = new Builder(1066);
  const foot = [];   // footprints for occlusion tests and colliders
  const markers = {};

  for (const r of RANGES) foot.push({ type: 'rect', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
  for (const r of PAVILIONS) foot.push({ type: 'rect', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
  foot.push({ type: 'rect', ...pick(GREAT_HALL) });
  foot.push({ type: 'rect', ...pick(ENTRANCE) });
  foot.push({ type: 'rect', ...pick(WEST_TOWER) });
  for (const t of TOWERS) foot.push({ type: 'circle', x: t.x, z: t.z, r: t.r });
  foot.push({ type: 'rect', x0: -7, x1: 7, z0: -80.2, z1: -77 }); // portal

  const inside = (x, z, margin = 0) => foot.some((f) => (f.type === 'rect'
    ? x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin
    : Math.hypot(x - f.x, z - f.z) < f.r + margin));

  const setTint = (i) => { B.tint = TINTS[i % TINTS.length]; };

  // ── Rectangular ranges ──────────────────────────────────────────────────
  function facadeWindows(x0, z0, x1, z1, rot, yTop, { bay = 6.2, first = 0, w = 1.3, h = 2.6, groundW = 1.7, groundH = 3.4, floors = null, lit = true, skipFn = null, piers = true, yBase = PLATEAU - 1 } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.floor(len / bay));
    const nx = Math.sin(rot), nz = Math.cos(rot);
    const lines = floors || floorLines(yTop);
    const out = [];
    const phase = Math.floor(B.rand() * 4);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (inside(x + nx * 1.4, z + nz * 1.4)) continue;
      if (piers && n > 5 && (i + phase) % 4 === 3) {
        // A blank pier with a pilaster buttress gives the front its rhythm.
        B.box('stone', x + nx * 0.35, yBase, z + nz * 0.35, 1.5, yTop - yBase - 0.5, 0.7, rot, { faces: 'nsewt', bands: 4 });
        B.box('trim', x + nx * 0.45, yTop - 3.2, z + nz * 0.45, 1.8, 0.35, 0.95, rot, { faces: 'nsewt' });
        continue;
      }
      const tall = B.rand() < 0.3;
      for (let f = first; f < lines.length; f++) {
        const y = lines[f];
        if (skipFn && skipFn(i, f, x, z)) continue;
        if (f > 0 && B.rand() < 0.08) continue;
        const ww = f === 0 ? groundW : w, hh = f === 0 ? groundH : (tall && f % 2 === 1 ? h + 0.6 : h);
        if (y + hh + 1 > yTop) continue;
        B.archWindow(x, y + 0.95, z, rot, ww, hh, { lit });
        out.push({ i, f, x, y, z });
      }
    }
    return out;
  }

  function stringCourses(x0, x1, z0, z1, yTop, lines) {
    for (const y of lines.slice(1)) {
      if (y > yTop - 1) continue;
      B.box('trim', (x0 + x1) / 2, y - 0.18, (z0 + z1) / 2, x1 - x0 + 0.34, 0.3, z1 - z0 + 0.34, 0, { faces: 'nsewt' });
    }
  }

  function plinth(x0, x1, z0, z1, yBase) {
    B.box('stoneDark', (x0 + x1) / 2, yBase, (z0 + z1) / 2, x1 - x0 + 0.9, CASTLE_FLOOR + 0.8 - yBase, z1 - z0 + 0.9, 0, { faces: 'nsewt', bands: 2 });
  }

  function chimneys(x0, x1, z0, z1, axis, yRidge, every = 26) {
    const along = axis === 'x';
    const L0 = along ? x0 : z0, L1 = along ? x1 : z1;
    const wm = along ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const n = Math.floor((L1 - L0) / every);
    for (let i = 1; i <= n; i++) {
      const l = L0 + ((L1 - L0) * i) / (n + 1);
      const cx = along ? l : wm, cz = along ? wm : l;
      if (inside(cx, cz, 2) && !insideOnly(cx, cz)) continue;
      const hh = 4.5 + B.rand() * 1.5;
      const w = along ? 1.4 : 3.2, d = along ? 3.2 : 1.4;
      B.box('stone', cx, yRidge - 3, cz, w, hh + 3, d, 0, { faces: 'nsewt' });
      B.box('trim', cx, yRidge + hh, cz, w + 0.35, 0.35, d + 0.35, 0, { faces: 'nsewt' });
      for (let k = -1; k <= 1; k++) {
        const px = cx + (along ? 0 : k * 0.85), pz = cz + (along ? k * 0.85 : 0);
        B.cyl('stoneDark', px, pz, yRidge + hh + 0.35, yRidge + hh + 1.2, 0.22, 0.18, 8, { top: true });
      }
    }
  }
  // Only one footprint (the range itself) contains the point.
  const insideOnly = (x, z) => foot.filter((f) => (f.type === 'rect'
    ? x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 : Math.hypot(x - f.x, z - f.z) < f.r)).length <= 1;

  function dormers(x0, x1, z0, z1, axis, yEave, yRidge, sideSign) {
    const along = axis === 'x';
    const L0 = along ? x0 : z0, L1 = along ? x1 : z1;
    const W0 = along ? z0 : x0, W1 = along ? z1 : x1;
    const half = (W1 - W0) / 2;
    const n = Math.floor((L1 - L0) / 10);
    const slope = (yRidge - yEave) / half;
    for (let i = 0; i < n; i++) {
      const l = L0 + ((L1 - L0) * (i + 0.5)) / n;
      const inset = 2.6;
      const wEdge = sideSign > 0 ? W1 - inset : W0 + inset;
      const cx = along ? l : wEdge, cz = along ? wEdge : l;
      const probeX = along ? l : wEdge + sideSign * 4, probeZ = along ? wEdge + sideSign * 4 : l;
      if (inside(probeX, probeZ)) continue;
      const yb = yEave + slope * (inset - 0.8);
      const ww = 2.4, hh = 2.8, dd = 4.5;
      const bx = along ? l : wEdge - sideSign * dd / 2, bz = along ? wEdge - sideSign * dd / 2 : l;
      B.box('stone', bx, yb, bz, along ? ww : dd, hh, along ? dd : ww, 0, { faces: 'nsewt' });
      const rot = along ? (sideSign > 0 ? 0 : Math.PI) : (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2);
      B.archWindow(cx, yb + 0.35, cz, rot, 1.0, 1.9, { frame: 0.16 });
      const rx0 = along ? l - ww / 2 : bx - dd / 2, rx1 = along ? l + ww / 2 : bx + dd / 2;
      const rz0 = along ? bz - dd / 2 : l - ww / 2, rz1 = along ? bz + dd / 2 : l + ww / 2;
      B.gableRoof('slate', 'stone', rx0, rx1, rz0, rz1, yb + hh, yb + hh + 1.7, along ? 'z' : 'x', { overhang: 0.25 });
    }
  }

  function crowSteps(x0, x1, z0, z1, axis, yEave, yRidge, ends) {
    // Crow-stepped gables: a Scots signature.
    const along = axis === 'x';
    const W0 = along ? z0 : x0, W1 = along ? z1 : x1;
    const half = (W1 - W0) / 2;
    const steps = Math.max(3, Math.round(half / 1.6));
    for (const [lEnd, dir] of ends) {
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const y = yEave + (yRidge - yEave) * t0;
        for (const side of [-1, 1]) {
          const w = (W0 + W1) / 2 + side * half * (1 - t0 - 0.5 / steps);
          const cx = along ? lEnd + dir * 0.1 : w, cz = along ? w : lEnd + dir * 0.1;
          B.box('trim', cx, y, cz, along ? 0.9 : half / steps + 0.2, (yRidge - yEave) / steps + 0.5, along ? half / steps + 0.2 : 0.9, 0, { faces: 'nsewt' });
        }
      }
      const cx = along ? lEnd : (W0 + W1) / 2, cz = along ? (W0 + W1) / 2 : lEnd;
      B.box('trim', cx, yRidge, cz, 1.2, 1.4, 1.2, 0, { faces: 'nsewt' });
    }
  }

  function buildRange(r, idx) {
    setTint(idx);
    B.prov = r.prov;
    const yBase = PLATEAU - 1 - (r.foundation || 0);
    const yTop = PLATEAU + r.eave;
    const { x0, x1, z0, z1 } = r;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const lines = floorLines(yTop);
    B.box('stone', cx, yBase, cz, x1 - x0, yTop - yBase, z1 - z0, 0, { faces: 'nsew', bands: 6 });
    plinth(x0, x1, z0, z1, yBase);
    stringCourses(x0, x1, z0, z1, yTop, lines);
    // Windows on all four faces (hidden faces are skipped by the occlusion test).
    const eastOpening = r.id === 'rangeE';
    const skipPassage = (i, f, x, z) => eastOpening && f === 0 && Math.abs(z + 30) < 4;
    const fw = { skipFn: skipPassage, yBase };
    facadeWindows(x0, z1, x1, z1, 0, yTop, fw);                 // south face
    facadeWindows(x1, z0, x0, z0, Math.PI, yTop, fw);           // north face
    facadeWindows(x1, z1, x1, z0, Math.PI / 2, yTop, fw);       // east face
    facadeWindows(x0, z0, x0, z1, -Math.PI / 2, yTop, fw);      // west face
    // Parapet walk and roof behind it.
    const along = r.axis === 'x';
    const depth = along ? z1 - z0 : x1 - x0;
    const yRidge = yTop + (depth / 2) * 1.55;
    B.box('trim', cx, yTop - 0.4, cz, x1 - x0 + 0.5, 0.45, z1 - z0 + 0.5, 0, { faces: 'nsewt' });
    const par = { height: 1.0, thick: 0.55 };
    if (along) {
      B.battlement(x0, z0 - 0.1, x1, z0 - 0.1, yTop, par);
      B.battlement(x0, z1 + 0.1, x1, z1 + 0.1, yTop, par);
    } else {
      B.battlement(x0 - 0.1, z0, x0 - 0.1, z1, yTop, par);
      B.battlement(x1 + 0.1, z0, x1 + 0.1, z1, yTop, par);
    }
    B.prov = PROV.interpreted;
    B.gableRoof('slate', 'stone', x0 + 0.9, x1 - 0.9, z0 + 0.9, z1 - 0.9, yTop + 0.6, yRidge, r.axis, { overhang: 0 });
    const ends = along ? [[x0 + 0.9, -1], [x1 - 0.9, 1]] : [[z0 + 0.9, -1], [z1 - 0.9, 1]];
    crowSteps(x0 + 0.9, x1 - 0.9, z0 + 0.9, z1 - 0.9, r.axis, yTop + 0.6, yRidge, ends.filter(([l, d]) => {
      const px = along ? l + d * 3 : cx, pz = along ? cz : l + d * 3;
      return !inside(px, pz);
    }));
    if (detail > 0.5) {
      dormers(x0, x1, z0, z1, r.axis, yTop + 0.6, yRidge, 1);
      dormers(x0, x1, z0, z1, r.axis, yTop + 0.6, yRidge, -1);
    }
    chimneys(x0, x1, z0, z1, r.axis, yRidge);
    if (eastOpening) {
      // A pend through the east range, from the greenhouse path to the courtyard.
      B.prov = PROV.interpreted;
      B.archWindow(x1 + 0.02, CASTLE_FLOOR - 2, -30, Math.PI / 2, 4.2, 6.2, { openKey: 'void', frame: 0.45, depth: 0.35 });
      B.archWindow(x0 - 0.02, CASTLE_FLOOR, -30, -Math.PI / 2, 4.2, 5.4, { openKey: 'void', frame: 0.45, depth: 0.35 });
    }
  }

  // ── Round towers ────────────────────────────────────────────────────────
  function buildTower(t, idx) {
    setTint(idx + 2);
    B.prov = t.prov;
    const sides = t.sides || (t.r > 10 ? 40 : t.r > 6 ? 32 : 20);
    const smooth = !t.sides;
    const yBase = PLATEAU - 1 - (t.foundation || 0);
    const yTop = PLATEAU + t.h;
    const bat = t.foundation ? PLATEAU - 4 : PLATEAU + 5;
    B.cyl('stoneDark', t.x, t.z, yBase, bat, t.r * 1.09, t.r * 1.02, sides, { bands: 3, smooth });
    B.cyl('stone', t.x, t.z, bat, yTop, t.r * 1.02, t.r, sides, { bands: 8, smooth });
    const lines = floorLines(yTop);
    for (const y of lines.slice(1)) {
      if (y > yTop - 2) continue;
      B.cyl('trim', t.x, t.z, y - 0.2, y + 0.12, t.r + 0.16, t.r + 0.16, sides, { smooth });
    }
    // Windows, staggered floor by floor like a stair.
    const per = Math.max(3, Math.round((2 * Math.PI * t.r) / (t.r > 10 ? 7.5 : 6.5)));
    lines.forEach((y, f) => {
      if (y + 3.6 > yTop - 2) return;
      for (let k = 0; k < per; k++) {
        const a = (k / per) * Math.PI * 2 + (f % 2) * (Math.PI / per) + idx;
        const wx = t.x + Math.cos(a) * (t.r + 0.02), wz = t.z + Math.sin(a) * (t.r + 0.02);
        const px = t.x + Math.cos(a) * (t.r + 1.6), pz = t.z + Math.sin(a) * (t.r + 1.6);
        if (inside(px, pz)) continue;
        if (B.rand() < 0.18) continue;
        const rot = Math.atan2(Math.cos(a), Math.sin(a));
        const small = t.r < 7;
        B.archWindow(wx, y + 0.95, wz, rot, small ? 0.9 : 1.15, small ? 1.9 : 2.3, { frame: 0.2 });
      }
    });
    // Corbel table.
    const cr = t.r + 0.35;
    const nc = Math.round((2 * Math.PI * cr) / 1.15);
    for (let k = 0; k < nc; k++) {
      const a = (k / nc) * Math.PI * 2;
      const rot = Math.atan2(Math.cos(a), Math.sin(a));
      B.box('trim', t.x + Math.cos(a) * cr, yTop - 2.3, t.z + Math.sin(a) * cr, 0.5, 1.2, 0.75, rot, { faces: 'nsewtb' });
    }
    const pr = t.r + 0.8;
    const parapet = t.roof === 'platform' || t.h > 54 || t.id.startsWith('porch');
    if (parapet) {
      B.cyl('trim', t.x, t.z, yTop - 1.1, yTop + 1.1, pr, pr, sides, { smooth, bottom: true });
      B.cyl('trim', t.x, t.z, yTop + 1.1, yTop - 0.2, pr - 0.55, pr - 0.55, sides, { smooth });
      B.disc('trim', t.x, t.z, yTop + 1.1, pr, sides, 1);
      const nm = Math.round((2 * Math.PI * pr) / 1.9);
      for (let k = 0; k < nm; k++) {
        const a = (k / nm) * Math.PI * 2;
        const rot = Math.atan2(Math.cos(a), Math.sin(a));
        B.box('trim', t.x + Math.cos(a) * (pr - 0.28), yTop + 1.1, t.z + Math.sin(a) * (pr - 0.28), 1.05, 0.95, 0.55, rot);
      }
    } else {
      B.cyl('trim', t.x, t.z, yTop - 1.1, yTop, pr - 0.3, pr - 0.3, sides, { smooth, bottom: true });
    }
    // Roof.
    if (t.roof === 'cone') {
      B.prov = PROV.interpreted;
      const cr0 = parapet ? t.r - 0.4 : t.r + 0.9;
      const y0 = parapet ? yTop - 0.2 : yTop;
      B.cone('slate', t.x, t.z, y0, cr0, t.coneH, smooth ? Math.max(20, sides) : sides, { bell: parapet ? 0.05 : 0.14 });
      const apex = y0 + t.coneH;
      B.cyl('lead', t.x, t.z, apex - 1.2, apex + 3.8, 0.35, 0.05, 8);
      B.cyl('gold', t.x, t.z, apex + 1.4, apex + 1.9, 0.32, 0.32, 10, { top: true, bottom: true });
      B.box('gold', t.x, apex + 3.2, t.z, 1.6, 0.35, 0.06, idx * 0.7, { faces: 'nsewt' });
      markers[t.id] = new THREE.Vector3(t.x, apex + 4, t.z);
    } else {
      // Astronomy Tower: an open, battlemented platform with a stair turret.
      B.disc('paving', t.x, t.z, yTop + 0.05, pr - 0.5, sides, 1);
      const sa = -Math.PI * 0.25;
      const sr = 3.9;
      const sx = t.x + Math.cos(sa) * (t.r - sr), sz = t.z + Math.sin(sa) * (t.r - sr);
      const st = yTop + 15;
      B.cyl('stone', sx, sz, yTop - 6, st, sr, sr, 24, { bands: 3 });
      for (const y of [yTop + 5, yTop + 10]) B.cyl('trim', sx, sz, y, y + 0.3, sr + 0.15, sr + 0.15, 24);
      const nc2 = 20;
      for (let k = 0; k < nc2; k++) {
        const a = (k / nc2) * Math.PI * 2;
        B.box('trim', sx + Math.cos(a) * (sr + 0.3), st - 1.6, sz + Math.sin(a) * (sr + 0.3), 0.45, 1.0, 0.6, Math.atan2(Math.cos(a), Math.sin(a)), { faces: 'nsewtb' });
      }
      B.cyl('trim', sx, sz, st - 0.6, st + 0.4, sr + 0.6, sr + 0.6, 24, { bottom: true });
      B.prov = PROV.interpreted;
      B.cone('slate', sx, sz, st + 0.35, sr + 0.5, 16, 24, { bell: 0.12 });
      B.cyl('lead', sx, sz, st + 15.6, st + 21, 0.3, 0.04, 8);
      B.cyl('gold', sx, sz, st + 18, st + 18.5, 0.3, 0.3, 10, { top: true, bottom: true });
      for (let k = 0; k < 3; k++) {
        const a = sa + 1.6 + k * 1.3;
        B.archWindow(sx + Math.cos(a) * (sr + 0.02), yTop + 1.2 + k * 4.4, sz + Math.sin(a) * (sr + 0.02), Math.atan2(Math.cos(a), Math.sin(a)), 1.1, 2.4, { openKey: k === 0 ? 'void' : 'glass' });
      }
      // A corbelled gallery two-thirds of the way up.
      B.prov = t.prov;
      const gy = PLATEAU + t.h * 0.66;
      const gr = t.r + 1.3;
      const ng = Math.round((2 * Math.PI * gr) / 1.2);
      for (let k = 0; k < ng; k++) {
        const a = (k / ng) * Math.PI * 2;
        B.box('trim', t.x + Math.cos(a) * (t.r + 0.5), gy - 1.6, t.z + Math.sin(a) * (t.r + 0.5), 0.55, 1.5, 1.2, Math.atan2(Math.cos(a), Math.sin(a)), { faces: 'nsewtb' });
      }
      B.cyl('trim', t.x, t.z, gy - 0.2, gy + 1.2, gr, gr, 48, { bottom: true });
      B.disc('trim', t.x, t.z, gy + 1.2, gr, 48, 1);
      // Telescopes on their tripods.
      B.prov = PROV.book;
      for (let k = 0; k < 4; k++) {
        const a = 0.9 + k * 1.25;
        const tx = t.x + Math.cos(a) * (t.r * 0.55), tz = t.z + Math.sin(a) * (t.r * 0.55);
        for (let l = 0; l < 3; l++) {
          const la = (l / 3) * Math.PI * 2;
          B.box('wood', tx + Math.cos(la) * 0.35, yTop, tz + Math.sin(la) * 0.35, 0.06, 1.4, 0.06, la);
        }
        const dir = a + 1.1;
        for (let s = 0; s < 6; s++) {
          const f = s / 5;
          B.cyl('gold', tx + Math.cos(dir) * (f * 1.1 - 0.4), tz + Math.sin(dir) * (f * 1.1 - 0.4), yTop + 1.4 + f * 0.9, yTop + 1.52 + f * 0.9, 0.09 - f * 0.02, 0.09 - f * 0.02, 8);
        }
      }
      markers[t.id] = new THREE.Vector3(t.x, yTop + 36, t.z);
    }
    // Stair turrets on the great towers: corbelled out, Scots fashion.
    if (t.r >= 11 && t.roof === 'cone') {
      B.prov = PROV.interpreted;
      const a = Math.atan2(-t.z, -t.x) + (idx % 2 ? 0.9 : -0.9);
      const sr = 2.7;
      const sx = t.x + Math.cos(a) * (t.r + sr * 0.55), sz = t.z + Math.sin(a) * (t.r + sr * 0.55);
      if (!inside(sx + Math.cos(a) * 3, sz + Math.sin(a) * 3)) {
        const y0 = PLATEAU + 18;
        B.cone('trim', sx, sz, y0, sr, -3.5, 16, { bell: 0 });
        B.cyl('stone', sx, sz, y0, yTop + 5.5, sr, sr, 16, { bands: 4 });
        B.cyl('trim', sx, sz, yTop + 5.3, yTop + 5.9, sr + 0.3, sr + 0.3, 16, { bottom: true });
        B.cone('slate', sx, sz, yTop + 5.8, sr + 0.35, 8.5, 16, { bell: 0.12 });
        B.cyl('lead', sx, sz, yTop + 13.9, yTop + 16.5, 0.2, 0.03, 6);
        for (let y = y0 + 3; y < yTop + 3; y += 7) {
          B.archWindow(sx + Math.cos(a) * (sr + 0.02), y, sz + Math.sin(a) * (sr + 0.02), Math.atan2(Math.cos(a), Math.sin(a)), 0.6, 1.3, { frame: 0.12 });
        }
      }
    }
  }

  // ── The Great Hall (to the right of the Entrance Hall, PS7) ─────────────
  function buildGreatHall() {
    const g = GREAT_HALL;
    setTint(3);
    B.prov = g.prov;
    const yTop = PLATEAU + g.eave, yRidge = PLATEAU + g.ridge;
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2;
    B.box('stone', cx, PLATEAU - 1, cz, g.x1 - g.x0, yTop - PLATEAU + 1, g.z1 - g.z0, 0, { faces: 'nsew', bands: 5 });
    plinth(g.x0, g.x1, g.z0, g.z1, PLATEAU - 1);
    const bayW = (g.x1 - g.x0) / g.bays;
    for (let i = 0; i <= g.bays; i++) {
      const x = g.x0 + i * bayW;
      for (const side of [-1, 1]) {
        const z = side < 0 ? g.z0 : g.z1;
        if (inside(x, z + side * 3.2) && !(Math.abs(x - g.x0) < 0.1 || Math.abs(x - g.x1) < 0.1)) continue;
        B.box('stone', x, PLATEAU - 1, z + side * 1.25, 2.1, 17, 2.5, 0, { faces: 'nsewt', bands: 3 });
        B.box('trim', x, PLATEAU + 16, z + side * 1.25, 2.3, 0.4, 2.7, 0, { faces: 'nsewt' });
        B.box('stone', x, PLATEAU + 16.4, z + side * 0.9, 1.6, yTop - PLATEAU - 14.4, 1.8, 0, { faces: 'nsewt', bands: 2 });
        B.pyramid('trim', x, z + side * 0.9, yTop + 2, 0.95, 1.0, 5.5);
        B.cyl('gold', x, z + side * 0.9, yTop + 7.3, yTop + 7.7, 0.14, 0.14, 6, { top: true });
      }
    }
    for (let i = 0; i < g.bays; i++) {
      const x = g.x0 + (i + 0.5) * bayW;
      if (!inside(x, g.z0 - 1.4)) B.archWindow(x, PLATEAU + 6, g.z0 - 0.02, Math.PI, 4.4, 15.5, { mullion: true, frame: 0.42, depth: 0.3 });
      if (!inside(x, g.z1 + 1.4)) B.archWindow(x, PLATEAU + 6, g.z1 + 0.02, 0, 4.4, 15.5, { mullion: true, frame: 0.42, depth: 0.3 });
    }
    // The great west window.
    B.archWindow(g.x0 - 0.02, PLATEAU + 8, cz, -Math.PI / 2, 9, 17, { mullion: true, frame: 0.6, depth: 0.4 });
    B.box('trim', cx, yTop - 0.4, cz, g.x1 - g.x0 + 0.5, 0.45, g.z1 - g.z0 + 0.5, 0, { faces: 'nsewt' });
    B.battlement(g.x0, g.z0 - 0.1, g.x1, g.z0 - 0.1, yTop, { height: 0.8, mh: 0.7, merlon: 0.8, gap: 0.6 });
    B.battlement(g.x0, g.z1 + 0.1, g.x1, g.z1 + 0.1, yTop, { height: 0.8, mh: 0.7, merlon: 0.8, gap: 0.6 });
    B.gableRoof('slate', 'stone', g.x0 + 0.8, g.x1 - 0.8, g.z0 + 0.8, g.z1 - 0.8, yTop + 0.5, yRidge, 'x', { overhang: 0 });
    crowSteps(g.x0 + 0.8, g.x1 - 0.8, g.z0 + 0.8, g.z1 - 0.8, 'x', yTop + 0.5, yRidge, [[g.x0 + 0.8, -1]]);
    // Louvred lantern (flèche) over the hall's centre.
    B.prov = PROV.interpreted;
    const lx = cx + 6;
    B.cyl('lead', lx, cz, yRidge - 1.5, yRidge + 4.5, 2.2, 2.2, 8, { smooth: false, phase: Math.PI / 8 });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      B.archWindow(lx + Math.cos(a) * 2.05, yRidge + 0.6, cz + Math.sin(a) * 2.05, Math.atan2(Math.cos(a), Math.sin(a)), 0.9, 2.6, { openKey: 'void', surround: false });
    }
    B.cone('lead', lx, cz, yRidge + 4.5, 2.6, 9, 8, { bell: 0.05, phase: Math.PI / 8 });
    B.cyl('gold', lx, cz, yRidge + 13.2, yRidge + 15.5, 0.12, 0.02, 6);
    markers.hall = new THREE.Vector3(cx, yRidge + 6, cz);
  }

  // ── The Entrance: oak front doors behind a flight of stone steps ────────
  function buildEntrance() {
    const e = ENTRANCE;
    setTint(1);
    B.prov = e.prov;
    const yTop = PLATEAU + e.eave;
    const cx = (e.x0 + e.x1) / 2, cz = (e.z0 + e.z1) / 2;
    const lines = floorLines(yTop);
    B.box('stone', cx, PLATEAU - 1, cz, e.x1 - e.x0, yTop - PLATEAU + 1, e.z1 - e.z0, 0, { faces: 'nsew', bands: 6 });
    plinth(e.x0, e.x1, e.z0, e.z1, PLATEAU - 1);
    stringCourses(e.x0, e.x1, e.z0, e.z1, yTop, lines);
    // Portal projecting from the north front.
    B.box('trim', 0, PLATEAU - 1, e.z0 - 1.6, 13, 17, 3.2, 0, { faces: 'nsewt', bands: 3 });
    B.gableRoof('trim', 'trim', -6.5, 6.5, e.z0 - 3.2, e.z0, PLATEAU + 16, PLATEAU + 20.5, 'z', { overhang: 0.2 });
    for (let k = 0; k < 3; k++) {
      B.archWindow(0, CASTLE_FLOOR - 0.02, e.z0 - 3.2 - 0.02, Math.PI, 7.2 - k * 1.1, 12.2 - k * 1.3, {
        openKey: k === 2 ? 'wood' : 'void', frame: 0.5, depth: 0.25 + k * 0.05, surround: true, offset: 0.03 + k * 0.02,
      });
    }
    markers.doors = new THREE.Vector3(0, CASTLE_FLOOR + 6, e.z0 - 3.3);
    // Great window over the doors.
    B.archWindow(0, PLATEAU + 21.5, e.z0 - 0.02, Math.PI, 6.4, 11, { mullion: true, frame: 0.5, depth: 0.32 });
    facadeWindows(e.x0, e.z1, e.x1, e.z1, 0, yTop, { bay: 7 });
    facadeWindows(e.x1, e.z0, e.x0, e.z0, Math.PI, yTop, { bay: 11, first: 6, skipFn: (i) => i === 1 || i === 2 });
    B.box('trim', cx, yTop - 0.4, cz, e.x1 - e.x0 + 0.5, 0.45, e.z1 - e.z0 + 0.5, 0, { faces: 'nsewt' });
    B.battlement(e.x0, e.z0 - 0.1, e.x1, e.z0 - 0.1, yTop);
    B.battlement(e.x0, e.z1 + 0.1, e.x1, e.z1 + 0.1, yTop);
    B.battlement(e.x0 - 0.1, e.z0, e.x0 - 0.1, e.z1, yTop);
    B.battlement(e.x1 + 0.1, e.z0, e.x1 + 0.1, e.z1, yTop);
    B.box('lead', cx, yTop - 0.3, cz, e.x1 - e.x0 - 1, 0.4, e.z1 - e.z0 - 1, 0, { faces: 't' });
  }

  // ── The West Tower: the Owlery at its top (GF15), Flitwick's office on the
  //    seventh floor, thirteenth window from the right (PA21) ───────────────
  function buildWestTower() {
    const w = WEST_TOWER;
    setTint(4);
    B.prov = w.prov;
    const yTop = PLATEAU + w.eave;
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
    const lines = floorLines(yTop);
    B.box('stone', cx, PLATEAU - 1, cz, w.x1 - w.x0, yTop - PLATEAU + 1, w.z1 - w.z0, 0, { faces: 'nsew', bands: 8 });
    plinth(w.x0, w.x1, w.z0, w.z1, PLATEAU - 1);
    stringCourses(w.x0, w.x1, w.z0, w.z1, yTop, lines);
    // West face: windows counted from the right as seen from outside (south → north).
    const bay = 3.6;
    const n = Math.floor((w.z1 - w.z0) / bay);
    lines.forEach((y, f) => {
      for (let i = 0; i < n; i++) {
        const z = w.z1 - (i + 0.5) * ((w.z1 - w.z0) / n);
        const x = w.x0 - 0.02;
        if (inside(x - 1.4, z)) continue;
        const flitwick = f === 7 && i === 12;
        B.prov = flitwick ? PROV.book : w.prov;
        const ww = f === 0 ? 1.4 : 1.1, hh = f === 0 ? 3.1 : 2.4;
        if (flitwick) B.litValue = [1, 0.4];
        B.archWindow(x, y + 0.95, z, -Math.PI / 2, ww, hh, { lit: true, frame: flitwick ? 0.34 : 0.22 });
        if (flitwick) markers.flitwick = new THREE.Vector3(x - 0.3, y + 2.2, z);
      }
    });
    B.prov = w.prov;
    facadeWindows(w.x1, w.z0, w.x0, w.z0, Math.PI, yTop, { bay: 3.8 });
    facadeWindows(w.x0, w.z1, w.x1, w.z1, 0, yTop, { bay: 3.8 });
    facadeWindows(w.x1, w.z1, w.x1, w.z0, Math.PI / 2, yTop, { bay: 3.8 });
    // Corbel table and the Owlery storey: open arches for the birds.
    B.box('trim', cx, yTop - 0.6, cz, w.x1 - w.x0 + 1.4, 0.8, w.z1 - w.z0 + 1.4, 0, { faces: 'nsewtb' });
    const oy = yTop + 0.2, oh = w.owlery;
    B.box('stone', cx, oy, cz, w.x1 - w.x0 + 0.6, oh, w.z1 - w.z0 + 0.6, 0, { faces: 'nsew', bands: 2 });
    const openings = (x0, z0, x1, z1, rot) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const k = Math.floor(len / 3.4);
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k;
        B.archWindow(x0 + (x1 - x0) * t, oy + 1.1, z0 + (z1 - z0) * t, rot, 1.7, 5.2, { openKey: 'void', frame: 0.3 });
      }
    };
    const ox0 = w.x0 - 0.3, ox1 = w.x1 + 0.3, oz0 = w.z0 - 0.3, oz1 = w.z1 + 0.3;
    openings(ox0, oz1, ox1, oz1, 0);
    openings(ox1, oz0, ox0, oz0, Math.PI);
    openings(ox0 - 0.02, oz0, ox0 - 0.02, oz1, -Math.PI / 2);
    openings(ox1 + 0.02, oz1, ox1 + 0.02, oz0, Math.PI / 2);
    B.box('trim', cx, oy + oh, cz, w.x1 - w.x0 + 1.2, 0.5, w.z1 - w.z0 + 1.2, 0, { faces: 'nsewtb' });
    B.prov = PROV.interpreted;
    B.gableRoof('slate', 'stone', w.x0 - 0.3, w.x1 + 0.3, w.z0 - 0.3, w.z1 + 0.3, oy + oh + 0.4, oy + oh + 21, 'z', { overhang: 0.8, hip: true });
    B.cyl('lead', cx, w.z0 + 14, oy + oh + 19, oy + oh + 26, 0.3, 0.04, 8);
    B.cyl('lead', cx, w.z1 - 14, oy + oh + 19, oy + oh + 26, 0.3, 0.04, 8);
    markers.owlery = new THREE.Vector3(cx, oy + oh * 0.6, cz);
  }

  // ── Courtyards, forecourt and cloister ───────────────────────────────────
  function buildCourts() {
    B.prov = PROV.interpreted;
    B.tint = [1, 1, 1];
    for (const c of COURTS) {
      const key = c.kind === 'lawn' || c.kind === 'garden' ? 'turf' : 'paving';
      B.box(key, (c.x0 + c.x1) / 2, PLATEAU - 1, (c.z0 + c.z1) / 2, c.x1 - c.x0, CASTLE_FLOOR - PLATEAU + 0.98, c.z1 - c.z0, 0, { faces: 't' });
      if (c.kind === 'garden' || c.kind === 'lawn') {
        // Flagged walks crossing the lawn.
        B.box('paving', (c.x0 + c.x1) / 2, CASTLE_FLOOR - 0.01, (c.z0 + c.z1) / 2, c.x1 - c.x0, 0.05, 3, 0, { faces: 't' });
        B.box('paving', (c.x0 + c.x1) / 2, CASTLE_FLOOR - 0.01, (c.z0 + c.z1) / 2, 3, 0.05, c.z1 - c.z0, 0, { faces: 't' });
      }
    }
    // The forecourt terrace and its stone steps down to the drive.
    const f = FORECOURT;
    B.prov = PROV.author;
    B.box('paving', 0, PLATEAU - 1.5, (f.z0 + f.z1) / 2, f.x1 - f.x0, f.y - PLATEAU + 1.5, f.z1 - f.z0, 0, { faces: 'nsewt' });
    const stepW = 18;
    for (let s = 0; s < 6; s++) {
      const y = PLATEAU - 1 + ((6 - s) / 6) * (f.y - PLATEAU + 1);
      B.box('trim', 0, PLATEAU - 1.5, f.z0 - 0.45 - s * 0.45, stepW + s * 0.8, y - PLATEAU + 1.5, 0.45, 0, { faces: 'nsewt' });
    }
    // Balustrade walls with pedestals.
    const bal = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rot = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      B.box('trim', (x0 + x1) / 2, f.y, (z0 + z1) / 2, len, 1.05, 0.5, rot, { faces: 'nsewt' });
      B.box('trim', (x0 + x1) / 2, f.y + 1.05, (z0 + z1) / 2, len + 0.2, 0.18, 0.7, rot, { faces: 'nsewt' });
      const n = Math.floor(len / 9);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(n, 1);
        const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
        B.box('trim', px, f.y, pz, 0.9, 1.5, 0.9, rot, { faces: 'nsewt' });
        B.pyramid('trim', px, pz, f.y + 1.5, 0.5, 0.5, 0.9);
      }
    };
    bal(f.x0, f.z0, -stepW / 2 - 2.5, f.z0);
    bal(stepW / 2 + 2.5, f.z0, f.x1, f.z0);
    bal(f.x0, f.z0, f.x0, f.z1);
    bal(f.x1, f.z0, f.x1, f.z1);
  }

  function buildCloister() {
    // The arcaded courtyard (an atlas interpretation of "the courtyard").
    const c = COURTS.find((k) => k.kind === 'cloister');
    B.prov = PROV.interpreted;
    setTint(2);
    const inset = 4.2, y0 = CASTLE_FLOOR;
    const x0 = c.x0 + inset, x1 = c.x1 - inset, z0 = c.z0 + inset, z1 = c.z1 - inset;
    const sides = [
      [x0, z1, x1, z1, 0],
      [x1, z0, x0, z0, Math.PI],
      [x1, z1, x1, z0, Math.PI / 2],
      [x0, z0, x0, z1, -Math.PI / 2],
    ];
    const archH = 4.4, beamY = y0 + 5.2, pier = 0.85;
    for (const [ax, az, bx, bz] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const n = Math.floor(len / 4.2);
      const bayL = len / n;
      // Face toward the garth (inside the arcade rectangle).
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const ccx = (x0 + x1) / 2, ccz = (z0 + z1) / 2;
      const inX = ccx - mx, inZ = ccz - mz;
      const faceRot = Math.atan2(Math.abs(dx) > 0.5 ? 0 : Math.sign(inX), Math.abs(dx) > 0.5 ? Math.sign(inZ) : 0);
      const fx = Math.sin(faceRot), fz = Math.cos(faceRot);
      for (let i = 0; i <= n; i++) {
        const px = ax + dx * i * bayL, pz = az + dz * i * bayL;
        B.box('trim', px, y0, pz, pier, beamY - y0, pier, 0, { faces: 'nsewt' });
      }
      const rot = Math.atan2(dx, dz) - Math.PI / 2;
      B.box('stone', mx, beamY, mz, len + pier, 1.1, 0.8, rot, { faces: 'nsewtb' });
      B.box('trim', mx, beamY + 1.1, mz, len + pier + 0.2, 0.25, 1.0, rot, { faces: 'nsewtb' });
      // Arch rings and spandrels.
      for (let i = 0; i < n; i++) {
        const cxA = ax + dx * (i + 0.5) * bayL, czA = az + dz * (i + 0.5) * bayL;
        const w = bayL - pier;
        const o = archOutline(w, archH, 6);
        const tx = Math.cos(faceRot), tz = -Math.sin(faceRot);
        const P = (lx, ly, off) => new THREE.Vector3(cxA + tx * lx + fx * off, y0 + ly, czA + tz * lx + fz * off);
        const nrm = new THREE.Vector3(fx, 0, fz);
        for (const off of [0.4, -0.4]) {
          const sgn = off > 0 ? 1 : -1;
          const N = nrm.clone().multiplyScalar(sgn);
          for (let k = 2; k < o.length - 1; k++) {
            const a = o[k], b = o[k + 1];
            if (a[1] < archH * 0.5 && b[1] < archH * 0.5) continue;
            const pa = P(a[0], a[1], off), pb = P(b[0], b[1], off);
            const ta = P(a[0], beamY - y0, off), tb = P(b[0], beamY - y0, off);
            if (sgn > 0) B.quad('stone', pa, ta, tb, pb, N);
            else B.quad('stone', pb, tb, ta, pa, N);
          }
        }
      }
      // Lean-to roof from the range wall down to the arcade.
      const back = 4.2;
      const r0 = new THREE.Vector3(ax - fx * back - dx * 0.5, beamY + 3.1, az - fz * back - dz * 0.5);
      const r1 = new THREE.Vector3(bx - fx * back + dx * 0.5, beamY + 3.1, bz - fz * back + dz * 0.5);
      const r2 = new THREE.Vector3(bx + fx * 0.7 + dx * 0.5, beamY + 1.3, bz + fz * 0.7 + dz * 0.5);
      const r3 = new THREE.Vector3(ax + fx * 0.7 - dx * 0.5, beamY + 1.3, az + fz * 0.7 - dz * 0.5);
      const rn = new THREE.Vector3(fx * 1.8, back + 0.7, fz * 1.8).normalize();
      const cross = new THREE.Vector3().subVectors(r1, r0).cross(new THREE.Vector3().subVectors(r3, r0));
      if (cross.dot(rn) > 0) B.quad('slate', r0, r3, r2, r1, rn, [[0, 5], [0, 0], [len, 0], [len, 5]]);
      else B.quad('slate', r0, r1, r2, r3, rn, [[0, 5], [len, 5], [len, 0], [0, 0]]);
    }
    // A well-head in the garth.
    const gx = (x0 + x1) / 2, gz = (z0 + z1) / 2;
    B.cyl('trim', gx, gz, y0, y0 + 1.0, 1.6, 1.6, 20, { top: true });
    B.cyl('void', gx, gz, y0 + 1.0, y0 + 1.02, 1.2, 1.2, 20, { top: true });
    for (const s of [-1, 1]) B.box('wood', gx + s * 1.3, y0 + 1, gz, 0.2, 2.2, 0.2);
    B.box('wood', gx, y0 + 3.1, gz, 2.9, 0.2, 0.25);
  }

  // ── Lake-front pavilions: tall gabled bays over the cliff ──────────────
  function buildPavilion(p, idx) {
    setTint(idx + 1);
    B.prov = p.prov;
    const yBase = PLATEAU - 1 - (p.foundation || 0);
    const yTop = PLATEAU + p.eave;
    const { x0, x1, z0, z1 } = p;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const lines = floorLines(yTop);
    B.box('stone', cx, yBase, cz, x1 - x0, yTop - yBase, z1 - z0, 0, { faces: 'nsew', bands: 7 });
    B.box('stoneDark', cx, yBase, cz, x1 - x0 + 1.2, PLATEAU - yBase + 1, z1 - z0 + 1.2, 0, { faces: 'nsewt', bands: 3 });
    stringCourses(x0, x1, z0, z1, yTop, lines);
    const south = z1 > 0;
    const face = south ? z1 : z0;
    const rot = south ? 0 : Math.PI;
    const w = x1 - x0;
    // A tall traceried window over two storeys, then paired lights above.
    B.archWindow(cx, lines[2] + 0.8, face + (south ? 0.02 : -0.02), rot, Math.min(4.6, w * 0.34), 10.5, { mullion: true, frame: 0.45, depth: 0.3 });
    for (let f = 5; f < lines.length; f++) {
      if (lines[f] + 3.4 > yTop) continue;
      for (const k of [-1, 1]) B.archWindow(cx + k * w * 0.22, lines[f] + 0.9, face + (south ? 0.02 : -0.02), rot, 1.2, 2.5);
    }
    facadeWindows(x1, z1, x1, z0, Math.PI / 2, yTop, { bay: 5, piers: false, yBase });
    facadeWindows(x0, z0, x0, z1, -Math.PI / 2, yTop, { bay: 5, piers: false, yBase });
    // Steep gable facing out, crow-stepped, with a finial.
    B.box('trim', cx, yTop - 0.4, cz, w + 0.5, 0.45, z1 - z0 + 0.5, 0, { faces: 'nsewt' });
    const yRidge = yTop + (w / 2) * 1.8;
    B.gableRoof('slate', 'stone', x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, yTop, yRidge, 'z', { overhang: 0 });
    crowSteps(x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, 'z', yTop, yRidge, [[south ? z1 - 0.3 : z0 + 0.3, south ? 1 : -1]]);
    B.archWindow(cx, yTop + 2.2, face + (south ? 0.02 : -0.02), rot, 1.6, 4.2, { frame: 0.25 });
    // Corner buttresses running down into the rock.
    for (const bx of [x0, x1]) {
      B.box('stoneDark', bx, yBase, face + (south ? -0.4 : 0.4), 2.2, PLATEAU - yBase + 6, 2.2, 0, { faces: 'nsewt', bands: 3 });
      B.pyramid('trim', bx, face + (south ? -0.4 : 0.4), PLATEAU + 5, 1.1, 1.1, 1.6);
    }
  }

  // ── Bartizans: corbelled turrets with tall candle-snuffer caps ─────────
  function buildBartizan([x, z, start], idx) {
    B.prov = PROV.interpreted;
    setTint(idx);
    const r = 2.3 + (idx % 3) * 0.25;
    const y0 = PLATEAU + start;
    const y1 = y0 + 11 + (idx % 4) * 1.5;
    B.cone('trim', x, z, y0, r, -3.2, 14, { bell: 0 });
    for (let k = 0; k < 3; k++) B.cyl('trim', x, z, y0 - 1.1 - k * 0.7, y0 - 0.8 - k * 0.7, r * (0.9 - k * 0.22), r * (0.9 - k * 0.22), 14);
    B.cyl('stone', x, z, y0, y1, r, r, 14, { bands: 3 });
    B.cyl('trim', x, z, y1 - 0.2, y1 + 0.35, r + 0.25, r + 0.25, 14, { bottom: true });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + idx;
      B.archWindow(x + Math.cos(a) * (r + 0.02), y0 + 4 + (k % 2) * 2.5, z + Math.sin(a) * (r + 0.02), Math.atan2(Math.cos(a), Math.sin(a)), 0.55, 1.3, { frame: 0.1 });
    }
    const ch = 7.5 + (idx % 3) * 1.8;
    B.cone('slate', x, z, y1 + 0.3, r + 0.35, ch, 14, { bell: 0.16 });
    B.cyl('lead', x, z, y1 + ch - 0.4, y1 + ch + 2.6, 0.16, 0.03, 6);
  }

  RANGES.forEach(buildRange);
  PAVILIONS.forEach(buildPavilion);
  BARTIZANS.forEach(buildBartizan);
  buildGreatHall();
  buildEntrance();
  buildWestTower();
  TOWERS.forEach(buildTower);
  buildCourts();
  buildCloister();

  // ── Materials and meshes ─────────────────────────────────────────────────
  const materials = {
    stone: makeSurface({ color: '#8b867b', pattern: 'ashlar', course: 0.52, bump: 0.02 }),
    stoneDark: makeSurface({ color: '#6c6860', pattern: 'ashlar', course: 0.72, bump: 0.025, grime: 1.3 }),
    trim: makeSurface({ color: '#aaa495', pattern: 'dressed', bump: 0.014, grime: 0.6 }),
    paving: makeSurface({ color: '#8c877c', pattern: 'dressed', bump: 0.01, grime: 0.5 }),
    slate: makeSurface({ color: '#3b444e', pattern: 'slate', roughness: 0.7, bump: 0.05, grime: 0.45, envMapIntensity: 0.9 }),
    lead: makeSurface({ color: '#56625e', pattern: 'none', roughness: 0.5, metalness: 0.35, grime: 0.3 }),
    wood: makeSurface({ color: '#5b402c', pattern: 'planks', roughness: 0.82, bump: 0.02, grime: 0.4 }),
    gold: makeSurface({ color: '#c9a24e', pattern: 'none', roughness: 0.3, metalness: 1, grime: 0, weather: false }),
    void: makeSurface({ color: '#07080a', pattern: 'none', roughness: 1, grime: 0, weather: false, envMapIntensity: 0 }),
    turf: makeSurface({ color: '#4e6a2e', pattern: 'none', roughness: 0.95, grime: 0.2 }),
    glass: makeGlass(),
  };
  const group = new THREE.Group();
  group.name = 'castle';
  const stats = { triangles: 0 };
  for (const [key, geo] of B.build()) {
    const mesh = new THREE.Mesh(geo, materials[key] || materials.stone);
    mesh.castShadow = key !== 'glass' && key !== 'void';
    mesh.receiveShadow = true;
    mesh.name = `castle-${key}`;
    group.add(mesh);
    stats.triangles += geo.index.count / 3;
  }

  // ── Walking: colliders and floor heights ─────────────────────────────────
  const solids = foot.filter((f) => !(f.type === 'rect' && f.x0 === 101 && f.x1 === 123));
  // The east range, split around the pend at z = −30.
  solids.push({ type: 'rect', x0: 101, x1: 123, z0: -50, z1: -32.2 }, { type: 'rect', x0: 101, x1: 123, z0: -27.8, z1: 50 });
  const collides = (x, z) => solids.some((f) => (f.type === 'rect'
    ? x > f.x0 - 0.45 && x < f.x1 + 0.45 && z > f.z0 - 0.45 && z < f.z1 + 0.45
    : Math.hypot(x - f.x, z - f.z) < f.r + 0.6));
  const floorAt = (x, z) => {
    for (const c of COURTS) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return CASTLE_FLOOR;
    const f = FORECOURT;
    if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return f.y;
    if (x > f.x0 && x < f.x1 && z > f.z0 - 3 && z <= f.z0) {
      if (Math.abs(x) < 9.5) return PLATEAU + ((z - (f.z0 - 3)) / 3) * (f.y - PLATEAU);
    }
    if (x >= 101 && x <= 123 && Math.abs(z + 30) < 2.2) return PLATEAU + ((123 - x) / 22) * (CASTLE_FLOOR - PLATEAU);
    return null;
  };

  return { group, materials, markers, collides, floorAt, stats, footprints: foot };
}

function pick(o) { return { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 }; }
