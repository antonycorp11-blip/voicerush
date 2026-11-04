import type { MGImpl } from './shell';
import { note, pluck, sfx } from '../audio';

const PADS = [
  { midi: 60, color: '#e8607a', label: 'Dó' },
  { midi: 62, color: '#f2a63a', label: 'Ré' },
  { midi: 64, color: '#f2c14e', label: 'Mi' },
  { midi: 67, color: '#58b06c', label: 'Sol' },
  { midi: 69, color: '#4f8fd8', label: 'Lá' },
];

export const melodia: MGImpl = (ctx, done) => {
  const { root, difficulty, instrument } = ctx;
  const lengths = difficulty >= 2 ? [3, 4, 5, 6] : [3, 4, 5];
  root.innerHTML = `
    <div class="ml-wrap">
      <div class="ml-msg">Ouça…</div>
      <div class="ml-pads">${PADS.map((p, i) => `<button class="ml-pad" data-i="${i}" style="--c:${p.color}"><span class="ml-k">${i + 1}</span><span class="ml-n">♪</span><span class="ml-l">${p.label}</span></button>`).join('')}</div>
      <div class="ml-dots"></div>
    </div>`;
  const msg = root.querySelector('.ml-msg') as HTMLElement;
  const dots = root.querySelector('.ml-dots') as HTMLElement;
  const pads = Array.from(root.querySelectorAll('.ml-pad')) as HTMLElement[];
  let round = 0;
  let seq: number[] = [];
  let pos = 0;
  let listening = false;
  let earned = 0;
  const possible = lengths.reduce((a, b) => a + b, 0);
  let timers: number[] = [];
  let alive = true;

  const play = (i: number) => {
    if (instrument && ['violao', 'guitarra', 'ukulele', 'baixo'].includes(instrument)) pluck(PADS[i].midi, 0.5, 0.4);
    else note(PADS[i].midi + 12, 0.45, 0.4);
    const el = pads[i];
    el.classList.add('lit');
    timers.push(window.setTimeout(() => el.classList.remove('lit'), 260));
  };

  const renderDots = () => {
    dots.innerHTML = seq.map((_, k) => `<span class="${k < pos ? 'ok' : ''}"></span>`).join('');
  };

  const startRound = () => {
    if (!alive) return;
    if (round >= lengths.length) { done((earned / possible) * 100); return; }
    const len = lengths[round];
    seq = [];
    for (let k = 0; k < len; k++) {
      let n = Math.floor(Math.random() * PADS.length);
      if (k > 0 && n === seq[k - 1] && Math.random() < 0.6) n = (n + 1 + Math.floor(Math.random() * 3)) % PADS.length;
      seq.push(n);
    }
    pos = 0;
    listening = false;
    msg.textContent = `Rodada ${round + 1}/${lengths.length} — ouça…`;
    ctx.setStatus(`🎵 ${round + 1}/${lengths.length}`);
    ctx.setProgress(round / lengths.length);
    renderDots();
    const gap = 620 - difficulty * 60;
    seq.forEach((n, k) => timers.push(window.setTimeout(() => play(n), 500 + k * gap)));
    timers.push(window.setTimeout(() => { listening = true; msg.textContent = 'Sua vez! Repita a melodia'; }, 500 + seq.length * gap));
  };

  const input = (i: number) => {
    if (!listening) return;
    play(i);
    if (seq[pos] === i) {
      pos++;
      renderDots();
      if (pos === seq.length) {
        listening = false;
        earned += seq.length;
        msg.textContent = 'Isso! 🎉';
        sfx.pop();
        round++;
        timers.push(window.setTimeout(startRound, 900));
      }
    } else {
      listening = false;
      earned += (pos / seq.length) * seq.length * 0.5;
      msg.textContent = 'Ops, nota errada…';
      pads[i].classList.add('wrong');
      timers.push(window.setTimeout(() => pads[i].classList.remove('wrong'), 400));
      sfx.bad();
      round++;
      timers.push(window.setTimeout(startRound, 1100));
    }
  };

  pads.forEach((p) => p.addEventListener('pointerdown', (e) => { e.preventDefault(); input(Number(p.dataset.i)); }));
  const onKey = (e: KeyboardEvent) => {
    const k = Number(e.key);
    if (k >= 1 && k <= 5) input(k - 1);
  };
  window.addEventListener('keydown', onKey);
  timers.push(window.setTimeout(startRound, 400));
  return () => { alive = false; timers.forEach(clearTimeout); window.removeEventListener('keydown', onKey); };
};
