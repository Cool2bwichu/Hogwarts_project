// Sky dome, clouds, stars and moon, plus the environment map used for
// reflections. The horizon colour is the fog colour, so distant hills dissolve
// into the sky instead of meeting it at a line.

import * as THREE from 'three';
import { U, GLSL_COMMON } from './shared.js';

export const SKY_UNIFORMS = {
  uMoonDir: { value: new THREE.Vector3(0, 0.5, 0.8).normalize() },
  uMoonColor: { value: new THREE.Color('#dfe7ff') },
  uSunVis: { value: 1 },
  uStars: { value: 0 },
  uCloudCover: { value: 0.2 },
  uCloudLit: { value: new THREE.Color(1, 1, 1) },
  uCloudDark: { value: new THREE.Color(0.5, 0.55, 0.6) },
  uEnvMode: { value: 0 },
};

// Gradient sky used by the dome and by the loch's reflections.
export const SKY_FN = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform float uSunVis;
vec3 skyGradient(vec3 d, vec3 fogA, vec3 fogB, vec3 sunDir) {
  float y = d.y;
  float sunAmt = pow(max(dot(d, sunDir), 0.0), 5.0);
  vec3 horizon = mix(fogA, fogB, sunAmt);
  float t = 1.0 - exp(-max(y, 0.0) * 3.2);
  vec3 col = mix(horizon, uZenith, t);
  col += fogB * pow(max(dot(d, sunDir), 0.0), 3.0) * 0.18 * (1.0 - t);
  if (y < 0.0) col = mix(horizon, horizon * 0.82, clamp(-y * 5.0, 0.0, 1.0));
  return col;
}
`;

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + position * 1000.0, 1.0);
  gl_Position = p.xyww;
}
`;

