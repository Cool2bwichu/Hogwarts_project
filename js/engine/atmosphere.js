// Time of day and weather → every lighting and colour parameter in the scene.
// Colours are keyed to the sun's elevation (not the clock), so any hour
// between the presets is physically consistent.

import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise.js';

const LATITUDE = 56.8 * Math.PI / 180;   // the Scottish Highlands
const DECLINATION = 0;                    // near the autumn equinox, at the start of term
export const SOLAR_NOON = 13.3;           // British Summer Time, ~4.5° west

export const TIME_PRESETS = [
  { id: 'dawn', label: 'First light', hour: 7.3 },
  { id: 'morning', label: 'Morning', hour: 9.5 },
  { id: 'day', label: 'Midday', hour: 13.3 },
  { id: 'golden', label: 'Golden hour', hour: 18.45 },
  { id: 'dusk', label: 'Blue hour', hour: 19.95 },
  { id: 'night', label: 'Moonlight', hour: 23.3 },
];

export const WEATHER = [
  { id: 'clear', label: 'Clear' },
  { id: 'mist', label: 'Highland mist' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow' },
  { id: 'storm', label: 'Storm' },
];

export function sunDirection(hour, out = new THREE.Vector3()) {
  const H = (hour - SOLAR_NOON) * 15 * Math.PI / 180;
  const sinEl = Math.sin(LATITUDE) * Math.sin(DECLINATION) + Math.cos(LATITUDE) * Math.cos(DECLINATION) * Math.cos(H);
  const el = Math.asin(sinEl);
  const cosAz = (Math.sin(DECLINATION) - Math.sin(el) * Math.sin(LATITUDE)) / (Math.cos(el) * Math.cos(LATITUDE));
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az; // afternoon: west of south
  // Azimuth from north, clockwise. North = −z, east = +x.
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return out;
}

// ── Keyframes over sun elevation (degrees) ────────────────────────────────
const K = [-18, -9, -4, 0, 4, 10, 20, 34];
const hex = (h) => new THREE.Color(h);
// The grade is a filter, not a colour: '#ffd8a8' means ×(1, 0.85, 0.66). Read
// the digits as they are, or the sRGB decode roughly squares the tint.
const filter = (h) => new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace);
const TABLE = {
  zenith:   ['#03060f', '#101a38', '#2a3a70', '#4a64a0', '#5f86c2', '#5f8fcf', '#4d86cf', '#3f7bc9'].map(hex),
  horizon:  ['#070b16', '#1e2a48', '#4e5476', '#8f8499', '#a9a2b3', '#b3b6c4', '#b8c8d8', '#bccfde'].map(hex),
  sunSide:  ['#0a1020', '#3d3a5a', '#c0706a', '#f08a52', '#f7a45e', '#f5c483', '#ece6d6', '#eef1ef'].map(hex),
  sun:      ['#000000', '#000000', '#ff6a3a', '#ff8c4a', '#ffb070', '#ffd09a', '#fff0dc', '#fffaf2'].map(hex),
  hemiSky:  ['#3b4d7a', '#40517e', '#56608a', '#7c7c9c', '#9aa3bc', '#a9bcd6', '#b2c8e2', '#b8cfe8'].map(hex),
  hemiGround: ['#141820', '#1a1d24', '#2a2622', '#3d3328', '#4b4230', '#4f4a36', '#56553c', '#5a5a3e'].map(hex),
  grade:    ['#8fa6ff', '#a0a8e8', '#d8b8c8', '#ffc9a0', '#ffd8a8', '#fff0d8', '#fffaf4', '#ffffff'].map(filter),
};
const SCALARS = {
  sunI:   [0, 0, 0.15, 0.9, 2.1, 3.0, 3.5, 3.8],
  hemiI:  [0.42, 0.42, 0.5, 0.74, 0.98, 1.1, 1.2, 1.25],
  night:  [1, 0.95, 0.6, 0.25, 0.05, 0, 0, 0],
  exposure: [1.85, 1.6, 1.2, 1.02, 0.98, 0.94, 0.9, 0.88],
  stars:  [1, 0.8, 0.25, 0, 0, 0, 0, 0],
};

