// Everything you hear, synthesized with the Web Audio API. Nothing is a recording.
import { SPRINKLERS, TREES, ROAD_WIDTH, roadX, WHEEL_LINE, PASTURE_WEST, PIT, SHOP } from './layout.js';
import { CLASS } from './groundmap.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ---------- offline helpers: tiny filters for building sample buffers ----------
function biquad(type, f, q, sr) {
  const w = (2 * Math.PI * f) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function filt(data, type, f, q, sr) {
  const c = biquad(type, f, q, sr);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
  return data;
}
const noise = (n) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return a; };
function mixInto(dst, src, gain, offset = 0) { for (let i = 0; i < src.length && i + offset < dst.length; i++) dst[i + offset] += src[i] * gain; }
function env(a, sr, attack, decay) {
  for (let i = 0; i < a.length; i++) {
    const t = i / sr;
    a[i] *= (t < attack ? t / attack : 1) * Math.exp(-Math.max(0, t - attack) / decay);
  }
  return a;
}
function normalize(a, peak = 0.9) { let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m; return a; }

// ---------- footsteps ----------
function makeStep(kind, sr) {
  const n = Math.floor(sr * 0.42);
  const out = new Float32Array(n);
  const thud = (gain, f = 170, dec = 0.022) => mixInto(out, filt(filt(env(noise(n), sr, 0.002, dec), 'lp', f, 0.9, sr), 'lp', f, 0.7, sr), gain);
  const swish = (gain, f, q, attack, dec, off = 0) => mixInto(out, filt(env(noise(n), sr, attack, dec), 'bp', f, q, sr), gain, Math.floor(off * sr));
  const grains = (count, span, f, q, gain, dec = 0.08) => {
    const g = new Float32Array(n);
    for (let k = 0; k < count; k++) {
      const t = Math.pow(Math.random(), 1.6) * span;
      const i = Math.floor(t * sr);
      const a = (Math.random() * 2 - 1) * Math.exp(-t / dec);
      for (let j = 0; j < 14 && i + j < n; j++) g[i + j] += a * Math.exp(-j / 2.5) * (j % 2 ? -1 : 1);
    }
    mixInto(out, filt(g, 'bp', f, q, sr), gain);
  };
  if (kind === 'lawn') {
    thud(0.9, 160, 0.03);
    swish(0.22, rand(2400, 3400), 0.6, 0.012, 0.07);
    swish(0.12, 650, 2.2, 0.01, 0.05, 0.02);
    swish(0.08, 4200, 1.2, 0.02, 0.05, 0.09);
  } else if (kind === 'tall') {
    thud(0.6, 150, 0.03);
    swish(0.5, rand(1800, 2600), 0.5, 0.04, 0.12);
    swish(0.3, rand(3600, 4800), 0.9, 0.05, 0.1, 0.05);
    grains(30, 0.25, 5200, 1.2, 0.25, 0.12);
  } else if (kind === 'gravel') {
    thud(0.55, 200, 0.02);
    grains(rand(70, 110), 0.2, rand(2200, 3000), 0.7, 1.0, 0.07);
    grains(rand(30, 50), 0.16, 5200, 1.0, 0.5, 0.05);
    grains(25, 0.12, 900, 1.2, 0.5, 0.05);
  } else if (kind === 'hard') {
    mixInto(out, filt(env(noise(n), sr, 0.0005, 0.006), 'bp', rand(800, 1100), 1.1, sr), 1.0);
    thud(0.7, 130, 0.03);
    swish(0.1, 3000, 0.8, 0.008, 0.04, 0.055);
    grains(12, 0.08, 3800, 1.0, 0.18, 0.04);
  } else if (kind === 'sand') {
    thud(0.7, 140, 0.035);
    grains(45, 0.18, rand(1300, 1800), 0.8, 0.6, 0.08);
    swish(0.18, 1500, 0.6, 0.02, 0.07);
  } else if (kind === 'dirt') {
    thud(0.85, 150, 0.03);
    grains(25, 0.14, 1800, 0.8, 0.4, 0.06);
    swish(0.1, 2600, 0.7, 0.015, 0.05);
  }
  return normalize(out, 0.85);
}

function surfaceKind(cls) {
  if (cls === 'hard') return 'hard';
  switch (cls) {
    case CLASS.LAWN: return 'lawn';
    case CLASS.PASTURE: case CLASS.FIELD: case CLASS.DITCH: return 'tall';
    case CLASS.GRAVEL: return 'gravel';
    case CLASS.ASPHALT: case CLASS.CONCRETE: case CLASS.ROAD: return 'hard';
    case CLASS.SAND: return 'sand';
    default: return 'dirt';
  }
}