const fragment = /* glsl */ `
uniform sampler2D uNoise;
uniform float uTime, uStars, uCloudCover, uEnvMode, uNight;
uniform vec3 uFogColor, uFogSunColor, uSunDir, uMoonDir, uMoonColor, uCloudLit, uCloudDark;
varying vec3 vDir;
${GLSL_COMMON}
${SKY_FN}

float starLayer(vec3 d, float scale, float thresh) {
  vec3 q = d * scale;
  vec3 c = floor(q);
  vec3 f = fract(q) - 0.5;
  float h = hash13(c);
  if (h < thresh) return 0.0;
  vec3 o = vec3(hash13(c + 1.3), hash13(c + 2.7), hash13(c + 4.1)) - 0.5;
  float dd = length(f - o * 0.6);
  float fw = length(fwidth(q));
  float size = max(0.05 + 0.08 * fract(h * 17.0), fw * 0.9);
  float b = smoothstep(size, size * 0.2, dd) * min(1.0, (0.05 + 0.08 * fract(h * 17.0)) / size);
  float tw = 0.75 + 0.25 * sin(uTime * (1.3 + h * 3.0) + h * 60.0);
  return b * tw * (0.35 + (h - thresh) / (1.0 - thresh));
}

void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d, uFogColor, uFogSunColor, uSunDir);
  float cloudBlock = 0.0;

  // Clouds on a plane two kilometres up.
  if (d.y > 0.0 && uCloudCover > 0.01) {
    float t = (2200.0 - cameraPosition.y) / max(d.y, 0.015);
    vec2 p = cameraPosition.xz + d.xz * t;
    vec2 uv = (p + vec2(uTime * 7.0, uTime * 2.6)) * 0.000085;
    float n = texture2D(uNoise, uv).g * 0.58 + texture2D(uNoise, uv * 2.9 + 0.31).b * 0.3 + texture2D(uNoise, uv * 7.3 + 0.7).r * 0.12;
    float cov = uCloudCover;
    float dens = smoothstep(1.0 - cov * 0.92 - 0.02, 1.08 - cov * 0.6, n + cov * 0.18);
    vec2 uvs = uv + normalize(uSunDir.xz + 1e-4) * 0.006;
    float ns = texture2D(uNoise, uvs).g * 0.58 + texture2D(uNoise, uvs * 2.9 + 0.31).b * 0.3 + texture2D(uNoise, uvs * 7.3 + 0.7).r * 0.12;
    float shade = clamp(0.62 + (n - ns) * 5.0, 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, shade);
    float toward = pow(max(dot(d, uSunDir), 0.0), 10.0);
    cc += uSunColor * toward * (1.0 - dens) * 0.9 * uSunVis;
    float fade = smoothstep(0.0, 0.14, d.y);
    cloudBlock = clamp(dens * fade, 0.0, 1.0);
    col = mix(col, cc, cloudBlock * 0.96);
  }

  // Sun disk and glow.
  float sd = dot(d, uSunDir);
  float sang = sqrt(max(2.0 * (1.0 - sd), 0.0));
  float horizonCut = smoothstep(-0.015, 0.01, d.y);
  float disk = smoothstep(0.0105, 0.0088, sang) * (uEnvMode > 0.5 ? 3.0 : 42.0);
  float glow = pow(max(sd, 0.0), 900.0) * 3.0 + pow(max(sd, 0.0), 70.0) * 0.28;
  col += uSunColor * (disk * horizonCut * (1.0 - cloudBlock) + glow * (1.0 - cloudBlock * 0.6)) * uSunVis;

  if (uEnvMode < 0.5 && uNight > 0.01) {
    // Stars and a faint Milky Way.
    vec3 band = normalize(vec3(0.35, 0.55, -0.76));
    float mw = exp(-pow(dot(d, band) / 0.2, 2.0));
    float mwN = texture2D(uNoise, vec2(atan(d.z, d.x) * 0.8, d.y * 1.4)).g;
    float stars = starLayer(d, 260.0, 0.985) * 1.3 + starLayer(d, 520.0, 0.992 - mw * 0.02) * 0.8;
    float aboveH = smoothstep(0.0, 0.12, d.y);
    col += vec3(0.8, 0.86, 1.0) * stars * uStars * aboveH * (1.0 - cloudBlock);
    col += vec3(0.16, 0.18, 0.26) * mw * smoothstep(0.35, 0.8, mwN) * uStars * aboveH * 0.35 * (1.0 - cloudBlock);

    // Moon, drawn a little larger than life.
    float md = dot(d, uMoonDir);
    float mang = sqrt(max(2.0 * (1.0 - md), 0.0));
    float mr = 0.021;
    float mdisk = smoothstep(mr, mr * 0.93, mang);
    vec3 mt = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mb = cross(mt, uMoonDir);
    vec2 mp = vec2(dot(d - uMoonDir, mt), dot(d - uMoonDir, mb)) / mr;
    float maria = texture2D(uNoise, mp * 0.18 + 0.4).g;
    float limb = sqrt(max(1.0 - dot(mp, mp), 0.0));
    vec3 moon = uMoonColor * (0.55 + 0.45 * smoothstep(0.35, 0.65, maria)) * (0.55 + 0.45 * limb) * 3.2;
    float mglow = exp(-mang * 14.0) * 0.12 + exp(-mang * 55.0) * 0.25;
    col = mix(col, moon, mdisk * uNight * (1.0 - cloudBlock * 0.85) * horizonCut);
    col += uMoonColor * mglow * uNight * (1.0 - cloudBlock * 0.5) * horizonCut;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...U, ...SKY_UNIFORMS },
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;

    // A private scene used to capture the environment map.
    this.envScene = new THREE.Scene();
    this.envMaterial = this.material.clone();
    this.envMaterial.uniforms = { ...U, ...SKY_UNIFORMS, uEnvMode: { value: 1 } };
    const envMesh = new THREE.Mesh(this.mesh.geometry, this.envMaterial);
    envMesh.frustumCulled = false;
    this.envScene.add(envMesh);
    this.envRT = null;
    this.pmrem = null;
  }

  /** Copy atmosphere state into the sky uniforms. */
  apply(atmo) {
    SKY_UNIFORMS.uMoonDir.value.copy(atmo.moonDir);
    SKY_UNIFORMS.uSunVis.value = atmo.sunVisible;
    SKY_UNIFORMS.uStars.value = atmo.starAlpha;
    SKY_UNIFORMS.uCloudCover.value = atmo.cloudCover;
    SKY_UNIFORMS.uCloudLit.value.copy(atmo.out.cloudLit);
    SKY_UNIFORMS.uCloudDark.value.copy(atmo.out.cloudDark);
  }

  /** Re-capture reflections. Cheap enough to run when the light changes. */
  captureEnvironment(renderer) {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const prev = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100, { size: 128 });
    if (prev) prev.dispose();
    return this.envRT.texture;
  }
}
