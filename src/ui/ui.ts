// UI layer: HUD, toolbar, side panels, modals, dialogs.
import type { Game, Lead, DialogLine, UIHooks, BuildSpot } from '../game/game';
import { ROOM_TYPES, SKILL_MAP, SKILLS } from '../data/content';
import type { BranchId } from '../data/content';
import type { RoomType } from '../data/content';
import { INVESTOR_LOOK, BOSS_LOOK } from '../game/game';
import type { PendingEvent, WeekStats, Teacher } from '../game/state';
import { DAY_FULL, DAY_NAMES, OPEN_HOUR, firstName, clearSave } from '../game/state';
import { INSTRUMENTS } from '../data/instruments';
import type { InstrumentId, MinigameKind } from '../data/instruments';
import type { Look } from '../art/characters';
import { portraitURL } from '../art/characters';
import { EVENT_DEFS } from '../game/events';
import { runMinigame } from '../minigames/shell';
import { sfx, setMusic, setSfx, isMusicOn, isSfxOn } from '../audio';
import { money, roomPanel, teamPanel, demandPanel, marketingPanel, financePanel, eventsPanel, meetingChoices, roomName } from './panels';
import { skillTreeHTML } from './skilltree';
import { morph } from './morph';

type PanelId = 'room' | 'team' | 'demand' | 'marketing' | 'finance' | 'events' | null;

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export class UI implements UIHooks {
  g: Game;
  root: HTMLElement;
  panel: PanelId = null;
  panelArg = -1;
  panelEl: HTMLElement;
  hudEl: HTMLElement;
  objEl: HTMLElement;
  toastsEl: HTMLElement;
  barEl: HTMLElement;
  lastPanelRender = 0;
  pointerInPanel = false;
  skillOpen = false;
  modalDepth = 0;
  objCollapsed = window.innerHeight <= 520;

  constructor(g: Game, root: HTMLElement) {
    this.g = g;
    this.root = root;
    root.innerHTML = `
      <div class="hud"></div>
      <div class="objective"></div>
      <div class="toolbar"></div>
      <div class="toasts"></div>
      <aside class="panel hidden"><button class="panel-x" data-act="close">✕</button><div class="panel-body"></div></aside>`;
    this.hudEl = $('.hud', root);
    this.objEl = $('.objective', root);
    this.barEl = $('.toolbar', root);
    this.toastsEl = $('.toasts', root);
    this.panelEl = $('.panel', root);
    this.panelEl.addEventListener('pointerenter', () => (this.pointerInPanel = true));
    this.panelEl.addEventListener('pointerleave', () => (this.pointerInPanel = false));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => this.onInput(e, true));
    this.renderToolbar();
  }

  // ------------------------------------------------------------ toolbar & HUD
  renderToolbar() {
    const g = this.g;
    const ch = g.s.chapter;
    const btn = (id: string, icon: string, label: string, badge = '') => `<button class="tb-btn ${this.panel === id || (id === 'skills' && this.skillOpen) ? 'on' : ''}" data-act="panel" data-arg="${id}"><span class="tb-i">${icon}</span><span class="tb-l">${label}</span>${badge}</button>`;
    const evN = g.s.events.length;
    const sp = g.s.skillPoints;
    if (ch === 1) {
      morph(this.barEl, btn('skills', '🎼', 'Habilidades', sp ? `<b class="badge">${sp}</b>` : ''));
      return;
    }
    morph(this.barEl, [
      btn('school', '🏫', 'Escola'),
      btn('team', '👥', 'Equipe'),
      btn('demand', '📊', 'Demanda'),
      btn('marketing', '📣', 'Marketing'),
      btn('finance', '💰', 'Finanças'),
      btn('skills', '🎼', 'Habilidades', sp ? `<b class="badge">${sp}</b>` : ''),
      btn('events', '❗', 'Situações', evN ? `<b class="badge red">${evN}</b>` : ''),
    ].join(''));
  }

  renderHUD() {
    const g = this.g;
    const s = g.s;
    const need = g.xpThreshold(s.level);
    const prev = s.level > 1 ? g.xpThreshold(s.level - 1) : 0;
    const pct = ((s.xp - prev) / (need - prev)) * 100;
    const fc = s.chapter >= 2 ? g.forecast() : null;
    const narrow = window.innerWidth < 760;
    const time = s.chapter === 1 ? `Dia ${s.ch1.day + 1} · Estúdio Som Maior` : narrow ? `S${s.week} · ${DAY_NAMES[s.day]} · ` + `${String(OPEN_HOUR + Math.floor(s.minute / 60)).padStart(2, '0')}:${String(s.minute % 60).padStart(2, '0')}` : `Semana ${s.week} · ${DAY_FULL[s.day]} · ${String(OPEN_HOUR + Math.floor(s.minute / 60)).padStart(2, '0')}:${String(s.minute % 60).padStart(2, '0')}`;
    const spd = (v: number, l: string) => `<button class="spd ${g.speed === v ? 'on' : ''}" data-act="speed" data-arg="${v}">${l}</button>`;
    const inv = s.investor;
    const clock = s.chapter === 1 ? `Dia ${s.ch1.day + 1}` : `${narrow ? 'S' + s.week : 'Semana ' + s.week} · ${narrow ? DAY_NAMES[s.day] : DAY_FULL[s.day]} ${String(OPEN_HOUR + Math.floor(s.minute / 60)).padStart(2, '0')}:${String(s.minute % 60).padStart(2, '0')}`;
    void time;
    morph(this.hudEl, `
      <div class="topbar">
        <div class="tbs lvlbox" title="${g.schoolName()}">
          <span class="px lvl">LVL ${s.level}</span>
          <div class="xpbar"><div style="width:${pct}%"></div></div>
        </div>
        <div class="tbs" title="Dinheiro em caixa"><span class="tbi">💰</span><b class="px ${s.cash < 0 ? 'red' : 'gold'}">${money(s.cash)}</b></div>
        ${fc ? `<div class="tbs" title="Previsão de lucro por semana"><span class="tbi">📈</span><b class="px ${fc.profit < 0 ? 'red' : 'green'}">${fc.profit >= 0 ? '+' : ''}${money(fc.profit)}</b><small>/sem</small></div>` : ''}
        ${s.chapter >= 2 && !narrow ? `<div class="tbs" title="Alunos"><span class="tbi">🎓</span><b class="px">${s.students.length}</b></div>` : ''}
        ${inv && !inv.bought ? `<div class="tbs" title="Confiança do investidor"><span class="tbi">🤝</span><b class="px ${inv.trust < 30 ? 'red' : ''}">${Math.round(inv.trust)}%</b></div>` : ''}
        <div class="tbs grow"></div>
        <div class="tbs clock"><span class="px">${clock}</span>${s.chapter >= 2 ? `<span class="spds">${spd(0, '⏸')}${spd(1, '▶')}${spd(2, '▶▶')}${spd(4, '▶▶▶')}</span>` : ''}</div>
        <div class="tbs icons"><button class="ico" data-act="fullscreen" title="Tela cheia">⛶</button><button class="ico" data-act="menu" title="Menu">☰</button></div>
      </div>`);
  }

  renderObjective() {
    const g = this.g;
    const s = g.s;
    let h = '';
    if (s.chapter === 1) {
      h = `<div class="obj-h"><span class="dot-live"></span><b>Estúdio Som Maior</b><small>você é professor e secretário</small></div>`;
      h += s.ch1.tasks.map((t) => `<div class="task ${t.done ? 'done' : ''}">${t.done ? '✅' : t.kind === 'lesson' ? INSTRUMENTS[t.instrument!].emoji : '📄'} <span>${t.label}</span>${t.done ? `<small>${t.score}%</small>` : `<button class="btn small primary" data-act="ch1task" data-arg="${t.id}">Fazer</button>`}</div>`).join('');
      h += `<div class="obj-f">💵 Ganhos no estúdio: <b>${money(s.ch1.earned)}</b></div>`;
    } else if (s.chapter === 2) {
      const a = Math.min(8, s.students.length), v = Math.min(1000, s.youtube.views);
      h = `<div class="obj-h"><span class="dot-live"></span><b>A Salinha do Bairro</b><small>meta para chamar atenção</small></div>
        <div class="goal"><span>🎓 Alunos</span><b>${s.students.length}/8</b></div><div class="bar"><div style="width:${(a / 8) * 100}%"></div></div>
        <div class="goal"><span>▶ Visualizações no YouTube</span><b>${s.youtube.views}/1000</b></div><div class="bar"><div style="width:${(v / 1000) * 100}%"></div></div>
        <div class="row gap"><button class="btn small accent" data-act="video">🎬 Gravar vídeo</button><button class="btn small" data-act="campaign" data-arg="panfletos">📄 Panfletos R$120</button></div>`;
    } else if (s.investor) {
      const fc = g.forecast();
      const inv = s.investor;
      h = `<div class="obj-h"><img class="pix mini-face" src="${portraitURL(INVESTOR_LOOK)}"><b>Meta da semana ${inv.week}</b><small>revisão sábado 20h</small></div>
        <div class="goal ${s.cash >= inv.goalCash ? 'ok' : 'no'}"><span>${s.cash >= inv.goalCash ? '✅' : '❌'} Caixa ≥ ${money(inv.goalCash)}</span><b>${money(s.cash)}</b></div>
        <div class="goal ${fc.profit >= inv.goalProfit ? 'ok' : 'no'}"><span>${fc.profit >= inv.goalProfit ? '✅' : '❌'} Lucro previsto ≥ ${money(inv.goalProfit)}</span><b>${money(fc.profit)}</b></div>`;
      const price = g.buyoutPrice();
      if (inv.bought) h = `<div class="obj-h"><b>🏁 A escola é 100% sua!</b><small>próximo sonho: abrir a Filial</small></div>`;
      else h += `<div class="goal big-goal"><span>🏁 Comprar a parte do sócio</span><b>${money(Math.max(0, s.cash))} / ${money(price)}</b></div><div class="bar"><div style="width:${Math.min(100, (Math.max(0, s.cash) / price) * 100)}%"></div></div>${s.cash >= price && g.canBuyout() ? '<button class="btn small primary" data-act="buyout">🤝 Comprar agora</button>' : ''}`;
    }
    if (s.chapter >= 2) {
      const waiting = g.leads.filter((l) => l.agent?.clickable && !l.busy).length;
      if (waiting) h += `<div class="obj-wait"><span>❓ <b>${waiting}</b> interessado(s) esperando</span><button class="btn small primary" data-act="attend">Atender</button></div>`;
      const mine = g.lessons.filter((l) => l.player && l.score === null && l.agents[0]?.clickable).length;
      if (mine) h += `<div class="obj-wait lesson"><span>♪ <b>${mine}</b> aula(s) sua(s) agora</span><button class="btn small accent" data-act="teach">Dar aula</button></div>`;
    }
    let mini = '';
    if (s.chapter === 1) mini = `📋 ${s.ch1.tasks.filter((t) => !t.done).length} tarefa(s)`;
    else if (s.chapter === 2) mini = `🎯 ${s.students.length}/8 alunos · ${Math.min(1000, s.youtube.views)}/1000 views`;
    else if (s.investor) { const fc = g.forecast(); mini = `🎯 Meta: ${s.cash >= s.investor.goalCash ? '✅' : '❌'} caixa ${fc.profit >= s.investor.goalProfit ? '✅' : '❌'} lucro`; }
    const waitIdx = h.indexOf('<div class="obj-wait');
    const extras = waitIdx >= 0 ? h.slice(waitIdx) : '';
    const body = this.objCollapsed ? `<div class="obj-mini">${mini}</div>${extras}` : h;
    const out = `<button class="obj-tog" data-act="objToggle">${this.objCollapsed ? '▸' : '▾'}</button>${body}`;
    this.objEl.classList.toggle('collapsed', this.objCollapsed);
    morph(this.objEl, out);
  }

  tick(now: number) {
    this.renderHUD();
    this.renderObjective();
    if (this.panel && now - this.lastPanelRender > 1200 && !this.pointerInPanel && !this.modalDepth) this.renderPanel();
    if (this.g.dirtyUI) { this.renderToolbar(); this.g.dirtyUI = false; }
  }

  refresh() {
    this.renderHUD();
    this.renderObjective();
    this.renderToolbar();
    if (this.panel) this.renderPanel();
    if (this.skillOpen) this.renderSkills();
  }

  // ------------------------------------------------------------ panels
  openPanel(p: PanelId, arg = -1) {
    this.panel = p;
    this.panelArg = arg;
    this.panelEl.classList.toggle('hidden', !p);
    this.g.scene.highlightPlots.clear();
    if (p === 'room' && arg >= 0) this.g.scene.highlightPlots.add(arg);
    this.renderPanel();
    this.renderToolbar();
  }

  renderPanel() {
    const g = this.g;
    const body = $('.panel-body', this.panelEl);
    let h = '';
    switch (this.panel) {
      case 'room': h = this.panelArg >= 0 && g.s.plots[this.panelArg] ? roomPanel(g, this.panelArg) : this.schoolOverview(); break;
      case 'team': h = teamPanel(g); break;
      case 'demand': h = demandPanel(g); break;
      case 'marketing': h = marketingPanel(g); break;
      case 'finance': h = financePanel(g); break;
      case 'events': h = eventsPanel(g); break;
      default: return;
    }
    morph(body, h);
    this.lastPanelRender = performance.now();
  }

  schoolOverview(): string {
    const g = this.g;
    let h = `<div class="ptitle">🏫 ${g.schoolName()}</div><p class="muted small">Toque num espaço do mapa (ou aqui) para gerenciar. Tudo vem pré-montado.</p>`;
    if (g.s.chapter === 3) h += '<button class="btn wide" data-act="identity">🎨 Nome, uniforme e mensalidade</button>';
    for (const p of g.s.plots) {
      if (!p.owned && p.index !== g.layout.hall) continue;
      h += `<button class="room-row" data-act="room" data-arg="${p.index}"><b>${roomName(g, p)}</b><small>${p.owned ? `Nível ${p.decor + 1} · ${['Abandonado', 'Pintado', 'Aconchegante', 'Premium', 'Luxo'][p.decor]}` + (p.type === 'classroom' ? ' · ' + Object.keys(p.equip).map((i) => INSTRUMENTS[i as InstrumentId].emoji).join(' ') : '') : 'Compartilhado'}</small></button>`;
    }
    if (g.s.chapter === 3) {
      h += '<div class="sect">➕ Construir</div><p class="muted small">Escolha o tipo: a sala já vem pré-montada. Depois toque num dos encaixes tracejados no mapa.</p><div class="grid2">';
      for (const [type, def] of Object.entries(ROOM_TYPES) as [RoomType, NonNullable<(typeof ROOM_TYPES)[RoomType]>][]) {
        const locked = def.skill && !g.has(def.skill);
        const n = locked ? 0 : g.buildSpots(type).length;
        h += `<button class="build-opt ${locked || !n ? 'locked' : ''}" data-act="buildMode" data-arg="${type}" ${locked || !n ? 'disabled' : ''}>
          <div class="bo-emoji">${def.emoji}</div><div class="bo-name">${def.name}</div><div class="bo-cost">a partir de ${money(def.cost + def.w * 120)}</div>
          <div class="bo-desc">${locked ? '🔒 ' + SKILL_MAP[def.skill!].name : !n ? 'Sem espaço no terreno' : `${def.w / 2}m · ${n} encaixe(s) · ${def.desc}`}</div></button>`;
      }
      h += '</div>';
    }
    return h;
  }

  // ------------------------------------------------------------ build mode (prefab spots)
  buildType: RoomType | null = null;
  spots: BuildSpot[] = [];
  buildBar: HTMLElement | null = null;

  startBuildMode(type: RoomType) {
    const g = this.g;
    this.spots = g.buildSpots(type);
    if (!this.spots.length) return;
    this.buildType = type;
    this.openPanel(null);
    g.scene.ghosts = this.spots.map((sp, k) => ({ id: k, side: sp.side, col: sp.col, w: sp.w, h: sp.h, label: ROOM_TYPES[type]!.emoji }));
    g.scene.focusBuilding(g.layout, this.spots);
    this.buildBar?.remove();
    const bar = document.createElement('div');
    bar.className = 'build-bar';
    bar.innerHTML = `<span>${ROOM_TYPES[type]!.emoji} Onde construir a <b>${ROOM_TYPES[type]!.name}</b>? Toque num encaixe tracejado.</span>
      <div class="bb-list">${this.spots.map((sp, k) => `<button class="btn small" data-act="buildSpot" data-arg="${k}">${sp.label} · ${money(sp.cost)}</button>`).join('')}</div>
      <button class="btn small ghost" data-act="cancelBuild">Cancelar</button>`;
    this.root.appendChild(bar);
    this.buildBar = bar;
  }

  confirmSpot(k: number) {
    const sp = this.spots[k];
    const type = this.buildType;
    if (!sp || !type) return;
    const id = this.g.buildAt(type, sp);
    this.endBuildMode();
    if (id !== undefined) this.openPanel('room', id);
  }

  endBuildMode() {
    this.buildType = null;
    this.spots = [];
    this.g.scene.ghosts = [];
    this.buildBar?.remove();
    this.buildBar = null;
    this.g.scene.focusBuilding(this.g.layout);
  }

  // ------------------------------------------------------------ events
  async onClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset.act!;
    const arg = el.dataset.arg ?? '';
    const g = this.g;
    if (act !== 'speed') sfx.click();
    switch (act) {
      case 'close': this.openPanel(null); break;
      case 'objToggle': this.objCollapsed = !this.objCollapsed; this.renderObjective(); break;
      case 'panel':
        if (arg === 'skills') { this.toggleSkills(); break; }
        if (arg === 'school') {
          this.panel = 'room';
          this.panelEl.classList.remove('hidden');
          morph($('.panel-body', this.panelEl), this.schoolOverview());
          this.panelArg = -1;
          this.renderToolbar();
          break;
        }
        this.openPanel(this.panel === arg ? null : (arg as PanelId));
        break;
      case 'room': this.openPanel('room', Number(arg)); break;
      case 'speed': g.speed = Number(arg); this.renderHUD(); break;
      case 'music': setMusic(!isMusicOn()); break;
      case 'sfx': setSfx(!isSfxOn()); break;
      case 'menu': this.menu(); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen?.(); else (window as any).__fullscreen?.(); break;
      case 'buildMode': this.startBuildMode(arg as RoomType); break;
      case 'buildSpot': this.confirmSpot(Number(arg)); break;
      case 'cancelBuild': this.endBuildMode(); break;
      case 'walls': g.upgradeWalls(Number(arg)); this.renderPanel(); break;
      case 'item': { const [i, it] = arg.split(':'); g.buyItem(Number(i), it as any); this.renderPanel(); break; }
      case 'reception': g.buildReception(); this.renderPanel(); break;
      case 'decor': g.upgradeDecor(Number(arg)); this.renderPanel(); break;
      case 'equip': { const [i, inst, t] = arg.split(':'); g.buyEquip(Number(i), inst as InstrumentId, Number(t)); this.renderPanel(); break; }
      case 'unequip': { const [i, inst] = arg.split(':'); g.removeEquip(Number(i), inst as InstrumentId); this.renderPanel(); break; }
      case 'hire': { const t = g.s.candidates.find((c) => c.id === Number(arg)); if (t) this.negotiateModal(t, true); break; }
      case 'salary': { const t = g.s.teachers.find((c) => c.id === Number(arg)); if (t) this.negotiateModal(t, false); break; }
      case 'identity': this.identity(false); break;
      case 'buyout': g.buyout(); break;
      case 'fire': {
        const t = g.s.teachers.find((c) => c.id === Number(arg));
        if (!t) break;
        const n = g.studentsOf(t).length;
        const ok = await this.choice('Demitir professor?', `${t.name} tem ${n} aluno(s). Tentaremos realocá-los com outros professores.`, [{ label: 'Sim, demitir' }, { label: 'Cancelar' }], t.look);
        if (ok === 0) g.fireTeacher(t);
        this.renderPanel();
        break;
      }
      case 'train': { const t = g.s.teachers.find((c) => c.id === Number(arg)); if (t) g.trainTeacher(t); this.renderPanel(); break; }
      case 'raise': { const t = g.s.teachers.find((c) => c.id === Number(arg)); if (t) g.raiseTeacher(t); this.renderPanel(); break; }
      case 'reroll': if (g.spend(150, 'Recrutamento')) { g.refreshCandidates(); this.renderPanel(); } break;
      case 'hireStaff': { const st = g.s.staffCandidates.find((c) => c.id === Number(arg)); if (st) g.hireStaff(st); this.renderPanel(); break; }
      case 'fireStaff': { const st = g.s.staff.find((c) => c.id === Number(arg)); if (st) g.fireStaff(st); this.renderPanel(); break; }
      case 'meeting': this.meetingModal(); break;
      case 'campaign': {
        const sel = this.panelEl.querySelector('[data-input=focus-inst]') as HTMLSelectElement | null;
        g.launchCampaign(arg as any, sel ? (sel.value as InstrumentId) : undefined);
        if (this.panel) this.renderPanel();
        break;
      }
      case 'video': g.recordVideo().then(() => this.refresh()); break;
      case 'recital': g.scheduleRecital(); this.renderPanel(); break;
      case 'openEvent': { const ev = g.s.events.find((x) => x.uid === Number(arg)); if (ev) this.openEvent(ev); break; }
      case 'buySkill': g.buySkill(arg); this.renderSkills(); break;
      case 'attend': { const l = g.leads.find((x) => x.agent?.clickable && !x.busy); if (l) this.openLead(l); break; }
      case 'teach': { const l = g.lessons.find((x) => x.player && x.score === null && x.agents[0]?.clickable); if (l) g.playLesson(l); break; }
      case 'ch1task': { const t = g.s.ch1.tasks.find((x) => x.id === arg); if (t) g.doCh1Task(t); break; }
    }
  }

  onInput(e: Event, commit = false) {
    const el = e.target as HTMLInputElement;
    const k = el.dataset.input;
    if (!k) return;
    const g = this.g;
    const v = Number(el.value);
    if (k === 'price-ind' || k === 'price-grp') {
      if (commit) { g.applyPrice(k === 'price-ind' ? 'ind' : 'grp', v); this.renderPanel(); return; }
    }
    else if (k === 'price-rehearsal') g.setPrice('rehearsal', v);
    else if (k === 'player-hours') { if (commit) { g.setPlayerHours(v); this.renderPanel(); } return; }
    else return;
    // live label update
    const row = el.previousElementSibling as HTMLElement | null;
    const big = row?.querySelector('.big');
    if (big) big.textContent = money(v);
    if (commit) this.renderPanel();
  }

  // ------------------------------------------------------------ skill tree
  skillBranch: BranchId = 'pedagogia';

  toggleSkills() {
    if (this.skillOpen) { $('.skill-modal')?.remove(); this.skillOpen = false; this.g.resume(); this.renderToolbar(); return; }
    this.skillOpen = true;
    this.g.pause();
    // open on a branch that has something to buy
    const s = this.g.s;
    const buyable = SKILLS.find((x) => !this.g.has(x.id) && x.req.every((r) => this.g.has(r)) && s.skillPoints >= x.cost && !(x.minChapter && s.chapter < x.minChapter));
    if (buyable) this.skillBranch = buyable.branch;
    const m = document.createElement('div');
    m.className = 'skill-modal';
    m.innerHTML = `<div class="skill-inner"><div class="skill-head"><div><div class="px st-title">ÁRVORE DA ESCOLA</div><div class="small muted">Cada nível de reputação = 1 nota 🎵. Escolha bem: não dá para ter tudo.</div></div><div class="st-points-box"><b class="st-points"></b><span>🎵 notas</span></div><button class="btn ghost" data-act2="close">✕</button></div><div class="skill-body"></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-act2=close]') || t === m) { sfx.click(); this.toggleSkills(); return; }
      const tab = t.closest('[data-branch]') as HTMLElement | null;
      if (tab) { this.skillBranch = tab.dataset.branch as BranchId; sfx.click(); this.renderSkills(); return; }
      const b = t.closest('[data-act=buySkill]') as HTMLElement | null;
      if (b && !(b as HTMLButtonElement).disabled) { this.g.buySkill(b.dataset.arg!); this.renderSkills(); this.renderToolbar(); }
    });
    this.renderSkills();
    this.renderToolbar();
  }

  renderSkills() {
    const m = $('.skill-modal');
    if (!m) return;
    morph($('.skill-body', m), skillTreeHTML(this.g, this.skillBranch));
    $('.st-points', m).textContent = String(this.g.s.skillPoints);
  }

  // ------------------------------------------------------------ modal helpers
  modal(html: string, cls = ''): HTMLElement {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    document.body.appendChild(ov);
    this.modalDepth++;
    sfx.open();
    return ov;
  }
  closeModal(ov: HTMLElement) {
    ov.remove();
    this.modalDepth = Math.max(0, this.modalDepth - 1);
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' | 'money' | 'level' = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = text;
    this.toastsEl.prepend(t);
    const maxT = window.innerHeight <= 520 ? 2 : 3;
    while (this.toastsEl.children.length > maxT) this.toastsEl.lastElementChild?.remove();
    setTimeout(() => t.classList.add('out'), 3600);
    setTimeout(() => t.remove(), 4100);
  }

  dialog(lines: DialogLine[]): Promise<void> {
    return new Promise((resolve) => {
      this.g.pause();
      const ov = document.createElement('div');
      ov.className = 'dlg-ov';
      document.body.appendChild(ov);
      this.modalDepth++;
      let i = 0;
      let typing = 0;
      let full = '';
      const show = () => {
        const l = lines[i];
        const side = l.side ?? 'l';
        full = l.text;
        ov.innerHTML = `<div class="dlg ${side}">
          ${l.look ? `<img class="dlg-face pix" src="${portraitURL(l.look)}">` : `<div class="dlg-face sys">${l.who.startsWith('Cap') ? '🎼' : l.who === 'Dica' ? '💡' : '📱'}</div>`}
          <div class="dlg-box"><div class="dlg-name">${l.who}</div><div class="dlg-text"></div><div class="dlg-next">${i < lines.length - 1 ? '▼' : '✓'}</div></div></div>`;
        const tx = $('.dlg-text', ov);
        let k = 0;
        clearInterval(typing);
        typing = window.setInterval(() => {
          k += 2;
          tx.textContent = full.slice(0, k);
          if (k % 6 === 0) sfx.click();
          if (k >= full.length) clearInterval(typing);
        }, 22);
        if (l.who.startsWith('Capítulo')) ov.querySelector('.dlg')!.classList.add('chapter');
      };
      const next = () => {
        const tx = $('.dlg-text', ov);
        if (tx && tx.textContent!.length < full.length) { clearInterval(typing); tx.textContent = full; return; }
        i++;
        if (i >= lines.length) {
          clearInterval(typing);
          ov.remove();
          window.removeEventListener('keydown', key);
          this.modalDepth = Math.max(0, this.modalDepth - 1);
          this.g.resume();
          resolve();
          return;
        }
        show();
      };
      const key = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); } };
      ov.addEventListener('click', next);
      window.addEventListener('keydown', key);
      show();
    });
  }

  choice(title: string, text: string, options: { label: string; sub?: string; disabled?: boolean }[], look?: Look): Promise<number> {
    return new Promise((resolve) => {
      this.g.pause();
      const ov = this.modal(`
        ${look ? `<img class="modal-face pix" src="${portraitURL(look)}">` : ''}
        <div class="m-title">${title}</div><p>${text}</p>
        <div class="m-opts">${options.map((o, k) => `<button class="btn ${k === 0 ? 'primary' : ''} opt" data-k="${k}" ${o.disabled ? 'disabled' : ''}>${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('')}</div>`, 'choice');
      ov.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
        sfx.click();
        this.closeModal(ov);
        this.g.resume();
        resolve(Number((b as HTMLElement).dataset.k));
      }));
    });
  }

  minigame(o: { kind: MinigameKind; title?: string; subtitle?: string; instrument?: InstrumentId; difficulty?: number; portrait?: string; allowSkip?: boolean }): Promise<number> {
    this.modalDepth++;
    return runMinigame(o).then((r) => { this.modalDepth = Math.max(0, this.modalDepth - 1); return r; });
  }

  // ------------------------------------------------------------ lead (atendimento)
  openLead(lead: Lead) {
    const g = this.g;
    if (lead.busy) return;
    lead.busy = true;
    g.pause();
    const s = g.s;
    let discount = false;
    let trial = false;
    const inst = INSTRUMENTS[lead.instrument];
    const ov = this.modal('', 'lead');
    const render = () => {
      const slotI = g.findSlot(lead.instrument, 'ind');
      const slotG = g.has('turmas') ? g.findSlot(lead.instrument, 'grp') : null;
      const pI = s.prices.ind * (discount ? 0.85 : 1);
      const pG = s.prices.grp * (discount ? 0.85 : 1);
      const extra = trial ? 0.18 : 0;
      const cI = g.conversion(lead, 'ind', pI, extra);
      const cG = g.conversion(lead, 'grp', pG, extra);
      const reason = (sl: any) => (sl.reason === 'noTeacher' ? 'Sem professor de ' + inst.name : sl.reason === 'noRoom' ? 'Sem sala/horário com ' + inst.name : 'Agenda dos professores lotada');
      const sens = lead.sens > 0.7 ? '💲💲💲 muito sensível a preço' : lead.sens > 0.4 ? '💲💲 atento ao preço' : '💲 não liga muito para preço';
      ov.querySelector('.modal')!.innerHTML = `
        <div class="lead-top" style="--ic:${inst.color}">
          <img class="lead-face pix" src="${portraitURL(lead.look)}">
          <div><div class="m-title">${lead.name}</div>
          <div class="lead-want">Quer aprender <b>${inst.emoji} ${inst.name}</b></div>
          <div class="small">${lead.pref === 'grp' ? '👥 Prefere turma (mais barato)' : '🧑‍🏫 Prefere aula individual'} · ${sens}</div></div>
        </div>
        <div class="lead-opts">
          ${slotI.ok
            ? `<button class="lead-opt" data-k="ind"><b>Matricular: aula individual</b><span>${money(pI)}/mês · ${DAY_NAMES[slotI.day]} ${slotI.hour}h com ${firstName(g.teacher(slotI.teacherId)?.name ?? '')}</span><em class="${cI > 0.5 ? 'hi' : cI > 0.25 ? 'mid' : 'lo'}">${Math.round(cI * 100)}%</em></button>`
            : `<div class="lead-opt off"><b>Aula individual</b><span>❌ ${reason(slotI)}</span></div>`}
          ${slotG ? (slotG.ok
            ? `<button class="lead-opt" data-k="grp"><b>Matricular: turma</b><span>${money(pG)}/mês · ${DAY_NAMES[slotG.day]} ${slotG.hour}h ${slotG.join ? '(turma existente)' : '(nova turma)'}</span><em class="${cG > 0.5 ? 'hi' : cG > 0.25 ? 'mid' : 'lo'}">${Math.round(cG * 100)}%</em></button>`
            : `<div class="lead-opt off"><b>Turma</b><span>❌ ${reason(slotG)}</span></div>`) : ''}
        </div>
        <div class="row gap wrap">
          <label class="chk"><input type="checkbox" data-t="disc" ${discount ? 'checked' : ''}> 🏷️ Oferecer 15% de desconto</label>
          <label class="chk"><input type="checkbox" data-t="trial" ${trial ? 'checked' : ''}> 🎁 Aula experimental grátis (R$ 40)</label>
        </div>
        <div class="row gap">
          ${!slotI.ok && !(slotG && slotG.ok) ? '<button class="btn accent" data-k="wait">📋 Lista de espera</button>' : ''}
          <button class="btn ghost" data-k="bye">Dispensar</button>
        </div>`;
      ov.querySelectorAll('[data-t]').forEach((c) => c.addEventListener('change', (e) => {
        const t = (e.target as HTMLInputElement);
        if (t.dataset.t === 'disc') discount = t.checked; else trial = t.checked;
        render();
      }));
      ov.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
        const k = (b as HTMLElement).dataset.k!;
        if (k === 'ind' || k === 'grp') {
          const price = k === 'ind' ? pI : pG;
          const c = k === 'ind' ? cI : cG;
          if (trial) g.addCash(-40, 'Aulas experimentais');
          if (Math.random() < c) {
            const st = g.enroll(lead, k, price);
            if (!st) g.toWaitlist(lead, k);
          } else {
            sfx.bad();
            this.toast(`${firstName(lead.name)} vai "pensar com carinho"… e não fechou. 😕`, 'bad');
            g.declineLead(lead);
          }
        } else if (k === 'wait') {
          g.toWaitlist(lead, lead.pref);
          this.toast(`📋 ${firstName(lead.name)} entrou na lista de espera.`, 'info');
        } else {
          g.declineLead(lead);
        }
        close();
      }));
    };
    const close = () => { lead.busy = false; this.closeModal(ov); g.resume(); this.refresh(); };
    render();
  }

  // ------------------------------------------------------------ events
  openEvent(ev: PendingEvent) {
    const g = this.g;
    const def = EVENT_DEFS[ev.defId];
    if (!def) return;
    g.pause();
    const t = ev.data.teacherId !== undefined ? g.s.teachers.find((x) => x.id === ev.data.teacherId) : undefined;
    const st = ev.data.studentId !== undefined ? g.s.students.find((x) => x.id === ev.data.studentId) : undefined;
    const face = t?.look ?? st?.look ?? (ev.defId === 'aporte' ? INVESTOR_LOOK : undefined);
    const ov = this.modal(`
      <div class="ev-head">${face ? `<img class="modal-face pix" src="${portraitURL(face)}">` : `<div class="ev-big">${def.emoji}</div>`}<div><div class="m-kicker">${def.emoji} ${({ admin: 'Administrativo', professor: 'Professores', aluno: 'Alunos', oportunidade: 'Oportunidade', mercado: 'Mercado' })[def.category]}</div><div class="m-title">${def.title(g, ev)}</div></div></div>
      <p>${def.text(g, ev)}</p>
      <div class="m-opts">${def.options.map((o, k) => { const dis = o.disabled?.(g, ev); return `<button class="btn opt ${k === 0 ? 'primary' : ''}" data-k="${k}" ${dis ? 'disabled' : ''}>${o.label}${o.hint || dis ? `<small>${dis || o.hint}</small>` : ''}</button>`; }).join('')}</div>
      <button class="btn ghost small later">Decidir depois</button>`, 'event');
    ov.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const res = g.resolveEvent(ev, Number((b as HTMLElement).dataset.k));
      const m = ov.querySelector('.modal')!;
      m.innerHTML = `<div class="ev-big">${def.emoji}</div><div class="m-title">Resultado</div><p>${res}</p><button class="btn primary btn-confirm">OK</button>`;
      (m.querySelector('.btn-confirm') as HTMLElement).onclick = () => { this.closeModal(ov); g.resume(); this.refresh(); };
    }));
    (ov.querySelector('.later') as HTMLElement).onclick = () => { this.closeModal(ov); g.resume(); this.refresh(); };
  }

  meetingModal() {
    const g = this.g;
    g.pause();
    const ov = this.modal(`<div class="m-title">👥 Reunião de professores</div><p>Qual vai ser a pauta desta semana?</p>${meetingChoices()}<button class="btn ghost small later">Cancelar</button>`, 'wide');
    ov.querySelectorAll('[data-act=meet]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      g.teacherMeeting((b as HTMLElement).dataset.arg as any);
      this.closeModal(ov); g.resume(); this.refresh();
    }));
    (ov.querySelector('.later') as HTMLElement).onclick = () => { this.closeModal(ov); g.resume(); };
  }

  // ------------------------------------------------------------ school identity (name / uniform / fee)
  identity(first: boolean): Promise<void> {
    return new Promise((resolve) => {
      const g = this.g;
      const s = g.s;
      g.pause();
      const colors = ['#c24d6a', '#e05a4a', '#f08a3e', '#d8a63a', '#3f9a52', '#3fb7b0', '#4f8fd8', '#7a5ac8', '#2e2433'];
      let name = s.schoolName ?? `Escola ${firstName(s.playerName)}`;
      let color = s.uniform ?? colors[0];
      let ind = s.prices.ind;
      const ov = this.modal('', 'wide identity');
      const render = () => {
        const fair = g.fairPrice('ind');
        morph(ov.querySelector('.modal')!, `
          <div class="m-kicker">${first ? 'Inauguração' : 'Identidade da escola'}</div>
          <div class="m-title">${first ? '🏫 Como vai ser a sua escola?' : '🎨 Identidade da escola'}</div>
          <div class="id-grid">
            <div>
              <label class="id-lbl">Nome (vai na placa)</label>
              <input class="inp id-name" maxlength="26" value="${name.replace(/"/g, '')}">
              <label class="id-lbl">Cor do uniforme e da placa</label>
              <div class="id-colors">${colors.map((c) => `<button class="id-c ${c === color ? 'on' : ''}" data-c="${c}" style="--c:${c}"></button>`).join('')}</div>
              <label class="id-lbl">Mensalidade (aula individual)</label>
              <div class="price-row"><span class="small muted">Preço justo hoje ≈ ${money(fair)}. Vale para todos os alunos.</span><b class="big">${money(ind)}</b></div>
              <input type="range" min="120" max="800" step="10" value="${ind}" class="wide id-price">
              <div class="small muted">Cada aula individual rende <b>${money(ind / 4)}</b> (mensalidade ÷ 4 aulas). O salário de cada professor você negocia em 👥 Equipe.</div>
            </div>
            <div class="id-preview">
              <div class="id-sign" style="--c:${color}">${name.toUpperCase() || 'ESCOLA'}</div>
              <img class="pix id-uni" src="${portraitURL({ ...s.playerLook, shirt: color, accent: '#fff6dc' })}">
              <div class="small muted">Professores e equipe usam o uniforme.</div>
            </div>
          </div>
          <button class="btn primary big btn-confirm">${first ? 'Abrir a escola! 🎉' : 'Salvar'}</button>`);
      };
      render();
      ov.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.classList.contains('id-name')) { name = t.value; (ov.querySelector('.id-sign') as HTMLElement).textContent = name.toUpperCase() || 'ESCOLA'; }
        if (t.classList.contains('id-price')) { ind = Number(t.value); render(); }
      });
      ov.addEventListener('click', (e) => {
        const t = e.target as HTMLElement;
        const c = t.closest('[data-c]') as HTMLElement | null;
        if (c) { color = c.dataset.c!; sfx.click(); render(); return; }
        if (t.closest('.btn-confirm')) {
          s.schoolName = (name.trim() || `Escola ${firstName(s.playerName)}`).slice(0, 26);
          s.uniform = color;
          if (ind !== s.prices.ind) { if (s.students.length) g.applyPrice('ind', ind); else g.setPrice('ind', ind); }
          sfx.good();
          this.closeModal(ov);
          g.resume();
          g.invalidateScene();
          if (!first) g.setupWorldAgents();
          this.refresh();
          resolve();
        }
      });
    });
  }

  // ------------------------------------------------------------ salary negotiation
  negotiateModal(t: Teacher, hiring: boolean) {
    const g = this.g;
    const s = g.s;
    g.pause();
    const ask = g.askingWage(t);
    let offer = hiring ? ask : t.wage;
    const ov = this.modal('', 'wide');
    let msg = '';
    const render = () => {
      const revI = g.lessonRevenue('ind');
      const revG = g.has('turmas') ? g.lessonRevenue('grp') : 0;
      const ch = g.acceptChance(t, offer, hiring ? undefined : t.wage);
      morph(ov.querySelector('.modal')!, `
        <div class="ev-head"><img class="modal-face pix" src="${portraitURL(t.look)}"><div><div class="m-kicker">${hiring ? 'Contratação' : 'Renegociar salário'}</div><div class="m-title">${t.name}</div>
          <div class="small">${t.instruments.map((i) => INSTRUMENTS[i].emoji + ' ' + INSTRUMENTS[i].name).join(' · ')} · ${'★'.repeat(t.skill)}</div></div></div>
        <div class="neg-box">
          <div class="kv"><span>Ele(a) pede</span><b>${money(ask)} por aula</b></div>
          ${!hiring ? `<div class="kv"><span>Recebe hoje</span><b>${money(t.wage)} por aula</b></div>` : ''}
          <div class="price-row"><b>Sua proposta</b><b class="big">${money(offer)}</b></div>
          <input type="range" class="wide neg-range" min="${Math.round(ask * 0.5)}" max="${Math.round(ask * 1.6)}" step="1" value="${offer}">
          <div class="neg-calc">
            <div><small>Aula individual rende</small><b>${money(revI)}</b><small>você fica com</small><b class="${revI - offer >= 0 ? 'green' : 'red'}">${money(revI - offer)}</b></div>
            ${revG ? `<div><small>Turma cheia (${g.groupSize()}) rende</small><b>${money(revG)}</b><small>você fica com</small><b class="${revG - offer >= 0 ? 'green' : 'red'}">${money(revG - offer)}</b></div>` : ''}
            <div><small>Com agenda cheia (${t.hours}h)</small><b class="${(revI - offer) * t.hours >= 0 ? 'green' : 'red'}">${money((revI - offer) * t.hours)}/sem</b><small>de lucro (individual)</small></div>
          </div>
          <div class="neg-chance ${ch >= 0.8 ? 'hi' : ch >= 0.4 ? 'mid' : 'lo'}">Chance de aceitar: <b>${Math.round(ch * 100)}%</b></div>
          ${msg ? `<div class="alert">${msg}</div>` : ''}
        </div>
        <div class="row gap"><button class="btn primary btn-confirm">${hiring ? 'Fazer proposta' : 'Propor novo salário'}</button><button class="btn ghost neg-cancel">Cancelar</button></div>`);
    };
    render();
    const close = () => { this.closeModal(ov); g.resume(); this.refresh(); };
    ov.addEventListener('input', (e) => { const r = e.target as HTMLInputElement; if (r.classList.contains('neg-range')) { offer = Number(r.value); msg = ''; render(); } });
    ov.addEventListener('click', (e) => {
      const tg = e.target as HTMLElement;
      if (tg.closest('.neg-cancel')) { close(); return; }
      if (!tg.closest('.btn-confirm')) return;
      if (hiring && !s.candidates.includes(t)) { close(); return; }
      if (g.negotiate(t, offer, hiring)) {
        sfx.good();
        this.toast(`🤝 ${firstName(t.name)} aceitou ${money(offer)} por aula!`, 'good');
        close();
      } else {
        sfx.bad();
        if (hiring && offer / ask < 0.75) {
          s.candidates = s.candidates.filter((c) => c !== t);
          this.toast(`😤 ${firstName(t.name)} achou a proposta baixa e foi embora.`, 'bad');
          close();
        } else { msg = `${firstName(t.name)} recusou. Tente um valor um pouco maior.`; render(); }
      }
    });
  }

  // ------------------------------------------------------------ reports
  weekReport(st: WeekStats, extra: { rent: number; staff: number; forecast: number }): Promise<void> {
    return new Promise((resolve) => {
      const g = this.g;
      const led = Object.entries(st.ledger).sort((a, b) => b[1] - a[1]);
      const avgQ = st.lessons ? st.quality / st.lessons : 0;
      const net = st.revenue - st.costs;
      const ov = this.modal(`
        <div class="m-kicker">Fim da semana ${g.s.week}</div><div class="m-title">📒 Balanço da semana</div>
        <div class="rep-grid">
          <div><small>Receitas</small><b class="green">${money(st.revenue)}</b></div>
          <div><small>Despesas</small><b class="red">${money(st.costs)}</b></div>
          <div><small>Resultado</small><b class="${net >= 0 ? 'green' : 'red'}">${money(net)}</b></div>
          <div><small>Aulas dadas</small><b>${st.lessons}</b></div>
          <div><small>Qualidade média</small><b>${Math.round(avgQ)}%</b></div>
          <div><small>Interessados</small><b>${st.leads}</b></div>
          <div><small>Matrículas</small><b class="green">+${st.enrolled}</b></div>
          <div><small>Cancelamentos</small><b class="red">-${st.churned}</b></div>
          <div><small>Perdidos (sem vaga)</small><b class="${st.lostCap ? 'red' : ''}">${st.lostCap}</b></div>
          ${st.noise ? `<div><small>Aulas com barulho</small><b class="red">${st.noise}</b></div>` : ''}
        </div>
        <details><summary>Detalhes do caixa</summary>${led.map(([k, v]) => `<div class="kv small"><span>${k}</span><b class="${v >= 0 ? 'green' : 'red'}">${money(v)}</b></div>`).join('')}</details>
        <div class="kv total"><span>📈 Lucro previsto p/ próxima semana</span><b class="${extra.forecast >= 0 ? 'green' : 'red'}">${money(extra.forecast)}</b></div>
        ${st.lostCap >= 3 ? '<div class="alert">⚠️ Você perdeu alunos por falta de vaga. Veja 📊 Demanda: contrate professores ou equipe salas.</div>' : ''}
        ${(st.noise ?? 0) >= 3 ? '<div class="alert">🔊 Muitas aulas atrapalhadas por som vindo da sala ao lado. Troque as paredes por isolamento.</div>' : ''}
        <button class="btn primary big btn-confirm">Continuar</button>`, 'report');
      (ov.querySelector('.btn-confirm') as HTMLElement).onclick = () => { this.closeModal(ov); resolve(); };
    });
  }

  investorMeeting(r: { metCash: boolean; metProfit: boolean; cash: number; profit: number; goalCash: number; goalProfit: number; trustDelta: number; trust: number; grave: boolean }): Promise<void> {
    return new Promise((resolve) => {
      const both = r.metCash && r.metProfit;
      const grace = r.trustDelta === 0 && !both;
      const line = grace ? 'Primeiras semanas são de adaptação, vou pegar leve. Mas a partir de agora quero os dois números no verde.' : both ? (r.trust > 85 ? 'Impressionante. Continue assim e conversamos sobre crescer mais rápido.' : 'Bom trabalho. Meta batida. Semana que vem a régua sobe.')
        : r.metCash || r.metProfit ? 'Metade da meta não é meta. Quero ver os dois números no verde.'
        : r.grave ? 'Isso está muito abaixo do combinado. Se continuar assim, eu tiro meu dinheiro.' : 'Semana ruim. Me mostre um plano: mais alunos, menos custo, preço certo.';
      const ov = this.modal(`
        <div class="inv-head"><img class="modal-face pix" src="${portraitURL(INVESTOR_LOOK)}"><div><div class="m-kicker">Reunião de sábado</div><div class="m-title">Augusto Ferraz</div></div></div>
        <div class="quote">“${line}”</div>
        <div class="goal ${r.metCash ? 'ok' : 'no'}"><span>${r.metCash ? '✅' : '❌'} Caixa ≥ ${money(r.goalCash)}</span><b>${money(r.cash)}</b></div>
        <div class="goal ${r.metProfit ? 'ok' : 'no'}"><span>${r.metProfit ? '✅' : '❌'} Lucro previsto ≥ ${money(r.goalProfit)}</span><b>${money(r.profit)}</b></div>
        <div class="kv"><span>Confiança</span><b class="${r.trustDelta >= 0 ? 'green' : 'red'}">${r.trustDelta >= 0 ? '+' : ''}${r.trustDelta} → ${Math.round(r.trust)}%</b></div>
        <div class="tbar big"><div style="width:${r.trust}%" class="${r.trust < 30 ? 'low' : ''}"></div></div>
        ${r.trust < 30 && r.trust > 0 ? '<div class="alert">⚠️ A confiança está perigosamente baixa!</div>' : ''}
        <button class="btn primary big btn-confirm">${r.trust > 0 ? 'Próxima semana' : '...'}</button>`, 'report');
      if (both) sfx.good(); else sfx.bad();
      (ov.querySelector('.btn-confirm') as HTMLElement).onclick = () => { this.closeModal(ov); resolve(); };
    });
  }

  gameOver(kind: 'lost' | 'won') {
    const g = this.g;
    const s = g.s;
    const ov = this.modal(kind === 'won' ? `
      <div class="ev-big">🏆</div><div class="m-title">Você abriu a FILIAL!</div>
      <p>Da salinha do bairro a uma rede de escolas de música. A melhor estratégia venceu.</p>
      <div class="rep-grid"><div><small>Semanas</small><b>${s.week}</b></div><div><small>Alunos</small><b>${s.students.length}</b></div><div><small>Alunos no total</small><b>${s.totalStudentsEver}</b></div><div><small>Reputação</small><b>Nível ${s.level}</b></div><div><small>Caixa</small><b>${money(s.cash)}</b></div><div><small>Professores</small><b>${s.teachers.length - 1}</b></div></div>
      <div class="row gap"><button class="btn primary big" data-k="cont">Continuar jogando</button><button class="btn ghost" data-k="new">Novo jogo</button></div>`
      : `
      <img class="modal-face pix" src="${portraitURL(INVESTOR_LOOK)}">
      <div class="m-title">O investidor saiu da sociedade</div>
      <p>“Sinto muito, ${firstName(s.playerName)}. Os números não fecharam.” — Sem o dinheiro do Augusto, a escola fechou as portas.</p>
      <p class="muted">Dica: acompanhe 📊 Demanda (não perca alunos por falta de vaga), cuide da 📈 previsão de lucro e não gaste todo o caixa de uma vez.</p>
      <button class="btn primary big" data-k="new">Recomeçar do zero</button>`, 'report');
    ov.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.k;
      if (k === 'new') { clearSave(); location.reload(); }
      else { s.gameOver = null; this.closeModal(ov); g.resume(); }
    }));
  }

  menu() {
    const g = this.g;
    g.pause();
    const ov = this.modal(`<div class="m-title">☰ Menu</div>
      <div class="m-opts">
        <button class="btn primary opt" data-k="back">Voltar ao jogo</button>
        <button class="btn opt" data-k="help">Como jogar</button>
        <button class="btn opt" data-k="music">${isMusicOn() ? '🎵 Desligar música' : '🔇 Ligar música'}</button>
        <button class="btn opt" data-k="sfx">${isSfxOn() ? '🔊 Desligar efeitos' : '🔈 Ligar efeitos'}</button>
        <button class="btn ghost opt" data-k="new">Apagar progresso e recomeçar</button>
      </div>`, 'choice');
    ov.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => {
      const k = (b as HTMLElement).dataset.k;
      this.closeModal(ov);
      g.resume();
      if (k === 'music') setMusic(!isMusicOn());
      if (k === 'sfx') setSfx(!isSfxOn());
      if (k === 'help') {
        await this.dialog([
          { who: 'Dica', text: 'Clique nos espaços do prédio para construir salas, reformar e comprar instrumentos. Cada sala de aula comporta até 3 instrumentos.' },
          { who: 'Dica', text: 'Interessados (❓) chegam pela porta. Atenda-os para matricular — ou contrate vendedores. Se não houver professor + sala com o instrumento, eles vão para a lista de espera.' },
          { who: 'Dica', text: 'Aulas com ♪ são suas: clique no aluno para jogar o minigame. Quanto melhor, mais satisfeito o aluno fica.' },
          { who: 'Dica', text: 'Todo sábado o investidor confere o caixa e a previsão de lucro. Bata as metas para manter a confiança acima de zero.' },
          { who: 'Dica', text: 'Níveis de reputação dão Notas Musicais 🎵 para a árvore de habilidades. O objetivo final: abrir a Filial!' },
        ]);
      }
      if (k === 'new') {
        const c = await this.choice('Recomeçar?', 'Todo o progresso será apagado.', [{ label: 'Sim, apagar tudo' }, { label: 'Cancelar' }]);
        if (c === 0) { clearSave(); location.reload(); }
      }
    }));
  }
}

export { BOSS_LOOK };
