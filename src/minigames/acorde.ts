import type { MGImpl } from './shell';
import { note, sfx } from '../audio';

const NAMES = ['Dó', 'Dó♯', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'];
const SYMS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const acorde: MGImpl = (ctx, done) => {
  const { root, difficulty } = ctx;
  const rounds = 4;
  const base = 60;
  const keys: { m: number; black: boolean; x: number }[] = [];
  let wx = 0;
  for (let m = base; m < base + 24; m++) {
    const pc = m % 12;
    if (BLACK.has(pc)) keys.push({ m, black: true, x: wx - 0.32 });
    else { keys.push({ m, black: false, x: wx }); wx++; }
  }
  const whiteCount = wx;
  root.innerHTML = `
    <div class="ac-wrap">
      <div class="ac-task"></div>
      <div class="ac-recipe"></div>
      <div class="ac-kb">
        ${keys.map((k) => `<button class="ac-key ${k.black ? 'blk' : 'wht'}" data-m="${k.m}" style="left:${(k.x / whiteCount) * 100}%;width:${(k.black ? 0.64 : 1) / whiteCount * 100}%"><span class="ac-lab"></span></button>`).join('')}
      </div>
      <div class="row gap center"><button class="btn ghost small ac-hint">💡 Mostrar contagem (-15)</button><button class="btn ghost small ac-listen">🔊 Ouvir raiz</button></div>
    </div>`;
  const task = root.querySelector('.ac-task') as HTMLElement;
  const recipe = root.querySelector('.ac-recipe') as HTMLElement;
  const keyEls = Array.from(root.querySelectorAll('.ac-key')) as HTMLElement[];
  const hintBtn = root.querySelector('.ac-hint') as HTMLElement;
  const listenBtn = root.querySelector('.ac-listen') as HTMLElement;
  let r = 0;
  let rootM = 60;
  let minor = false;
  let picked = new Set<number>();
  let mistakes = 0;
  let hinted = false;
  let tStart = 0;
  const scores: number[] = [];
  let timers: number[] = [];

  const setup = () => {
    const allowBlack = difficulty >= 2;
    do { rootM = base + Math.floor(Math.random() * 12); } while (!allowBlack && BLACK.has(rootM % 12));
    minor = Math.random() < (difficulty >= 1 ? 0.5 : 0.25);
    picked = new Set();
    mistakes = 0;
    hinted = false;
    tStart = performance.now();
    const nm = NAMES[rootM % 12] + (minor ? ' menor' : ' maior');
    task.innerHTML = `Monte o acorde de <b>${nm}</b> <span class="ac-sym">${SYMS[rootM % 12]}${minor ? 'm' : ''}</span>`;
    recipe.innerHTML = minor
      ? `Receita <b>menor</b> 😢: <span class="pill">R</span> ➜ conte <b>3</b> teclas ➜ <span class="pill">●</span> ➜ conte <b>4</b> teclas ➜ <span class="pill">●</span>`
      : `Receita <b>maior</b> 😄: <span class="pill">R</span> ➜ conte <b>4</b> teclas ➜ <span class="pill">●</span> ➜ conte <b>3</b> teclas ➜ <span class="pill">●</span>`;
    keyEls.forEach((el) => {
      const m = Number(el.dataset.m);
      el.classList.remove('sel', 'bad', 'good');
      (el.querySelector('.ac-lab') as HTMLElement).textContent = m === rootM ? 'R' : '';
      el.classList.toggle('root', m === rootM);
    });
    ctx.setStatus(`🎹 ${r + 1}/${rounds}`);
    ctx.setProgress(r / rounds);
    note(rootM, 0.6, 0.35);
  };

  const target = () => minor ? [rootM + 3, rootM + 7] : [rootM + 4, rootM + 7];

  const click = (m: number) => {
    if (m === rootM) { note(m, 0.5, 0.35); return; }
    note(m, 0.5, 0.35);
    const el = keyEls.find((e) => Number(e.dataset.m) === m)!;
    if (picked.has(m)) { picked.delete(m); el.classList.remove('sel'); return; }
    picked.add(m);
    el.classList.add('sel');
    if (picked.size === 2) {
      const t = target();
      const ok = t.every((x) => picked.has(x));
      if (ok) {
        [rootM, ...t].forEach((x, i) => timers.push(window.setTimeout(() => note(x, 0.9, 0.3), i * 70)));
        keyEls.forEach((e) => { if (t.includes(Number(e.dataset.m))) e.classList.add('good'); });
        const secs = (performance.now() - tStart) / 1000;
        scores.push(Math.max(15, 100 - mistakes * 18 - (hinted ? 15 : 0) - Math.max(0, secs - 10) * 2));
        sfx.pop();
        r++;
        timers.push(window.setTimeout(() => { if (r >= rounds) done(scores.reduce((a, b) => a + b, 0) / scores.length); else setup(); }, 1000));
      } else {
        mistakes++;
        sfx.bad();
        picked.forEach((x) => { const e = keyEls.find((k) => Number(k.dataset.m) === x)!; if (!t.includes(x)) e.classList.add('bad'); });
        timers.push(window.setTimeout(() => {
          keyEls.forEach((e) => { e.classList.remove('bad'); if (!target().includes(Number(e.dataset.m)) || true) e.classList.remove('sel'); });
          picked.clear();
        }, 650));
        if (mistakes >= 4) {
          scores.push(10);
          r++;
          timers.push(window.setTimeout(() => { if (r >= rounds) done(scores.reduce((a, b) => a + b, 0) / scores.length); else setup(); }, 900));
        }
      }
    }
  };

  keyEls.forEach((el) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); click(Number(el.dataset.m)); }));
  hintBtn.onclick = () => {
    hinted = true;
    keyEls.forEach((el) => {
      const m = Number(el.dataset.m);
      const d = m - rootM;
      if (d > 0 && d <= 7) (el.querySelector('.ac-lab') as HTMLElement).textContent = String(d);
    });
  };
  listenBtn.onclick = () => note(rootM, 0.6, 0.35);
  setup();
  return () => { timers.forEach(clearTimeout); };
};
