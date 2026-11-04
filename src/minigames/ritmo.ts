import type { MGImpl } from './shell';
import { drum, pluck, note, audio } from '../audio';

export const ritmo: MGImpl = (ctx, done) => {
  const { root, difficulty, instrument, color } = ctx;
  const bpm = 84 + difficulty * 12;
  const beat = 60 / bpm;
  // pattern: 4 bars x 8 eighths
  const hits: number[] = [];
  const pOff = 0.12 + difficulty * 0.1;
  for (let i = 0; i < 32; i++) {
    const onBeat = i % 2 === 0;
    const strong = i % 8 === 0;
    if (strong || (onBeat && Math.random() < 0.72) || (!onBeat && Math.random() < pOff)) hits.push(i);
  }
  const lead = 4; // count-in beats
  const notes = hits.map((i) => ({ t: (lead + i / 2) * beat, state: 0 as 0 | 1 | 2, grade: '' }));
  const total = (lead + 16 + 1) * beat;

  root.innerHTML = `
    <div class="rt-wrap">
      <canvas class="rt-canvas" width="720" height="200"></canvas>
      <div class="rt-feedback"></div>
      <button class="btn primary big rt-tap">TOCAR (espaço)</button>
    </div>`;
  const cv = root.querySelector('canvas') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const fb = root.querySelector('.rt-feedback') as HTMLElement;
  const tapBtn = root.querySelector('.rt-tap') as HTMLElement;
  const a = audio();
  const t0 = (a ? a.currentTime : performance.now() / 1000) + 0.3;
  const now = () => (a ? a.currentTime : performance.now() / 1000) - t0;
  let points = 0;
  let extra = 0;
  let combo = 0;
  let raf = 0;
  let ended = false;
  let lastBeat = -1;
  const HIT_X = 110;
  const SPEED = 230; // px per second

  const sound = () => {
    if (instrument === 'bateria') drum(Math.random() < 0.5 ? 'snare' : 'kick', 0.6);
    else if (instrument === 'piano') note(64 + [0, 3, 5, 7][Math.floor(Math.random() * 4)], 0.3, 0.35);
    else pluck(52 + [0, 7, 12][Math.floor(Math.random() * 3)], 0.4, 0.35);
  };

  const press = () => {
    if (ended) return;
    const t = now();
    let best = -1, bd = 9;
    notes.forEach((n, i) => { if (n.state === 0) { const d = Math.abs(n.t - t); if (d < bd) { bd = d; best = i; } } });
    if (best >= 0 && bd < 0.17) {
      const n = notes[best];
      n.state = 1;
      sound();
      if (bd < 0.06) { points += 1; n.grade = 'Perfeito!'; combo++; }
      else if (bd < 0.11) { points += 0.7; n.grade = 'Bom'; combo++; }
      else { points += 0.4; n.grade = 'Ok'; combo = 0; }
      fb.textContent = n.grade + (combo > 3 ? `  ×${combo}` : '');
      fb.className = 'rt-feedback show ' + (bd < 0.06 ? 'perfect' : 'good');
    } else {
      extra++;
      combo = 0;
      fb.textContent = 'Fora do tempo';
      fb.className = 'rt-feedback show miss';
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter' || /^Key[A-Z]$/.test(e.code)) { e.preventDefault(); press(); }
  };
  window.addEventListener('keydown', onKey);
  tapBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });

  const frame = () => {
    const t = now();
    // metronome
    const b = Math.floor(t / beat);
    if (b !== lastBeat && b >= 0 && t < total - beat) {
      lastBeat = b;
      drum('hat', b < lead ? 0.9 : 0.35);
      if (b < lead) ctx.setStatus(`<b>${lead - b}</b>`);
      else ctx.setStatus(`♪ ${notes.filter((n) => n.state === 1).length}/${notes.length}`);
    }
    for (const n of notes) if (n.state === 0 && t - n.t > 0.17) { n.state = 2; combo = 0; fb.textContent = 'Errou!'; fb.className = 'rt-feedback show miss'; }
    ctx.setProgress(t / total);
    // draw
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fbf6ec';
    g.fillRect(0, 0, cv.width, cv.height);
    // staff lines
    g.strokeStyle = '#e6dccb';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 60 + i * 20); g.lineTo(cv.width, 60 + i * 20); g.stroke(); }
    // beat lines
    for (let k = 0; k < 40; k++) {
      const bt = k * beat;
      const x = HIT_X + (bt - t) * SPEED;
      if (x < -10 || x > cv.width + 10) continue;
      g.strokeStyle = k % 4 === 0 ? '#d4c6ae' : '#ece3d3';
      g.beginPath(); g.moveTo(x, 50); g.lineTo(x, 150); g.stroke();
    }
    // hit circle
    const pulse = 1 + Math.max(0, 1 - ((t / beat) % 1) * 4) * 0.12;
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.beginPath(); g.arc(HIT_X, 100, 30 * pulse, 0, Math.PI * 2); g.stroke();
    g.fillStyle = color + '22';
    g.fill();
    // notes
    for (const n of notes) {
      const x = HIT_X + (n.t - t) * SPEED;
      if (x < -40 || x > cv.width + 40) continue;
      if (n.state === 1) {
        g.globalAlpha = Math.max(0, 1 - (t - n.t) * 3);
        g.fillStyle = '#ffd65a';
        g.beginPath(); g.arc(HIT_X, 100, 36 + (t - n.t) * 60, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        continue;
      }
      g.fillStyle = n.state === 2 ? '#c9bfb0' : '#2e2433';
      g.beginPath(); g.ellipse(x, 104, 16, 12, -0.4, 0, Math.PI * 2); g.fill();
      g.fillRect(x + 12, 46, 5, 58);
      if (n.state === 0) { g.fillStyle = color; g.beginPath(); g.ellipse(x - 3, 101, 6, 4, -0.4, 0, Math.PI * 2); g.fill(); }
    }
    if (t >= total) {
      ended = true;
      const score = (points / notes.length) * 100 - extra * 2.5;
      done(score);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { ended = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
};