// ---------- the soundscape ----------
export class Soundscape {
  constructor() {
    this.started = false;
    this.muted = false;
    this.gust = 0.6;
    this.timers = [];
    this.emitters = [];
    this.listener = { x: 0, y: 0, z: 0 };
  }

  async start(quality, world) {
    if (this.started) { await this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older browsers */ }
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.world = world;
    this.Q = quality;
    this.hrtf = quality.tier === 'high' ? 'HRTF' : 'equalpower';
    await ctx.resume();
    const sr = ctx.sampleRate;

    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.out.connect(comp).connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    comp.connect(this.meter);
    this.out.gain.setTargetAtTime(1.55, ctx.currentTime, 1.2);

    // a little open-air space to sit everything in, and a tighter one for under the patio
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.4, 2.6, 0.5);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.22;
    const verbHp = ctx.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 250;
    this.verb.connect(verbHp).connect(verbOut).connect(this.out);
    this.verbIn = ctx.createGain(); this.verbIn.connect(this.verb);
    this.room = ctx.createConvolver();
    this.room.buffer = this.impulse(0.5, 3.5, 0.0);
    this.roomSend = ctx.createGain(); this.roomSend.gain.value = 0;
    this.roomSend.connect(this.room).connect(this.out);

    this.white = this.noiseBuffer(4, 'white');
    this.pink = this.noiseBuffer(6, 'pink');
    this.brown = this.noiseBuffer(6, 'brown');

    this.steps = {};
    for (const k of ['lawn', 'tall', 'gravel', 'hard', 'sand', 'dirt']) {
      this.steps[k] = [];
      for (let i = 0; i < 6; i++) {
        const d = makeStep(k, sr);
        const b = ctx.createBuffer(1, d.length, sr);
        b.copyToChannel(d, 0);
        this.steps[k].push(b);
      }
    }
    this.stepBus = ctx.createGain(); this.stepBus.gain.value = 0.42;
    this.stepBus.connect(this.out);
    this.stepBus.connect(this.roomSend);

