// The atlas geography. Everything that has a position lives here so the 3D
// world, the parchment map, colliders and labels always agree.
//
// Scale: 1 unit = 1 metre. +x is east, −z is north, +y is up.
// Positions come from J.K. Rowling's annotated sketch of the grounds (British
// Library, "Harry Potter: A History of Magic"), measured at ~0.85 m per sketch
// unit with the castle centre as origin. Canonical dimensions (e.g. the
// Quidditch pitch, 500 × 180 ft) override sketch proportions where they exist.

import { fbm, ridged, noise2, smoothstep, clamp, lerp } from '../engine/noise.js';

export const LAKE_LEVEL = 0;
export const PLATEAU = 46;        // the castle's cliff-top, metres above the loch
export const CASTLE_FLOOR = 48;   // ground floor, two metres above the forecourt
export const FLOOR_Y = [48, 53, 57, 61, 65, 69, 73, 77]; // ground … seventh floor
export const PITCH_LEVEL = 35;

export const LAKE = { cx: 0, cz: 703, rx: 1000, rz: 625 };

// Canonical Quidditch pitch: an oval 500 ft long and 180 ft wide, hoops 50 ft high.
export const PITCH = {
  x: -130, z: -258,
  rx: 27.43, rz: 76.2,      // field half-widths (east–west, north–south)
  hoopHeight: 15.24,
};

export const SITES = {
  castle: { x: 0, z: 0 },
  steps: { x: 0, z: -95 },
  gates: { x: 0, z: -398 },
  hagrid: { x: 112, z: -268 },
  pumpkins: { x: 80, z: -292 },
  willow: { x: 161, z: -170 },
  garden: { x: 186, z: -36 },
  greenhouses: { x: 252, z: 48 },
  changingW: { x: -212, z: -262 },
  changingE: { x: -58, z: -262 },
  beech: { x: -238, z: 78 },
  tomb: { x: 318, z: 104 },
  harbour: { x: 26, z: 97 },
  clearing: { x: 350, z: -430 },
  paddock: { x: 262, z: -345 },
  station: { x: 150, z: 1405 },
  hogsmeade: { x: -60, z: -1180 },
  shack: { x: 230, z: -1060 },
  flyingLawn: { x: -150, z: -120 },
};

// ─── Castle plan ──────────────────────────────────────────────────────────
// Rowling's sketch shows a long east–west block with round corner towers, a
// row of three round towers down the middle, a narrower wing at the west end,
// a tower on the east side and a forecourt with steps on the north front.
// Ranges, courtyards and heights are the atlas's architectural reading.

export const PROV = {
  book: 0,        // stated in the novels
  author: 1,      // Rowling's own sketch or her Wizarding World writing
  inferred: 2,    // deduced from several passages (e.g. by the Harry Potter Lexicon)
  interpreted: 3, // the atlas fills a gap: form, style, exact placement
  film: 4,        // only in the film adaptations
};

export const RANGES = [
  { id: 'rangeNW', x0: -123, x1: -100, z0: -72, z1: -50, eave: 32, axis: 'x', prov: PROV.author },
  { id: 'rangeNE', x0: 22, x1: 72, z0: -72, z1: -50, eave: 34, axis: 'x', prov: PROV.author },
  { id: 'rangeNE2', x0: 72, x1: 123, z0: -72, z1: -50, eave: 29, axis: 'x', prov: PROV.author },
  { id: 'rangeSW', x0: -123, x1: -42, z0: 50, z1: 72, eave: 31, axis: 'x', prov: PROV.author, foundation: 16 },
  { id: 'rangeSC', x0: -42, x1: 40, z0: 48, z1: 72, eave: 39, axis: 'x', prov: PROV.author, foundation: 16 },
  { id: 'rangeSE', x0: 40, x1: 123, z0: 50, z1: 72, eave: 33, axis: 'x', prov: PROV.author, foundation: 16 },
  { id: 'rangeW', x0: -123, x1: -101, z0: -50, z1: 50, eave: 30, axis: 'z', prov: PROV.author },
  { id: 'rangeE', x0: 101, x1: 123, z0: -50, z1: 50, eave: 33, axis: 'z', prov: PROV.author },
  { id: 'spine', x0: -101, x1: 101, z0: -9, z1: 9, eave: 26, axis: 'x', prov: PROV.interpreted },
];

// Projecting bays that break the long lake front (atlas interpretation).
export const PAVILIONS = [
  { id: 'bayW', x0: -86, x1: -70, z0: 66, z1: 78, eave: 38, prov: PROV.interpreted, foundation: 40 },
  { id: 'bayC', x0: -12, x1: 10, z0: 66, z1: 80, eave: 47, prov: PROV.interpreted, foundation: 42 },
  { id: 'bayE', x0: 66, x1: 82, z0: 66, z1: 78, eave: 40, prov: PROV.interpreted, foundation: 40 },
  { id: 'bayN', x0: 84, x1: 100, z0: -80, z1: -66, eave: 36, prov: PROV.interpreted },
];

