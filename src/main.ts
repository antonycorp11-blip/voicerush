import './style.css';
import { Scene, SceneModel } from './game/scene';
import { makeLayout } from './game/layout';
import { Game, BOSS_LOOK } from './game/game';
import { UI } from './ui/ui';
import { newGame, loadGame, saveGame, GameState } from './game/state';
import { Look, randomLook, charSprite, SKINS, HAIRS, SHIRTS, PANTS } from './art/characters';
import { INSTRUMENTS, INSTRUMENT_IDS, InstrumentId } from './data/instruments';
import { audio, startMusic, sfx } from './audio';
import { randomLook as rl } from './art/characters';

const canvas = document.getElementById('world') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const scene = new Scene(canvas);
let game: Game | null = null;
let ui: UI | null = null;

function resize() { scene.resize(); }
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ demo backdrop (title screen)
const ALL = ['cadeiras', 'som', 'clima', 'luz', 'estante', 'plantas', 'sofa', 'tv'];
// an organically grown school for the title screen
const DEMO: { side: 'top' | 'bottom'; col: number; w: number; h: number; type: any; decor: number; equip?: any; items: string[]; walls: number }[] = [
  { side: 'bottom', col: 30, w: 8, h: 7, type: 'reception', decor: 4, items: ALL, walls: 1 },
  { side: 'bottom', col: 38, w: 9, h: 7, type: 'classroom', decor: 2, equip: { violao: 1, guitarra: 1, ukulele: 0 }, items: ['cadeiras', 'som', 'plantas'], walls: 1 },
  { side: 'bottom', col: 47, w: 5, h: 7, type: 'booth', decor: 3, items: ALL, walls: 2 },
  { side: 'bottom', col: 52, w: 10, h: 7, type: 'classroom', decor: 4, equip: { piano: 2, violino: 1, canto: 2 }, items: ALL, walls: 2 },
  { side: 'bottom', col: 20, w: 8, h: 7, type: 'lounge', decor: 2, items: ALL, walls: 0 },
  { side: 'top', col: 22, w: 14, h: 10, type: 'auditorium', decor: 3, items: ALL, walls: 1 },
  { side: 'top', col: 38, w: 10, h: 8, type: 'rehearsal', decor: 3, items: ALL, walls: 2 },
  { side: 'top', col: 48, w: 9, h: 7, type: 'classroom', decor: 3, equip: { bateria: 2, baixo: 1, guitarra: 2 }, items: ALL, walls: 2 },
  { side: 'top', col: 57, w: 6, h: 7, type: 'studio', decor: 1, items: ['som'], walls: 0 },
];
function demoModel(): SceneModel {
  const layout = makeLayout(DEMO.map((d, i) => ({ id: i, side: d.side, col: d.col, w: d.w, h: d.h })), 0);
  const plots = DEMO.map((d, i) => ({ index: i, owned: true, type: d.type, decor: d.decor, equip: d.equip ?? {}, items: d.items, walls: d.walls }));
  return { layout, plots, sign: 'ESCOLA DE MÚSICA', signColor: '#c24d6a', version: -1 };
}

