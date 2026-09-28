// Off the main thread: the ground field used by the grass (height, how much
// grass grows, and whether it's mown lawn). Returns half-float RGBA data.

import { heightAt, forestDensity, boxDist, PATHS, PITCH, lakeSDF, polylineDist, isBuiltUp, SITES } from '../world/layout.js';

const toHalf = (() => {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  return (v) => {
    f[0] = v;
    const x = u[0];
    let bits = (x >> 16) & 0x8000;
    let m = (x >> 12) & 0x07ff;
    const e = (x >> 23) & 0xff;
    if (e < 103) return bits;
    if (e > 142) return bits | 0x7c00;
    if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
  };
})();

self.onmessage = (ev) => {
  const { x0, z0, size, res } = ev.data;
  const data = new Uint16Array(res * res * 4);
  const cell = size / res;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
      const h = heightAt(x, z);
      let d = 1;
      if (h < 1.6 || lakeSDF(x, z) < 2) d = 0;
      else {
        d *= 1 - forestDensity(x, z) * 0.85;
        if (boxDist(x, z, -18, -10, 170, 90) === 0) d = 0; // the castle and its courts
        for (const p of PATHS) {
          const pd = polylineDist(x, z, p.pts);
          if (pd < p.width * 0.5 + 0.8) { d = 0; break; }
          if (pd < p.width * 0.5 + 3) d *= 0.5;
        }
        const hx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z), hz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5);
        const slope = Math.hypot(hx, hz) / 3;
        d *= Math.max(0, 1 - Math.max(0, slope - 0.5) * 3);
        if (d > 0 && isBuiltUp(x, z, -22) && Math.hypot((x - PITCH.x) / 40, (z - PITCH.z) / 90) > 1) d *= 0.6;
        if (Math.hypot(x - SITES.pumpkins.x, z - SITES.pumpkins.z) < 16) d *= 0.3;
      }
      const cb = boxDist(x, z, -18, -10, 186, 94);
      const lawn = Math.max(1 - Math.min(1, Math.max(0, (cb - 40) / 130)), Math.hypot((x - PITCH.x) / 60, (z - PITCH.z) / 110) < 1 ? 1 : 0);
      const k = (j * res + i) * 4;
      data[k] = toHalf(h);
      data[k + 1] = toHalf(d);
      data[k + 2] = toHalf(lawn);
      data[k + 3] = toHalf(1);
    }
  }
  self.postMessage({ data }, [data.buffer]);
};
