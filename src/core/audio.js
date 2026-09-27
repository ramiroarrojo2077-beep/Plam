// Motor de audio procedural con Web Audio: todos los sonidos se sintetizan en tiempo real.
// Los pasos y ruidos de los animatrónicos son posicionales (HRTF) respecto al jugador.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.loops = {};
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = this.gain(1, this.master);
    this.amb = this.gain(0.7, this.master);
    this.music = this.gain(0.8, this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 3.2);
    this.reverbSend = this.gain(0.32, this.reverb);
    this.reverb.connect(this.master);
    this.sfx.connect(this.reverbSend);
    this.noiseBuf = this.makeNoise(3, false);
    this.brownBuf = this.makeNoise(4, true);
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    this.shaper.curve = curve;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get t() {
    return this.ctx.currentTime;
  }

  gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  makeNoise(sec, brown) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  panner(pos, ref = 1.5, roll = 1.1) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 80;
    p.rolloffFactor = roll;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  setListener(pos, yaw) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = fx;
      L.forwardY.value = 0;
      L.forwardZ.value = fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ---------------------------------------------------------------- primitivas
  noise({ dur = 0.3, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.004, when = 0, dest = null, brown = false, curve = 'exp' } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + dur + 0.05);
    return g;
  }

  osc({ type = 'sine', freq = 440, freqEnd = null, dur = 0.3, gain = 0.3, attack = 0.005, when = 0, dest = null, detune = 0, release = 'exp' } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t0 + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    if (release === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  // ---------------------------------------------------------------- efectos
  footstep(pos, style = 'walk', muffled = false) {
    if (!this.ctx) return;
    const p = this.panner(pos, 1.6, 1.0);
    let dest = p;
    if (muffled) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      f.connect(p);
      dest = f;
    }
    const run = style === 'run';
    const k = run ? 0.8 : style === 'shuffle' ? 0.4 : 1;
    this.osc({ freq: 78 + Math.random() * 10, freqEnd: 36, dur: run ? 0.14 : 0.22, gain: 0.9 * k, dest });
    this.noise({ type: 'lowpass', freq: 520, dur: run ? 0.08 : 0.13, gain: 0.45 * k, dest });
    this.noise({ type: 'bandpass', freq: 2300 + Math.random() * 600, q: 9, dur: 0.07, gain: 0.22 * k, when: 0.01, dest });
    this.osc({ type: 'square', freq: 170 + Math.random() * 30, dur: 0.05, gain: 0.04, when: 0.005, dest });
    if (!run && Math.random() < (style === 'shuffle' ? 0.6 : 0.35)) {
      this.osc({ type: 'sawtooth', freq: 240, freqEnd: 300, dur: 0.28, gain: 0.018, attack: 0.05, when: 0.08, dest });
    }
  }

  servo(pos, gain = 0.05) {
    if (!this.ctx) return;
    const p = this.panner(pos, 1.2, 1.3);
    const f0 = 280 + Math.random() * 120;
    this.osc({ type: 'sawtooth', freq: f0, freqEnd: f0 * 1.25, dur: 0.35, gain, attack: 0.04, dest: p });
    this.osc({ type: 'square', freq: f0 * 2.01, freqEnd: f0 * 2.4, dur: 0.3, gain: gain * 0.25, attack: 0.04, dest: p });
  }

  doorSlam(pos) {
    if (!this.ctx) return;
    const p = this.panner(pos, 2.5, 0.8);
    this.noise({ type: 'lowpass', freq: 320, freqEnd: 70, dur: 0.6, gain: 1.0, dest: p, brown: true });
    this.osc({ freq: 58, freqEnd: 40, dur: 0.5, gain: 0.8, dest: p });
    this.osc({ type: 'triangle', freq: 311, dur: 1.0, gain: 0.07, dest: p, when: 0.01 });
    this.osc({ type: 'triangle', freq: 523, dur: 0.8, gain: 0.05, dest: p, when: 0.01 });
    this.noise({ type: 'bandpass', freq: 3200, q: 3, dur: 0.12, gain: 0.3, dest: p });
    this.noise({ type: 'bandpass', freq: 900, freqEnd: 2000, q: 2, dur: 0.25, gain: 0.12, dest: p, when: -0.0 });
  }

  doorOpen(pos) {
    if (!this.ctx) return;
    const p = this.panner(pos, 2.5, 0.8);
    this.noise({ type: 'bandpass', freq: 500, freqEnd: 1600, q: 2, dur: 0.4, gain: 0.25, dest: p });
    this.osc({ type: 'sawtooth', freq: 90, freqEnd: 140, dur: 0.4, gain: 0.05, dest: p });
    this.noise({ type: 'bandpass', freq: 2500, q: 5, dur: 0.06, gain: 0.25, dest: p, when: 0.38 });
  }

  click(pos = null) {
    if (!this.ctx) return;
    const dest = pos ? this.panner(pos, 1, 1) : this.sfx;
    this.osc({ type: 'square', freq: 1900, dur: 0.025, gain: 0.08, dest });
    this.noise({ type: 'highpass', freq: 3000, dur: 0.02, gain: 0.15, dest });
  }

  deny(pos = null) {
    if (!this.ctx) return;
    const dest = pos ? this.panner(pos, 1, 1) : this.sfx;
    this.osc({ type: 'square', freq: 180, dur: 0.12, gain: 0.08, dest });
    this.osc({ type: 'square', freq: 150, dur: 0.12, gain: 0.08, dest, when: 0.13 });
  }

  lightBuzz(on, side) {
    if (!this.ctx) return;
    const key = 'buzz' + side;
    if (on && !this.loops[key]) {
      const ctx = this.ctx;
      const pos = { x: side === 'L' ? -4.8 : 4.8, y: 2.6, z: -0.6 };
      const p = this.panner(pos, 2, 1);
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 120;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 240;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 480;
      f.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.06, ctx.currentTime, 0.02);
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(p);
      o1.start();
      o2.start();
      this.loops[key] = { stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); o1.stop(ctx.currentTime + 0.2); o2.stop(ctx.currentTime + 0.2); } };
    } else if (!on && this.loops[key]) {
      this.loops[key].stop();
      delete this.loops[key];
    }
  }

  camBlip() {
    this.osc({ type: 'square', freq: 940, dur: 0.04, gain: 0.05 });
    this.osc({ type: 'square', freq: 1420, dur: 0.05, gain: 0.04, when: 0.045 });
    this.noise({ type: 'highpass', freq: 1500, dur: 0.18, gain: 0.12 });
  }

  staticBurst(dur = 0.4, gain = 0.2) {
    this.noise({ type: 'highpass', freq: 700, dur, gain, curve: 'lin' });
  }

  monitorFlip(up) {
    this.noise({ type: 'bandpass', freq: up ? 300 : 1800, freqEnd: up ? 1800 : 300, q: 1.2, dur: 0.24, gain: 0.18 });
    this.osc({ type: 'square', freq: 2400, dur: 0.02, gain: 0.04, when: up ? 0.22 : 0 });
    if (up) this.osc({ freq: 60, dur: 0.3, gain: 0.08, when: 0.2 });
  }

  stinger() {
    if (!this.ctx) return;
    for (const f of [110, 116.5, 164.8, 233]) this.osc({ type: 'triangle', freq: f, dur: 1.6, gain: 0.12, attack: 0.005 });
    this.noise({ type: 'lowpass', freq: 800, dur: 0.6, gain: 0.25 });
  }

  // Grito del susto: voces distorsionadas con barrido de tono y vibrato, cuantización digital,
  // banco de formantes (garganta), chirrido metálico con modulación en anillo, golpe grave y servo.
  // Cada animatrónico tiene su timbre.
  scream(kind = 'shriek', dur = 1.55) {
    if (!this.ctx) return;
    const P = {
      deep: { f: [92, 123, 138, 184], sweep: 1.35, vib: 17, vibAmt: 26, formants: [480, 860, 2200], screech: 1700, crush: 12, trem: 11 },
      shriek: { f: [215, 272, 323, 431], sweep: 1.45, vib: 27, vibAmt: 55, formants: [820, 1450, 3100], screech: 2900, crush: 7, trem: 15 },
      screech: { f: [262, 350, 392, 524], sweep: 1.55, vib: 33, vibAmt: 70, formants: [960, 1750, 3400], screech: 3400, crush: 6, trem: 17 },
      howl: { f: [158, 211, 237, 316], sweep: 1.75, vib: 21, vibAmt: 48, formants: [640, 1120, 2650], screech: 2300, crush: 8, trem: 12 },
    }[kind] || null;
    if (!P) return this.scream('shriek', dur);
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const end = t0 + dur;
    // Bus de salida con envolvente
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(1.0, t0 + 0.025);
    out.gain.setValueAtTime(1.0, end - 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, end);
    out.connect(this.master);
    const rev = this.gain(0.25, this.reverb);
    out.connect(rev);
    // Voces
    const voices = ctx.createGain();
    voices.gain.value = 0.16;
    const trem = ctx.createOscillator();
    trem.frequency.value = P.trem;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.06;
    trem.connect(tremG).connect(voices.gain);
    const drive = ctx.createWaveShaper();
    drive.curve = this.shaper.curve;
    drive.oversample = '2x';
    const crush = ctx.createWaveShaper();
    const cc = new Float32Array(4096);
    for (let i = 0; i < cc.length; i++) {
      const x = (i / (cc.length - 1)) * 2 - 1;
      cc[i] = Math.round(x * P.crush) / P.crush;
    }
    crush.curve = cc;
    voices.connect(drive).connect(crush);
    const dry = ctx.createBiquadFilter();
    dry.type = 'lowpass';
    dry.frequency.value = 5200;
    const dryG = ctx.createGain();
    dryG.gain.value = 0.55;
    crush.connect(dry).connect(dryG).connect(out);
    P.formants.forEach((ff, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(ff * 0.8, t0);
      bp.frequency.linearRampToValueAtTime(ff * 1.15, t0 + 0.2);
      bp.frequency.linearRampToValueAtTime(ff * 0.9, end);
      bp.Q.value = 5 + i * 2;
      const g = ctx.createGain();
      g.gain.value = [1.3, 0.9, 0.5][i];
      crush.connect(bp).connect(g).connect(out);
    });
    const vib = ctx.createOscillator();
    vib.frequency.value = P.vib;
    const vibG = ctx.createGain();
    vibG.gain.value = P.vibAmt;
    vib.connect(vibG);
    const types = ['sawtooth', 'square', 'sawtooth', 'sawtooth'];
    P.f.forEach((f, i) => {
      for (const det of [-14, 11]) {
        const o = ctx.createOscillator();
        o.type = types[i];
        o.detune.value = det + (Math.random() - 0.5) * 10;
        o.frequency.setValueAtTime(f * 0.7, t0);
        o.frequency.exponentialRampToValueAtTime(f * P.sweep, t0 + 0.16);
        o.frequency.exponentialRampToValueAtTime(f * 1.05, t0 + dur * 0.7);
        o.frequency.exponentialRampToValueAtTime(f * 0.78, end);
        vibG.connect(o.frequency);
        o.connect(voices);
        o.start(t0);
        o.stop(end + 0.05);
      }
    });
    // Chirrido metálico con modulación en anillo y paneo inquieto
    const scr = ctx.createOscillator();
    scr.type = 'triangle';
    scr.frequency.setValueAtTime(P.screech * 0.8, t0);
    scr.frequency.exponentialRampToValueAtTime(P.screech * 1.2, t0 + 0.3);
    scr.frequency.exponentialRampToValueAtTime(P.screech * 0.9, end);
    const jit = ctx.createOscillator();
    jit.frequency.value = 7.3;
    const jitG = ctx.createGain();
    jitG.gain.value = P.screech * 0.04;
    jit.connect(jitG).connect(scr.frequency);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const mod = ctx.createOscillator();
    mod.frequency.value = 173;
    const modG = ctx.createGain();
    modG.gain.value = 0.09;
    mod.connect(modG).connect(ring.gain);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) {
      const pl = ctx.createOscillator();
      pl.frequency.value = 4.7;
      const plG = ctx.createGain();
      plG.gain.value = 0.55;
      pl.connect(plG).connect(pan.pan);
      pl.start(t0);
      pl.stop(end + 0.05);
    }
    scr.connect(ring).connect(pan).connect(out);
    // Ruido de garganta
    this.noise({ type: 'bandpass', freq: 3200, freqEnd: 1100, q: 0.8, dur, gain: 0.55, dest: out, attack: 0.01 });
    // Golpe de impacto y servo
    this.osc({ freq: 52, freqEnd: 26, dur: 0.95, gain: 1.0, dest: this.master });
    this.noise({ type: 'lowpass', freq: 500, freqEnd: 90, dur: 0.35, gain: 0.9, dest: this.master, brown: true });
    this.osc({ type: 'sawtooth', freq: 380, freqEnd: 1400, dur: 0.45, gain: 0.06, dest: this.master });
    for (const n of [trem, vib, jit, mod, scr]) {
      n.start(t0);
      n.stop(end + 0.05);
    }
  }

  // Golpe seco con estática (destellos del susto y alucinaciones).
  hit(gain = 0.5) {
    if (!this.ctx) return;
    this.noise({ type: 'highpass', freq: 1200, dur: 0.18, gain: gain * 0.6, curve: 'lin' });
    this.osc({ freq: 80, freqEnd: 35, dur: 0.3, gain });
    for (const f of [311, 330, 466]) this.osc({ type: 'sawtooth', freq: f, dur: 0.35, gain: gain * 0.06 });
  }

  // Gruñido grave y servos (Bruno se acerca antes de abalanzarse).
  creep() {
    if (!this.ctx) return;
    this.osc({ type: 'sawtooth', freq: 55, freqEnd: 62, dur: 0.9, gain: 0.12, attack: 0.2 });
    this.noise({ type: 'bandpass', freq: 300, q: 3, dur: 0.9, gain: 0.25, attack: 0.3 });
    this.servo({ x: 0, y: 1.5, z: 0.5 }, 0.08);
  }

  bang(pos) {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) {
      const p = this.panner(pos, 2.5, 0.8);
      const w = i * 0.32 + Math.random() * 0.05;
      this.noise({ type: 'lowpass', freq: 900, dur: 0.25, gain: 0.9, dest: p, when: w, brown: true });
      this.osc({ freq: 95, freqEnd: 50, dur: 0.25, gain: 0.7, dest: p, when: w });
      this.osc({ type: 'triangle', freq: 420, dur: 0.5, gain: 0.06, dest: p, when: w });
    }
  }

  clang(pos, gain = 0.3) {
    if (!this.ctx) return;
    const p = this.panner(pos, 2, 1);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const w = i * (0.08 + Math.random() * 0.2);
      const f = 500 + Math.random() * 900;
      for (const [m, g] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) this.osc({ type: 'triangle', freq: f * m, dur: 0.7, gain: gain * 0.25 * g, dest: p, when: w });
      this.noise({ type: 'bandpass', freq: 3000, q: 2, dur: 0.06, gain: gain * 0.6, dest: p, when: w });
    }
  }

  laugh(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const p = this.panner(pos, 3, 0.7);
    for (let i = 0; i < 3; i++) {
      const t0 = ctx.currentTime + i * 0.3;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(118 - i * 6, t0);
      o.frequency.linearRampToValueAtTime(98 - i * 6, t0 + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      for (const [ff, q, gg] of [[520, 6, 1], [880, 8, 0.6], [2400, 10, 0.2]]) {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = ff;
        f.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = gg;
        o.connect(f).connect(fg).connect(g);
      }
      g.connect(p);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  }

  // Caja de música: Marcha del Toreador (Bizet, dominio público).
  musicBox(pos) {
    if (!this.ctx) return { stop() {} };
    const ctx = this.ctx;
    const p = this.panner(pos, 2.5, 0.6);
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(p);
    const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, Bb4: 466.2, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5 };
    const melody = [
      ['C5', 0.75], ['D5', 0.25], ['C5', 0.5], ['A4', 0.5], ['A4', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 0.5], ['Bb4', 0.5], ['A4', 1.5],
      ['Bb4', 0.75], ['G4', 0.25], ['C5', 0.5], ['A4', 1.0], ['F4', 0.5], ['D4', 0.5], ['G4', 0.5], ['C4', 1.5],
      ['D4', 0.5], ['G4', 0.5], ['F4', 0.5], ['E4', 0.5], ['D4', 0.5], ['E4', 0.5], ['F4', 0.5], ['G4', 1.5],
      ['A4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['G4', 0.5], ['A4', 0.5], ['F4', 2.0],
    ];
    const beat = 0.34;
    let stopped = false;
    const timers = [];
    const playLoop = (offset) => {
      let t = 0;
      for (const [n, d] of melody) {
        const f = N[n];
        const when = offset + t;
        const detune = (Math.random() - 0.5) * 18;
        this.osc({ freq: f, dur: 1.1, gain: 0.22, attack: 0.004, when, dest: bus, detune });
        this.osc({ freq: f * 2, dur: 0.5, gain: 0.06, attack: 0.003, when, dest: bus, detune });
        this.osc({ freq: f * 4.2, dur: 0.18, gain: 0.03, attack: 0.002, when, dest: bus });
        t += d * beat;
      }
      return t;
    };
    const len = melody.reduce((a, [, d]) => a + d * beat, 0);
    const loop = () => {
      if (stopped) return;
      playLoop(0.05);
      timers.push(setTimeout(loop, len * 1000));
    };
    loop();
    return {
      stop: () => {
        stopped = true;
        timers.forEach(clearTimeout);
        bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      },
    };
  }

  chime() {
    if (!this.ctx) return;
    const notes = [523.3, 659.3, 784, 1046.5, 784, 1046.5];
    notes.forEach((f, i) => {
      for (const [m, g] of [[1, 0.3], [2.01, 0.1], [3.02, 0.05]]) this.osc({ freq: f * m, dur: 2.2, gain: g, when: i * 0.42, attack: 0.004 });
    });
    for (let i = 0; i < 5; i++) this.noise({ type: 'bandpass', freq: 1200 + Math.random() * 800, q: 0.8, dur: 1.4, gain: 0.08, when: 2.4 + i * 0.25, attack: 0.3 });
  }

  powerDown() {
    if (!this.ctx) return;
    this.osc({ type: 'sawtooth', freq: 240, freqEnd: 25, dur: 1.8, gain: 0.25 });
    this.osc({ freq: 60, freqEnd: 20, dur: 1.8, gain: 0.4 });
    this.noise({ type: 'lowpass', freq: 200, dur: 0.5, gain: 0.6, brown: true });
    this.noise({ type: 'bandpass', freq: 2500, q: 4, dur: 0.05, gain: 0.3, when: 0.02 });
  }

  phoneRing(times = 2) {
    if (!this.ctx) return;
    for (let r = 0; r < times; r++) {
      for (let k = 0; k < 2; k++) {
        const w = r * 3 + k * 0.5;
        this.osc({ freq: 440, dur: 0.4, gain: 0.07, when: w, attack: 0.01, release: 'lin' });
        this.osc({ freq: 480, dur: 0.4, gain: 0.07, when: w, attack: 0.01, release: 'lin' });
      }
    }
  }

  // Ambiente: zumbido del ventilador y de la red eléctrica + dron grave.
  startAmbient() {
    if (!this.ctx || this.loops.ambient) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    out.connect(this.amb);
    const src = ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    const fanG = ctx.createGain();
    fanG.gain.value = 0.22;
    const trem = ctx.createOscillator();
    trem.frequency.value = 11;
    const tremG = ctx.createGain();
    tremG.gain.value = 0.06;
    trem.connect(tremG).connect(fanG.gain);
    src.connect(lp).connect(fanG).connect(out);
    const hum = ctx.createOscillator();
    hum.frequency.value = 60;
    const hum2 = ctx.createOscillator();
    hum2.frequency.value = 120;
    const humG = ctx.createGain();
    humG.gain.value = 0.035;
    hum.connect(humG);
    hum2.connect(humG);
    humG.connect(out);
    const drone = ctx.createOscillator();
    drone.frequency.value = 43;
    const drone2 = ctx.createOscillator();
    drone2.frequency.value = 45.3;
    const droneG = ctx.createGain();
    droneG.gain.value = 0.07;
    drone.connect(droneG);
    drone2.connect(droneG);
    droneG.connect(out);
    [src, trem, hum, hum2, drone, drone2].forEach((n) => n.start());
    this.loops.ambient = {
      fan: fanG,
      hum: humG,
      out,
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => [src, trem, hum, hum2, drone, drone2].forEach((n) => { try { n.stop(); } catch (e) { /* ya parado */ } }), 800);
      },
    };
  }

  setFan(on) {
    const a = this.loops.ambient;
    if (!a) return;
    a.fan.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, on ? 0.3 : 1.2);
    a.hum.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.3);
  }

  stopAmbient() {
    if (this.loops.ambient) {
      this.loops.ambient.stop();
      delete this.loops.ambient;
    }
  }

  // Música del menú: acordes menores lentos con pads desafinados, bajo y caja de música.
  startMenuMusic() {
    if (!this.ctx || this.loops.menuMusic) return;
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    bus.connect(lp).connect(this.music);
    const send = this.gain(0.6, this.reverb);
    bus.connect(send);
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]];
    const bar = 3.4;
    let i = 0;
    let stopped = false;
    const pad = (f, when, dur) => {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        const t0 = ctx.currentTime + when;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.022, t0 + 1.1);
        g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.8);
        o.connect(g).connect(bus);
        o.start(t0);
        o.stop(t0 + dur + 1);
      }
    };
    const tick = () => {
      if (stopped) return;
      const ch = chords[i % chords.length];
      for (const m of ch) pad(hz(m), 0.05, bar);
      this.osc({ freq: hz(ch[0] - 12), dur: bar, gain: 0.05, attack: 0.6, dest: bus, release: 'lin' });
      if (i % 2 === 1) {
        const notes = [ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[1] + 24];
        notes.forEach((m, k) => {
          const w = 0.3 + k * 0.42 + (Math.random() - 0.5) * 0.04;
          this.osc({ freq: hz(m), dur: 1.4, gain: 0.05, attack: 0.004, when: w, dest: bus, detune: (Math.random() - 0.5) * 30 });
          this.osc({ freq: hz(m) * 2.01, dur: 0.5, gain: 0.012, attack: 0.003, when: w, dest: bus });
        });
      }
      i++;
    };
    tick();
    const id = setInterval(tick, bar * 1000);
    this.loops.menuMusic = {
      stop: () => {
        stopped = true;
        clearInterval(id);
        bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      },
    };
  }

  // Golpe grave con estática para los sobresaltos del menú.
  menuJolt() {
    if (!this.ctx) return;
    this.osc({ freq: 70, freqEnd: 32, dur: 0.9, gain: 0.35 });
    this.noise({ type: 'highpass', freq: 900, dur: 0.5, gain: 0.18, curve: 'lin' });
    for (const f of [155, 164, 233]) this.osc({ type: 'triangle', freq: f, dur: 1.2, gain: 0.05 });
  }

  // Estática continua (pantalla de fin de juego / monitor).
  startStatic(gain = 0.12) {
    if (!this.ctx) return;
    this.stopStatic();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(this.sfx);
    src.start();
    this.loops.static = { g, stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); setTimeout(() => src.stop(), 300); } };
  }

  setStatic(gain) {
    if (this.loops.static) this.loops.static.g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.03);
  }

  stopStatic() {
    if (this.loops.static) {
      this.loops.static.stop();
      delete this.loops.static;
    }
  }

  stopAll() {
    for (const k of Object.keys(this.loops)) {
      this.loops[k].stop();
      delete this.loops[k];
    }
  }
}