function demoAgents() {
  const m = demoModel();
  scene.setModel(m, false);
  scene.agents = [];
  for (const p of m.plots) {
    const sp = scene.roomSpots(p.index);
    if (!sp) continue;
    for (const sl of sp.slots.slice(0, 2)) {
      const a = scene.spawn(rl(), sl.x, sl.y, {});
      a.dir = 'down';
      if (sl.kind === 'hold') a.held = sl.inst;
      scene.spawn(rl(), sl.x + 15, sl.y + 4, {}).dir = 'left';
      scene.setActive(p.index, [sl.inst], 9999);
    }
    for (const b of sp.band.slice(0, 3)) scene.spawn(rl(), b.x, b.y, {}).dir = 'down';
    for (const a of sp.audience.slice(0, 9)) scene.spawn(rl(), a.x, a.y, {}).dir = 'up';
    for (const a of sp.stage.slice(0, 2)) scene.spawn(rl(), a.x, a.y, {}).dir = 'down';
    for (const w of sp.wait.slice(0, 2)) { const a = scene.spawn(rl(), w.x, w.y, {}); a.dir = 'down'; a.bubble = 'q'; }
    for (const st of sp.staff.slice(0, 2)) scene.spawn(rl(), st.x, st.y, {}).dir = 'down';
    if (sp.audience.length) scene.setActive(p.index, [], 9999);
  }
  scene.hour = 17.5;
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let uiTimer = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  requestAnimationFrame(frame);
  try {
    if (game) game.update(dt);
    else scene.update(dt, 1);
    scene.render();
    uiTimer += dt;
    if (ui && uiTimer > 0.2) { uiTimer = 0; ui.tick(now); }
  } catch (err) { console.error(err); }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ input
let down: { x: number; y: number; px: number; py: number; moved: boolean; id: number } | null = null;
const touches = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    if (down) down.moved = true;
    return;
  }
  down = { x: e.clientX, y: e.clientY, px: scene.panX, py: scene.panY, moved: false, id: e.pointerId };
  audio();
});
const endTouch = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
window.addEventListener('pointercancel', endTouch);
window.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2 && pinch0) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d / pinch0 > 1.25) { scene.setZoom(0.5); pinch0 = d; }
    else if (d / pinch0 < 0.8) { scene.setZoom(-0.5); pinch0 = d; }
    return;
  }
  if (down && down.id === e.pointerId) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    // fingers wobble: only treat as a drag after a clear movement
    if (Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 6 : 14)) down.moved = true;
    if (down.moved) { scene.panX = down.px + dx * scene.dpr; scene.panY = down.py + dy * scene.dpr; }
    return;
  }
  if (!game || e.target !== canvas) { scene.hoverPlot = -1; return; }
  const pt = scene.toWorld(e.clientX, e.clientY);
  const a = scene.agentAt(pt);
  scene.hoverPlot = a ? -1 : game.s.chapter >= 2 ? scene.plotAt(pt) : -1;
  canvas.style.cursor = a?.onClick ? 'pointer' : scene.hoverPlot >= 0 ? 'pointer' : 'grab';
});
window.addEventListener('pointerup', (e) => {
  endTouch(e);
  if (!down || down.id !== e.pointerId) return;
  const wasDrag = down.moved;
  down = null;
  if (wasDrag || !game || e.target !== canvas) return;
  const pt = scene.toWorld(e.clientX, e.clientY);
  const gh = scene.ghostAt(pt);
  if (gh >= 0) { ui?.confirmSpot(gh); return; }
  const r = game.click(pt);
  if (r && r.kind === 'plot' && game.s.chapter >= 2) ui?.openPanel('room', r.plot);
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scene.setZoom(e.deltaY < 0 ? 0.5 : -0.5); }, { passive: false });
window.addEventListener('keydown', (e) => {
  if (!game || document.querySelector('.modal-ov, .mg-overlay, .dlg-ov')) return;
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.code === 'Space' && game.s.chapter >= 2) { e.preventDefault(); game.speed = game.speed === 0 ? 1 : 0; }
  if (e.key === '1') game.speed = 1;
  if (e.key === '2') game.speed = 2;
  if (e.key === '3') game.speed = 4;
  if (e.key === 'Escape') ui?.openPanel(null);
});
// Autosave: phones rarely fire 'beforeunload' when the app is closed, so save
// every few seconds and whenever the page goes to the background.
const autosave = () => { if (game) game.save(); };
setInterval(autosave, 4000);
window.addEventListener('beforeunload', autosave);
window.addEventListener('pagehide', autosave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave(); });

// ------------------------------------------------------------------ start game
export function goFullscreen() {
  const el = document.documentElement as any;
  try {
    const p = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => (screen.orientation as any)?.lock?.('landscape')).catch(() => {});
  } catch { /* ignore */ }
}
(window as any).__fullscreen = goFullscreen;
const isTouch = matchMedia('(pointer: coarse)').matches;

async function start(state: GameState, fresh: boolean) {
  if (isTouch) goFullscreen();
  document.querySelector('.title-ov')?.remove();
  scene.zoom = 0;
  scene.panX = scene.panY = 0;
  resize();
  game = new Game(state, scene);
  ui = new UI(game, uiRoot);
  game.ui = ui;
  (window as any).__game = game;
  startMusic();
  if (state.chapter === 1) {
    await game.ch1Start();
    if (fresh) {
      await ui.dialog([
        { who: 'Capítulo 1', text: '🎵 O ESTÚDIO' },
        { who: state.playerName, look: state.playerLook, side: 'r', text: 'Mais um dia no Estúdio Som Maior. Aqui eu dou aula… e ainda cuido da recepção e do caixa.' },
        { who: 'Seu Válter', look: BOSS_LOOK, text: 'Bom dia! Tem aluno te esperando nas salas — clique neles (♪) para dar a aula. E tem papelada na recepção.' },
        { who: 'Dica', text: 'Cada aula é um minigame musical. Não precisa saber música para jogar! Quanto melhor você for, mais ganha.' },
      ]);
    }
  } else {
    game.setupWorldAgents();
    if (state.minute === 0 && !state.gameOver) game.startDay();
  }
  ui.refresh();
}

