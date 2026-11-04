import type { MGImpl } from './shell';
import { sfx } from '../audio';
import { randomName } from '../game/state';

type Tray = 0 | 1 | 2;
interface Doc { title: string; who: string; stamp: string; stampColor: string; tray: Tray; amount?: number }

export const papelada: MGImpl = (ctx, done) => {
  const { root, difficulty } = ctx;
  const count = 10 + difficulty * 2;
  const limit = 32;
  const docs: Doc[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    const who = randomName();
    const amount = 180 + Math.floor(Math.random() * 30) * 10;
    if (r < 0.36) docs.push({ title: 'Recibo de mensalidade', who, stamp: 'PAGO', stampColor: '#3f9a52', tray: 0, amount });
    else if (r < 0.62) docs.push({ title: 'Boleto', who, stamp: Math.random() < 0.5 ? 'EM ABERTO' : 'VENCIDO', stampColor: '#d04a3a', tray: 1, amount });
    else if (r < 0.88) docs.push({ title: 'Ficha de matrícula', who, stamp: 'NOVO ALUNO', stampColor: '#3f74c9', tray: 2 });
    else if (difficulty >= 1 && Math.random() < 0.5) docs.push({ title: 'Recibo de mensalidade', who, stamp: 'ESTORNADO', stampColor: '#d08a2a', tray: 1, amount });
    else docs.push({ title: 'Ficha de matrícula', who, stamp: 'NOVO ALUNO', stampColor: '#3f74c9', tray: 2 });
  }
  root.innerHTML = `
    <div class="pp-wrap">
      <div class="pp-desk"><div class="pp-doc"></div></div>
      <div class="pp-trays">
        <button class="pp-tray" data-t="0"><b>1</b> ✅ Pago</button>
        <button class="pp-tray" data-t="1"><b>2</b> ⏳ Pendente</button>
        <button class="pp-tray" data-t="2"><b>3</b> 📝 Matrícula</button>
      </div>
    </div>`;
  const docEl = root.querySelector('.pp-doc') as HTMLElement;
  let i = 0;
  let correct = 0;
  const t0 = performance.now();
  let alive = true;
  let raf = 0;

  const show = () => {
    const d = docs[i];
    docEl.className = 'pp-doc in';
    docEl.innerHTML = `
      <div class="pp-dt">${d.title}</div>
      <div class="pp-who">Aluno(a): ${d.who}</div>
      ${d.amount ? `<div class="pp-amt">Valor: R$ ${d.amount},00</div>` : '<div class="pp-amt">Instrumento: ______  Horário: ____</div>'}
      <div class="pp-lines"><i></i><i></i><i></i></div>
      <div class="pp-stamp" style="--sc:${d.stampColor}">${d.stamp}</div>`;
    ctx.setStatus(`📄 ${i + 1}/${docs.length}`);
  };

  const choose = (t: Tray) => {
    if (!alive || i >= docs.length) return;
    const ok = docs[i].tray === t;
    if (ok) { correct++; sfx.pop(); } else sfx.bad();
    docEl.className = 'pp-doc out' + (ok ? '' : ' wrong') + ' to' + t;
    i++;
    if (i >= docs.length) { finish(); return; }
    window.setTimeout(() => alive && show(), 180);
  };

  const finish = () => {
    if (!alive) return;
    alive = false;
    const secs = (performance.now() - t0) / 1000;
    const timeBonus = Math.max(0, (limit - secs) / limit) * 15;
    done((correct / docs.length) * 90 + timeBonus);
  };

  root.querySelectorAll('.pp-tray').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); choose(Number((b as HTMLElement).dataset.t) as Tray); }));
  const onKey = (e: KeyboardEvent) => { if (e.key === '1' || e.key === '2' || e.key === '3') choose((Number(e.key) - 1) as Tray); };
  window.addEventListener('keydown', onKey);
  const tick = () => {
    if (!alive) return;
    const secs = (performance.now() - t0) / 1000;
    ctx.setProgress(secs / limit);
    if (secs >= limit) {
      // remaining docs count as wrong
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  show();
  raf = requestAnimationFrame(tick);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
};
