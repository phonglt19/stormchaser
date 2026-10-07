// Fully procedural storm audio (no asset files): wind, engine, rumble, thunder, probe beeps.
export class StormAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
  }

  init() {
    if (this.started) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // ---- shared noise buffer ----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = w * 0.5 + last * 3.5;
    }
    this.noiseBuffer = buf;

    // ---- wind bed ----
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.55;
    this.windFilter = windFilter;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windSrc.connect(windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    // ---- tornado rumble (low) ----
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0.0;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 150;
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = buf;
    rumbleSrc.loop = true;
    rumbleSrc.connect(rumbleFilter).connect(this.rumbleGain).connect(this.master);
    rumbleSrc.start();

    // LFO that wobbles the rumble for a "freight train" flutter.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.016;
    lfo.connect(lfoGain).connect(this.rumbleGain.gain);
    lfo.start();

    // ---- engine ----
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 420;
    const engSrc = ctx.createBufferSource();
    engSrc.buffer = buf;
    engSrc.loop = true;
    engSrc.playbackRate.value = 1.0;
    this.engineRate = engSrc.playbackRate;
    engSrc.connect(engFilter).connect(this.engineGain).connect(this.master);
    engSrc.start();

    this.oscGain = ctx.createGain();
    this.oscGain.gain.value = 0.0;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 60;
    const oscFilter = ctx.createBiquadFilter();
    oscFilter.type = 'lowpass';
    oscFilter.frequency.value = 300;
    this.osc.connect(oscFilter).connect(this.oscGain).connect(this.master);
    this.osc.start();

    // ---- rain hiss ----
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2600;
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = buf;
    rainSrc.loop = true;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rainSrc.start();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  setWind(norm) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(norm * 0.3, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(320 + norm * 620, t, 0.3);
  }

  setRain(norm) {
    if (!this.ctx || this.muted) return;
    this.rainGain.gain.setTargetAtTime(norm * 0.075, t0(this.ctx), 0.4);
  }

  setRumble(norm, proximity) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const level = clamp01(norm) * (0.18 + 0.42 * clamp01(proximity));
    this.rumbleGain.gain.setTargetAtTime(level, t, 0.35);
  }

  setEngine(speedNorm, throttle) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.07 + throttle * 0.05, t, 0.12);
    this.engineRate.setTargetAtTime(0.6 + speedNorm * 1.9, t, 0.12);
    this.oscGain.gain.setTargetAtTime(0.012 + throttle * 0.03, t, 0.1);
    this.osc.frequency.setTargetAtTime(48 + speedNorm * 120 + throttle * 18, t, 0.1);
  }

  thunder(intensity = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(420, t);
    filt.frequency.exponentialRampToValueAtTime(90, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5 * intensity, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2 + intensity);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 3.4);
  }

  probeBeep() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1180, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  chime(up = true) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(up ? 620 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(up ? 1240 : 210, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.0);
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function t0(ctx) {
  return ctx.currentTime;
}
