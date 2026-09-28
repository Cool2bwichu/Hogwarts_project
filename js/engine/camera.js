// Camera rig: Explore (orbit), Walk (eye level), Fly (free flight) and smooth
// flights between viewpoints. The camera never passes through the ground.

import * as THREE from 'three';
import { heightAt } from '../world/layout.js';
import { clamp, lerp } from './noise.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

export class CameraRig {
  constructor(camera, dom, { groundAt, colliders } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.groundAt = groundAt || ((x, z) => heightAt(x, z));
    this.colliders = colliders || (() => false);
    this.mode = 'explore';
    // Orbit state.
    this.target = new THREE.Vector3(0, 60, -20);
    this.yaw = 0.6;          // around y, 0 = looking north
    this.pitch = 0.42;        // down from horizontal
    this.distance = 520;
    this.goal = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, distance: this.distance };
    // First-person state.
    this.pos = new THREE.Vector3();
    this.look = { yaw: 0, pitch: 0 };
    this.lookGoal = { yaw: 0, pitch: 0 };
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.moveInput = new THREE.Vector2();
    this.vertical = 0;
    this.speedScale = 1;
    this.eye = 1.7;
    this.flight = null;
    this.autoRotate = false;
    this.idleTime = 0;
    this.onChange = null;
    this.limits = { minDist: 12, maxDist: 2600, minPitch: -0.15, maxPitch: 1.52 };
    this.bind();
  }

  bind() {
    const el = this.dom;
    this.pointers = new Map();
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
      this.flight = null;
      this.idleTime = 0;
      this.pinchStart = null;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.idleTime = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this.pinchStart) {
          const f = this.pinchStart.d / Math.max(d, 1);
          if (this.mode === 'explore') this.goal.distance = clamp(this.goal.distance * Math.pow(f, 1.0), this.limits.minDist, this.limits.maxDist);
          this.pan((mx - this.pinchStart.mx) * 0.5, (my - this.pinchStart.my) * 0.5);
        }
        this.pinchStart = { d, mx, my };
        return;
      }
      const h = this.dom.clientHeight || 800;
      if (this.mode === 'explore') {
        if (p.button === 2 || p.button === 1 || p.shift) this.pan(dx, dy);
        else {
          this.goal.yaw -= (dx / h) * 3.2;
          this.goal.pitch = clamp(this.goal.pitch + (dy / h) * 2.4, this.limits.minPitch, this.limits.maxPitch);
        }
      } else {
        this.lookGoal.yaw -= (dx / h) * 2.4;
        this.lookGoal.pitch = clamp(this.lookGoal.pitch - (dy / h) * 2.0, -1.35, 1.35);
      }
    });
    const up = (e) => { this.pointers.delete(e.pointerId); this.pinchStart = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.flight = null;
      this.idleTime = 0;
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (this.mode === 'explore') {
        const f = Math.exp(dy * 0.0012);
        const before = this.goal.distance;
        this.goal.distance = clamp(this.goal.distance * f, this.limits.minDist, this.limits.maxDist);
        // Zoom toward the cursor.
        if (f < 1 && this.cursorPoint) {
          const k = 1 - this.goal.distance / before;
          this.goal.target.lerp(this.cursorPoint, k * 0.9);
        }
      } else if (this.mode === 'fly') {
        this.speedScale = clamp(this.speedScale * Math.exp(-dy * 0.001), 0.2, 6);
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
      this.idleTime = 0;
      if (this.mode !== 'explore' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  pan(dx, dy) {
    const h = this.dom.clientHeight || 800;
    const s = (this.goal.distance * Math.tan((this.camera.fov * Math.PI) / 360) * 2) / h;
    const cy = Math.cos(this.goal.yaw), sy = Math.sin(this.goal.yaw);
    const k = Math.max(Math.sin(this.goal.pitch) + 0.35, 0.35);
    // Grab-and-drag: right = (cos, 0, −sin), forward = (−sin, 0, −cos).
    this.goal.target.x -= (cy * dx + sy * dy / k) * s;
    this.goal.target.z -= (-sy * dx + cy * dy / k) * s;
    this.goal.target.x = clamp(this.goal.target.x, -1600, 1600);
    this.goal.target.z = clamp(this.goal.target.z, -1600, 1700);
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const cam = this.camera;
    if (mode === 'walk' || mode === 'fly') {
      this.pos.copy(cam.position);
      cam.getWorldDirection(tmp);
      this.look.yaw = this.lookGoal.yaw = Math.atan2(-tmp.x, -tmp.z);
      this.look.pitch = this.lookGoal.pitch = Math.asin(clamp(tmp.y, -1, 1));
      if (mode === 'walk') {
        // Drop to eye level where the camera is looking.
        if (this.pos.y - this.groundAt(this.pos.x, this.pos.z) > 30) {
          const t = this.target;
          this.pos.set(t.x, 0, t.z);
        }
        // Never inside a tower or out on the loch: step to the nearest open ground,
        // preferring the side the camera came from.
        const [fx, fz] = this.freeSpot(this.pos.x, this.pos.z, Math.atan2(cam.position.x - this.pos.x, cam.position.z - this.pos.z));
        this.pos.x = fx;
        this.pos.z = fz;
        this.pos.y = this.groundAt(this.pos.x, this.pos.z) + this.eye;
        this.look.pitch = this.lookGoal.pitch = 0.02;
      }
    } else if (mode === 'explore') {
      cam.getWorldDirection(tmp);
      const dist = clamp(this.mode === 'walk' ? 90 : 160, this.limits.minDist, this.limits.maxDist);
      this.goal.target.copy(cam.position).addScaledVector(tmp, dist);
      this.goal.target.y = Math.max(this.goal.target.y, this.groundAt(this.goal.target.x, this.goal.target.z) + 2);
      this.goal.distance = dist;
      this.goal.yaw = Math.atan2(-tmp.x, -tmp.z);
      this.goal.pitch = clamp(-Math.asin(clamp(tmp.y, -1, 1)), 0.05, 1.2);
      this.target.copy(this.goal.target);
      this.distance = dist;
      this.yaw = this.goal.yaw;
      this.pitch = this.goal.pitch;
    }
    this.mode = mode;
    this.flight = null;
  }

  /** Fly the orbit camera to a new framing. */
  flyTo({ target, yaw, pitch, distance, duration }) {
    if (this.mode !== 'explore') this.setMode('explore');
    const from = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, distance: this.distance };
    const to = {
      target: new THREE.Vector3().copy(target),
      yaw: yaw ?? this.yaw,
      pitch: clamp(pitch ?? this.pitch, this.limits.minPitch, this.limits.maxPitch),
      distance: clamp(distance ?? this.distance, this.limits.minDist, this.limits.maxDist),
    };
    to.yaw = from.yaw + wrapAngle(to.yaw - from.yaw);
    const travel = from.target.distanceTo(to.target) + Math.abs(Math.log(to.distance / from.distance)) * 200;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.flight = { from, to, t: 0, duration: reduce ? 0.01 : (duration ?? clamp(1.4 + travel / 700, 1.4, 4.2)), arc: clamp(travel * 0.25, 0, 500) };
    Object.assign(this.goal, { target: to.target.clone(), yaw: to.yaw, pitch: to.pitch, distance: to.distance });
    this.idleTime = 0;
  }

  /** Nearest point to (x, z) where a walker can stand, searched in rings. */
  freeSpot(x, z, bearing = 0) {
    const ok = (px, pz) => !this.colliders(px, pz) && this.groundAt(px, pz) >= 0.4;
    if (ok(x, z)) return [x, z];
    for (let r = 2; r <= 300; r += 2) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 3));
      for (let k = 0; k < n; k++) {
        // Fan out from the bearing: 0, +1, −1, +2, −2 …
        const step = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
        const a = bearing + (step / n) * 2 * Math.PI;
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (ok(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }

  /** Place the walker at a spot, facing a heading. */
  walkTo(x, z, yaw) {
    this.setMode('walk');
    this.pos.set(x, this.groundAt(x, z) + this.eye, z);
    this.look.yaw = this.lookGoal.yaw = yaw ?? this.look.yaw;
    this.look.pitch = this.lookGoal.pitch = 0.04;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const cam = this.camera;
    this.idleTime += dt;
    if (this.mode === 'explore') this.updateOrbit(dt);
    else this.updateFirstPerson(dt);
    cam.updateMatrixWorld();
  }

  updateOrbit(dt) {
    const g = this.goal;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const k = ease(f.t);
      this.target.lerpVectors(f.from.target, f.to.target, k);
      this.yaw = lerp(f.from.yaw, f.to.yaw, k);
      this.pitch = lerp(f.from.pitch, f.to.pitch, k);
      this.distance = Math.exp(lerp(Math.log(f.from.distance), Math.log(f.to.distance), k)) + Math.sin(k * Math.PI) * f.arc;
      if (f.t >= 1) this.flight = null;
    } else {
      // Keyboard orbit.
      const kr = (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0) - (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0);
      const kf = (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0);
      if (kr) g.yaw += kr * dt * 0.9;
      if (kf) g.distance = clamp(g.distance * Math.exp(-kf * dt * 1.2), this.limits.minDist, this.limits.maxDist);
      if (this.autoRotate && this.idleTime > 6 && !this.pointers.size) g.yaw += dt * 0.035;
      const k = 1 - Math.exp(-dt * 9);
      this.target.lerp(g.target, k);
      this.yaw += (g.yaw - this.yaw) * k;
      this.pitch += (g.pitch - this.pitch) * k;
      this.distance = Math.exp(lerp(Math.log(this.distance), Math.log(g.distance), k));
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + sp * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Keep above the ground (and let the pitch give way instead of clipping).
    const ground = this.groundAt(cam.position.x, cam.position.z) + 2.5;
    if (cam.position.y < ground) cam.position.y = ground;
    cam.lookAt(this.target);
  }

  updateFirstPerson(dt) {
    const cam = this.camera;
    const walk = this.mode === 'walk';
    const k = 1 - Math.exp(-dt * 14);
    this.look.yaw += (this.lookGoal.yaw - this.look.yaw) * k;
    this.look.pitch += (this.lookGoal.pitch - this.look.pitch) * k;

    const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + this.moveInput.y;
    const r = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.moveInput.x;
    const v = (this.keys.has('KeyE') || this.keys.has('Space') ? 1 : 0) - (this.keys.has('KeyQ') || this.keys.has('ShiftLeft') && !walk ? 1 : 0) + this.vertical;
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? (walk ? 2.2 : 3) : 1;

    const sy = Math.sin(this.look.yaw), cy = Math.cos(this.look.yaw);
    const fwd = tmp.set(-sy, 0, -cy);
    const right = tmp2.set(cy, 0, -sy);
    const ground = this.groundAt(this.pos.x, this.pos.z);
    let speed;
    if (walk) speed = 3.2 * this.speedScale * boost;
    else speed = clamp((this.pos.y - ground) * 0.9, 12, 160) * this.speedScale * boost;

    const want = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, r);
    if (!walk) {
      // Fly where you look.
      want.set(0, 0, 0)
        .addScaledVector(new THREE.Vector3(-sy * Math.cos(this.look.pitch), Math.sin(this.look.pitch), -cy * Math.cos(this.look.pitch)), f)
        .addScaledVector(right, r);
      want.y += v;
    }
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(speed);
    this.vel.lerp(want, 1 - Math.exp(-dt * (walk ? 10 : 4)));
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    if (walk) {
      // Slide along walls.
      if (this.colliders(next.x, this.pos.z)) next.x = this.pos.x;
      if (this.colliders(this.pos.x, next.z)) next.z = this.pos.z;
      const gh = this.groundAt(next.x, next.z);
      // No walking into the loch or up cliffs.
      if (gh < 0.4 || gh - (this.pos.y - this.eye) > 1.2) { next.x = this.pos.x; next.z = this.pos.z; }
      const bob = Math.sin(performance.now() * 0.009) * 0.035 * Math.min(1, this.vel.length() / 3);
      next.y = lerp(this.pos.y, this.groundAt(next.x, next.z) + this.eye + bob, 1 - Math.exp(-dt * 12));
    } else {
      const gh = this.groundAt(next.x, next.z);
      next.y = clamp(next.y, Math.max(gh, 0) + 3, 1400);
      next.x = clamp(next.x, -2000, 2000);
      next.z = clamp(next.z, -2000, 2000);
    }
    this.pos.copy(next);
    cam.position.copy(this.pos);
    const cp = Math.cos(this.look.pitch);
    cam.lookAt(this.pos.x - sy * cp, this.pos.y + Math.sin(this.look.pitch), this.pos.z - cy * cp);
  }

  /** Where the orbit camera is looking, for labels and the compass. */
  heading() {
    return this.mode === 'explore' ? this.yaw : this.look.yaw;
  }
}