function sample(arr, el) {
  if (el <= K[0]) return [0, 0, 0];
  if (el >= K[K.length - 1]) return [K.length - 1, K.length - 1, 0];
  let i = 0;
  while (el > K[i + 1]) i++;
  const t = (el - K[i]) / (K[i + 1] - K[i]);
  return [i, i + 1, t * t * (3 - 2 * t)];
}
function colorAt(name, el, out) {
  const [a, b, t] = sample(null, el);
  return out.copy(TABLE[name][a]).lerp(TABLE[name][b], t);
}
function scalarAt(name, el) {
  const [a, b, t] = sample(null, el);
  return lerp(SCALARS[name][a], SCALARS[name][b], t);
}

// Weather parameter targets.
const WX = {
  clear: { cloud: 0.18, overcast: 0, fog: 1, fall: 1, rain: 0, snow: 0, wind: 0.3, mist: 0 },
  mist:  { cloud: 0.55, overcast: 0.45, fog: 5.5, fall: 3.2, rain: 0, snow: 0, wind: 0.12, mist: 1 },
  rain:  { cloud: 0.86, overcast: 0.8, fog: 2.6, fall: 1.2, rain: 1, snow: 0, wind: 0.6, mist: 0.3 },
  snow:  { cloud: 0.9, overcast: 0.72, fog: 3.0, fall: 1.1, rain: 0, snow: 1, wind: 0.35, mist: 0.3 },
  storm: { cloud: 0.97, overcast: 1, fog: 2.8, fall: 1, rain: 1.35, snow: 0, wind: 1.1, mist: 0.2 },
};

/** Mutable atmosphere state, eased towards the chosen time and weather. */
export class Atmosphere {
  constructor() {
    this.hour = 18.45;
    this.targetHour = this.hour;
    this.weather = 'clear';
    this.w = { ...WX.clear };
    this.snowCover = 0;
    this.wetness = 0;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.out = {
      zenith: new THREE.Color(), horizon: new THREE.Color(), sunSide: new THREE.Color(),
      sun: new THREE.Color(), hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
      grade: new THREE.Color(), lightColor: new THREE.Color(), moonColor: new THREE.Color('#aac0ea'),
      cloudLit: new THREE.Color(), cloudDark: new THREE.Color(),
    };
    this.update(0, true);
  }

  setWeather(id) { this.weather = id; }
  setHour(h, immediate = false) {
    this.targetHour = ((h % 24) + 24) % 24;
    if (immediate) this.hour = this.targetHour;
  }

  get elevation() { return Math.asin(this.sunDir.y) * 180 / Math.PI; }

