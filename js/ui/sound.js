// A quiet, synthesised soundscape: wind that follows the weather, rain, and an
// owl now and then after dark. Nothing is downloaded; it starts only on request.

export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
  }

  start() {
    if (!this.ctx) this.build();
    this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.8);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // Brown noise buffer, shared by wind and rain.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;

    const loop = (b) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s; };
    // Wind: band-passed brown noise with a slow gust LFO.
    const wind = loop(buf);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.25;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(this.windFilter.frequency);
    lfo.start();
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    // Rain: high-passed white noise.
    const rain = loop(white);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
    this.nextOwl = ctx.currentTime + 8;
  }

  hoot() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const call = (start, dur, f0) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, start);
      o.frequency.linearRampToValueAtTime(f0 * 0.92, start + dur);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.05, start + 0.05);
      g.gain.linearRampToValueAtTime(0, start + dur);
      o.connect(g).connect(this.master);
      o.start(start);
      o.stop(start + dur + 0.05);
    };
    call(t, 0.35, 410);
    call(t + 0.55, 0.18, 400);
    call(t + 0.8, 0.6, 395);
  }

  update(atmo) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.12 + atmo.wind * 0.35, t, 1.5);
    this.windFilter.Q.value = 0.6 + atmo.wind * 0.6;
    this.rainGain.gain.setTargetAtTime(atmo.rain * 0.12, t, 1.2);
    if (atmo.night > 0.6 && atmo.rain < 0.2 && t > this.nextOwl) {
      this.hoot();
      this.nextOwl = t + 14 + Math.random() * 30;
    }
  }
}
