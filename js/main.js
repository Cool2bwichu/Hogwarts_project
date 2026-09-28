// Hogwarts · The Living Atlas — boot, frame loop and the app API the
// interface talks to.

import * as THREE from 'three';
import { U } from './engine/shared.js';
import { Atmosphere } from './engine/atmosphere.js';
import { Sky } from './engine/sky.js';
import { Renderer, detectTier, TIERS } from './engine/renderer.js';
import { CameraRig } from './engine/camera.js';
import { WeatherFX } from './engine/weather.js';
import { buildTerrain } from './world/terrain.js';
import { Lake } from './world/water.js';
import { heightAt } from './world/layout.js';
import { buildCastle } from './world/castle.js';
import { Vegetation } from './world/vegetation.js';
import { buildGrounds } from './world/grounds.js';
import { buildWillow, buildRocks, buildSmoke, buildOwls } from './world/features.js';
import { Grass } from './world/grass.js';
import { PLACES } from './data/places.js';
import { Labels } from './ui/labels.js';
import { ParchmentMap } from './ui/map.js';
import { Ambience } from './ui/sound.js';
import { createUI } from './ui/ui.js';

const status = document.getElementById('boot-status');
const bar = document.getElementById('boot-bar');
const timings = [];
let stepStart = performance.now(), stepLabel = 'start';
const step = async (label, pct) => {
  const t = performance.now();
  timings.push([stepLabel, Math.round(t - stepStart)]);
  stepStart = t;
  stepLabel = label;
  if (status) status.textContent = label;
  if (bar) bar.style.transform = `scaleX(${pct})`;
  // Yield so the label paints; MessageChannel isn't paused in background tabs.
  await new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  await new Promise((r) => setTimeout(r, 16));
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(`hla.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`hla.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

async function boot() {
  const stage = document.getElementById('stage');
  const autoTier = detectTier();
  const saved = store.get('tier', autoTier);
  const tierId = TIERS[saved] ? saved : autoTier;
  const R = new Renderer(stage, tierId);
  const { scene, camera, gl } = R;
  window.__atlas = { R, timings };

  await step('Raising the Highlands…', 0.08);
  const atmo = new Atmosphere();
  const sky = new Sky();
  scene.add(sky.mesh);
  const terrain = buildTerrain({ resolution: R.tier.terrain });
  scene.add(terrain.mesh, terrain.ring);

  await step('Raising the castle…', 0.3);
  const castle = buildCastle();
  scene.add(castle.group);

  await step('Laying out the grounds…', 0.45);
  const grounds = buildGrounds();
  scene.add(grounds.group);
  const willow = buildWillow();
  scene.add(willow.mesh);
  const rocks = buildRocks({ amount: Math.max(0.5, R.tier.trees) });
  scene.add(rocks.group);
  const smoke = buildSmoke([
    { pos: grounds.markers.chimney, scale: 1 },
    { pos: grounds.markers.steam, scale: 1.6, dark: true },
  ]);
  scene.add(smoke.points);
  const owls = buildOwls(castle.markers.owlery);
  scene.add(owls);
  const weather = new WeatherFX();
  scene.add(weather.mesh);
  const grass = new Grass({ count: Math.max(1, R.tier.grass || 70000) });
  scene.add(grass.mesh);

  await step('Planting the Forbidden Forest…', 0.55);
  const shadowBox = { x: 40, z: -110, half: 390 };
  let veg = new Vegetation({ amount: R.tier.trees, lodDistance: 240 + R.tier.trees * 80, shadowBox });
  scene.add(veg.group);

  await step('Filling the loch…', 0.8);
  const lake = new Lake(terrain.lakeDepth);
  lake.setQuality({ reflection: R.tier.reflection, every: R.tier.reflectEvery });
  scene.add(lake.mesh);

  // ── Walking surface and colliders ──────────────────────────────────────
  const groundAt = (x, z) => castle.floorAt(x, z) ?? Math.max(heightAt(x, z), 0);
  const collides = (x, z) => castle.collides(x, z) || grounds.colliders.some((f) => (f.type === 'rect'
    ? x > f.x0 - 0.4 && x < f.x1 + 0.4 && z > f.z0 - 0.4 && z < f.z1 + 0.4
    : f.type === 'circle' ? Math.hypot(x - f.x, z - f.z) < f.r + 0.4 : false))
    || Math.hypot(x - willow.position.x, z - willow.position.z) < 2.2;
  const rig = new CameraRig(camera, gl.domElement, { groundAt, colliders: collides });
  rig.autoRotate = true;

  // Anchors for labels and flights.
  const markers = { ...castle.markers, ...grounds.markers };
  markers.courtyard = new THREE.Vector3(52, 56, -30);
  const resolveAnchor = (p) => {
    const a = p.anchor;
    if (Array.isArray(a)) return new THREE.Vector3(a[0], a[1], a[2]);
    return (markers[a] || new THREE.Vector3(0, 80, 0)).clone();
  };

  // Whatever is under a screen point: terrain, or roughly the castle's roofline.
  const castleTop = (x, z) => (castle.footprints.some((f) => (f.type === 'rect'
    ? x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 : Math.hypot(x - f.x, z - f.z) < f.r)) ? 82 : -Infinity);
  const surface = (x, z) => Math.max(heightAt(x, z), 0, castleTop(x, z));
  const ray = new THREE.Raycaster();
  function pick(clientX, clientY) {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    let t = 0, prev = 0;
    for (let i = 0; i < 400; i++) {
      t += Math.max(1.5, t * 0.015);
      if (o.y + d.y * t < surface(o.x + d.x * t, o.z + d.z * t)) {
        let lo = prev, hi = t;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m < surface(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
        }
        return new THREE.Vector3(o.x + d.x * hi, o.y + d.y * hi, o.z + d.z * hi);
      }
      prev = t;
      if (t > 6000) break;
    }
    return null;
  }
  gl.domElement.addEventListener('wheel', (e) => { if (rig.mode === 'explore') rig.cursorPoint = pick(e.clientX, e.clientY); }, { capture: true, passive: true });
  gl.domElement.addEventListener('dblclick', (e) => {
    if (rig.mode !== 'explore') return;
    const p = pick(e.clientX, e.clientY);
    if (p) rig.flyTo({ target: p, distance: Math.max(35, rig.distance * 0.4), duration: 1.3 });
  });

  // ── App API ────────────────────────────────────────────────────────────
  let ui = null;
  const occluded = (from, to) => {
    const dx = from.x - to.x, dy = from.y - to.y, dz = from.z - to.z;
    const len = Math.hypot(dx, dy, dz);
    for (let k = 1; k < 24; k++) {
      const t = (14 + (len - 14) * (k / 24)) / len;
      const x = to.x + dx * t, y = to.y + dy * t, z = to.z + dz * t;
      if (y < surface(x, z) - 2) return true;
    }
    return false;
  };
  const labels = new Labels(document.getElementById('labels'), PLACES, resolveAnchor, (id) => ui.select(id), occluded);
  const ambience = new Ambience();
  const app = {
    atmo, rig, animate: false, mode: 'explore', tierId, autoTier,
    labelsOn: store.get('labels', true), lensOn: false, soundOn: false, fast: store.get('fast', false),
    lens: 0, lensTarget: 0, highlightId: null,
    setHour(h, immediate) { atmo.setHour(h, immediate); },
    setAnimate(b) { app.animate = b; },
    setWeather(w) { atmo.setWeather(w); },
    setTier(id) {
      if (!TIERS[id] || id === app.tierId) return;
      app.tierId = id;
      store.set('tier', id);
      R.setTier(id);
      lake.setQuality({ reflection: R.tier.reflection, every: R.tier.reflectEvery });
      // Tree density follows the tier; rebuild once the menu has painted.
      setTimeout(() => {
        scene.remove(veg.group);
        veg = new Vegetation({ amount: R.tier.trees, lodDistance: 240 + R.tier.trees * 80, shadowBox });
        scene.add(veg.group);
        veg.update(camera, performance.now(), true);
        R.shadowDirty = true;
      }, 60);
    },
    setLabels(b) { app.labelsOn = b; labels.setEnabled(b); store.set('labels', b); },
    setLens(b) { app.lensOn = b; app.lensTarget = b ? 1 : 0; if (!b) U.uLensFocus.value = -1; },
    setLensFocus(i) { U.uLensFocus.value = i; },
    setSound(b) { app.soundOn = b; if (b) ambience.start(); else ambience.stop(); },
    setFast(b) { app.fast = b; rig.speedScale = b ? 2.2 : 1; store.set('fast', b); },
    setMode(m) {
      app.mode = m;
      if (m === 'map') return;
      rig.setMode(m);
      rig.autoRotate = m === 'explore';
    },
    overview() {
      rig.flyTo({ target: new THREE.Vector3(0, 70, -10), yaw: -0.62, pitch: 0.2, distance: 520 });
      app.highlight(null);
    },
    zoom(f) {
      if (rig.mode === 'explore') rig.goal.distance = THREE.MathUtils.clamp(rig.goal.distance * f, rig.limits.minDist, rig.limits.maxDist);
      else rig.speedScale = THREE.MathUtils.clamp(rig.speedScale / f, 0.3, 6);
    },
    flyToPlace(id) {
      const p = PLACES.find((x) => x.id === id);
      if (!p) return;
      if (app.mode !== 'explore') { app.setMode('explore'); ui.setModeUI('explore'); }
      const v = p.view;
      rig.flyTo({ target: new THREE.Vector3(...v.target), yaw: v.yaw, pitch: v.pitch, distance: v.distance });
    },
    walkToPlace(id) {
      const p = PLACES.find((x) => x.id === id);
      if (!p?.walk) return;
      app.mode = 'walk';
      rig.walkTo(p.walk[0], p.walk[1], p.walk[2]);
      rig.autoRotate = false;
    },
    highlight(id) {
      app.highlightId = id;
      const p = PLACES.find((x) => x.id === id);
      if (!p) { U.uHighlight.value.w = 0; return; }
      const a = resolveAnchor(p);
      U.uHighlight.value.set(a.x, a.z, p.major ? 40 : 22, 0);
    },
    postcard() {
      frame(last + 1);
      return gl.domElement.toDataURL('image/jpeg', 0.92);
    },
    faceNorth() {
      if (rig.mode === 'explore') rig.flyTo({ target: rig.target.clone(), yaw: 0, pitch: rig.pitch, distance: rig.distance, duration: 1.1 });
      else rig.lookGoal.yaw = 0;
    },
    metresPerPixel() {
      return (rig.distance * 2 * Math.tan((camera.fov * Math.PI) / 360)) / (gl.domElement.clientHeight || 800);
    },
    isFlying() { return !!rig.flight; },
    map: null,
  };
  app.map = new ParchmentMap(document.getElementById('mapcanvas'), {
    places: PLACES, resolveAnchor, onSelect: (id) => ui.select(id),
  });
  app.map.focusPlace = (id) => {
    const p = PLACES.find((x) => x.id === id);
    const a = resolveAnchor(p);
    app.map.view.cx = a.x;
    app.map.view.cz = a.z;
    app.map.view.s = Math.max(app.map.view.s, 1.4);
    app.map.draw();
  };
  addEventListener('resize', () => { if (app.mode === 'map') { app.map.resize(); app.map.draw(); } });
  ui = createUI(app);
  labels.setEnabled(app.labelsOn);
  if (app.fast) rig.speedScale = 2.2;
  Object.assign(window.__atlas, { app, atmo, sky, rig, lake, terrain, scene, camera, castle, grounds, willow, ui, get veg() { return veg; } });

  // Opening shot: from over the loch, the castle on its cliff at golden hour.
  rig.target.set(0, 72, -10);
  rig.yaw = -0.62; rig.pitch = 0.2; rig.distance = 760;
  rig.goal = { target: rig.target.clone(), yaw: -0.62, pitch: 0.2, distance: 760 };
  rig.flyTo({ target: new THREE.Vector3(0, 70, -10), yaw: -0.5, pitch: 0.19, distance: 520, duration: 5 });

  let lastEnv = -999, lastEnvCloud = -1, envTimer = 0;
  let last = performance.now();
  await step('Lighting the lamps…', 1);
  document.body.classList.add('ready');

  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    U.uTime.value = (U.uTime.value + dt) % 10000;
    if (app.animate) atmo.setHour(atmo.targetHour + dt * 0.1, true);
    atmo.update(dt);
    const o = atmo.out;
    U.uZenith.value.copy(o.zenith);
    U.uFogColor.value.copy(o.horizon);
    U.uFogSunColor.value.copy(o.sunSide);
    U.uFogDensity.value = atmo.fogDensity;
    U.uFogFalloff.value = atmo.fogFalloff;
    U.uNight.value = atmo.night;
    U.uSnow.value = atmo.snowCover;
    U.uWet.value = atmo.wetness;
    U.uWind.value = atmo.wind;
    app.lens += (app.lensTarget - app.lens) * Math.min(1, dt * 5);
    U.uLens.value = app.lens < 0.002 ? 0 : app.lens;
    if (app.highlightId) U.uHighlight.value.w = Math.min(1, U.uHighlight.value.w + dt * 2);
    sky.apply(atmo);
    ui.frame(dt);
    ambience.update(atmo);
    if (app.mode === 'map') return; // the parchment map needs no 3D frames

    R.applyLight(atmo, rig.mode === 'walk' ? rig.pos : null);
    const flash = weather.update(dt, atmo, camera);
    if (flash > 0) { R.sun.intensity += flash * 4; R.hemi.intensity += flash * 2.5; }
    lake.uniforms.uAmbient.value.copy(o.hemiSky).multiplyScalar(atmo.hemiIntensity * 0.5 + flash);
    lake.uniforms.uRain.value = atmo.rain;

    envTimer += dt;
    if ((Math.abs(atmo.elevation - lastEnv) > 1.2 || Math.abs(atmo.cloudCover - lastEnvCloud) > 0.06) && envTimer > 0.4) {
      scene.environment = sky.captureEnvironment(gl);
      lastEnv = atmo.elevation;
      lastEnvCloud = atmo.cloudCover;
      envTimer = 0;
    }

    rig.update(dt);
    sky.mesh.position.copy(camera.position);
    veg.update(camera, now, R.shadowDirty);
    // The willow grows restless when you come near.
    const wd = camera.position.distanceTo(willow.position);
    const want = 0.12 + 0.9 * (1 - Math.min(1, Math.max(0, (wd - 12) / 60)));
    willow.uniforms.uWhomp.value += (want - willow.uniforms.uWhomp.value) * Math.min(1, dt * 1.5);
    smoke.material.uniforms.uPixel.value = (gl.getPixelRatio() * gl.domElement.clientHeight) / 900;
    const glow = Math.max(0, atmo.night - 0.15) / 0.85;
    grounds.lampMat.color.setRGB(0.2 + 5 * glow, 0.15 + 3.2 * glow, 0.08 + 1.4 * glow);
    grounds.materials.plant.emissiveIntensity = glow * 0.9;
    owls.visible = atmo.rain < 0.5;
    grass.update(camera, R, (R.tier.grass || 0) > 0, groundAt(camera.position.x, camera.position.z));

    lake.beforeRender(gl, scene, camera);
    R.render({
      exposure: atmo.exposure,
      bloom: atmo.bloom * 0.12,
      saturation: atmo.saturation,
      grade: o.grade,
      time: U.uTime.value,
      threshold: 1.4,
    });
    labels.update(camera, gl.domElement.clientWidth, gl.domElement.clientHeight, app.highlightId);
    R.track(dt);
  }
  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }
  // Test hook: advance frames while the page sits in a background pane.
  window.__atlas.tick = (n = 1, stepMs = 16.7) => { for (let i = 0; i < n; i++) frame(last + stepMs); };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  const s = document.getElementById('boot-status');
  if (s) s.textContent = `The atlas could not start: ${err.message}. It needs a browser with WebGL 2.`;
});