  update(dt, immediate = false) {
    // Ease the clock the short way round.
    let d = this.targetHour - this.hour;
    if (d > 12) d -= 24;
    if (d < -12) d += 24;
    this.hour = immediate ? this.targetHour : ((this.hour + d * Math.min(1, dt * 1.8)) % 24 + 24) % 24;

    const tw = WX[this.weather];
    const k = immediate ? 1 : Math.min(1, dt * 0.55);
    for (const key in tw) this.w[key] = lerp(this.w[key], tw[key], k);
    // Snow settles slowly and melts slowly; rain wets quickly and dries slowly.
    this.snowCover = clamp(this.snowCover + dt * (this.w.snow > 0.5 ? 0.05 : -0.03), 0, 1);
    this.wetness = clamp(this.wetness + dt * (this.w.rain > 0.3 ? 0.25 : -0.04), 0, 1);
    if (immediate) {
      this.snowCover = tw.snow > 0.5 ? 1 : 0;
      this.wetness = tw.rain > 0.3 ? 1 : 0;
    }

    sunDirection(this.hour, this.sunDir);
    const el = this.elevation;
    const o = this.out;
    const oc = this.w.overcast;

    colorAt('zenith', el, o.zenith);
    colorAt('horizon', el, o.horizon);
    colorAt('sunSide', el, o.sunSide);
    colorAt('sun', el, o.sun);
    colorAt('hemiSky', el, o.hemiSky);
    colorAt('hemiGround', el, o.hemiGround);
    colorAt('grade', el, o.grade);

    // Overcast skies: flatter, greyer, the sun side glow suppressed.
    const grey = new THREE.Color().copy(o.horizon);
    const gl = grey.r * 0.3 + grey.g * 0.55 + grey.b * 0.15;
    grey.setRGB(gl * 0.92, gl * 0.95, gl * 1.0);
    o.horizon.lerp(grey, oc * 0.85);
    o.sunSide.lerp(o.horizon, oc * 0.85);
    const zg = o.zenith.r * 0.3 + o.zenith.g * 0.55 + o.zenith.b * 0.15;
    o.zenith.lerp(new THREE.Color(zg * 0.95, zg, zg * 1.08), oc * 0.8);
    if (this.w.mist > 0.01) {
      o.horizon.lerp(new THREE.Color().copy(o.hemiSky).multiplyScalar(0.95), this.w.mist * 0.35);
    }

    this.night = scalarAt('night', el);
    this.starAlpha = scalarAt('stars', el) * (1 - this.w.cloud * 0.9);
    this.exposure = scalarAt('exposure', el) + oc * 0.12;

    // Moon: rises opposite the sun; lights the grounds when the sun is down.
    const moonEl = clamp(-el * 0.9 + 16, 8, 52) * Math.PI / 180;
    const sunAz = Math.atan2(this.sunDir.x, -this.sunDir.z);
    const moonAz = sunAz + Math.PI * 0.82;
    this.moonDir.set(Math.sin(moonAz) * Math.cos(moonEl), Math.sin(moonEl), -Math.cos(moonAz) * Math.cos(moonEl));

    const sunI = scalarAt('sunI', el) * (1 - oc * 0.78);
    const moonI = 1.25 * smoothstep(-3, -10, el) * (1 - oc * 0.7);
    if (sunI >= moonI * 1.5 || el > -4) {
      this.lightDir.copy(this.sunDir);
      if (this.lightDir.y < 0.035) this.lightDir.y = 0.035;
      this.lightDir.normalize();
      o.lightColor.copy(o.sun);
      this.lightIntensity = sunI;
      this.lightIsMoon = false;
    } else {
      this.lightDir.copy(this.moonDir);
      o.lightColor.copy(o.moonColor);
      this.lightIntensity = moonI;
      this.lightIsMoon = true;
    }
    this.hemiIntensity = scalarAt('hemiI', el) * (1 + oc * 0.25);

    // Fog: base haze plus weather.
    this.fogDensity = 0.00024 * this.w.fog * (1 + this.night * 0.2);
    this.fogFalloff = 0.0016 * this.w.fall;
    this.fogBase = 0;

    // Clouds.
    this.cloudCover = this.w.cloud;
    o.cloudLit.copy(o.sunSide).lerp(new THREE.Color(1, 1, 1), 0.35 * (1 - this.night)).multiplyScalar(lerp(1.0, 0.62, oc));
    o.cloudDark.copy(o.horizon).multiplyScalar(lerp(0.72, 0.5, oc));
    this.sunVisible = smoothstep(-2.5, 1.5, el) * (1 - oc * 0.92);
    this.bloom = lerp(0.55, 0.9, this.night) * (1 - oc * 0.25);
    this.saturation = lerp(1.06, 0.84, oc) * lerp(1, 0.86, this.night);
    this.rain = this.w.rain;
    this.snow = this.w.snow;
    this.wind = this.w.wind;
    this.mist = this.w.mist;
  }
}
