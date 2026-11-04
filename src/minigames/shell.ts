// Shared minigame modal shell: intro → play → result.
import type { InstrumentId, MinigameKind } from '../data/instruments';
import { INSTRUMENTS, MINIGAME_NAMES } from '../data/instruments';
import { duckMusic, sfx } from '../audio';
import { ritmo } from './ritmo';
import { melodia } from './melodia';
import { afinacao } from './afinacao';
import { acorde } from './acorde';
import { intrusa } from './intrusa';
import { papelada } from './papelada';

export interface MGContext {
  root: HTMLElement;
  difficulty: number; // 0..3
  instrument?: InstrumentId;
  color: string;
  setProgress: (t: number) => void;
  setStatus: (html: string) => void;
}
export type MGImpl = (ctx: MGContext, done: (score: number) => void) => () => void;

const IMPLS: Record<MinigameKind, MGImpl> = { ritmo, melodia, afinacao, acorde, intrusa, papelada };

export const HOWTO: Record<MinigameKind, string> = {
  ritmo: 'As notas vêm da direita. Toque <b>ESPAÇO</b> (ou clique/toque) quando cada nota passar pelo círculo. Siga o tempo!',
  melodia: 'Ouça a melodia e repita na mesma ordem clicando nos blocos (ou teclas <b>1–5</b>). As sequências vão crescendo.',
  afinacao: 'Arraste a tarraxa (ou use <b>← →</b>) até o ponteiro ficar no <b>verde</b> e segure ali. Ouça: quando afinado, o som para de "ondular".',
  acorde: 'A tecla <b>R</b> é a raiz. Siga a receita contando <b>todas as teclas</b> (pretas e brancas) e clique nas 2 notas que faltam.',
  intrusa: 'Ouça a <b>partitura</b> e depois o <b>aluno</b>. Ele errou UMA nota: clique na nota onde o som foi diferente.',
  papelada: 'Arquive cada documento na bandeja certa: <b>1</b> Pago, <b>2</b> Pendente, <b>3</b> Matrícula. Leia o carimbo!',
};

export interface MinigameOpts {
  kind: MinigameKind;
  title?: string;
  subtitle?: string;
  instrument?: InstrumentId;
  difficulty?: number;
  portrait?: string;
  allowSkip?: boolean;
}

export function pickMinigame(inst: InstrumentId): MinigameKind {
  const l = INSTRUMENTS[inst].minigames;
  return l[Math.floor(Math.random() * l.length)];
}

export function runMinigame(o: MinigameOpts): Promise<number> {
  return new Promise((resolve) => {
    const color = o.instrument ? INSTRUMENTS[o.instrument].color : '#9b6bd1';
    const ov = document.createElement('div');
    ov.className = 'mg-overlay';
    ov.innerHTML = `
      <div class="mg-card" style="--mg:${color}">
        <div class="mg-head">
          ${o.portrait ? `<img class="mg-portrait pix" src="${o.portrait}">` : ''}
          <div class="mg-titles">
            <div class="mg-kicker">${o.instrument ? INSTRUMENTS[o.instrument].emoji + ' ' + INSTRUMENTS[o.instrument].name + ' · ' : ''}${MINIGAME_NAMES[o.kind]}</div>
            <div class="mg-title">${o.title ?? MINIGAME_NAMES[o.kind]}</div>
            ${o.subtitle ? `<div class="mg-sub">${o.subtitle}</div>` : ''}
          </div>
          <div class="mg-status"></div>
        </div>
        <div class="mg-progress"><div></div></div>
        <div class="mg-body"></div>
      </div>`;
    document.body.appendChild(ov);
    duckMusic(true);
    const body = ov.querySelector('.mg-body') as HTMLElement;
    const status = ov.querySelector('.mg-status') as HTMLElement;
    const bar = ov.querySelector('.mg-progress > div') as HTMLElement;
    let cleanup: (() => void) | null = null;

    const finish = (score: number) => {
      cleanup?.();
      cleanup = null;
      score = Math.max(0, Math.min(100, Math.round(score)));
      const stars = score >= 85 ? 3 : score >= 60 ? 2 : score >= 35 ? 1 : 0;
      const msg = stars === 3 ? 'Aula incrível! 🎉' : stars === 2 ? 'Boa aula!' : stars === 1 ? 'Deu pro gasto…' : 'Foi difícil hoje 😅';
      if (stars >= 2) sfx.good(); else sfx.bad();
      body.innerHTML = `
        <div class="mg-result">
          <div class="mg-stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>
          <div class="mg-score">${score}<small>%</small></div>
          <div class="mg-msg">${msg}</div>
          <button class="btn primary big" data-k="ok">Continuar</button>
        </div>`;
      bar.style.width = '100%';
      status.innerHTML = '';
      (body.querySelector('[data-k=ok]') as HTMLElement).onclick = () => {
        sfx.click();
        ov.remove();
        duckMusic(false);
        resolve(score);
      };
    };

    body.innerHTML = `
      <div class="mg-intro">
        <div class="mg-howto">${HOWTO[o.kind]}</div>
        <div class="row gap">
          <button class="btn primary big" data-k="go">▶ Começar</button>
          ${o.allowSkip !== false ? '<button class="btn ghost" data-k="skip">Dar aula no automático</button>' : ''}
        </div>
      </div>`;
    (body.querySelector('[data-k=go]') as HTMLElement).onclick = () => {
      sfx.click();
      body.innerHTML = '';
      const ctx: MGContext = {
        root: body,
        difficulty: o.difficulty ?? 1,
        instrument: o.instrument,
        color,
        setProgress: (t) => { bar.style.width = Math.round(Math.max(0, Math.min(1, t)) * 100) + '%'; },
        setStatus: (h) => { status.innerHTML = h; },
      };
      cleanup = IMPLS[o.kind](ctx, finish);
    };
    const skip = body.querySelector('[data-k=skip]') as HTMLElement | null;
    if (skip) skip.onclick = () => { ov.remove(); duckMusic(false); resolve(-1); };
  });
}