    this.buildBed();
    this.buildTrees();
    this.buildSprinklers();
    this.buildDitch();
    this.buildFieldLine();
    this.scheduleLife();
    this.started = true;
  }

  impulse(seconds, decay, pre) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, decay) * (t < pre * 0.02 ? t / (pre * 0.02 + 1e-6) : 1);
      }
      filt(d, 'lp', 5200, 0.7, sr);
    }
    return b;
  }

  noiseBuffer(seconds, kind) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sr * seconds);
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // smooth the loop point
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) { const t = i / fade; d[n - fade + i] = d[n - fade + i] * (1 - t) + d[i] * t; }
    return b;
  }

  loop(buffer, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = true; s.playbackRate.value = rate;
    s.start(this.ctx.currentTime, Math.random() * buffer.duration);
    return s;
  }

  // A point in space that sounds can be played from.
  emitter(x, y, z, { ref = 4, rolloff = 1, air = true, gain = 1 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain(); input.gain.value = gain;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
    const p = new PannerNode(ctx, { panningModel: this.hrtf, distanceModel: 'inverse', refDistance: ref, rolloffFactor: rolloff, maxDistance: 20000, positionX: x, positionY: y, positionZ: z });
    input.connect(lp).connect(p).connect(this.out);
    const send = ctx.createGain(); send.gain.value = 0.18;
    p.connect(send).connect(this.verbIn);
    const e = { input, lp, panner: p, x, y, z, air, set: (nx, ny, nz) => { e.x = nx; e.y = ny; e.z = nz; const t = ctx.currentTime; p.positionX.setTargetAtTime(nx, t, 0.03); p.positionY.setTargetAtTime(ny, t, 0.03); p.positionZ.setTargetAtTime(nz, t, 0.03); } };
    this.emitters.push(e);
    return e;
  }

  // ---------- continuous beds ----------
  buildBed() {
    const ctx = this.ctx;
    // wind: two decorrelated pink noise beds, darker when calm, brighter in a gust
    this.windNodes = [];
    for (const side of [-1, 1]) {
      const src = this.loop(this.pink, 0.9 + side * 0.04);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
      const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 900; bp.gain.value = 3; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = 0.05;
      const pan = ctx.createStereoPanner(); pan.pan.value = side * 0.6;
      src.connect(lp).connect(bp).connect(g).connect(pan).connect(this.out);
      this.windNodes.push({ lp, g, side });
    }
    // low air rumble of the open valley
    const rumble = this.loop(this.brown, 0.5);
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 120;
    const rg = ctx.createGain(); rg.gain.value = 0.05;
    rumble.connect(rlp).connect(rg).connect(this.out);
  }

  buildTrees() {
    const ctx = this.ctx;
    this.leafNodes = [];
    const spots = TREES.filter((t) => Math.hypot(t.x, t.z) < 40).map((t) => ({ x: t.x, z: t.z, y: t.h * 0.65, kind: t.kind, r: t.r }));
    spots.push({ x: -40, z: -92, y: 12, kind: 'cotton', r: 30 });
    for (const s of spots) {
      const e = this.emitter(s.x, s.y + this.world.T.heightAt(s.x, s.z), s.z, { ref: s.kind === 'cotton' ? 25 : 5 });
      const src = this.loop(this.white, rand(0.9, 1.1));
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = s.kind === 'spruce' ? 900 : 1500;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.6;
      bp.frequency.value = s.kind === 'spruce' ? 2000 : s.kind === 'birch' ? 4800 : s.kind === 'cotton' ? 3600 : 3800;
      const amp = ctx.createGain(); amp.gain.value = 0;
      // patter: a slow noise drives the gain at audio rate, so leaves clatter rather than hiss
      const mod = this.loop(this.white, 0.02 + Math.random() * 0.01);
      const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = s.kind === 'spruce' ? 3 : 14;
      const depth = ctx.createGain(); depth.gain.value = 0;
      mod.connect(mlp).connect(depth).connect(amp.gain);
      src.connect(hp).connect(bp).connect(amp).connect(e.input);
      this.leafNodes.push({ amp, depth, kind: s.kind, base: s.kind === 'cotton' ? 0.08 : s.kind === 'spruce' ? 0.035 : 0.05 });
    }
  }

  buildSprinklers() {
    const ctx = this.ctx;
    this.heads = new Map();
    const water = this.world.water;
    for (const h of water.heads.filter((h) => h.kind === 'lawn')) {
      const e = this.emitter(h.x, h.y, h.z, { ref: 2.2 });
      // the jet itself
      const src = this.loop(this.white, 1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6500; bp.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(bp).connect(g).connect(e.input);
      // where it lands: rain on grass, sweeping around with the head
      const land = this.emitter(h.x, h.y, h.z, { ref: 3 });
      const rs = this.loop(this.white, 1);
      const rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 1800;
      const ramp = ctx.createGain(); ramp.gain.value = 0.0;
      const mod = this.loop(this.white, 0.08);
      const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 40;
      const md = ctx.createGain(); md.gain.value = 0.22;
      mod.connect(mlp).connect(md).connect(ramp.gain);
      const rg = ctx.createGain(); rg.gain.value = 0.42;
      rs.connect(rhp).connect(ramp).connect(rg).connect(land.input);
      this.heads.set(h, { e, land, h });
    }
    water.on((type, h) => {
      const rec = this.heads.get(h);
      if (rec) this.sprinklerHit(rec.e, type);
    });
  }

  sprinklerHit(e, type) {
    const ctx = this.ctx, t = ctx.currentTime + 0.005;
    const click = (gain, f, q, dur) => {
      const s = ctx.createBufferSource(); s.buffer = this.white; s.playbackRate.value = rand(0.9, 1.1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      s.connect(bp).connect(g).connect(e.input);
      s.start(t, Math.random() * 2); s.stop(t + dur + 0.02);
    };
    if (type === 'tick') {
      click(0.9, rand(3000, 3800), 3.5, 0.03);
      click(0.5, rand(1300, 1600), 4, 0.05);
      click(0.35, 5600, 0.7, 0.16);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = rand(2300, 2500);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      o.connect(og).connect(e.input); o.start(t); o.stop(t + 0.08);
    } else if (type === 'rattle') {
      click(0.45, rand(3200, 4200), 3, 0.022);
      click(0.18, 5800, 0.8, 0.05);
    } else if (type === 'turn') {
      click(0.6, 2200, 3, 0.05);
    }
  }

  buildDitch() {
    // irrigation water in the ditch along the road; the sound follows to the nearest point
    const ctx = this.ctx;
    this.ditch = this.emitter(30, -1, 0, { ref: 2.5 });
    const src = this.loop(this.white, 1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp).connect(g).connect(this.ditch.input);
    this.ditchBubbles = 0;
  }

  bubble(e, f0, gain) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator(); o.type = 'sine';
    const dur = rand(0.025, 0.06);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * rand(1.4, 2.2), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0003, t + dur);
    o.connect(g).connect(e.input); o.start(t); o.stop(t + dur + 0.01);
  }

  buildFieldLine() {
    const ctx = this.ctx;
    this.fieldEm = [];
    for (const z of [-110, -10, 90]) {
      const e = this.emitter(WHEEL_LINE.x, this.world.T.heightAt(WHEEL_LINE.x, z) + 1.4, z, { ref: 14 });
      const src = this.loop(this.white, 1);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.035;
      src.connect(bp).connect(g).connect(e.input);
      this.fieldEm.push(e);
    }
  }

  // ---------- voices ----------
  // notes: [startHz, endHz, seconds, gapAfter, {vib, vibRate, harm, curve}]
  sing(e, notes, { gain = 0.3, wave = 'sine', breath = 0, pitch = 1 } = {}) {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.02;
    for (const [f0, f1, dur, gap, o = {}] of notes) {
      const osc = ctx.createOscillator(); osc.type = o.wave || wave;
      osc.frequency.setValueAtTime(f0 * pitch, t);
      if (o.curve === 'exp') osc.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dur);
      else osc.frequency.linearRampToValueAtTime(f1 * pitch, t + dur);
      let vib = null;
      if (o.vib) {
        vib = ctx.createOscillator(); vib.frequency.value = o.vibRate || 30;
        const vg = ctx.createGain(); vg.gain.value = o.vib * pitch;
        vib.connect(vg).connect(osc.frequency); vib.start(t); vib.stop(t + dur + 0.05);
      }
      const g = ctx.createGain();
      const a = Math.min(0.012, dur * 0.25), r = Math.min(0.03, dur * 0.35);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain * (o.amp || 1), t + a);
      g.gain.setValueAtTime(gain * (o.amp || 1), t + dur - r);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g).connect(e.input);
      if (o.harm) {
        const h2 = ctx.createOscillator(); h2.type = 'sine';
        h2.frequency.setValueAtTime(f0 * 2 * pitch, t); h2.frequency.linearRampToValueAtTime(f1 * 2 * pitch, t + dur);
        const hg = ctx.createGain(); hg.gain.value = o.harm;
        h2.connect(hg).connect(g); h2.start(t); h2.stop(t + dur + 0.02);
      }
      if (breath) {
        const n = ctx.createBufferSource(); n.buffer = this.white;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * pitch; bp.Q.value = 3;
        const ng = ctx.createGain(); ng.gain.value = breath;
        n.connect(bp).connect(ng).connect(g); n.start(t, Math.random()); n.stop(t + dur + 0.02);
      }
      osc.start(t); osc.stop(t + dur + 0.02);
      t += dur + gap;
    }
    return t - ctx.currentTime;
  }

  meadowlark(e) {
    const p = rand(0.94, 1.06);
    const songs = [
      [[2050, 2000, 0.2, 0.06], [2900, 2750, 0.13, 0.03], [2500, 1700, 0.12, 0.05], [3300, 2600, 0.05, 0.01, { vib: 160, vibRate: 45 }], [2600, 3400, 0.05, 0.01, { vib: 120, vibRate: 50 }], [3100, 2300, 0.06, 0.01, { vib: 200, vibRate: 40 }], [2400, 2900, 0.05, 0.02], [2100, 1600, 0.16, 0]],
      [[2700, 2650, 0.16, 0.05], [2200, 2150, 0.18, 0.04], [3000, 2400, 0.07, 0.01, { vib: 180, vibRate: 42 }], [2500, 3200, 0.06, 0.01, { vib: 150, vibRate: 48 }], [2900, 2200, 0.08, 0.02, { vib: 120, vibRate: 40 }], [1900, 1500, 0.2, 0]],
      [[2400, 2300, 0.22, 0.05], [3100, 2900, 0.1, 0.04], [2800, 2000, 0.09, 0.02], [3200, 2500, 0.05, 0.01, { vib: 220, vibRate: 46 }], [2300, 3000, 0.05, 0.01, { vib: 200, vibRate: 44 }], [2700, 1900, 0.14, 0]],
    ];
    return this.sing(e, pick(songs), { gain: 0.22, pitch: p, breath: 0.15 });
  }

  robin(e) {
    const p = rand(0.95, 1.05);
    const phrase = () => {
      const n = [];
      const k = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < k; i++) {
        const base = rand(2200, 2900);
        n.push([base, base * rand(1.12, 1.25), 0.07, 0.0, { harm: 0.08 }]);
        n.push([base * 1.2, base * rand(0.85, 0.95), 0.09, rand(0.08, 0.14), { harm: 0.08 }]);
      }
      n[n.length - 1][3] = rand(0.4, 0.7);
      return n;
    };
    let notes = [];
    const phrases = 2 + ((Math.random() * 4) | 0);
    for (let i = 0; i < phrases; i++) notes = notes.concat(phrase());
    return this.sing(e, notes, { gain: 0.16, pitch: p });
  }

  dove(e) {
    const p = rand(0.96, 1.04);
    return this.sing(e, [
      [480, 560, 0.28, 0.0, { curve: 'exp' }], [560, 470, 0.42, 0.35], [470, 450, 0.42, 0.22], [470, 445, 0.42, 0.22], [465, 440, 0.45, 0],
    ], { gain: 0.24, pitch: p, breath: 0.6 });
  }

  magpie(e) {
    const ctx = this.ctx;
    const n = 5 + ((Math.random() * 5) | 0);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(2300, 2800); bp.Q.value = 2.5;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = rand(1250, 1450);
      const og = ctx.createGain(); og.gain.value = 0.06;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      s.connect(bp).connect(g); o.connect(og).connect(g); g.connect(e.input);
      s.start(t, Math.random()); s.stop(t + 0.08); o.start(t); o.stop(t + 0.08);
      t += rand(0.1, 0.13);
    }
    return t - ctx.currentTime;
  }

  sparrow(e) {
    const notes = [];
    const k = 2 + ((Math.random() * 5) | 0);
    for (let i = 0; i < k; i++) {
      const f = rand(2800, 3600);
      notes.push([f, f * rand(0.7, 0.8), rand(0.05, 0.08), rand(0.08, 0.25), { harm: 0.2 }]);
    }
    return this.sing(e, notes, { gain: 0.1 });
  }

  blackbird(e) {
    return this.sing(e, [
      [1500, 1700, 0.07, 0.03, { harm: 0.3 }], [2300, 2600, 0.08, 0.02, { harm: 0.2 }],
      [3600, 3300, 0.85, 0, { vib: 300, vibRate: 34, harm: 0.15 }],
    ], { gain: 0.16, pitch: rand(0.96, 1.04), breath: 0.2 });
  }

  killdeer(e) {
    return this.sing(e, [[3300, 3900, 0.12, 0.04], [3800, 3100, 0.2, rand(0.6, 1.2)], [3300, 3900, 0.12, 0.04], [3800, 3100, 0.2, 0]], { gain: 0.14 });
  }

  moo(e) {
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const dur = rand(1.1, 1.8);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = rand(95, 125);
    o.frequency.setValueAtTime(f * 0.9, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + dur * 0.35); o.frequency.linearRampToValueAtTime(f * 0.95, t + dur);
    const v = ctx.createOscillator(); v.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 2.5;
    v.connect(vg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.setValueAtTime(400, t); f1.frequency.linearRampToValueAtTime(750, t + dur * 0.4); f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.25); g.gain.setValueAtTime(0.6, t + dur - 0.35); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(e.input);
    o.start(t); o.stop(t + dur + 0.05); v.start(t); v.stop(t + dur + 0.05);
    return dur;
  }

  bark(e) {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.02;
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = rand(380, 460);
      o.frequency.setValueAtTime(f * 0.8, t); o.frequency.linearRampToValueAtTime(f, t + 0.04); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.16);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(bp); s.connect(bp); bp.connect(g).connect(e.input);
      o.start(t); o.stop(t + 0.2); s.start(t, Math.random()); s.stop(t + 0.2);
      t += rand(0.28, 0.45);
    }
    return t - ctx.currentTime;
  }

  snort(e, gain = 0.5) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const dur = rand(0.35, 0.6);
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const res = ctx.createBiquadFilter(); res.type = 'peaking'; res.frequency.value = 280; res.gain.value = 12; res.Q.value = 3;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const flut = ctx.createOscillator(); flut.type = 'square'; flut.frequency.value = rand(22, 32);
    const fg = ctx.createGain(); fg.gain.value = 0.5;
    flut.connect(fg).connect(am.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.exponentialRampToValueAtTime(0.002, t + dur);
    s.connect(lp).connect(res).connect(am).connect(g).connect(e.input);
    s.start(t, Math.random()); s.stop(t + dur + 0.05); flut.start(t); flut.stop(t + dur + 0.05);
  }

  nicker(e) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const dur = rand(0.7, 1.1);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(100, 120), t); o.frequency.linearRampToValueAtTime(rand(80, 95), t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(14, t); lfo.frequency.linearRampToValueAtTime(9, t + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp).connect(am).connect(g).connect(e.input);
    o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  chew(e) {
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.01;
    for (let i = 0; i < 4; i++) {
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(1200, 2200); bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      s.connect(bp).connect(g).connect(e.input); s.start(t, Math.random()); s.stop(t + 0.14);
      t += rand(0.5, 0.75);
    }
  }

  // ---------- who lives where ----------
  scheduleLife() {
    const T = this.world.T;
    const H = (x, z) => T.heightAt(x, z);
    const fencePosts = [[-92, 10], [-70, -18], [-92, 40], [-60, 50], [-24, -30], [31, -40], [29.5, -14], [26, 40], [-150, 0], [-120, -42]];
    const treeTops = TREES.map((t) => [t.x, t.z, t.h * 0.8]);
    const wires = [[18, -60], [21, 30], [15, 70]];
    const P = (x, z, up) => [x, H(x, z) + up, z];
    this.voices = [
      { fn: 'meadowlark', spots: fencePosts.map(([x, z]) => P(x, z, 1.5)), every: [7, 16], ref: 10, count: 3 },
      { fn: 'robin', spots: treeTops.slice(0, 7).map(([x, z, h]) => P(x, z, h)), every: [10, 24], ref: 6, count: 2 },
      { fn: 'dove', spots: wires.map(([x, z]) => P(x, z, 9.5)).concat(treeTops.slice(2, 5).map(([x, z, h]) => P(x, z, h))), every: [16, 34], ref: 6, count: 1 },
      { fn: 'magpie', spots: [P(-30, -60, 8), P(40, -40, 3), P(-60, 30, 2), P(10, -18, 13)], every: [26, 60], ref: 9, count: 1 },
      { fn: 'sparrow', spots: [P(-7, -23, 6.4), P(2, -28, 5.2), P(-17, -18.3, 5), P(-10, 13.9, 3.2)], every: [3, 9], ref: 3, count: 2 },
      { fn: 'blackbird', spots: [P(roadX(-20) + 6.6, -20, 1.2), P(roadX(40) + 6.6, 40, 1.2), P(roadX(90) + 6.6, 90, 1.2)], every: [12, 26], ref: 7, count: 1 },
      { fn: 'killdeer', spots: [P(120, -60, 1), P(160, 60, 1), P(-170, 70, 1)], every: [40, 90], ref: 12, count: 1 },
      { fn: 'moo', spots: [P(420, 520, 2), P(-620, 380, 2), P(700, -300, 2), P(-300, -700, 2)], every: [28, 75], ref: 70, count: 1 },
      { fn: 'bark', spots: [P(380, -260, 1), P(-420, 220, 1), P(260, 420, 1)], every: [60, 140], ref: 40, count: 1 },
    ];
    for (const v of this.voices) {
      v.ems = [];
      for (let i = 0; i < v.count; i++) {
        const spot = pick(v.spots);
        v.ems.push({ e: this.emitter(...spot, { ref: v.ref }), next: rand(1, v.every[1] * 0.6) });
      }
    }
    // a neighbor mowing, off to the south across the fields
    this.mower = this.makeMower();
  }

  makeMower() {
    const ctx = this.ctx;
    const e = this.emitter(260, 4, 330, { ref: 30 });
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 27;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 54.3;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0;
    const o2g = ctx.createGain(); o2g.gain.value = 0.3;
    o.connect(shaper); o2.connect(o2g).connect(shaper);
    shaper.connect(lp).connect(g).connect(e.input);
    const whir = this.loop(this.white, 1);
    const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 220; wbp.Q.value = 1.5;
    const wg = ctx.createGain(); wg.gain.value = 0.25;
    whir.connect(wbp).connect(wg).connect(g);
    o.start(); o2.start();
    return { e, o, o2, g, t: 0, on: true, until: rand(60, 140), x: 230, z: 320, dir: 1 };
  }

  // ---------- per frame ----------
  update(dt, cam, player) {
    if (!this.started) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const L = ctx.listener;
    const fx = -Math.sin(cam.yaw) * Math.cos(cam.pitch), fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * Math.cos(cam.pitch);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.x, now, 0.02); L.positionY.setTargetAtTime(cam.y, now, 0.02); L.positionZ.setTargetAtTime(cam.z, now, 0.02);
      L.forwardX.setTargetAtTime(fx, now, 0.02); L.forwardY.setTargetAtTime(fy, now, 0.02); L.forwardZ.setTargetAtTime(fz, now, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.x, cam.y, cam.z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    this.listener = cam;

    // air soaks up the highs over distance
    for (const e of this.emitters) {
      if (!e.air) continue;
      const d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z);
      e.lp.frequency.setTargetAtTime(Math.max(500, 18000 * Math.exp(-d / 260)), now, 0.1);
    }

    // gusts drive the wind bed, the leaves, and (through WIND.uGust) everything you see moving
    const g = this.gust;
    for (const w of this.windNodes) {
      w.lp.frequency.setTargetAtTime(260 + g * 520, now, 0.3);
      w.g.gain.setTargetAtTime(0.03 + g * g * 0.09, now, 0.3);
    }
    for (const l of this.leafNodes) {
      const k = Math.max(0, g - 0.25);
      l.amp.gain.setTargetAtTime(l.base * k * 0.6, now, 0.25);
      l.depth.gain.setTargetAtTime(l.base * k * 1.6, now, 0.25);
    }

    // sprinkler water lands where the jet points
    for (const rec of this.heads.values()) {
      const h = rec.h;
      const d = rec.h.v * 0.8;
      const lx = h.x + Math.cos(h.ang) * d * 0.75, lz = h.z - Math.sin(h.ang) * d * 0.75;
      rec.land.set(lx, this.world.T.heightAt(lx, lz) + 0.1, lz);
    }

    // the ditch: nearest point along the road's east side
    {
      const z = Math.max(-150, Math.min(150, cam.z));
      const x = roadX(z) + ROAD_WIDTH / 2 + 3.3;
      this.ditch.set(x, this.world.T.heightAt(x, z) + 0.2, z);
      const dd = Math.hypot(x - cam.x, z - cam.z);
      this.ditchBubbles -= dt;
      if (this.ditchBubbles <= 0 && dd < 40) {
        this.bubble(this.ditch, rand(320, 900), rand(0.04, 0.12));
        this.ditchBubbles = rand(0.03, 0.16);
      }
    }
    // the wheel line ticks too, far off
    if (Math.random() < dt * 3.5) {
      const e = pick(this.fieldEm);
      this.sprinklerHit(e, Math.random() < 0.85 ? 'tick' : 'rattle');
    }

    // birds and everything else on their own clocks
    for (const v of this.voices) {
      for (const s of v.ems) {
        s.next -= dt;
        if (s.next > 0) continue;
        const spot = Math.random() < 0.35 ? pick(v.spots) : [s.e.x, s.e.y, s.e.z];
        s.e.set(...spot);
        const dur = this[v.fn](s.e) || 1;
        s.next = dur + rand(v.every[0], v.every[1]);
      }
    }

    // swallows chatter as they pass; now and then a fly comes by
    this.swallowT = (this.swallowT ?? 3) - dt;
    if (this.swallowT <= 0 && this.world.life) {
      const near = this.world.life.birdPositions().filter((b) => Math.hypot(b[0] - cam.x, b[2] - cam.z) < 35);
      if (near.length) {
        if (!this.swallowEm) this.swallowEm = this.emitter(0, 0, 0, { ref: 4 });
        this.swallowEm.set(...pick(near));
        this.twitter(this.swallowEm);
      }
      this.swallowT = rand(1.5, 5);
    }
    this.flyT = (this.flyT ?? rand(8, 20)) - dt;
    if (this.flyT <= 0) { this.flyBy(cam); this.flyT = rand(14, 40); }
    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const a = f.a0 + f.t * f.w;
      const r = f.r + Math.sin(f.t * 3.1) * 0.25;
      f.e.set(cam.x + Math.cos(a) * r, cam.y - 0.2 + Math.sin(f.t * 4.7) * 0.25, cam.z + Math.sin(a) * r);
      if (f.t > f.dur) this.fly = null;
    }

    // the mower crawls back and forth
    const m = this.mower;
    m.until -= dt;
    if (m.until <= 0) { m.on = !m.on; m.until = m.on ? rand(70, 160) : rand(20, 50); }
    m.x += m.dir * dt * 1.1;
    if (Math.abs(m.x - 240) > 30) { m.dir *= -1; m.o.frequency.setTargetAtTime(22, now, 0.3); m.o.frequency.setTargetAtTime(27, now + 0.8, 0.4); }
    m.e.set(m.x, 4, m.z);
    m.g.gain.setTargetAtTime(m.on ? 0.22 + Math.sin(now * 0.7) * 0.04 : 0, now, m.on ? 1.5 : 0.6);

    // under a roof, footsteps get a little room
    const under = player && ((player.pos.x > PIT.rect[0] && player.pos.x < PIT.rect[2] && player.pos.z > PIT.rect[1] && player.pos.z < PIT.rect[3]) ||
      (player.pos.x > SHOP.leanTo[0] && player.pos.x < SHOP.leanTo[2] && player.pos.z > SHOP.leanTo[1] && player.pos.z < SHOP.leanTo[3]));
    this.roomSend.gain.setTargetAtTime(under ? 0.5 : 0.0, now, 0.2);
  }

  step(cls, speed) {
    if (!this.started) return;
    const kind = surfaceKind(cls);
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = pick(this.steps[kind]);
    s.playbackRate.value = rand(0.92, 1.08) * (speed > 2.4 ? 1.06 : 1);
    const g = ctx.createGain();
    const loud = Math.min(1.25, 0.65 + speed * 0.22);
    g.gain.value = loud * rand(0.8, 1.05) * ({ hard: 0.6, gravel: 1.5, tall: 1.2, sand: 1.25, lawn: 1.0, dirt: 1.1 }[kind] || 1);
    const pan = ctx.createStereoPanner();
    this.foot = -(this.foot || 1);
    pan.pan.value = this.foot * 0.12;
    s.connect(g).connect(pan).connect(this.stepBus);
    s.start(t);
  }

  twitter(e) {
    const notes = [];
    const k = 3 + ((Math.random() * 6) | 0);
    for (let i = 0; i < k; i++) {
      const f = rand(3600, 5600);
      notes.push([f, f * rand(0.75, 1.2), rand(0.018, 0.035), rand(0.02, 0.07), { vib: 300, vibRate: 60 }]);
    }
    return this.sing(e, notes, { gain: 0.07 });
  }

  flyBy(cam) {
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = rand(2.5, 4.5);
    const e = this.emitter(cam.x + 2, cam.y, cam.z, { ref: 0.4, air: false });
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = rand(175, 215);
    const wob = ctx.createOscillator(); wob.frequency.value = rand(6, 11);
    const wg = ctx.createGain(); wg.gain.value = 9; wob.connect(wg).connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.4); g.gain.setValueAtTime(0.045, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp).connect(g).connect(e.input);
    o.start(t); o.stop(t + dur + 0.1); wob.start(t); wob.stop(t + dur + 0.1);
    this.fly = { e, t: 0, dur, a0: Math.random() * 6.28, w: rand(1.2, 2.2) * (Math.random() < 0.5 ? -1 : 1), r: rand(0.6, 1.4) };
    setTimeout(() => { const i = this.emitters.indexOf(e); if (i >= 0) this.emitters.splice(i, 1); e.panner.disconnect(); }, (dur + 0.5) * 1000);
  }

  hoof(e) {
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.006); g.gain.exponentialRampToValueAtTime(0.002, t + 0.12);
    s.connect(lp).connect(g).connect(e.input); s.start(t, Math.random() * 3); s.stop(t + 0.15);
    const n = ctx.createBufferSource(); n.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.08, t + 0.02); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(bp).connect(ng).connect(e.input); n.start(t, Math.random()); n.stop(t + 0.2);
  }

  // horses call through here
  horse(e, what) { if (this.started) this[what](e); }

  // loudness of what's coming out right now, for testing
  level() {
    const a = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(a);
    let sum = 0, peak = 0;
    for (const v of a) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
    return { rms: 20 * Math.log10(Math.sqrt(sum / a.length) + 1e-9), peak: 20 * Math.log10(peak + 1e-9) };
  }

  setMuted(m) {
    if (!this.started) return;
    this.muted = m;
    this.out.gain.setTargetAtTime(m ? 0 : 1.55, this.ctx.currentTime, 0.2);
  }
  duck(d) {
    if (!this.started || this.muted) return;
    this.out.gain.setTargetAtTime(d ? 0.45 : 1.55, this.ctx.currentTime, 0.5);
  }
}

export { PASTURE_WEST };
