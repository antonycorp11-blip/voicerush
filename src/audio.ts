// Tiny WebAudio synth: notes, drums, UI sounds and a soft lo-fi background loop.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicOn = true;
let sfxOn = true;
let musicTimer: number | null = null;

try {
  musicOn = localStorage.getItem('emt-music') !== '0';
  sfxOn = localStorage.getItem('emt-sfx') !== '0';
} catch { /* ignore */ }

export function audio(): AudioContext | null {
  if (!ctx) {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new AC() as AudioContext;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicOn ? 0.16 : 0;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxOn ? 0.5 : 0;
      sfxGain.connect(master);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

type Wave = OscillatorType;

export function tone(freq: number, dur = 0.4, wave: Wave = 'triangle', vol = 0.5, when = 0, dest?: AudioNode) {
  const a = audio();
  if (!a || !sfxGain) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest ?? sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Piano-ish note: triangle + soft sine octave. */
export function note(midi: number, dur = 0.6, vol = 0.45, when = 0) {
  const f = midiToFreq(midi);
  tone(f, dur, 'triangle', vol, when);
  tone(f * 2, dur * 0.6, 'sine', vol * 0.25, when);
}

/** Plucked string. */
export function pluck(midi: number, dur = 0.8, vol = 0.4, when = 0) {
  const a = audio();
  if (!a || !sfxGain) return;
  const f = midiToFreq(midi);
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const flt = a.createBiquadFilter();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(f * 6, t);
  flt.frequency.exponentialRampToValueAtTime(f * 1.2, t + dur * 0.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(flt); flt.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'highpass', when = 0) {
  const a = audio();
  if (!a || !sfxGain) return;
  const t = a.currentTime + when;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t);
}

export function drum(kind: 'kick' | 'snare' | 'hat' | 'clap', vol = 0.6, when = 0) {
  const a = audio();
  if (!a || !sfxGain) return;
  const t = a.currentTime + when;
  if (kind === 'kick') {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.3);
  } else if (kind === 'snare') {
    noise(0.16, vol * 0.6, 1500, 'highpass', when);
    tone(190, 0.1, 'triangle', vol * 0.4, when);
  } else if (kind === 'hat') {
    noise(0.05, vol * 0.35, 7000, 'highpass', when);
  } else {
    noise(0.12, vol * 0.5, 1200, 'bandpass', when);
  }
}

export const sfx = {
  click() { tone(880, 0.06, 'square', 0.08); },
  open() { tone(660, 0.08, 'triangle', 0.18); tone(990, 0.1, 'triangle', 0.15, 0.06); },
  coin() { tone(1046, 0.08, 'square', 0.1); tone(1568, 0.16, 'square', 0.1, 0.07); },
  good() { note(72, 0.2, 0.3); note(76, 0.2, 0.3, 0.08); note(79, 0.35, 0.3, 0.16); },
  bad() { tone(220, 0.25, 'sawtooth', 0.12); tone(180, 0.3, 'sawtooth', 0.1, 0.12); },
  levelUp() { [72, 76, 79, 84].forEach((n, i) => note(n, 0.35, 0.3, i * 0.09)); },
  pop() { tone(520, 0.05, 'sine', 0.2); tone(780, 0.06, 'sine', 0.15, 0.03); },
  alert() { tone(988, 0.1, 'triangle', 0.2); tone(740, 0.14, 'triangle', 0.2, 0.12); },
  build() { drum('kick', 0.4); tone(392, 0.1, 'square', 0.08, 0.05); tone(523, 0.18, 'square', 0.08, 0.12); },
};

// -------------------------------------------------------------- background loop
const PROG = [
  [53, 57, 60, 64], // Fmaj7
  [52, 55, 59, 62], // Em7
  [50, 53, 57, 60], // Dm7
  [55, 59, 62, 65], // G7
];
const MELODY = [72, 0, 74, 76, 0, 79, 76, 0, 74, 0, 72, 69, 0, 72, 0, 0];

function musicVoice(freq: number, t: number, dur: number, vol: number, wave: Wave) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1400;
  o.type = wave;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musicGain!);
  o.start(t); o.stop(t + dur + 0.1);
}

let musicStep = 0;
let nextTime = 0;
export function startMusic() {
  const a = audio();
  if (!a || musicTimer !== null) return;
  nextTime = a.currentTime + 0.1;
  const beat = 60 / 76 / 2; // eighths at 76bpm
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.4) {
      const bar = Math.floor(musicStep / 8) % 4;
      const s = musicStep % 8;
      const chord = PROG[bar];
      if (s === 0) {
        chord.forEach((n) => musicVoice(midiToFreq(n), nextTime, beat * 7.5, 0.06, 'triangle'));
        musicVoice(midiToFreq(chord[0] - 12), nextTime, beat * 3, 0.12, 'sine');
      }
      if (s === 4) musicVoice(midiToFreq(chord[0] - 12 + 7), nextTime, beat * 3, 0.09, 'sine');
      const mel = MELODY[(musicStep + bar * 3) % 16];
      if (mel && Math.random() < 0.7 && (musicStep / 32) % 2 >= 1) musicVoice(midiToFreq(mel), nextTime, beat * 1.6, 0.05, 'sine');
      // soft hat
      if (s % 2 === 1 && sfxGain) {
        // route hats into music gain via tiny noise burst
        const len = Math.floor(ctx.sampleRate * 0.03);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 8000;
        const g = ctx.createGain(); g.gain.value = 0.05;
        src.connect(hp); hp.connect(g); g.connect(musicGain!);
        src.start(nextTime);
      }
      nextTime += beat;
      musicStep++;
    }
  }, 100);
}

export function setMusic(on: boolean) {
  musicOn = on;
  try { localStorage.setItem('emt-music', on ? '1' : '0'); } catch { /* ignore */ }
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.2);
}
export function setSfx(on: boolean) {
  sfxOn = on;
  try { localStorage.setItem('emt-sfx', on ? '1' : '0'); } catch { /* ignore */ }
  if (sfxGain && ctx) sfxGain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.05);
}
export function isMusicOn() { return musicOn; }
export function isSfxOn() { return sfxOn; }
/** Duck background music while a minigame runs. */
export function duckMusic(duck: boolean) {
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(duck || !musicOn ? (musicOn ? 0.03 : 0) : 0.16, ctx.currentTime, 0.3);
}
