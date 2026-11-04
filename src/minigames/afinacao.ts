import type { MGImpl } from './shell';
import { audio, sfx, midiToFreq } from '../audio';

export const afinacao: MGImpl = (ctx, done) => {
  const { root, difficulty, instrument } = ctx;
  const strings = instrument === 'canto' ? [{ n: 'Vocalize Lá', m: 57 }, { n: 'Vocalize Dó', m: 60 }, { n: 'Vocalize Mi', m: 64 }]
    : instrument === 'violino' ? [{ n: 'Corda Sol', m: 55 }, { n: 'Corda Ré', m: 62 }, { n: 'Corda Lá', m: 69 }]
    : instrument === 'baixo' ? [{ n: 'Corda Mi', m: 40 }, { n: 'Corda Lá', m: 45 }, { n: 'Corda Ré', m: 50 }]
    : [{ n: 'Corda Mi', m: 52 }, { n: 'Corda Lá', m: 57 }, { n: 'Corda Sol', m: 55 }];
  const zone = 6 - difficulty; // cents tolerance
  root.innerHTML = `
    <div class="af-wrap">
      <div class="af-name"></div>
      <svg class="af-gauge" viewBox="0 0 300 170">
        <path d="M30 150 A120 120 0 0 1 270 150" fill="none" stroke="#eee3d0" stroke-width="22" stroke-linecap="round"/>
        <path class="af-green" d="" fill="none" stroke="#7fd08a" stroke-width="22"/>
        <text x="30" y="168" font-size="18" fill="#9a8e80" text-anchor="middle">♭</text>
        <text x="270" y="168" font-size="18" fill="#9a8e80" text-anchor="middle">♯</text>
        <circle class="af-hold" cx="150" cy="150" r="20" fill="none" stroke="#58b06c" stroke-width="5" stroke-dasharray="0 200" transform="rotate(-90 150 150)"/>
        <line class="af-needle" x1="150" y1="150" x2="150" y2="40" stroke="#2e2433" stroke-width="5" stroke-linecap="round"/>
        <circle cx="150" cy="150" r="9" fill="#2e2433"/>
      </svg>
      <div class="af-peg">
        <span>🔧 Tarraxa</span>
        <input type="range" min="-60" max="60" step="0.5" value="0" class="af-range">
      </div>
      <div class="af-hint">Segure no verde!</div>
    </div>`;
  const nameEl = root.querySelector('.af-name') as HTMLElement;
  const needle = root.querySelector('.af-needle') as SVGLineElement;
  const holdC = root.querySelector('.af-hold') as SVGCircleElement;
  const green = root.querySelector('.af-green') as SVGPathElement;
  const range = root.querySelector('.af-range') as HTMLInputElement;
  const hint = root.querySelector('.af-hint') as HTMLElement;
  // green arc
  const ang = (c: number) => (-90 + (c / 50) * 80) * (Math.PI / 180);
  const pt = (c: number, r = 120) => `${150 + Math.sin(ang(c) + Math.PI / 2 - Math.PI / 2) * 0}`;
  void pt;
  const arcPt = (c: number) => { const a = ang(c); return [150 + Math.cos(a) * 120, 150 + Math.sin(a) * 120]; };
  const [gx0, gy0] = arcPt(-zone), [gx1, gy1] = arcPt(zone);
  green.setAttribute('d', `M${gx0} ${gy0} A120 120 0 0 1 ${gx1} ${gy1}`);

  const a = audio();
  let osc: OscillatorNode | null = null, ref: OscillatorNode | null = null, gain: GainNode | null = null;
  if (a) {
    gain = a.createGain();
    gain.gain.value = 0;
    gain.connect(a.destination);
    osc = a.createOscillator(); osc.type = 'sawtooth';
    ref = a.createOscillator(); ref.type = 'sine';
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const rg = a.createGain(); rg.gain.value = 0.6;
    osc.connect(lp); lp.connect(gain);
    ref.connect(rg); rg.connect(gain);
    osc.start(); ref.start();
  }

  let idx = 0;
  let target = 0;
  let tStart = 0;
  let hold = 0;
  let scores: number[] = [];
  let raf = 0;
  let last = performance.now();
  let alive = true;
  let shown = 0;

  const setup = () => {
    const s = strings[idx];
    nameEl.innerHTML = `${s.n} <small>(${idx + 1}/${strings.length})</small>`;
    target = (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 30);
    range.value = '0';
    tStart = performance.now();
    hold = 0;
    shown = -target;
    if (a && ref && osc) {
      ref.frequency.setValueAtTime(midiToFreq(s.m), a.currentTime);
    }
    ctx.setStatus(`🎻 ${idx + 1}/${strings.length}`);
  };

  const dev = () => Number(range.value) - target;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { range.value = String(Number(range.value) - (e.shiftKey ? 3 : 1)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { range.value = String(Number(range.value) + (e.shiftKey ? 3 : 1)); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);

  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const d = dev();
    shown += (d - shown) * Math.min(1, dt * 10);
    const jitter = (Math.random() - 0.5) * (1.5 + difficulty);
    const c = Math.max(-50, Math.min(50, shown + jitter));
    needle.setAttribute('transform', `rotate(${(c / 50) * 80} 150 150)`);
    if (a && osc && gain) {
      const s = strings[idx];
      osc.frequency.setTargetAtTime(midiToFreq(s.m) * Math.pow(2, d / 1200), a.currentTime, 0.03);
      gain.gain.setTargetAtTime(0.09, a.currentTime, 0.1);
    }
    if (Math.abs(d) <= zone) { hold += dt; hint.textContent = 'Isso! Segure…'; hint.className = 'af-hint ok'; }
    else { hold = Math.max(0, hold - dt * 2); hint.textContent = d < 0 ? 'Muito grave — aperte a tarraxa (→)' : 'Muito agudo — afrouxe (←)'; hint.className = 'af-hint'; }
    holdC.setAttribute('stroke-dasharray', `${(hold / 1.2) * 126} 200`);
    const el = (now - tStart) / 1000;
    ctx.setProgress((idx + Math.min(1, el / 15)) / strings.length);
    if (hold >= 1.2 || el > 15) {
      const sc = hold >= 1.2 ? Math.max(35, Math.min(100, 112 - el * 6)) : 10;
      scores.push(sc);
      if (hold >= 1.2) sfx.pop(); else sfx.bad();
      idx++;
      if (idx >= strings.length) { done(scores.reduce((x, y) => x + y, 0) / scores.length); return; }
      setup();
    }
    raf = requestAnimationFrame(loop);
  };
  setup();
  raf = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    try { if (gain && a) gain.gain.setTargetAtTime(0, a.currentTime, 0.05); osc?.stop(a!.currentTime + 0.2); ref?.stop(a!.currentTime + 0.2); } catch { /* ignore */ }
  };
};
