// Rain, snow and lightning. Particles live in a box that travels with the
// camera and are animated entirely on the GPU: one draw call, no per-frame JS.

import * as THREE from 'three';
import { U } from './shared.js';

export class WeatherFX {
  constructor(count = 9000) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    this.count = count;
    this.uniforms = {
      ...U,
      uRainAmt: { value: 0 },
      uSnowAmt: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uFlash: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime, uWind, uRainAmt, uSnowAmt;
        uniform vec3 uCam;
        attribute vec4 aSeed;
        varying float vAlpha;
        varying vec2 vUv;
        varying float vSnow;
        void main() {
          float snow = step(0.5, uSnowAmt) ;
          float amt = max(uRainAmt, uSnowAmt);
          vAlpha = step(aSeed.w, amt);
          vSnow = snow;
          vec3 box = vec3(70.0, 44.0, 70.0);
          float fall = snow > 0.5 ? 1.6 + aSeed.z : 26.0 + aSeed.z * 8.0;
          vec3 wind = vec3(1.0, 0.0, 0.4) * uWind * (snow > 0.5 ? 2.5 : 7.0);
          vec3 p = vec3(aSeed.x, 1.0 - fract(aSeed.y + uTime * fall / box.y), aSeed.z) * box;
          p.xz += wind.xz * uTime;
          if (snow > 0.5) p.x += sin(uTime * 1.3 + aSeed.x * 30.0) * 0.6;
          // Wrap the box around the camera.
          vec3 origin = uCam - box * 0.5;
          p = origin + mod(p - origin, box);
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = snow > 0.5 ? vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) : normalize(vec3(0.0, -fall, 0.0) - wind);
          float w = snow > 0.5 ? 0.07 : 0.018;
          float h = snow > 0.5 ? 0.07 : 0.9;
          vec3 world = p + camRight * position.x * w * 2.0 + up * (position.y - 0.5) * h * (snow > 0.5 ? 2.0 : -1.0);
          vUv = position.xy + vec2(0.5, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFlash;
        varying float vAlpha;
        varying vec2 vUv;
        varying float vSnow;
        void main() {
          if (vAlpha < 0.5) discard;
          float a;
          if (vSnow > 0.5) { vec2 c = vUv - 0.5; a = smoothstep(0.25, 0.0, dot(c, c)) * 0.9; }
          else a = (1.0 - abs(vUv.x - 0.5) * 2.0) * 0.28;
          vec3 col = mix(uFogColor * 1.1 + 0.08, vec3(1.0), vSnow * 0.6) + uFlash;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'weather';
    this.flash = 0;
    this.nextStrike = 4;
  }

  update(dt, atmo, camera, light, hemi) {
    const u = this.uniforms;
    u.uCam.value.copy(camera.position);
    u.uRainAmt.value = Math.min(1, atmo.rain) * (atmo.snow > 0.5 ? 0 : 1);
    u.uSnowAmt.value = atmo.snow;
    this.mesh.visible = atmo.rain > 0.02 || atmo.snow > 0.02;
    // Lightning in a storm.
    if (atmo.weather === 'storm') {
      this.nextStrike -= dt;
      if (this.nextStrike < 0) {
        this.flash = 1;
        this.nextStrike = 5 + Math.random() * 11;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const f = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.flash * 40)) : 0;
    u.uFlash.value = f * 0.6;
    return f;
  }
}
