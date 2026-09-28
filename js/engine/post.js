// HDR pipeline: MSAA scene target → mip-chain bloom → one composite pass
// (filmic tone mapping, grade, vignette, dither). Everything past the scene
// render runs at reduced resolution except the final composite.

import * as THREE from 'three';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER = /* glsl */ `
uniform sampler2D tInput; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb
         + texture2D(tInput, vUv + uTexel * vec2( 0.5, -0.5)).rgb
         + texture2D(tInput, vUv + uTexel * vec2(-0.5,  0.5)).rgb
         + texture2D(tInput, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
  c *= 0.25;
  c = min(c, vec3(60.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.6;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const DOWN = /* glsl */ `
uniform sampler2D tInput; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tInput, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tInput, vUv + t * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture2D(tInput, vUv + t * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture2D(tInput, vUv + t * vec2( 1.0,  1.0)).rgb;
  vec3 e = texture2D(tInput, vUv).rgb;
  gl_FragColor = vec4(e * 0.5 + (a + b + c + d) * 0.125, 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D tInput; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tInput, vUv + vec2(-t.x, -t.y)).rgb
         + texture2D(tInput, vUv + vec2( 0.0, -t.y)).rgb * 2.0
         + texture2D(tInput, vUv + vec2( t.x, -t.y)).rgb
         + texture2D(tInput, vUv + vec2(-t.x,  0.0)).rgb * 2.0
         + texture2D(tInput, vUv).rgb * 4.0
         + texture2D(tInput, vUv + vec2( t.x,  0.0)).rgb * 2.0
         + texture2D(tInput, vUv + vec2(-t.x,  t.y)).rgb
         + texture2D(tInput, vUv + vec2( 0.0,  t.y)).rgb * 2.0
         + texture2D(tInput, vUv + vec2( t.x,  t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uBloom, uExposure, uSaturation, uVignette, uTime, uFxaa, uBloomOn;
uniform vec3 uGrade; uniform vec2 uTexel;
varying vec2 vUv;

vec3 aces(vec3 x) {
  // Narkowicz 2015, with a slightly softer shoulder for candlelight.
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 fxaa(vec2 uv) {
  vec3 rgbM = texture2D(tScene, uv).rgb;
  vec3 rgbNW = texture2D(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb;
  float lM = lum(aces(rgbM)), lNW = lum(aces(rgbNW)), lNE = lum(aces(rgbNE)), lSW = lum(aces(rgbSW)), lSE = lum(aces(rgbSE));
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lB = lum(aces(b));
  return (lB < lMin || lB > lMax) ? a : b;
}

void main() {
  vec3 c = uFxaa > 0.5 ? fxaa(vUv) : texture2D(tScene, vUv).rgb;
  if (uBloomOn > 0.5) c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  c *= uGrade;
  vec3 m = aces(c);
  float l = lum(m);
  m = mix(vec3(l), m, uSaturation);
  // Cool shadows, warm highlights: an old-print feel without a filter look.
  m += (vec3(-0.012, 0.0, 0.02)) * (1.0 - smoothstep(0.0, 0.35, l));
  vec2 q = vUv - 0.5;
  float v = 1.0 - dot(q, q) * uVignette;
  m *= clamp(v, 0.0, 1.0);
  m = toSRGB(clamp(m, 0.0, 1.0));
  // Triangular dither kills banding in the sky gradients.
  vec2 gp = gl_FragCoord.xy + fract(uTime * 7.13) * 91.7;
  float n1 = fract(sin(dot(gp, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(gp + 1.7, vec2(39.3468, 11.135))) * 24634.6345);
  m += (n1 + n2 - 1.0) / 255.0;
  gl_FragColor = vec4(m, 1.0);
}
`;

function fsMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader, uniforms,
    depthTest: false, depthWrite: false,
  });
}

export class PostPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.samples = 4;
    this.bloomEnabled = true;
    this.width = 1;
    this.height = 1;
    this.sceneRT = null;
    this.mips = [];

    this.prefilter = fsMaterial(PREFILTER, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 } });
    this.down = fsMaterial(DOWN, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = fsMaterial(UP, { tInput: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.composite = fsMaterial(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null },
      uBloom: { value: 0.6 }, uExposure: { value: 1 }, uSaturation: { value: 1 },
      uVignette: { value: 0.55 }, uTime: { value: 0 }, uFxaa: { value: 0 }, uBloomOn: { value: 1 },
      uGrade: { value: new THREE.Color(1, 1, 1) }, uTexel: { value: new THREE.Vector2() },
    });
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;
  }

  configure({ samples, bloom }) {
    const changed = samples !== this.samples;
    this.samples = samples;
    this.bloomEnabled = bloom;
    if (changed && this.sceneRT) {
      const { width, height } = this;
      this.sceneRT.dispose();
      this.sceneRT = null;
      this.setSize(width, height);
    }
  }

  setSize(width, height) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (this.sceneRT && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true, samples: this.samples };
    if (!this.sceneRT) this.sceneRT = new THREE.WebGLRenderTarget(width, height, opts);
    else this.sceneRT.setSize(width, height);

    for (const m of this.mips) m.dispose();
    this.mips = [];
    let w = Math.floor(width / 2), h = Math.floor(height / 2);
    for (let i = 0; i < 6 && w > 4 && h > 4; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }));
      w = Math.floor(w / 2);
      h = Math.floor(h / 2);
    }
    this.upRTs?.forEach((r) => r.dispose());
    this.upRTs = this.mips.slice(0, -1).map((m) => new THREE.WebGLRenderTarget(m.width, m.height, { type: THREE.HalfFloatType, depthBuffer: false }));
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene, camera, params) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const c = this.composite.uniforms;
    let bloomTex = this.blank;
    if (this.bloomEnabled && this.mips.length > 2) {
      this.prefilter.uniforms.tInput.value = this.sceneRT.texture;
      this.prefilter.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.prefilter.uniforms.uThreshold.value = params.threshold ?? 1.6;
      this.pass(this.prefilter, this.mips[0]);
      for (let i = 1; i < this.mips.length; i++) {
        this.down.uniforms.tInput.value = this.mips[i - 1].texture;
        this.down.uniforms.uTexel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
        this.pass(this.down, this.mips[i]);
      }
      let prev = this.mips[this.mips.length - 1];
      for (let i = this.mips.length - 2; i >= 0; i--) {
        this.up.uniforms.tInput.value = prev.texture;
        this.up.uniforms.tPrev.value = this.mips[i].texture;
        this.up.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        this.up.uniforms.uRadius.value = 1.0;
        this.pass(this.up, this.upRTs[i]);
        prev = this.upRTs[i];
      }
      bloomTex = prev.texture;
    }

    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = bloomTex;
    c.uBloomOn.value = this.bloomEnabled ? 1 : 0;
    c.uBloom.value = params.bloom ?? 0.6;
    c.uExposure.value = params.exposure ?? 1;
    c.uSaturation.value = params.saturation ?? 1;
    c.uGrade.value.copy(params.grade ?? new THREE.Color(1, 1, 1));
    c.uTime.value = params.time ?? 0;
    c.uFxaa.value = this.samples === 0 ? 1 : 0;
    c.uTexel.value.set(1 / this.width, 1 / this.height);
    this.pass(this.composite, null);
  }
}