// ------------------------------------------------------------------ title & creation screens
function titleScreen() {
  demoAgents();
  const saved = loadGame();
  const ov = document.createElement('div');
  ov.className = 'title-ov';
  ov.innerHTML = `
    <div class="title-card">
      <div class="title-kicker px">MUSIC SCHOOL TYCOON</div>
      <h1 class="title-h px">Do Zero<br>ao Palco</h1>
      <p class="title-sub">De professor contratado a dono da escola de música mais famosa da cidade.</p>
      <div class="title-btns">
        ${saved ? `<button class="btn primary big" data-k="cont">▶ Continuar <small>${saved.playerName} · ${saved.chapter === 3 ? 'Semana ' + (saved.investor?.week ?? 1) + ' da escola' : saved.chapter === 2 ? 'A salinha' : 'O estúdio'}</small></button>` : ''}
        <button class="btn ${saved ? '' : 'primary'} big" data-k="new">✦ Novo jogo</button>
      </div>
      <div class="title-foot">Clique para ativar o som 🔊 · Arraste o mapa para mover · Roda do mouse para zoom</div>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('[data-k=cont]')?.addEventListener('click', () => { audio(); sfx.open(); start(saved!, false); });
  ov.querySelector('[data-k=new]')!.addEventListener('click', () => { audio(); sfx.open(); ov.remove(); creation(); });
}

function creation() {
  let look: Look = randomLook();
  look.extra = 'none';
  const chosen: InstrumentId[] = ['violao', 'guitarra'];
  const ov = document.createElement('div');
  ov.className = 'title-ov';
  ov.innerHTML = `
    <div class="title-card create">
      <div class="title-kicker px">QUEM É VOCÊ?</div>
      <div class="create-row">
        <div class="avatar-box"><canvas width="18" height="27" class="avatar pix"></canvas>
          <div class="avatar-btns">
            <button class="btn small" data-c="skin">Pele</button><button class="btn small" data-c="hair">Cabelo</button>
            <button class="btn small" data-c="style">Corte</button><button class="btn small" data-c="shirt">Camisa</button>
            <button class="btn small" data-c="pants">Calça</button><button class="btn small" data-c="extra">Acessório</button>
            <button class="btn small accent" data-c="rand">🎲 Aleatório</button>
          </div>
        </div>
        <div class="create-form">
          <label>Seu nome<input class="inp" maxlength="18" placeholder="Seu nome" value=""></label>
          <div class="lbl">Seus 2 instrumentos (você dá aula deles)</div>
          <div class="inst-pick">${INSTRUMENT_IDS.map((i) => `<button class="ipick" data-i="${i}" style="--ic:${INSTRUMENTS[i].color}">${INSTRUMENTS[i].emoji}<span>${INSTRUMENTS[i].name}</span></button>`).join('')}</div>
          <p class="small muted">Você começa como professor e secretário num estúdio que não é seu. A história é sua: da sala alugada no bairro até a escola dos sonhos.</p>
          <button class="btn primary big wide" data-k="go">Começar a história ▶</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const cv = ov.querySelector('.avatar') as HTMLCanvasElement;
  const draw = () => {
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, 18, 27);
    g.drawImage(charSprite(look, 'down', 0), 0, 0);
  };
  const cyc = <T,>(arr: T[], v: T) => arr[(arr.indexOf(v) + 1) % arr.length];
  ov.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    sfx.click();
    const c = (b as HTMLElement).dataset.c;
    if (c === 'skin') look.skin = cyc(SKINS, look.skin);
    if (c === 'hair') look.hair = cyc(HAIRS, look.hair);
    if (c === 'style') look.hairStyle = (look.hairStyle + 1) % 7;
    if (c === 'shirt') { look.shirt = cyc(SHIRTS, look.shirt); look.accent = cyc(SHIRTS, look.shirt); }
    if (c === 'pants') look.pants = cyc(PANTS, look.pants);
    if (c === 'extra') look.extra = cyc(['none', 'glasses', 'beard', 'cap', 'headphones'] as Look['extra'][], look.extra);
    if (c === 'rand') look = randomLook();
    draw();
  }));
  const syncPick = () => ov.querySelectorAll('.ipick').forEach((b) => b.classList.toggle('on', chosen.includes((b as HTMLElement).dataset.i as InstrumentId)));
  ov.querySelectorAll('.ipick').forEach((b) => b.addEventListener('click', () => {
    const i = (b as HTMLElement).dataset.i as InstrumentId;
    sfx.click();
    if (chosen.includes(i)) { if (chosen.length > 1) chosen.splice(chosen.indexOf(i), 1); }
    else { chosen.push(i); if (chosen.length > 2) chosen.shift(); }
    syncPick();
  }));
  syncPick();
  draw();
  const inp = ov.querySelector('.inp') as HTMLInputElement;
  ov.querySelector('[data-k=go]')!.addEventListener('click', () => {
    const name = inp.value.trim() || 'Professor';
    sfx.good();
    const st = newGame(name, look, [...chosen]);
    saveGame(st);
    start(st, true);
  });
  setTimeout(() => inp.focus(), 50);
}

titleScreen();
