import type { MGImpl } from './shell';
import { note, sfx } from '../audio';

// C major scale steps (staff positions) from C4
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];

export const intrusa: MGImpl = (ctx, done) => {
  const { root, difficulty } = ctx;
  const rounds = 3;
  const len = 6 + Math.min(2, difficulty);
  root.innerHTML = `
    <div class="it-wrap">
      <div class="it-msg">Ouça a partitura e depois o aluno.</div>
      <div class="it-staff"><svg viewBox="0 0 600 160" class="it-svg"></svg></div>
      <div class="row gap center">
        <button class="btn primary it-score">▶ Partitura</button>
        <button class="btn accent it-student">▶ Aluno</button>
      </div>
    </div>`;
  const svg = root.querySelector('svg') as SVGSVGElement;
  const msg = root.querySelector('.it-msg') as HTMLElement;
  const bScore = root.querySelector('.it-score') as HTMLButtonElement;
  const bStud = root.querySelector('.it-student') as HTMLButtonElement;
  let r = 0;
  let mel: number[] = [];
  let wrongIdx = 0;
  let wrongNote = 0;
  let plays = 0;
  let tries = 0;
  let busy = false;
  const scores: number[] = [];
  let timers: number[] = [];

  const posY = (m: number) => {
    const step = SCALE.indexOf(m);
    return 120 - step * 9; // C4 below staff
  };

  const draw = (hi = -1, marks: Record<number, string> = {}) => {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<line x1="20" x2="580" y1="${48 + i * 18}" y2="${48 + i * 18}" stroke="#cdbfa8" stroke-width="2"/>`;
    s += `<text x="26" y="112" font-size="78" fill="#7a6a70" font-family="serif">𝄞</text>`;
    mel.forEach((m, i) => {
      const x = 110 + i * (450 / len);
      const y = posY(m) + 3;
      const col = marks[i] ?? (i === hi ? ctx.color : '#2e2433');
      if (m === 60) s += `<line x1="${x - 18}" x2="${x + 18}" y1="${y}" y2="${y}" stroke="#cdbfa8" stroke-width="2"/>`;
      s += `<g class="it-note" data-i="${i}" style="cursor:pointer">
        <rect x="${x - 22}" y="20" width="44" height="130" fill="transparent"/>
        <ellipse cx="${x}" cy="${y}" rx="11" ry="8" fill="${col}" transform="rotate(-20 ${x} ${y})"/>
        <line x1="${x + 10}" x2="${x + 10}" y1="${y}" y2="${y - 50}" stroke="${col}" stroke-width="3"/>
      </g>`;
    });
    svg.innerHTML = s;
    svg.querySelectorAll('.it-note').forEach((g) => g.addEventListener('pointerdown', () => guess(Number((g as SVGGElement).dataset.i))));
  };

  const setup = () => {
    mel = [];
    let idx = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < len; i++) {
      idx = Math.max(0, Math.min(SCALE.length - 1, idx + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]));
      mel.push(SCALE[idx]);
    }
    wrongIdx = 1 + Math.floor(Math.random() * (len - 1));
    const si = SCALE.indexOf(mel[wrongIdx]);
    let ni = si + (Math.random() < 0.5 ? -1 : 1) * (difficulty >= 2 ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2));
    ni = Math.max(0, Math.min(SCALE.length - 1, ni));
    if (ni === si) ni = si + 2 < SCALE.length ? si + 2 : si - 2;
    wrongNote = SCALE[ni];
    plays = 0;
    tries = 0;
    draw();
    msg.textContent = 'Ouça a partitura e depois o aluno. Clique na nota errada.';
    ctx.setStatus(`🎼 ${r + 1}/${rounds}`);
    ctx.setProgress(r / rounds);
  };

  const playSeq = (wrong: boolean) => {
    if (busy) return;
    busy = true;
    plays++;
    const gap = 430;
    mel.forEach((m, i) => timers.push(window.setTimeout(() => {
      note(wrong && i === wrongIdx ? wrongNote : m, 0.4, 0.4);
      draw(i);
    }, i * gap)));
    timers.push(window.setTimeout(() => { draw(); busy = false; }, mel.length * gap));
  };

  const guess = (i: number) => {
    if (busy) return;
    if (plays === 0) { msg.textContent = 'Primeiro ouça as duas versões 🙂'; return; }
    tries++;
    if (i === wrongIdx) {
      sfx.pop();
      scores.push(Math.max(20, (tries === 1 ? 100 : 45) - Math.max(0, plays - 3) * 8));
      draw(-1, { [i]: '#58b06c' });
      msg.textContent = 'Achou! O aluno tocou outra nota ali.';
      note(mel[i], 0.5, 0.4);
      next();
    } else {
      sfx.bad();
      draw(-1, { [i]: '#e05a4a' });
      if (tries >= 2) {
        scores.push(10);
        msg.textContent = 'Não era essa… a errada está em verde.';
        timers.push(window.setTimeout(() => draw(-1, { [wrongIdx]: '#58b06c' }), 300));
        next();
      } else msg.textContent = 'Não foi essa. Tente mais uma vez!';
    }
  };

  const next = () => {
    r++;
    busy = true;
    timers.push(window.setTimeout(() => { busy = false; if (r >= rounds) done(scores.reduce((a, b) => a + b, 0) / scores.length); else setup(); }, 1300));
  };

  bScore.onclick = () => playSeq(false);
  bStud.onclick = () => playSeq(true);
  setup();
  return () => timers.forEach(clearTimeout);
};