// Corbelled turrets on the rooflines: [x, z, height above the plateau where
// the corbelling starts]. A Scots-baronial signature (atlas interpretation).
export const BARTIZANS = [
  [-42, 73.6, 33], [40, 73.6, 34], [-124, 49, 26], [124, 49, 28], [-102, -10, 21], [102, -10, 22],
  [-102, 10, 21], [102, 10, 22], [72, -73.6, 28], [22.5, -73.6, 36], [-43, 46.5, 34], [124, -51, 26],
  [-101, -76, 22], [-22.5, 73.6, 39], [100.5, -80.5, 32],
];

export const GREAT_HALL = { x0: -100, x1: -22, z0: -75, z1: -47, eave: 28, ridge: 51, bays: 8, prov: PROV.book };
export const ENTRANCE = { x0: -22, x1: 22, z0: -77, z1: -48, eave: 42, prov: PROV.book };
export const WEST_TOWER = { x0: -161, x1: -123, z0: -42, z1: 38, eave: 58, owlery: 9, prov: PROV.book };
export const FORECOURT = { x0: -76, x1: 76, z0: -95, z1: -77, y: CASTLE_FLOOR };

export const TOWERS = [
  { id: 'north', name: 'North Tower', x: -117, z: -66, r: 11.5, h: 76, roof: 'cone', coneH: 36, prov: PROV.inferred },
  { id: 'gryffindor', name: 'Gryffindor Tower', x: 117, z: -66, r: 12.5, h: 84, roof: 'cone', coneH: 38, prov: PROV.inferred },
  { id: 'ravenclaw', name: 'Ravenclaw Tower', x: -117, z: 66, r: 12, h: 80, roof: 'cone', coneH: 34, prov: PROV.author, foundation: 40 },
  { id: 'southeast', name: 'South-east Tower', x: 117, z: 66, r: 11.5, h: 68, roof: 'cone', coneH: 31, prov: PROV.author, foundation: 40 },
  { id: 'centralWest', name: 'West Central Tower', x: -77, z: 0, r: 8.5, h: 70, roof: 'cone', coneH: 30, prov: PROV.author },
  { id: 'astronomy', name: 'Astronomy Tower', x: 0, z: 0, r: 14, h: 112, roof: 'platform', prov: PROV.inferred },
  { id: 'headmaster', name: 'Headmaster’s Tower', x: 77, z: 0, r: 8.5, h: 76, roof: 'cone', coneH: 31, prov: PROV.interpreted },
  { id: 'east', name: 'East Tower', x: 153, z: 25, r: 9, h: 60, roof: 'cone', coneH: 27, prov: PROV.author },
  { id: 'westTurretN', name: 'West Tower turret', x: -155, z: -40, r: 5.5, h: 82, roof: 'cone', coneH: 19, prov: PROV.author },
  { id: 'westTurretS', name: 'West Tower turret', x: -155, z: 36, r: 5.5, h: 82, roof: 'cone', coneH: 19, prov: PROV.author },
  { id: 'porchW', name: 'Entrance turret', x: -25, z: -79, r: 4.6, h: 56, roof: 'cone', coneH: 15, prov: PROV.interpreted, sides: 8 },
  { id: 'porchE', name: 'Entrance turret', x: 25, z: -79, r: 4.6, h: 56, roof: 'cone', coneH: 15, prov: PROV.interpreted, sides: 8 },
];

