// Place names floating over the 3D view. Labels are laid out every frame in
// priority order and skipped when they would collide, so the view never turns
// into a pile of tags.

import * as THREE from 'three';
import { PROV_COLORS } from '../engine/shared.js';
import { TIER_INDEX } from '../data/places.js';

const v = new THREE.Vector3();

export class Labels {
  constructor(root, places, resolveAnchor, onSelect, occluded = null) {
    this.occluded = occluded;
    this.root = root;
    this.items = places.map((p, i) => {
      const el = document.createElement('button');
      el.className = `label${p.major ? ' major' : ''} hide`;
      el.type = 'button';
      el.textContent = p.name;
      el.setAttribute('aria-label', `Open ${p.name} in the field guide`);
      const tier = p.evidence.reduce((best, e) => Math.min(best, TIER_INDEX[e.tier]), 9);
      el.style.setProperty('--dot', PROV_COLORS[Math.min(tier, 3)]);
      const stem = document.createElement('i');
      stem.className = 'stem';
      el.appendChild(stem);
      el.addEventListener('click', () => onSelect(p.id));
      root.appendChild(el);
      return { place: p, el, pos: resolveAnchor(p), shown: false, x: -1e4, y: -1e4, w: 0, h: 0, order: i, occ: false };
    });
    this.enabled = true;
    this.frame = 0;
  }

  update(camera, width, height, selectedId) {
    if (!this.enabled) return;
    this.frame++;
    // Measure once in a while; label sizes don't change.
    if (this.frame % 90 === 1) for (const it of this.items) { const w = it.el.offsetWidth; if (w) { it.w = w; it.h = it.el.offsetHeight; } }
    const camPos = camera.position;
    const cand = [];
    for (const it of this.items) {
      v.copy(it.pos).project(camera);
      const dist = camPos.distanceTo(it.pos);
      const onScreen = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.2;
      const range = it.place.major ? 2600 : it.place.cat === 'wilds' ? 1400 : 360;
      if (!onScreen || dist > range || dist < 6) { this.hide(it); continue; }
      // Hidden behind a hill or the castle? Re-tested a few labels per frame.
      if (this.occluded && (this.frame + it.order) % 8 === 0) it.occ = this.occluded(camPos, it.pos);
      if (it.occ && it.place.id !== selectedId) { this.hide(it); continue; }
      const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height - 14;
      const pri = (it.place.id === selectedId ? -1e6 : 0) + (it.place.major ? 0 : 3000) + dist;
      cand.push({ it, x, y, pri });
    }
    cand.sort((a, b) => a.pri - b.pri);
    const placed = [];
    for (const c of cand) {
      const w = c.it.w || 120, h = c.it.h || 26;
      const box = { x0: c.x - w / 2 - 4, x1: c.x + w / 2 + 4, y0: c.y - h - 4, y1: c.y + 4 };
      const hit = placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
      if (hit || placed.length > 9) { this.hide(c.it); continue; }
      placed.push(box);
      this.show(c.it, c.x, c.y);
    }
  }

  show(it, x, y) {
    if (Math.abs(it.x - x) > 0.3 || Math.abs(it.y - y) > 0.3) {
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      it.x = x; it.y = y;
    }
    if (!it.shown) { it.el.classList.remove('hide'); it.shown = true; }
  }

  hide(it) {
    if (it.shown) { it.el.classList.add('hide'); it.shown = false; }
  }

  setEnabled(on) {
    this.enabled = on;
    document.body.classList.toggle('no-labels', !on);
  }
}