export const COURTS = [
  { id: 'courtNW', x0: -101, x1: -2, z0: -47, z1: -9, kind: 'paved' },
  { id: 'courtNE', x0: 2, x1: 101, z0: -48, z1: -9, kind: 'cloister' },
  { id: 'courtSW', x0: -101, x1: -2, z0: 9, z1: 50, kind: 'lawn' },
  { id: 'courtSE', x0: 2, x1: 101, z0: 9, z1: 50, kind: 'garden' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function boxDist(x, z, cx, cz, hx, hz) {
  const dx = Math.max(Math.abs(x - cx) - hx, 0);
  const dz = Math.max(Math.abs(z - cz) - hz, 0);
  return Math.hypot(dx, dz);
}

/** Signed distance to the loch shore in metres (negative on the water). */
export function lakeSDF(x, z) {
  const px = x - LAKE.cx, pz = z - LAKE.cz;
  const k = Math.hypot(px / LAKE.rx, pz / LAKE.rz);
  const len = Math.hypot(px, pz);
  let d = k > 1e-6 ? len * (1 - 1 / k) : -Math.min(LAKE.rx, LAKE.rz);
  // Irregular shoreline, kept tight under the castle cliff.
  const damp = smoothstep(150, 460, Math.hypot(x, z - 90));
  d += damp * (48 * fbm(x / 310 + 2.3, z / 310 - 7.1, 3) + 14 * noise2(x / 70, z / 70));
  // Under the castle the shore may only gain land, so the cliff never undercuts it.
  d += (1 - damp) * (7 * Math.abs(fbm(x / 60 + 1.7, 3.1, 3)) + 3 * Math.abs(noise2(x / 17, 9.3)));
  return d;
}

/** How strongly a point belongs to the castle cliff (0–1). */
export function cliffZone(x, z) {
  return (1 - smoothstep(140, 250, Math.abs(x) + 30 * fbm(x / 90, z / 90 + 2, 2))) * smoothstep(20, 66, z) * (1 - smoothstep(170, 260, z));
}

function groundBase(x, z) {
  let h = 36 + 7 * fbm(x / 520 + 3.1, z / 520 - 1.7, 4) + 2.2 * fbm(x / 140, z / 140, 3);
  // Forest hills rise to the east and north-east.
  const east = smoothstep(180, 1150, x * 0.85 - z * 0.35);
  h += east * (40 + 34 * fbm(x / 380 + 9, z / 380, 4));
  // Moorland rises north of the Hogsmeade road.
  h += smoothstep(-440, -1050, z) * (32 + 22 * fbm(x / 300, z / 300 + 5, 3));
  // Low hills to the west.
  h += smoothstep(-360, -1150, x) * (28 + 20 * fbm(x / 260 - 4, z / 260, 3));
  // The glen's mountains.
  const r = Math.hypot(x * 0.9, (z - 350) * 0.8);
  const m = smoothstep(1250, 2700, r);
  if (m > 0) {
    const wx = x + 260 * fbm(x / 900, z / 900 + 4, 2);
    const wz = z + 260 * fbm(x / 900 + 7, z / 900, 2);
    const dome = 0.5 + 0.5 * fbm(wx / 2300 - 5, wz / 2300 + 2, 4);
    const crest = ridged(wx / 1700 + 11, wz / 1700 - 3, 5);
    h += m * (150 + 820 * Math.pow(dome * 0.62 + crest * 0.38, 1.35));
  }
  return h;
}

/** Terrain height at a world position. */
export function heightAt(x, z) {
  let h = groundBase(x, z);

  // The Quidditch pitch is levelled.
  const pe = Math.hypot((x - PITCH.x) / 105, (z - PITCH.z) / 150);
  h = lerp(PITCH_LEVEL, h, smoothstep(0.62, 1.25, pe));

  // The castle's cliff-top plateau.
  const cd = boxDist(x, z, -18, -10, 186, 94);
  h = lerp(h, PLATEAU, 1 - smoothstep(0, 72, cd));

  // The loch and its banks.
  const ld = lakeSDF(x, z);
  const cz = cliffZone(x, z);
  if (ld > 0) {
    const bank = lerp(95 + 50 * fbm(x / 400, z / 400 + 3, 2), 7.5, cz);
    const t = smoothstep(0, bank, ld);
    const shaped = cz > 0.02 ? Math.pow(t, lerp(1, 0.32, cz)) : t;
    const top = h;
    h = lerp(0.6, h, shaped);
    // Crags on the cliff face, never rising above the cliff-top.
    if (cz > 0.05 && shaped < 0.999) {
      const crag = ridged(x / 14 + 3, z / 14 + h / 18, 3);
      h += cz * (1 - shaped) * shaped * 4 * (crag * 13 - 5);
      h = Math.min(h, top - 0.3 * (1 - shaped));
    }
  } else {
    const slope = lerp(0.11, 1.4, cz);
    h = Math.max(-46, 0.6 + ld * slope);
  }
  return h;
}

/** Approximate slope (0 = flat, 1 = 45°) using central differences. */
export function slopeAt(x, z, e = 1.5) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

// ─── Forest ───────────────────────────────────────────────────────────────
// Rowling: the forest is massive and stretches out of sight; Hagrid's cabin
// and pumpkin patch sit at its edge; the Whomping Willow stands apart.
export const FOREST_EDGE = [
  [-60, -1100], [5, -540], [40, -430], [92, -342], [132, -308], [196, -262],
  [246, -210], [296, -126], [356, -44], [428, 58], [520, 150], [700, 262], [1150, 430],
];

export function forestSignedDist(x, z) {
  let best = Infinity, sign = 1;
  for (let i = 0; i < FOREST_EDGE.length - 1; i++) {
    const [ax, az] = FOREST_EDGE[i];
    const [bx, bz] = FOREST_EDGE[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      sign = dx * (z - az) - dz * (x - ax) < 0 ? 1 : -1;
    }
  }
  return best * sign; // positive inside the forest
}

/** Tree density 0–1 for placement and terrain shading. */
export function forestDensity(x, z) {
  const inside = forestSignedDist(x, z) + 34 * fbm(x / 160 + 5, z / 160, 3);
  let d = smoothstep(-12, 40, inside);
  // Clearings used by the field guide.
  d *= smoothstep(20, 44, Math.hypot(x - SITES.clearing.x, z - SITES.clearing.z));
  d *= smoothstep(26, 48, Math.hypot(x - SITES.paddock.x, z - SITES.paddock.z));
  // Copses scattered on the northern moor and western hills.
  const copse = smoothstep(0.42, 0.62, fbm(x / 210 - 3, z / 210 + 8, 3));
  const wild = Math.max(smoothstep(-460, -620, z), smoothstep(-420, -700, x));
  d = Math.max(d, copse * wild * 0.85);
  return d;
}

// ─── Paths ────────────────────────────────────────────────────────────────
export const PATHS = [
  // Rowling's sketch: a straight drive lined with trees, north to Hogsmeade.
  { id: 'drive', kind: 'gravel', width: 10, pts: [[0, -95], [0, -404]], prov: PROV.author },
  { id: 'road', kind: 'road', width: 8, pts: [[-1700, -470], [-1150, -440], [-900, -424], [-420, -405], [0, -404], [420, -420], [900, -474], [1500, -540], [1900, -600]], prov: PROV.author },
  { id: 'hogsmeadeRoad', kind: 'road', width: 7, pts: [[0, -404], [-20, -600], [-40, -820], [-60, -1050]], prov: PROV.author },
  // Sketch note: carriages go right round the lake to the front entrance.
  { id: 'lakeRoad', kind: 'road', width: 7, pts: [[-900, -424], [-1120, -160], [-1235, 200], [-1215, 560], [-1085, 980], [-760, 1325], [-300, 1475], [150, 1470], [520, 1500]], prov: PROV.author },
  { id: 'hagridPath', kind: 'dirt', width: 3.2, pts: [[44, -95], [66, -150], [86, -210], [104, -256]], prov: PROV.interpreted },
  { id: 'pitchPath', kind: 'dirt', width: 3.2, pts: [[-44, -95], [-66, -150], [-84, -196], [-92, -214]], prov: PROV.interpreted },
  { id: 'greenhousePath', kind: 'dirt', width: 3, pts: [[124, -30], [168, -26], [214, 12], [240, 38]], prov: PROV.interpreted },
  { id: 'lakesidePath', kind: 'dirt', width: 2.6, pts: [[-76, -92], [-150, -86], [-190, -24], [-222, 46], [-236, 72]], prov: PROV.interpreted },
  { id: 'tombPath', kind: 'dirt', width: 2.4, pts: [[252, 60], [288, 86], [312, 100]], prov: PROV.interpreted },
  { id: 'willowTrack', kind: 'dirt', width: 1.6, pts: [[70, -150], [120, -160], [150, -168]], prov: PROV.interpreted },
];

export const PLOTS = [
  { id: 'garden', kind: 'soil', x: SITES.garden.x, z: SITES.garden.z, w: 38, d: 26, rot: 0, prov: PROV.author },
  { id: 'pumpkins', kind: 'soil', x: SITES.pumpkins.x, z: SITES.pumpkins.z, w: 28, d: 18, rot: 0.2, prov: PROV.author },
];

/** Distance from a point to a polyline. */
export function polylineDist(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** True where a tree or rock would sit on something man-made. */
export function isBuiltUp(x, z, margin = 0) {
  if (boxDist(x, z, -18, -10, 186 + margin, 102 + margin) === 0) return true;
  if (Math.hypot((x - PITCH.x) / (60 + margin), (z - PITCH.z) / (112 + margin)) < 1) return true;
  for (const p of PATHS) if (polylineDist(x, z, p.pts) < p.width * 0.5 + 3 + margin) return true;
  for (const s of [SITES.hagrid, SITES.pumpkins, SITES.garden, SITES.greenhouses, SITES.changingW, SITES.changingE, SITES.tomb, SITES.gates, SITES.willow, SITES.station, SITES.shack]) {
    if (Math.hypot(x - s.x, z - s.z) < 30 + margin) return true;
  }
  // Hogsmeade's high street.
  return boxDist(x, z, SITES.hogsmeade.x, SITES.hogsmeade.z, 42 + margin, 122 + margin) === 0;
}
