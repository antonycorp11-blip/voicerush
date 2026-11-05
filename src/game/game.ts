// Core simulation + world orchestration.
import type { Look } from '../art/characters';
import { randomLook } from '../art/characters';
import type { InstrumentId, MinigameKind } from '../data/instruments';
import { INSTRUMENTS, INSTRUMENT_IDS } from '../data/instruments';
import {
  CAMPAIGNS, CampaignId, DECOR_COST, DECOR_SKILL, MAX_DECOR, ROOM_ITEMS, ItemId, ROOM_TYPES, RoomType, SKILL_MAP,
  LAND, BUILD_PER_CELL, RENT_PER_CELL, WALL_COST, WALL_NAMES, WALL_SKILL,
  STAFF_ROLES, StaffRole, TRAITS, TraitId, RIVAL_FOCUS,
} from '../data/content';
import {
  GameState, Student, Teacher, Plot, Staff, Contract, PendingEvent, DAY_MINUTES, OPEN_HOUR, emptyStats,
  randomName, firstName, playerTeacher, saveGame, DAY_NAMES, Ch1Task, WeekStats,
} from './state';
import { Scene, SceneModel, Agent, PlotView } from './scene';
import { wallNeighbors } from './layout';
import { Layout, makeLayout, pathTo, pathBetween, pathToStreet, plotCx, plotFloor, SIDEWALK_Y, WORLD_W, Pt } from './layout';
import { sfx } from '../audio';
import { EVENT_DEFS, rollEvent } from './events';

export const BASE_PRICE = { ind: 280, grp: 160 };
export const MIN_PER_SEC = 7.5; // game minutes per real second at 1x
export const HOUR_ORDER = [17, 18, 16, 19, 15, 14, 10, 9, 11, 8, 13, 12];

export interface BuildSpot { side: 'top' | 'bottom'; col: number; w: number; h: number; label: string; cost: number; between: boolean }

export interface Lead {
  id: number;
  name: string;
  look: Look;
  instrument: InstrumentId;
  pref: 'ind' | 'grp';
  sens: number;
  until: number; // abs minute
  agent: Agent | null;
  busy?: boolean;
  fromWait?: boolean;
}

export interface Lesson {
  key: string;
  teacherId: number;
  plot: number;
  inst: InstrumentId;
  students: Student[];
  contract?: Contract;
  player: boolean;
  sub: boolean;
  score: number | null; // minigame score
  agents: Agent[];
  teacherAgent: Agent | null;
  hour: number;
  noise?: number;
  noiseFrom?: number | null;
}

export interface DialogLine { who: string; text: string; look?: Look; side?: 'l' | 'r' }

export interface UIHooks {
  toast(text: string, kind?: 'good' | 'bad' | 'info' | 'money' | 'level'): void;
  refresh(): void;
  dialog(lines: DialogLine[]): Promise<void>;
  choice(title: string, text: string, options: { label: string; sub?: string; disabled?: boolean }[], look?: Look): Promise<number>;
  openLead(lead: Lead): void;
  openEvent(ev: PendingEvent): void;
  weekReport(s: WeekStats, extra: { rent: number; staff: number; forecast: number }): Promise<void>;
  investorMeeting(r: { metCash: boolean; metProfit: boolean; cash: number; profit: number; goalCash: number; goalProfit: number; trustDelta: number; trust: number; grave: boolean }): Promise<void>;
  gameOver(kind: 'lost' | 'won'): void;
  identity(first: boolean): Promise<void>;
  minigame(o: { kind: MinigameKind; title?: string; subtitle?: string; instrument?: InstrumentId; difficulty?: number; portrait?: string; allowSkip?: boolean }): Promise<number>;
}

export const BOSS_LOOK: Look = { skin: '#dca277', hair: '#9a96a0', hairStyle: 5, shirt: '#55606e', pants: '#2f3440', shoes: '#3a2a24', extra: 'beard', accent: '#55606e' };
export const INVESTOR_LOOK: Look = { skin: '#efbf98', hair: '#2e2420', hairStyle: 0, shirt: '#2f3440', pants: '#2f3440', shoes: '#2a2a33', extra: 'glasses', accent: '#c24d6a' };
export const LANDLORD_LOOK: Look = { skin: '#b97d52', hair: '#4b3226', hairStyle: 5, shirt: '#58b06c', pants: '#6b5a48', shoes: '#3a2a24', extra: 'cap', accent: '#f2c14e' };

export const CH1_ROOMS = [
  { id: 0, side: 'top' as const, col: 32, w: 8, h: 7 },
  { id: 1, side: 'top' as const, col: 40, w: 8, h: 7 },
  { id: 2, side: 'bottom' as const, col: 32, w: 8, h: 7 },
  { id: 3, side: 'bottom' as const, col: 40, w: 8, h: 7 },
];

export class Game {
  s: GameState;
  scene: Scene;
  ui!: UIHooks;
  layout: Layout;
  speed = 1;
  pauses = 0;
  leads: Lead[] = [];
  lessons: Lesson[] = [];
  playerAgent: Agent | null = null;
  staffAgents: Map<number, Agent> = new Map();
  teacherAgents: Map<number, Agent> = new Map();
  leadAcc: Record<string, number> = {};
  modelVersion = 1;
  minuteAcc = 0;
  busyPlayer = false;
  ch1Busy = false;
  ambientTimer = 0;
  dirtyUI = true;

  /** Safe autosave (skipped mid end-of-day so the week is never settled twice). */
  save() {
    if (this.inEndDay || this.s.gameOver === 'lost') return;
    saveGame(this.s);
  }

  constructor(s: GameState, scene: Scene) {
    this.s = s;
    this.scene = scene;
    this.layout = makeLayout([], 0);
    if (s.chapter === 1) this.layout = makeLayout(CH1_ROOMS, 2);
    else this.relayout();
  }

  // ------------------------------------------------------------------ helpers
  rnd() { return Math.random(); }
  id() { return this.s.nextId++; }
  has(skill: string) { return this.s.skills.includes(skill); }
  teacher(id: number) { return this.s.teachers.find((t) => t.id === id); }
  get absMinute() { return this.s.dayIndex * DAY_MINUTES + this.s.minute; }
  get hour() { return OPEN_HOUR + Math.floor(this.s.minute / 60); }
  get paused() { return this.pauses > 0 || this.speed === 0 || this.s.chapter === 1 || !!this.s.gameOver; }
  groupSize() { return this.has('turmasG') ? 6 : 4; }
  staffOf(role: StaffRole) { return this.s.staff.filter((x) => x.role === role); }
  hasRoom(type: RoomType) { return this.s.plots.some((p) => p.owned && p.type === type); }
  ownedPlots() { return this.s.plots.filter((p) => p.owned); }

  pause() { this.pauses++; }
  resume() { this.pauses = Math.max(0, this.pauses - 1); }

  news(text: string, kind = 'info') {
    this.s.news.unshift({ day: this.s.dayIndex, text, kind });
    if (this.s.news.length > 40) this.s.news.pop();
  }

  addCash(n: number, ledger: string, x?: number, y?: number) {
    this.s.cash += n;
    if (n >= 0) this.s.stats.revenue += n; else this.s.stats.costs += -n;
    this.s.stats.ledger[ledger] = (this.s.stats.ledger[ledger] ?? 0) + n;
    if (x !== undefined && y !== undefined && Math.abs(n) >= 1) this.scene.addFloat(x, y, (n >= 0 ? '+' : '-') + 'R$' + Math.abs(Math.round(n)), n >= 0 ? '#ffe08a' : '#ff9a8a');
    this.dirtyUI = true;
  }

  spend(n: number, ledger: string): boolean {
    if (this.s.cash < n && this.s.chapter < 3) { this.ui.toast('Dinheiro insuficiente!', 'bad'); sfx.bad(); return false; }
    if (this.s.cash - n < -2000) { this.ui.toast('Dinheiro insuficiente! (limite do cheque especial)', 'bad'); sfx.bad(); return false; }
    this.addCash(-n, ledger);
    return true;
  }

  xpThreshold(l: number) { return 40 * l + 12.5 * l * (l - 1); }
  addXP(n: number) {
    this.s.xp += n;
    while (this.s.xp >= this.xpThreshold(this.s.level)) {
      this.s.level++;
      this.s.skillPoints++;
      sfx.levelUp();
      this.ui?.toast(`⭐ Reputação nível ${this.s.level}! +1 Nota musical para a árvore`, 'level');
      this.news(`A escola subiu para o nível ${this.s.level} de reputação.`, 'good');
    }
    this.dirtyUI = true;
  }

  // ------------------------------------------------------------------ scene model
  sceneModel(): SceneModel {
    const s = this.s;
    let plots: PlotView[];
    let sign = 'AULAS DE MÚSICA';
    let signColor = '#c24d6a';
    if (s.chapter === 1) {
      plots = [
        { index: 0, owned: true, type: 'office', decor: 2, equip: {}, items: ['luz', 'clima'], walls: 1 },
        { index: 1, owned: true, type: 'classroom', decor: 2, equip: { violao: 1, piano: 1, guitarra: 1 }, items: ['som', 'plantas', 'estante', 'luz'], walls: 1 },
        { index: 2, owned: true, type: 'reception', decor: 2, equip: {}, items: ['sofa', 'plantas', 'tv', 'clima'], walls: 1 },
        { index: 3, owned: true, type: 'classroom', decor: 2, equip: { canto: 1, bateria: 1, ukulele: 1 }, items: ['som', 'cadeiras', 'clima', 'luz'], walls: 1 },
      ];
      sign = 'ESTÚDIO SOM MAIOR';
      signColor = '#3f74c9';
    } else {
      plots = s.plots.map((p) => ({
        index: p.index,
        owned: p.owned,
        type: p.type,
        decor: p.decor,
        equip: p.equip,
        items: p.items,
        walls: p.walls,
        shared: !p.owned && p.index === this.layout.hall,
      }));
      if (s.chapter === 2) { sign = 'AULAS - SALA 2'; signColor = '#d08a2a'; }
      else {
        sign = (s.schoolName ?? 'Escola de Música').slice(0, 26);
        if (s.uniform) signColor = s.uniform;
      }
    }
    return { layout: this.layout, plots, sign, signColor, version: this.modelVersion, building: s.chapter > 1 ? s.building : 1 };
  }

  invalidateScene() {
    this.modelVersion++;
    this.syncScene();
  }

  syncScene() {
    this.scene.setModel(this.sceneModel(), this.hour >= 18);
  }

  // ------------------------------------------------------------------ main loop
  update(dt: number) {
    const sceneSpeed = this.paused ? 1 : this.speed;
    this.scene.hour = this.s.chapter === 1 ? 10 : this.hour + (this.s.minute % 60) / 60;
    this.scene.update(dt, sceneSpeed);
    this.ambient(dt);
    if (this.paused) return;
    this.minuteAcc += dt * MIN_PER_SEC * this.speed;
    let guard = 0;
    while (this.minuteAcc >= 1 && guard++ < 120) {
      this.minuteAcc -= 1;
      this.stepMinute();
      if (this.paused) { this.minuteAcc = 0; break; }
    }
  }

  ambient(dt: number) {
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 3 + Math.random() * 5;
      const fromLeft = Math.random() < 0.5;
      const y = SIDEWALK_Y + 6 + Math.random() * 8;
      const a = this.scene.spawn(randomLook(), fromLeft ? -12 : WORLD_W + 12, y, { speed: 28 + Math.random() * 10, tag: 'ped' });
      this.scene.walk(a, [{ x: fromLeft ? WORLD_W + 14 : -14, y }], () => this.scene.removeAgent(a));
    }
  }

  stepMinute() {
    const s = this.s;
    s.minute++;
    const m = s.minute;
    if (m % 60 === 30 && m + 30 < DAY_MINUTES) this.spawnArrivals(OPEN_HOUR + (m + 30) / 60);
    if (m % 60 === 0 && m < DAY_MINUTES) this.startHour(OPEN_HOUR + m / 60);
    if (m % 60 === 50) this.endLessons(OPEN_HOUR + Math.floor(m / 60));
    if (m % 10 === 0) this.checkLeads();
    if (m === 18 * 60 - OPEN_HOUR * 60) this.syncScene();
    if (m >= DAY_MINUTES) this.endDay();
    this.dirtyUI = true;
  }

  // ------------------------------------------------------------------ schedule / capacity
  teacherSlots(t: Teacher): Set<string> {
    const set = new Set<string>();
    for (const st of this.s.students) if (st.teacherId === t.id) set.add(st.day + '-' + st.hour);
    for (const c of this.s.contracts) if (c.teacherId === t.id) set.add(c.day + '-' + c.hour);
    return set;
  }
  roomSlots(plot: number): Set<string> {
    const set = new Set<string>();
    for (const st of this.s.students) if (st.plot === plot) set.add(st.day + '-' + st.hour);
    for (const c of this.s.contracts) if (c.plot === plot) set.add(c.day + '-' + c.hour);
    return set;
  }
  teacherLoad(t: Teacher) { return this.teacherSlots(t).size; }

  classrooms(inst?: InstrumentId): Plot[] {
    return this.s.plots.filter((p) => p.owned && p.type === 'classroom' && (!inst || p.equip[inst] !== undefined));
  }

  findSlot(inst: InstrumentId, kind: 'ind' | 'grp', size = 1):
    { ok: true; teacherId: number; plot: number; day: number; hour: number; join: boolean } | { ok: false; reason: 'noTeacher' | 'noRoom' | 'noHours' } {
    const teachers = this.s.teachers.filter((t) => t.instruments.includes(inst) && t.hours > 0);
    const rooms = this.classrooms(inst);
    if (!teachers.length) return { ok: false, reason: 'noTeacher' };
    if (!rooms.length) return { ok: false, reason: 'noRoom' };
    if (kind === 'grp' && size === 1) {
      const groups = new Map<string, Student[]>();
      for (const st of this.s.students) if (st.kind === 'grp' && st.instrument === inst) {
        const k = `${st.teacherId}|${st.plot}|${st.day}|${st.hour}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(st);
      }
      for (const [k, list] of groups) if (list.length < this.groupSize()) {
        const [tid, plot, day, hour] = k.split('|').map(Number);
        return { ok: true, teacherId: tid, plot, day, hour, join: true };
      }
    }
    const tSlots = teachers.map((t) => ({ t, used: this.teacherSlots(t) }));
    const rSlots = rooms.map((r) => ({ r, used: this.roomSlots(r.index) }));
    // prefer the teacher with most free hours, but player last
    tSlots.sort((a, b) => (a.t.isPlayer ? 1 : 0) - (b.t.isPlayer ? 1 : 0) || (b.t.hours - b.used.size) - (a.t.hours - a.used.size));
    let anyHours = false;
    for (const hour of HOUR_ORDER) {
      for (let day = 0; day < 6; day++) {
        if (day === 5 && hour > 13) continue;
        const key = day + '-' + hour;
        for (const ts of tSlots) {
          if (ts.used.size >= ts.t.hours) continue;
          anyHours = true;
          if (ts.used.has(key)) continue;
          for (const rs of rSlots) {
            if (rs.used.has(key)) continue;
            return { ok: true, teacherId: ts.t.id, plot: rs.r.index, day, hour, join: false };
          }
        }
      }
    }
    return { ok: false, reason: anyHours ? 'noRoom' : 'noHours' };
  }

  /** Free lesson places for instrument (approximate). */
  capacity(inst: InstrumentId): { free: number; reason: string } {
    const teachers = this.s.teachers.filter((t) => t.instruments.includes(inst) && t.hours > 0);
    const rooms = this.classrooms(inst);
    if (!teachers.length) return { free: 0, reason: 'Falta professor' };
    if (!rooms.length) return { free: 0, reason: 'Falta sala com o instrumento' };
    let tFree = 0;
    for (const t of teachers) tFree += Math.max(0, t.hours - this.teacherLoad(t));
    let rFree = 0;
    for (const r of rooms) rFree += Math.max(0, 66 - this.roomSlots(r.index).size);
    const free = Math.min(tFree, rFree);
    if (free <= 0) return { free: 0, reason: tFree <= 0 ? 'Professores lotados' : 'Salas lotadas' };
    return { free, reason: 'OK' };
  }

  // ------------------------------------------------------------------ quality / pricing
  schoolQuality(): number {
    const lw = this.s.lastWeek;
    if (lw && lw.lessons > 3) return lw.quality / lw.lessons;
    if (this.s.stats.lessons > 3) return this.s.stats.quality / this.s.stats.lessons;
    return 58;
  }

  lessonQuality(t: Teacher | undefined, plot: Plot | undefined, inst: InstrumentId, group: boolean, opts: { score?: number | null; player?: boolean; sub?: boolean } = {}) {
    let q: number;
    if (opts.player) q = opts.score != null && opts.score >= 0 ? 28 + opts.score * 0.62 : 50;
    else if (t) q = 22 + t.skill * 11 + (t.morale - 60) * 0.12 + (t.traits.includes('virtuoso') ? 8 : 0);
    else q = 50;
    if (plot) {
      q += (plot.equip[inst] ?? 0) * 6 + plot.decor * 3.5;
      for (const it of ['som', 'luz', 'estante']) if (plot.items.includes(it)) q += 2;
    }
    if (this.has('metodo')) q += 5;
    if (this.has('apostilas')) q += 5;
    if (this.has('mestre')) q += 10;
    if (this.staffOf('coordenador').length) q += 8;
    if (group) q += t?.traits.includes('paciente') ? 2 : -5;
    if (opts.sub) q -= 8;
    return Math.max(5, Math.min(100, q));
  }

  fairPrice(kind: 'ind' | 'grp') {
    const q = this.schoolQuality();
    let f = BASE_PRICE[kind] * (0.72 + (q / 100) * 0.6 + (this.s.level - 1) * 0.025);
    if (this.has('mestre')) f *= 1.15;
    if (this.has('conforto')) f *= 1.1;
    return f;
  }

  conversion(lead: { pref: 'ind' | 'grp'; sens: number }, kind: 'ind' | 'grp', price: number, extra = 0) {
    const ratio = price / this.fairPrice(kind);
    let pf = 1 - (ratio - 1) * (0.6 + lead.sens * 1.4);
    pf = Math.max(0.02, Math.min(1.35, pf));
    const pref = kind === lead.pref ? 1 : 0.55;
    let c = 0.62 * pf * pref + extra;
    const rec = this.s.plots.find((p) => p.owned && p.type === 'reception');
    if (rec) c += 0.03 + rec.items.length * 0.012 + (rec.items.includes('tv') ? 0.03 : 0) + rec.decor * 0.01;
    if (this.has('precificacao')) c += 0.1;
    if (this.s.rivals.some((r) => r.alive && r.promo > 0)) c *= 0.9;
    return Math.max(0.02, Math.min(0.95, c));
  }

  expectation(st: { fee: number; kind: 'ind' | 'grp' }) {
    return 50 + (st.fee / BASE_PRICE[st.kind] - 1) * 45;
  }

  // ------------------------------------------------------------------ market / leads
  attractiveness(): number {
    const s = this.s;
    const avgSat = s.students.length ? s.students.reduce((a, b) => a + b.sat, 0) / s.students.length : 60;
    const q = this.schoolQuality();
    let a = (0.6 + s.level * 0.25) * (0.6 + (q / 100) * 0.8) * (0.7 + (avgSat / 100) * 0.6);
    let mult = 1;
    for (const c of s.campaigns) if (!CAMPAIGNS[c.id].focused) mult += CAMPAIGNS[c.id].mult;
    a *= mult;
    if (this.has('indique')) a *= 1.15;
    if (this.has('marca')) a *= 1.25;
    a *= 1 + Math.min(1, s.youtube.subs / 2500) * 0.6;
    if (s.youtube.boostWeeks > 0) a *= 1.3;
    for (const t of s.teachers) if (t.traits.includes('influencer')) a *= 1.08;
    const rivalAvg = s.rivals.filter((r) => r.alive).reduce((x, r) => x + r.price, 0) / Math.max(1, s.rivals.filter((r) => r.alive).length);
    a *= Math.pow(rivalAvg / Math.max(60, s.prices.ind), 0.45);
    if (s.chapter === 2) a *= 0.9;
    return a;
  }

  rivalAttract(r: GameState['rivals'][0]) {
    let a = r.rep * 0.25 * (r.quality / 60) * r.marketing;
    if (r.promo > 0) a *= 1.5;
    return a;
  }

  weeklyLeads(): Record<InstrumentId, number> {
    const s = this.s;
    const ours = this.attractiveness();
    const city = 100 + (s.chapter === 3 ? Math.min(80, (s.investor?.week ?? 0) * 4) : 0);
    const out = {} as Record<InstrumentId, number>;
    for (const i of INSTRUMENT_IDS) {
      let our = ours;
      for (const c of s.campaigns) if (CAMPAIGNS[c.id].focused && c.instrument === i) our *= 1 + CAMPAIGNS[c.id].mult;
      let rivals = 0;
      for (const r of s.rivals) if (r.alive) rivals += this.rivalAttract(r) * (RIVAL_FOCUS[r.id]?.includes(i) ? 1.5 : 0.75);
      const trend = s.trend && s.trend.instrument === i ? 2 : 1;
      out[i] = city * INSTRUMENTS[i].popularity * trend * (our / (our + rivals));
    }
    return out;
  }

  marketShare(): { name: string; color: string; share: number; me?: boolean }[] {
    const ours = this.attractiveness();
    const list = [{ name: this.schoolName(), color: '#f2a63a', a: ours, me: true }];
    for (const r of this.s.rivals) if (r.alive) list.push({ name: r.name, color: r.color, a: this.rivalAttract(r), me: false });
    const tot = list.reduce((x, y) => x + y.a, 0);
    return list.map((l) => ({ name: l.name, color: l.color, share: l.a / tot, me: l.me }));
  }

  schoolName() {
    if (this.s.chapter === 1) return `${this.s.playerName} · professor`;
    if (this.s.chapter === 3 && this.s.schoolName) return this.s.schoolName;
    return this.s.chapter === 3 ? `Escola ${firstName(this.s.playerName)}` : `Sala do ${firstName(this.s.playerName)}`;
  }

  spawnLeads() {
    const wl = this.weeklyLeads();
    for (const i of INSTRUMENT_IDS) {
      this.leadAcc[i] = (this.leadAcc[i] ?? Math.random()) + wl[i] / 66;
      while (this.leadAcc[i] >= 1) {
        this.leadAcc[i] -= 1;
        this.newLead(i);
      }
    }
  }

  waitSpots(): { plot: number; spots: Pt[] } {
    const L = this.layout;
    const rec = this.s.plots.find((p) => p.owned && p.type === 'reception');
    if (rec) return { plot: rec.index, spots: this.scene.roomSpots(rec.index)?.wait ?? [] };
    if (this.s.chapter === 2) {
      const room = this.s.plots.find((p) => p.owned && p.type === 'classroom');
      if (room) {
        const f = plotFloor(L, room.index);
        return { plot: room.index, spots: [{ x: f.x + 14, y: f.y + f.h - 8 }, { x: f.x + 30, y: f.y + f.h - 6 }, { x: f.x + f.w - 14, y: f.y + f.h - 8 }] };
      }
    }
    return { plot: L.hall, spots: this.scene.roomSpots(L.hall)?.wait ?? [] };
  }

  newLead(inst: InstrumentId, preset?: Partial<Lead>) {
    const s = this.s;
    s.stats.leads++;
    s.stats.byInst[inst].leads++;
    const pref: 'ind' | 'grp' = this.has('turmas') && Math.random() < 0.38 ? 'grp' : 'ind';
    const lead: Lead = {
      id: this.id(),
      name: randomName(),
      look: randomLook(),
      instrument: inst,
      pref,
      sens: 0.15 + Math.random() * 0.85,
      until: this.absMinute + 240 + (this.s.plots.some((p) => p.owned && p.items.includes('sofa')) ? 90 : 0),
      agent: null,
      ...preset,
    };
    // auto waitlist if seller busy etc handled in checkLeads
    const ws = this.waitSpots();
    const used = new Set(this.leads.map((l) => l.agent?.data?.spot));
    let spotIdx = ws.spots.findIndex((_, k) => !used.has(ws.plot + ':' + k));
    if (spotIdx < 0) spotIdx = Math.floor(Math.random() * Math.max(1, ws.spots.length));
    const target = ws.spots[spotIdx] ?? { x: plotCx(this.layout, ws.plot), y: plotFloor(this.layout, ws.plot).y + 40 };
    const a = this.scene.spawn(lead.look, -12, SIDEWALK_Y, { clickable: false, tag: 'lead', data: { spot: ws.plot + ':' + spotIdx, lead: lead.id } });
    const path = pathTo(this.layout, ws.plot, { x: target.x + (spotIdx >= ws.spots.length ? Math.random() * 10 : 0), y: target.y });
    a.x = path[0].x; a.y = path[0].y;
    this.scene.walk(a, path.slice(1), () => {
      a.bubble = 'q';
      a.clickable = true;
      a.dir = 'down';
      a.onClick = () => this.ui.openLead(lead);
    });
    lead.agent = a;
    this.leads.push(lead);
  }

  checkLeads() {
    const now = this.absMinute;
    // sellers
    const sellers = this.staffOf('vendedor');
    if (sellers.length) {
      let budget = sellers.length * 2;
      for (const l of this.leads) {
        if (budget <= 0) break;
        if (l.busy || !l.agent || l.agent.moving) continue;
        budget--;
        const sk = sellers.reduce((a, b) => a + b.skill, 0) / sellers.length;
        this.autoHandleLead(l, 0.02 * sk);
      }
    }
    for (const l of [...this.leads]) {
      if (l.busy) continue;
      if (now > l.until) {
        this.s.stats.lostPrice++;
        this.s.stats.byInst[l.instrument].lostPrice++;
        this.leadLeaves(l, 'sad');
        this.ui.toast(`${firstName(l.name)} cansou de esperar e foi embora 😕`, 'bad');
      }
    }
  }

  autoHandleLead(l: Lead, bonus: number) {
    const slotI = this.findSlot(l.instrument, 'ind');
    const slotG = this.has('turmas') ? this.findSlot(l.instrument, 'grp') : null;
    let kind: 'ind' | 'grp' = l.pref;
    if (kind === 'grp' && !(slotG && slotG.ok)) kind = 'ind';
    if (kind === 'ind' && !slotI.ok && slotG && slotG.ok) kind = 'grp';
    const slot = kind === 'ind' ? slotI : slotG!;
    if (!slot.ok) {
      this.toWaitlist(l, kind);
      return;
    }
    const price = kind === 'ind' ? this.s.prices.ind : this.s.prices.grp;
    const c = this.conversion(l, kind, price, bonus);
    if (Math.random() < c) this.enroll(l, kind, price);
    else this.declineLead(l);
  }

  toWaitlist(l: Lead, kind: 'ind' | 'grp') {
    const s = this.s;
    s.stats.lostCap++;
    s.stats.byInst[l.instrument].lostCap++;
    if (s.waitlist.length < 30) s.waitlist.push({ name: l.name, look: l.look, instrument: l.instrument, kind, sens: l.sens, since: s.dayIndex });
    this.leadLeaves(l, 'zz');
  }

  declineLead(l: Lead) {
    this.s.stats.lostPrice++;
    this.s.stats.byInst[l.instrument].lostPrice++;
    this.leadLeaves(l, 'sad');
  }

  leadLeaves(l: Lead, bubble: 'sad' | 'heart' | 'zz') {
    this.leads = this.leads.filter((x) => x !== l);
    const a = l.agent;
    if (a) {
      a.clickable = false;
      a.onClick = null;
      a.bubble = bubble;
      const ws = this.waitSpots();
      this.scene.walk(a, pathToStreet(this.layout, ws.plot, a), () => this.scene.removeAgent(a));
    }
    this.dirtyUI = true;
  }

  enroll(l: { name: string; look: Look; instrument: InstrumentId; sens: number }, kind: 'ind' | 'grp', fee: number, quiet = false): Student | null {
    const slot = this.findSlot(l.instrument, kind);
    if (!slot.ok) return null;
    const s = this.s;
    const st: Student = {
      id: this.id(),
      name: l.name,
      look: l.look,
      instrument: l.instrument,
      kind,
      fee: Math.round(fee),
      teacherId: slot.teacherId,
      plot: slot.plot,
      day: slot.day,
      hour: slot.hour,
      sat: 70,
      weeksLeft: this.has('semestral') ? 24 : 12,
    };
    s.students.push(st);
    s.stats.enrolled++;
    s.stats.byInst[l.instrument].enrolled++;
    s.totalStudentsEver++;
    this.addXP(6);
    if (!quiet) {
      sfx.coin();
      this.ui.toast(`🎉 ${firstName(st.name)} se matriculou em ${INSTRUMENTS[st.instrument].name} (${kind === 'grp' ? 'turma' : 'individual'}) · ${DAY_NAMES[st.day]} ${st.hour}h`, 'good');
    }
    const lead = this.leads.find((x) => x.name === l.name);
    if (lead) this.leadLeaves(lead, 'heart');
    this.dirtyUI = true;
    return st;
  }

  /** Try enrolling people from the waitlist (after capacity grows). */
  processWaitlist() {
    const s = this.s;
    const keep: typeof s.waitlist = [];
    let n = 0;
    for (const w of s.waitlist) {
      if (s.dayIndex - w.since > 12) continue; // gave up
      const slot = this.findSlot(w.instrument, w.kind);
      if (slot.ok && Math.random() < 0.65) {
        const price = w.kind === 'ind' ? s.prices.ind : s.prices.grp;
        const c = this.conversion({ pref: w.kind, sens: w.sens }, w.kind, price, 0.1);
        if (Math.random() < c && this.enroll(w, w.kind, price, true)) { n++; continue; }
      }
      if (!slot.ok) keep.push(w);
    }
    s.waitlist = keep;
    if (n) this.ui.toast(`📋 ${n} pessoa(s) da lista de espera se matricularam!`, 'good');
  }

  // ------------------------------------------------------------------ lessons
  lessonsAt(day: number, hour: number): Lesson[] {
    const map = new Map<string, Lesson>();
    for (const st of this.s.students) {
      if (st.day !== day || st.hour !== hour) continue;
      const key = st.kind === 'grp' ? `g|${st.teacherId}|${st.plot}|${st.instrument}` : `i|${st.id}`;
      if (!map.has(key)) map.set(key, { key, teacherId: st.teacherId, plot: st.plot, inst: st.instrument, students: [], player: false, sub: false, score: null, agents: [], teacherAgent: null, hour });
      map.get(key)!.students.push(st);
    }
    for (const c of this.s.contracts) {
      if (c.day !== day || c.hour !== hour) continue;
      map.set('c|' + c.id, { key: 'c|' + c.id, teacherId: c.teacherId, plot: c.plot, inst: c.instrument, students: [], contract: c, player: false, sub: false, score: null, agents: [], teacherAgent: null, hour });
    }
    const out = [...map.values()];
    for (const l of out) {
      const t = this.teacher(l.teacherId);
      l.player = !!t?.isPlayer || (!!t?.absent && t.cover === 'player');
      l.sub = !!t?.absent && t.cover === 'sub';
    }
    return out.filter((l) => {
      const t = this.teacher(l.teacherId);
      return !(t?.absent && (t.cover === 'cancel' || !t.cover));
    });
  }

  slotPos(plot: number, inst: InstrumentId) {
    const sp = this.scene.roomSpots(plot);
    const slot = sp?.slots.find((x) => x.inst === inst);
    const f = plotFloor(this.layout, plot);
    return { slot, teacher: slot ? { x: slot.x + 15, y: slot.y + 4 } : { x: f.x + f.w / 2, y: f.y + 40 }, chairs: sp?.chairs ?? [] };
  }

  spawnArrivals(hour: number) {
    const ls = this.lessonsAt(this.s.day, hour);
    for (const l of ls) {
      const pos = this.slotPos(l.plot, l.inst);
      const people: { look: Look; target: Pt; main: boolean }[] = [];
      if (l.contract) {
        for (let k = 0; k < Math.min(5, l.contract.size); k++) people.push({ look: randomLook(), target: pos.chairs[k] ?? pos.teacher, main: k === 0 && !!pos.slot });
      } else {
        l.students.forEach((st, k) => {
          const main = k === 0 && !!pos.slot;
          const target = main ? { x: pos.slot!.x, y: pos.slot!.y } : pos.chairs[k] ?? { x: pos.teacher.x - 10, y: pos.teacher.y + 8 };
          people.push({ look: st.look, target, main });
        });
      }
      for (const pp of people) {
        const a = this.scene.spawn(pp.look, -12, SIDEWALK_Y, { tag: 'student', speed: 52 });
        const path = pathTo(this.layout, l.plot, pp.target);
        a.x = path[0].x; a.y = path[0].y;
        a.data = { lessonKey: l.key, day: this.s.dayIndex, hour, main: pp.main };
        this.scene.walk(a, path.slice(1), () => {
          a.dir = pp.main ? 'down' : 'up';
          if (!pp.main) a.dir = 'up';
        });
      }
    }
  }

  startHour(hour: number) {
    const s = this.s;
    // lessons
    const ls = this.lessonsAt(s.day, hour);
    for (const l of ls) {
      l.agents = this.scene.agents.filter((a) => a.data?.lessonKey === l.key && a.data.day === s.dayIndex && a.data.hour === hour);
      const pos = this.slotPos(l.plot, l.inst);
      for (const a of l.agents) {
        if (a.data.main && pos.slot) {
          a.face = 'down';
          if (pos.slot.kind === 'hold') a.held = l.inst;
        }
      }
      // teacher agent
      if (l.player) {
        if (this.playerAgent && !this.busyPlayer) this.movePlayerTo(l.plot, pos.teacher);
        const main = l.agents[0];
        if (main) {
          main.bubble = 'note';
          main.clickable = true;
          main.onClick = () => this.playLesson(l);
        }
      } else {
        const t = this.teacher(l.teacherId);
        let ta = this.teacherAgents.get(l.teacherId);
        const look = this.uniformed(l.sub ? randomLook() : t?.look ?? randomLook());
        if (!ta || l.sub) {
          ta = this.scene.spawn(look, -12, SIDEWALK_Y, { tag: 'teacher', speed: 60 });
          const path = pathTo(this.layout, l.plot, pos.teacher);
          ta.x = path[0].x; ta.y = path[0].y;
          this.scene.walk(ta, path.slice(1));
          if (!l.sub) this.teacherAgents.set(l.teacherId, ta);
        } else {
          const curPlot = ta.data?.plot ?? l.plot;
          this.scene.walk(ta, pathBetween(this.layout, curPlot, ta, l.plot, pos.teacher));
        }
        ta.face = 'left';
        ta.data = { plot: l.plot };
        l.teacherAgent = ta;
      }
      this.scene.setActive(l.plot, [l.inst], 50 / MIN_PER_SEC / Math.max(1, this.speed));
      this.lessons.push(l);
    }
    if (ls.length && ls.some((l) => l.player)) {
      const n = ls.filter((l) => l.player).length;
      this.ui.toast(`🎵 ${n === 1 ? 'Sua aula começou' : n + ' aulas suas começaram'}! Clique no aluno com ♪ para dar a aula (minigame).`, 'info');
    }
    // leads
    if (s.chapter >= 2) this.spawnLeads();
    // rehearsal bookings & studio
    this.roomBusiness(hour);
    // sound leaking through walls (computed once everything for this hour started)
    for (const l of ls) { const n = this.noiseAt(l.plot); l.noise = n.level; l.noiseFrom = n.from; }
    // recital
    if (s.recital && s.recital.week === s.week && s.day === 5 && hour === 15) this.runRecital();
    this.dirtyUI = true;
  }

  movePlayerTo(plot: number, target: Pt) {
    const a = this.playerAgent;
    if (!a) return;
    const from = a.data?.plot ?? this.layout.hall;
    this.scene.walk(a, pathBetween(this.layout, from, a, plot, target));
    a.data = { ...(a.data ?? {}), plot };
    a.face = 'left';
  }

  async playLesson(l: Lesson) {
    if (this.busyPlayer || l.score !== null) return;
    const main = l.agents[0];
    const st = l.students[0];
    this.busyPlayer = true;
    this.pause();
    if (main) { main.bubble = null; main.clickable = false; }
    const kinds = INSTRUMENTS[l.inst].minigames;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const plot = this.s.plots[l.plot];
    const diff = Math.min(3, Math.floor((this.s.level - 1) / 3) + (l.students.length > 1 ? 1 : 0));
    const score = await this.ui.minigame({
      kind,
      instrument: l.inst,
      title: l.contract ? `Turma: ${l.contract.name}` : st ? `Aula com ${firstName(st.name)}` : 'Aula',
      subtitle: l.students.length > 1 ? `Turma com ${l.students.length} alunos` : plot && plot.equip[l.inst] !== undefined ? INSTRUMENTS[l.inst].equipTiers[plot.equip[l.inst]!].name : undefined,
      difficulty: diff,
      portrait: undefined,
    });
    l.score = score;
    if (score >= 0) this.addXP(score >= 85 ? 8 : 5);
    this.busyPlayer = false;
    this.resume();
    this.dirtyUI = true;
  }

  endLessons(hour: number) {
    const s = this.s;
    const done = this.lessons.filter((l) => l.hour === hour);
    this.lessons = this.lessons.filter((l) => l.hour !== hour);
    for (const l of done) {
      const t = this.teacher(l.teacherId);
      const plot = s.plots[l.plot];
      const group = l.students.length > 1 || !!l.contract || l.students[0]?.kind === 'grp';
      let q = this.lessonQuality(t, plot, l.inst, group, { score: l.score, player: l.player, sub: l.sub });
      const noise = l.noise ?? 0;
      if (noise > 0.5) {
        q = Math.max(5, q - noise * 7);
        s.stats.noise = (s.stats.noise ?? 0) + 1;
        const key = `noise${l.plot}_${s.dayIndex}`;
        if (noise > 0.9 && !s.flags[key] && Math.random() < 0.6) {
          s.flags[key] = 1;
          const src = l.noiseFrom != null ? s.plots[l.noiseFrom] : null;
          const what = src ? (src.type === 'classroom' ? 'a aula da sala ao lado' : 'a banda ao lado') : 'a sala ao lado';
          if (l.agents[0]) l.agents[0].bubble = 'noise';
          this.ui.toast(`🔊 ${l.students[0] ? firstName(l.students[0].name) : 'Um aluno'} reclamou: "dá pra ouvir ${what}!" — melhore as paredes da ${this.roomLabel(plot)}.`, 'bad');
          this.news(`🔊 Reclamação de barulho na ${this.roomLabel(plot)}.`, 'bad');
        }
      }
      s.stats.lessons++;
      s.stats.quality += q;
      let revenue = 0;
      for (const st of l.students) {
        const exp = this.expectation(st);
        let d = (q - exp) * 0.22;
        if (t?.traits.includes('carismatico') && !l.sub) d += 1.5;
        if (l.player && l.score != null && l.score >= 85) d += 3;
        if (plot) for (const it of ['cadeiras', 'clima', 'plantas']) if (plot.items.includes(it)) d += 0.4;
        if (noise > 0.5) d -= noise * 1.6;
        st.sat = Math.max(0, Math.min(100, st.sat + d));
        if (!st.unpaid) revenue += st.fee / 4;
        if (this.hasRoom('lounge') && Math.random() < 0.35) revenue += 8;
      }
      if (l.contract) revenue += 0; // contracts pay weekly
      const pos = this.slotPos(l.plot, l.inst);
      const fx = pos.slot?.x ?? plotCx(this.layout, l.plot);
      const fy = (pos.slot?.y ?? 100) - 26;
      let cost = 0;
      if (t && !t.isPlayer && !(t.absent && t.cover === 'player')) cost = t.wage * (l.sub ? 1.5 : 1);
      const net = revenue - cost;
      if (revenue) this.addCash(revenue, 'Mensalidades');
      if (cost) this.addCash(-cost, 'Salário professores');
      if (Math.abs(net) >= 1) this.scene.addFloat(fx, fy, (net >= 0 ? '+R$' : '-R$') + Math.abs(Math.round(net)), net >= 0 ? '#ffe08a' : '#ff9a8a');
      this.addXP(q >= 75 ? 2 : 1);
      // leave
      for (const a of l.agents) {
        a.held = null;
        a.bubble = a.bubble === 'noise' ? 'noise' : q >= 78 ? 'heart' : q < 40 ? 'sad' : null;
        a.clickable = false;
        a.onClick = null;
        this.scene.walk(a, pathToStreet(this.layout, l.plot, a), () => this.scene.removeAgent(a));
      }
      if (l.player && l.score === null && l.students[0]) {
        // auto lesson
      }
    }
    // teachers without next lesson leave
    const next = this.lessonsAt(s.day, hour + 1);
    for (const [tid, ta] of [...this.teacherAgents]) {
      if (!next.some((l) => l.teacherId === tid && !l.player)) {
        this.scene.walk(ta, pathToStreet(this.layout, ta.data?.plot ?? this.layout.hall, ta), () => this.scene.removeAgent(ta));
        this.teacherAgents.delete(tid);
      }
    }
    for (const a of this.scene.agents) if (a.tag === 'teacher' && !this.teacherAgents.has(-1) && !a.path.length && ![...this.teacherAgents.values()].includes(a) && a.data?.plot !== undefined && !a.remove) {
      // substitute teachers leave
      this.scene.walk(a, pathToStreet(this.layout, a.data.plot, a), () => this.scene.removeAgent(a));
      a.data = {};
    }
    // player returns to idle
    if (this.playerAgent && !next.some((l) => l.player) && !this.busyPlayer) this.playerIdle();
    // bands leave
    for (const a of this.scene.agents) if (a.tag === 'band' && a.data?.hour === hour) this.scene.walk(a, pathToStreet(this.layout, a.data.plot, a), () => this.scene.removeAgent(a));
    this.dirtyUI = true;
  }

  roomBusiness(hour: number) {
    const s = this.s;
    for (const p of s.plots) {
      if (!p.owned) continue;
      if (p.type === 'rehearsal' || p.type === 'booth') {
        const small = p.type === 'booth';
        const ok = (s.day < 5 && hour >= 17) || (s.day === 5 && hour >= 9);
        if (!ok) continue;
        const prob = Math.min(0.94, (0.3 + p.decor * 0.1 + p.items.length * 0.05) * Math.pow(50 / Math.max(10, s.prices.rehearsal), 1.2));
        if (Math.random() < prob) {
          const price = Math.round(s.prices.rehearsal * (small ? 0.7 : 1.25));
          const sp = this.scene.roomSpots(p.index);
          const n = small ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 2);
          for (let k = 0; k < n; k++) {
            const target = sp?.band[k] ?? { x: plotCx(this.layout, p.index), y: plotFloor(this.layout, p.index).y + 40 };
            const a = this.scene.spawn(randomLook(), -12, SIDEWALK_Y, { tag: 'band', speed: 60 });
            const path = pathTo(this.layout, p.index, target);
            a.x = path[0].x; a.y = path[0].y;
            a.data = { hour, plot: p.index };
            a.face = 'down';
            if (k === 2) a.held = 'guitarra';
            if (k === 3) a.held = 'baixo';
            this.scene.walk(a, path.slice(1));
          }
          this.scene.setActive(p.index, [], 50 / MIN_PER_SEC / Math.max(1, this.speed));
          const f = plotFloor(this.layout, p.index);
          this.addCash(price, 'Sala de ensaio', plotCx(this.layout, p.index), f.y + 20);
        }
      }
      if (p.type === 'studio' && s.day < 6 && hour >= 10 && hour <= 19 && Math.random() < (0.18 + p.decor * 0.04) * Math.max(0.2, 1 - this.noiseRisk(p.index) * 0.35)) {
        const f = plotFloor(this.layout, p.index);
        this.scene.setActive(p.index, [], 50 / MIN_PER_SEC / Math.max(1, this.speed));
        this.addCash(140, 'Estúdio', plotCx(this.layout, p.index), f.y + 20);
      }
    }
  }

  // ------------------------------------------------------------------ day / week
  playerIdle() {
    const a = this.playerAgent;
    if (!a) return;
    const s = this.s;
    let plot = this.layout.hall;
    let target: Pt;
    const rec = s.plots.find((p) => p.owned && p.type === 'reception');
    if (rec) { plot = rec.index; const f = plotFloor(this.layout, plot); target = { x: f.x + f.w - 60, y: f.y + 44 }; }
    else {
      const room = s.plots.find((p) => p.owned && p.type === 'classroom');
      if (room) { plot = room.index; const f = plotFloor(this.layout, plot); target = { x: f.x + f.w / 2 + 14, y: f.y + f.h - 16 }; }
      else { const f = plotFloor(this.layout, plot); target = { x: f.x + 40, y: f.y + 40 }; }
    }
    const from = a.data?.plot ?? plot;
    this.scene.walk(a, pathBetween(this.layout, from, a, plot, target));
    a.data = { ...(a.data ?? {}), plot };
    a.face = 'down';
  }

  setupWorldAgents() {
    // clear world agents
    this.scene.agents = [];
    this.scene.activeRooms.clear();
    this.scene.particles = [];
    this.teacherAgents.clear();
    this.staffAgents.clear();
    this.leads = [];
    this.lessons = [];
    this.syncScene();
    const s = this.s;
    if (s.chapter === 1) {
      const f0 = plotFloor(this.layout, 0);
      const boss = this.scene.spawn(BOSS_LOOK, f0.x + f0.w / 2 + 10, f0.y + 22, { tag: 'boss' });
      boss.dir = 'down';
      const f2 = plotFloor(this.layout, 2);
      this.playerAgent = this.scene.spawn(s.playerLook, f2.x + f2.w - 40, f2.y + 20, { tag: 'player', speed: 70 });
      this.playerAgent.data = { plot: 2 };
      // receptionist colleague
      this.scene.spawn({ ...randomLook(), shirt: '#3fb7b0' }, f2.x + f2.w - 22, f2.y + 18, { tag: 'npc' });
      return;
    }
    const L = this.layout;
    const room = s.plots.find((p) => p.owned && p.type === 'classroom');
    const startPlot = room?.index ?? L.hall;
    const f = plotFloor(L, startPlot);
    this.playerAgent = this.scene.spawn(this.uniformed(s.playerLook), f.x + f.w / 2 + 14, f.y + f.h - 16, { tag: 'player', speed: 70 });
    this.playerAgent.data = { plot: startPlot };
    this.playerIdle();
    this.placeStaff();
  }

  placeStaff() {
    for (const a of this.staffAgents.values()) this.scene.removeAgent(a);
    this.staffAgents.clear();
    const rec = this.s.plots.find((p) => p.owned && p.type === 'reception');
    if (!rec) return;
    const sp = this.scene.roomSpots(rec.index);
    this.s.staff.forEach((st, k) => {
      const spot = sp?.staff[k % (sp.staff.length || 1)];
      if (!spot) return;
      const a = this.scene.spawn(this.uniformed(st.look), spot.x + (k >= 3 ? 8 : 0), spot.y, { tag: 'staff' });
      a.dir = 'down';
      this.staffAgents.set(st.id, a);
    });
    const lounge = this.s.plots.find((p) => p.owned && p.type === 'lounge');
    if (lounge) {
      const ls = this.scene.roomSpots(lounge.index);
      if (ls?.staff[0]) this.scene.spawn({ ...randomLook(), shirt: '#6a4a3a' }, ls.staff[0].x, ls.staff[0].y, { tag: 'barista' }).dir = 'down';
    }
  }

  startDay() {
    const s = this.s;
    s.minute = 0;
    this.syncScene();
    // absences
    for (const t of s.teachers) {
      t.absent = false;
      t.cover = null;
      if (t.isPlayer) continue;
      const today = s.students.some((st) => st.teacherId === t.id && st.day === s.day) || s.contracts.some((c) => c.teacherId === t.id && c.day === s.day);
      if (!today) continue;
      let p = 0.025;
      if (t.traits.includes('faltoso')) p = 0.11;
      if (t.traits.includes('pontual')) p = 0;
      if (t.morale < 40) p += 0.05;
      if (Math.random() < p) {
        t.absent = true;
        const ev: PendingEvent = { uid: this.id(), defId: 'falta', data: { teacherId: t.id }, expires: s.dayIndex };
        if (this.staffOf('secretaria').length) {
          t.cover = 'sub';
          this.news(`Secretária chamou substituto para ${firstName(t.name)}, que faltou hoje.`, 'info');
          this.ui.toast(`📋 ${firstName(t.name)} faltou — a secretária chamou um substituto.`, 'info');
        } else {
          s.events.push(ev);
          sfx.alert();
          this.ui.openEvent(ev);
        }
      }
    }
    // random events
    if (s.chapter >= 2 && s.dayIndex > 1 && s.events.length < 4 && Math.random() < (s.chapter === 2 ? 0.35 : 0.55)) {
      const ev = rollEvent(this);
      if (ev) this.pushEvent(ev);
    }
    // expire old events
    for (const ev of [...s.events]) {
      if (ev.expires < s.dayIndex) {
        const def = EVENT_DEFS[ev.defId];
        if (def) {
          const txt = def.options[def.ignore ?? def.options.length - 1].apply(this, ev);
          this.news(`Situação ignorada: ${def.title(this, ev)} → ${txt}`, 'bad');
        }
        s.events = s.events.filter((e) => e !== ev);
      }
    }
    if (this.playerAgent) this.playerIdle();
    this.spawnArrivals(OPEN_HOUR);
    this.startHour(OPEN_HOUR);
  }

  pushEvent(ev: PendingEvent) {
    const s = this.s;
    const def = EVENT_DEFS[ev.defId];
    if (def.category === 'admin' && this.staffOf('secretaria').length && def.auto !== undefined) {
      const txt = def.options[def.auto].apply(this, ev);
      this.news(`📋 Secretária resolveu: ${def.title(this, ev)} → ${txt}`, 'info');
      this.ui.toast(`📋 Secretária resolveu: ${def.title(this, ev)}`, 'info');
      return;
    }
    s.events.push(ev);
    sfx.alert();
    this.ui.toast(`❗ Nova situação: ${def.title(this, ev)}`, 'info');
    if (def.urgent) this.ui.openEvent(ev);
  }

  resolveEvent(ev: PendingEvent, opt: number): string {
    const def = EVENT_DEFS[ev.defId];
    const txt = def.options[opt].apply(this, ev);
    this.s.events = this.s.events.filter((e) => e.uid !== ev.uid);
    this.dirtyUI = true;
    return txt;
  }

  /** True while the end-of-day/week reports run (state is mid-transition: don't save). */
  inEndDay = false;

  async endDay() {
    const s = this.s;
    this.inEndDay = true;
    s.minute = DAY_MINUTES;
    this.pause();
    // leads go home
    for (const l of [...this.leads]) { s.stats.lostPrice++; this.leadLeaves(l, 'zz'); }
    for (const t of s.teachers) { t.absent = false; t.cover = null; }
    // ch2 YouTube passive
    if (s.youtube.subs > 0) s.youtube.views += Math.round(s.youtube.subs * 0.4);
    s.youtube.videosThisWeek = s.chapter === 3 ? s.youtube.videosThisWeek : 0;
    this.processWaitlist();
    if (s.day >= 5) {
      await this.endWeek();
      if (s.gameOver) { this.inEndDay = false; this.resume(); return; }
      s.day = 0;
      s.week++;
    } else s.day++;
    s.dayIndex++;
    s.minute = 0;
    this.inEndDay = false;
    saveGame(s);
    await this.storyCheck();
    this.resume();
    if (!s.gameOver) this.startDay();
  }

  weeklyFixedCosts() {
    const s = this.s;
    let rent = 0;
    for (const p of s.plots) if (p.owned) rent += s.chapter === 2 ? 200 : p.w * RENT_PER_CELL * (p.side === 'top' ? 0.9 : 1);
    rent *= s.flags.rentMult ?? 1;
    if (s.building === 2) rent *= 0.9;
    if (this.has('planilha')) rent *= 0.92;
    const staff = s.staff.reduce((a, b) => a + b.wage, 0);
    return { rent: Math.round(rent), staff };
  }

  forecast(): { revenue: number; costs: number; profit: number; parts: Record<string, number> } {
    const s = this.s;
    let tuition = 0;
    for (const st of s.students) if (!st.unpaid) tuition += st.fee / 4;
    const contracts = s.contracts.reduce((a, c) => a + c.weekly, 0);
    const lw = s.lastWeek?.ledger ?? {};
    const rehearsal = Math.max(0, lw['Sala de ensaio'] ?? 0);
    const studio = Math.max(0, lw['Estúdio'] ?? 0);
    let teacherCost = 0;
    for (const t of s.teachers) if (!t.isPlayer) teacherCost += this.teacherLoad(t) * t.wage;
    const { rent, staff } = this.weeklyFixedCosts();
    let mkt = 0;
    for (const c of s.campaigns) mkt += CAMPAIGNS[c.id].cost / CAMPAIGNS[c.id].weeks;
    const revenue = tuition + contracts + rehearsal + studio;
    const costs = teacherCost + rent + staff + mkt;
    return { revenue, costs, profit: revenue - costs, parts: { tuition, contracts, rehearsal, studio, teacherCost, rent, staff, mkt } };
  }

  async endWeek() {
    const s = this.s;
    const { rent, staff } = this.weeklyFixedCosts();
    if (rent) this.addCash(-rent, 'Aluguel');
    if (staff) this.addCash(-staff, 'Funcionários');
    for (const c of s.contracts) this.addCash(c.weekly, 'Contratos de turmas');
    // weekly satisfaction bonuses
    const bonus = (this.has('apostilas') ? 2 : 0) + (this.has('conforto') ? 3 : 0) + (this.hasRoom('lounge') ? 3 : 0);
    for (const st of s.students) st.sat = Math.min(100, st.sat + bonus);
    const fc = this.forecast();
    await this.ui.weekReport(s.stats, { rent, staff, forecast: fc.profit });
    // investor
    if (s.chapter === 3 && s.investor && !s.investor.bought) {
      const inv = s.investor;
      const metCash = s.cash >= inv.goalCash;
      const metProfit = fc.profit >= inv.goalProfit;
      const grave = fc.profit < inv.goalProfit * 0.4 || s.cash < 0;
      let delta = 0;
      if (metCash && metProfit) { delta = 10; inv.streak++; inv.met++; this.addXP(40); }
      else { delta = grave ? -18 : -10; inv.streak = 0; }
      if (!metCash && !metProfit) delta -= 5;
      if (inv.week <= 3 && delta < 0) delta = 0; // adaptation period
      inv.trust = Math.max(0, Math.min(100, inv.trust + delta));
      await this.ui.investorMeeting({ metCash, metProfit, cash: s.cash, profit: fc.profit, goalCash: inv.goalCash, goalProfit: inv.goalProfit, trustDelta: delta, trust: inv.trust, grave });
      if (inv.trust <= 0 || s.cash < -3000) {
        s.gameOver = 'lost';
        saveGame(s);
        this.ui.gameOver('lost');
        return;
      }
      if (inv.streak === 4 && inv.trust >= 85 && !s.flags.bonusInvest) {
        s.flags.bonusInvest = 1;
        this.pushEvent({ uid: this.id(), defId: 'aporte', data: {}, expires: s.dayIndex + 3 });
      }
      inv.week++;
      const k = inv.week - 1;
      inv.goalCash = Math.round(Math.min(40000, 3000 + 700 * k + 150 * k * k) / 100) * 100;
      inv.goalProfit = Math.round(Math.min(6000, 100 + 120 * k + 25 * k * k) / 10) * 10;
    }
    // renewals & churn
    const churnMult = this.has('avaliacao') ? 0.7 : 1;
    const sec = this.staffOf('secretaria').length > 0;
    for (const st of [...s.students]) {
      st.weeksLeft--;
      if (st.sat < 25 && Math.random() < 0.3 * churnMult) { this.removeStudent(st, `${firstName(st.name)} cancelou: estava insatisfeito(a).`); continue; }
      if (st.sat < 40 && Math.random() < 0.08 * churnMult) { this.removeStudent(st, `${firstName(st.name)} cancelou a matrícula.`); continue; }
      if (st.weeksLeft <= 0) {
        if (st.sat >= 75) { st.weeksLeft = this.has('semestral') ? 24 : 12; continue; }
        if (st.sat < 32) { this.removeStudent(st, `${firstName(st.name)} não renovou o contrato.`); continue; }
        if (sec) {
          const ch = Math.min(0.97, (st.sat - 20) / 60 + 0.15);
          if (Math.random() < ch) st.weeksLeft = this.has('semestral') ? 24 : 12;
          else this.removeStudent(st, `${firstName(st.name)} não renovou (secretária tentou).`);
        } else {
          st.weeksLeft = 1;
          if (!s.events.some((e) => e.defId === 'renovacao' && e.data.studentId === st.id)) s.events.push({ uid: this.id(), defId: 'renovacao', data: { studentId: st.id }, expires: s.dayIndex + 3 });
        }
      }
      if (!this.has('cobranca') && !st.unpaid && Math.random() < 0.03) {
        st.unpaid = true;
        this.pushEvent({ uid: this.id(), defId: 'inadimplencia', data: { studentId: st.id }, expires: s.dayIndex + 4 });
      }
    }
    // contracts
    for (const c of [...s.contracts]) { c.weeksLeft--; if (c.weeksLeft <= 0) { s.contracts = s.contracts.filter((x) => x !== c); this.news(`Contrato "${c.name}" terminou.`, 'info'); } }
    // teachers morale
    for (const t of s.teachers) {
      if (t.isPlayer) continue;
      t.weeks++;
      const load = this.teacherLoad(t) / Math.max(1, t.hours);
      const market = 16 + t.skill * 5;
      let dm = 0;
      if (load > 0.85) dm -= 6;
      if (load < 0.25) dm -= 3; // bored / low income
      dm += t.wage >= market ? 2 : -4;
      if (t.traits.includes('estressado') && dm < 0) dm *= 2;
      if (this.staffOf('coordenador').length) dm += 3;
      t.morale = Math.max(0, Math.min(100, t.morale + dm));
      if (t.morale < 25 && Math.random() < 0.25) {
        this.pushEvent({ uid: this.id(), defId: 'proposta_rival', data: { teacherId: t.id, rival: s.rivals.find((r) => r.alive)?.name ?? 'uma escola rival' }, expires: s.dayIndex + 2 });
      }
    }
    // campaigns
    for (const c of s.campaigns) c.weeksLeft--;
    s.campaigns = s.campaigns.filter((c) => c.weeksLeft > 0);
    if (s.youtube.boostWeeks > 0) s.youtube.boostWeeks--;
    s.youtube.videosThisWeek = 0;
    if (s.trend) { s.trend.weeks--; if (s.trend.weeks <= 0) s.trend = null; }
    this.rivalsWeek();
    // candidates
    this.refreshCandidates();
    s.meetingThisWeek = false;
    s.history.push({ week: s.week, cash: Math.round(s.cash), profit: Math.round(fc.profit), students: s.students.length });
    if (s.history.length > 30) s.history.shift();
    s.lastWeek = s.stats;
    s.stats = emptyStats();
  }

  removeStudent(st: Student, msg: string) {
    this.s.students = this.s.students.filter((x) => x !== st);
    this.s.stats.churned++;
    this.news(msg, 'bad');
  }

  rivalsWeek() {
    const s = this.s;
    const share = this.marketShare();
    const myShare = share.find((x) => x.me)?.share ?? 0;
    for (const r of s.rivals) {
      if (!r.alive) continue;
      if (r.promo > 0) r.promo--;
      r.rep += 0.08;
      const roll = Math.random();
      if (s.chapter === 3 && roll < 0.12) {
        r.promo = 2;
        this.news(`📣 ${r.name} lançou promoção: matrícula grátis + 20% off!`, 'rival');
        this.ui.toast(`📣 Rival: ${r.name} lançou promoção!`, 'bad');
      } else if (roll < 0.2) {
        r.quality = Math.min(92, r.quality + 4);
        this.news(`🎓 ${r.name} contratou professores renomados.`, 'rival');
      } else if (roll < 0.28) {
        r.marketing = Math.min(3, r.marketing + 0.2);
        this.news(`📢 ${r.name} aumentou investimento em marketing.`, 'rival');
      }
      // weaker rival might close if we dominate
      if (s.chapter === 3 && myShare > 0.45 && r.style === 'balanced' && Math.random() < 0.25) {
        r.alive = false;
        s.youtube.boostWeeks += 2;
        this.news(`🏚️ ${r.name} fechou as portas! Os alunos de lá estão procurando você.`, 'good');
        this.ui.toast(`🏚️ ${r.name} fechou! +procura nas próximas semanas`, 'good');
      }
    }
  }

  // ------------------------------------------------------------------ candidates
  makeTeacher(minSkill = 1, maxSkill = 5): Teacher {
    const nInst = Math.random() < 0.45 ? 1 : Math.random() < 0.8 ? 2 : 3;
    const insts: InstrumentId[] = [];
    while (insts.length < nInst) {
      const r = Math.random();
      let acc = 0;
      for (const i of INSTRUMENT_IDS) { acc += INSTRUMENTS[i].popularity; if (r < acc) { if (!insts.includes(i)) insts.push(i); break; } }
    }
    const skill = Math.max(minSkill, Math.min(maxSkill, 1 + Math.floor(Math.random() * Math.random() * 5.5)));
    const traits: TraitId[] = [];
    const tlist = Object.keys(TRAITS) as TraitId[];
    if (Math.random() < 0.75) traits.push(tlist[Math.floor(Math.random() * tlist.length)]);
    if (Math.random() < 0.25) { const t2 = tlist[Math.floor(Math.random() * tlist.length)]; if (!traits.includes(t2) && !(t2 === 'pontual' && traits.includes('faltoso')) && !(t2 === 'faltoso' && traits.includes('pontual'))) traits.push(t2); }
    const wage = Math.round(14 + skill * 5 + (traits.includes('virtuoso') ? 8 : 0) + Math.random() * 6);
    return {
      id: this.id(),
      name: randomName(),
      look: randomLook(),
      instruments: insts,
      skill,
      hours: [12, 16, 20, 24, 30][Math.floor(Math.random() * 5)],
      wage,
      morale: 70 + Math.floor(Math.random() * 20),
      traits,
      weeks: 0,
    };
  }

  makeStaff(role: StaffRole): Staff {
    const skill = 1 + Math.floor(Math.random() * 5);
    return { id: this.id(), role, name: randomName(), look: randomLook(), skill, wage: Math.round(STAFF_ROLES[role].wage * (0.8 + skill * 0.1)) };
  }

  refreshCandidates() {
    const s = this.s;
    if (s.chapter < 3) return;
    s.candidates = [this.makeTeacher(), this.makeTeacher(), this.makeTeacher(2)];
    s.staffCandidates = (['vendedor', 'secretaria', 'coordenador'] as StaffRole[]).map((r) => this.makeStaff(r));
  }

  // ------------------------------------------------------------------ actions
  // ---------------------------------------------------------------- partner buyout (big goal)
  /** Price to buy Augusto's stake: grows with the school's profit, but stays reachable. */
  buyoutPrice() {
    const h = this.s.history.slice(-4);
    const avg = h.length ? h.reduce((a, b) => a + Math.max(0, b.profit), 0) / h.length : 0;
    return Math.round(Math.max(50000, 32000 + avg * 10) / 1000) * 1000;
  }
  canBuyout() {
    const inv = this.s.investor;
    return !!inv && !inv.bought && inv.week >= 4;
  }
  async buyout() {
    const s = this.s;
    const inv = s.investor;
    if (!inv || inv.bought || !this.canBuyout()) return;
    const price = this.buyoutPrice();
    if (s.cash < price) { this.ui.toast(`Faltam ${Math.round(price - s.cash).toLocaleString('pt-BR')} reais para comprar a parte do sócio.`, 'bad'); return; }
    this.pause();
    const ok = await this.ui.choice('Comprar a parte do Augusto?', `Você paga R$ ${price.toLocaleString('pt-BR')} e a escola passa a ser 100% sua: acabam as metas semanais e as cobranças.`, [{ label: '🤝 Fechar negócio' }, { label: 'Agora não' }], INVESTOR_LOOK);
    if (ok !== 0) { this.resume(); return; }
    this.addCash(-price, 'Compra da parte do sócio');
    inv.bought = true;
    this.addXP(200);
    sfx.levelUp();
    await this.ui.dialog([
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: `Negócio fechado, ${firstName(s.playerName)}. Foi um prazer. Você provou que sabe tocar uma escola.` },
      { who: s.playerName, look: s.playerLook, side: 'r', text: 'Agora a escola é 100% minha. Sem metas de sábado… só a minha visão de escola de música.' },
      { who: 'Dica', text: 'Próximo grande sonho: abrir a Filial (árvore de habilidades → Expansão).' },
    ]);
    this.news('🏁 Você comprou a parte do sócio! A escola é 100% sua.', 'good');
    this.resume();
    saveGame(s);
    this.dirtyUI = true;
  }

  // ---------------------------------------------------------------- teacher pay vs tuition
  /** What one lesson brings in (weekly share of the monthly fee). */
  lessonRevenue(kind: 'ind' | 'grp') { return kind === 'ind' ? this.s.prices.ind / 4 : (this.s.prices.grp / 4) * this.groupSize(); }
  /** What the teacher expects to earn per lesson (market). */
  askingWage(t: Teacher) { return Math.round(16 + t.skill * 5 + (t.traits.includes('virtuoso') ? 8 : 0)); }
  /** Chance a teacher accepts an offer per lesson. */
  acceptChance(t: Teacher, offer: number, current?: number) {
    const ask = this.askingWage(t);
    if (current !== undefined && offer >= current) return 1;
    const r = offer / ask;
    if (r >= 1) return 1;
    if (r < 0.7) return 0.03;
    return Math.max(0.05, Math.min(1, (r - 0.7) / 0.3));
  }
  /** Weekly result the school makes with this teacher (tuition of their students − their pay). */
  teacherEconomics(t: Teacher) {
    let rev = 0;
    for (const st of this.s.students) if (st.teacherId === t.id && !st.unpaid) rev += st.fee / 4;
    for (const c of this.s.contracts) if (c.teacherId === t.id) rev += c.weekly;
    const slots = this.teacherLoad(t);
    const pay = t.isPlayer ? 0 : slots * t.wage;
    return { rev, pay, profit: rev - pay, slots };
  }
  /** Apply a negotiation result. Returns true if the teacher accepted. */
  negotiate(t: Teacher, offer: number, hiring: boolean): boolean {
    const cur = hiring ? undefined : t.wage;
    const ok = Math.random() < this.acceptChance(t, offer, cur);
    if (!ok) {
      if (!hiring) t.morale = Math.max(0, t.morale - 8);
      return false;
    }
    const ratio = offer / this.askingWage(t);
    if (hiring) t.morale = Math.max(35, Math.min(100, 72 + (ratio - 1) * 70));
    else t.morale = Math.max(0, Math.min(100, t.morale + (offer - t.wage) * 3));
    t.wage = Math.round(offer);
    if (hiring) this.hireTeacher(t);
    this.dirtyUI = true;
    return true;
  }
  /** School-wide monthly fee: changing it applies to every student (raises upset some). */
  applyPrice(kind: 'ind' | 'grp', v: number) {
    const old = this.s.prices[kind];
    this.setPrice(kind, v);
    const nv = this.s.prices[kind];
    if (nv === old) return;
    for (const st of this.s.students) if (st.kind === kind) {
      st.fee = Math.round(st.fee * (nv / old));
      if (nv > old) st.sat = Math.max(0, st.sat - (nv / old - 1) * 45);
      else st.sat = Math.min(100, st.sat + (1 - nv / old) * 20);
    }
    this.ui.toast(nv > old ? `💲 Mensalidade reajustada para R$ ${nv}. Alguns alunos não gostaram.` : `💲 Mensalidade reduzida para R$ ${nv}. Alunos contentes!`, nv > old ? 'info' : 'good');
  }
  /** Agents wear the school uniform once the school is open. */
  uniformed(look: Look): Look {
    const u = this.s.chapter === 3 ? this.s.uniform : undefined;
    return u ? { ...look, shirt: u, accent: '#fff6dc' } : look;
  }

  // ---------------------------------------------------------------- building (prefab rooms on a growing corridor)
  land() { return LAND[this.s.building]; }

  /** Rebuild the geometry from the room list (call after building / growing rooms). */
  relayout() {
    const s = this.s;
    const hall = s.plots.find((p) => p.type === 'hall' || p.type === 'reception')?.index ?? 0;
    this.layout = makeLayout(s.plots.map((p) => ({ id: p.index, side: p.side, col: p.col, w: p.w, h: p.h })), hall);
  }

  /** Free spots (prefab positions) where a room of this type fits, next to the existing school. */
  buildSpots(type: RoomType): BuildSpot[] {
    const s = this.s;
    const def = ROOM_TYPES[type];
    if (!def) return [];
    const land = this.land();
    const L = this.layout;
    const out: BuildSpot[] = [];
    const sides: ('top' | 'bottom')[] = def.topOnly ? ['top'] : ['top', 'bottom'];
    for (const side of sides) {
      if (side === 'top' && !this.has('expansao1') && s.chapter === 3 && s.plots.every((p) => p.side !== 'top')) {
        // back side starts locked until "Novos Espaços"
        continue;
      }
      if (side === 'top' && def.h > land.maxH) continue;
      const occ = s.plots.filter((p) => p.side === side).map((p) => [p.col, p.col + p.w] as [number, number]).sort((a, b) => a[0] - b[0]);
      const cand = new Set<number>();
      // next to every room on this side, and along the corridor
      for (const [a, b] of occ) { cand.add(b); cand.add(a - def.w); }
      cand.add(L.minCol); cand.add(L.maxCol - def.w); cand.add(L.maxCol); cand.add(L.minCol - def.w);
      for (const col of cand) {
        if (col < land.min || col + def.w > land.max) continue;
        if (occ.some(([a, b]) => col < b && col + def.w > a)) continue;
        if (col > L.maxCol || col + def.w < L.minCol) continue; // must touch the corridor
        const left = s.plots.find((p) => p.side === side && p.col + p.w === col);
        const right = s.plots.find((p) => p.side === side && p.col === col + def.w);
        let label: string;
        const mid = (L.minCol + L.maxCol) / 2;
        if (left && right) label = `↔️ Entre ${this.roomLabel(left)} e ${this.roomLabel(right)}`;
        else if (left) label = `➡️ Ao lado de ${this.roomLabel(left)}`;
        else if (right) label = `⬅️ Ao lado de ${this.roomLabel(right)}`;
        else if (col + def.w <= L.minCol) label = '⬅️ Aumentando o corredor p/ esquerda';
        else if (col >= L.maxCol) label = '➡️ Aumentando o corredor p/ direita';
        else label = col + def.w / 2 < mid ? '⬅️ Ala esquerda' : '➡️ Ala direita';
        label += side === 'top' ? ' (fundos)' : ' (frente)';
        if (out.some((o) => o.label === label)) continue;
        const extends_ = col < L.minCol || col + def.w > L.maxCol;
        const cost = def.cost + def.w * BUILD_PER_CELL + (extends_ ? 800 : 0);
        out.push({ side, col, w: def.w, h: side === 'top' ? def.h : 7, label, cost, between: !!(left && right) });
      }
    }
    return out.sort((a, b) => Number(b.between) - Number(a.between) || a.cost - b.cost);
  }

  roomLabel(p: Plot) {
    if (p.type === 'hall' || p.type === 'reception') return 'Recepção';
    const same = this.s.plots.filter((x) => x.type === p.type);
    const n = same.length > 1 ? ' ' + (same.indexOf(p) + 1) : '';
    return (ROOM_TYPES[p.type]?.name ?? 'sala') + n;
  }

  buildAt(type: RoomType, spot: BuildSpot) {
    const s = this.s;
    const def = ROOM_TYPES[type];
    if (!def) return;
    if (def.skill && !this.has(def.skill)) return;
    if (!this.buildSpots(type).some((x) => x.side === spot.side && x.col === spot.col)) return;
    if (!this.spend(spot.cost, 'Obras e expansão')) return;
    const id = s.plots.length;
    s.plots.push({ index: id, owned: true, type, decor: 1, equip: {}, items: [], side: spot.side, col: spot.col, w: spot.w, h: spot.h, walls: 0 });
    this.relayout();
    sfx.build();
    this.invalidateScene();
    const f = plotFloor(this.layout, id);
    this.scene.sparkle(plotCx(this.layout, id), f.y + 30, 24);
    this.scene.focusBuilding(this.layout);
    this.ui.toast(`🏗️ ${def.name} construída — ${spot.label.replace(/^\S+ /, '')}!`, 'good');
    this.addXP(15);
    this.placeStaff();
    return id;
  }

  /** Grow a room sideways by n cells if there is free space next to it. */
  growRoom(i: number, n = 1): boolean {
    const s = this.s;
    const p = s.plots[i];
    const land = this.land();
    const free = (col: number, w: number) => col >= land.min && col + w <= land.max && !s.plots.some((o) => o !== p && o.side === p.side && col < o.col + o.w && col + w > o.col);
    if (free(p.col + p.w, n)) { p.w += n; }
    else if (free(p.col - n, n)) { p.col -= n; p.w += n; }
    else if (p.side === 'top' && p.h < land.maxH) { p.h += 1; } // no room beside it: grows deeper
    else return false;
    this.relayout();
    return true;
  }

  upgradeWalls(i: number) {
    const p = this.s.plots[i];
    const next = p.walls + 1;
    if (next > 2) return;
    const sk = WALL_SKILL[next];
    if (sk && !this.has(sk)) { this.ui.toast('Isolamento profissional requer Tratamento Acústico.', 'bad'); return; }
    if (!this.spend(WALL_COST[next] + p.w * 40, 'Obras e expansão')) return;
    p.walls = next;
    sfx.build();
    this.ui.toast(`🧱 ${WALL_NAMES[next]} instalado. Menos som vazando!`, 'good');
    this.invalidateScene();
  }

  /** How loud a room is at a given moment (0 when idle). */
  roomLoudness(i: number): number {
    const p = this.s.plots[i];
    if (!p) return 0;
    const active = this.scene.activeRooms.get(i);
    if (!active) return 0;
    if (p.type === 'classroom') {
      const map: Partial<Record<InstrumentId, number>> = { bateria: 2.6, guitarra: 1.5, baixo: 1.4, canto: 1, piano: 0.9, violino: 0.8, violao: 0.6, ukulele: 0.5 };
      return Math.max(0.4, ...active.inst.map((x) => map[x] ?? 0.6));
    }
    return ROOM_TYPES[p.type]?.loud ?? 0;
  }

  /** Sound leaking into room i from its wall neighbours right now. */
  noiseAt(i: number): { level: number; from: number | null } {
    const s = this.s;
    let level = 0, from: number | null = null, worst = 0;
    for (const n of wallNeighbors(this.layout, i)) {
      const loud = this.roomLoudness(n);
      if (!loud) continue;
      const w = Math.max(s.plots[i].walls, s.plots[n].walls);
      const both = Math.min(s.plots[i].walls, s.plots[n].walls) > 0 ? 0.7 : 1;
      const v = loud * [1, 0.4, 0.1][w] * both;
      level += v;
      if (v > worst) { worst = v; from = n; }
    }
    return { level, from };
  }

  /** Worst-case leak estimate for the room panel. */
  noiseRisk(i: number): number {
    const s = this.s;
    let lvl = 0;
    for (const n of wallNeighbors(this.layout, i)) {
      const p = s.plots[n];
      let loud = ROOM_TYPES[p.type]?.loud ?? 0;
      if (p.type === 'classroom') loud = p.equip.bateria !== undefined ? 2.6 : p.equip.guitarra !== undefined || p.equip.baixo !== undefined ? 1.5 : 0.8;
      const w = Math.max(s.plots[i].walls, p.walls);
      lvl += loud * [1, 0.4, 0.1][w] * (Math.min(s.plots[i].walls, p.walls) > 0 ? 0.7 : 1);
    }
    return lvl;
  }

  buyItem(i: number, id: ItemId) {
    const p = this.s.plots[i];
    const def = ROOM_ITEMS[id];
    if (!p.owned || p.items.includes(id) || !def.types.includes(p.type)) return;
    const cost = Math.round(def.cost * (1 + p.decor * 0.5));
    if (!this.spend(cost, 'Móveis e equipamentos')) return;
    p.items.push(id);
    sfx.build();
    this.invalidateScene();
    const f = plotFloor(this.layout, i);
    this.scene.sparkle(plotCx(this.layout, i), f.y + 30, 14);
    this.ui.toast(`${def.emoji} ${def.name} instalado(a) no lugar certo!`, 'good');
    this.addXP(4);
    this.placeStaff();
  }

  /** Move to a bigger building: same prefab rooms, much more land around them. */
  moveBuilding() {
    const s = this.s;
    if (s.building === 2) return;
    s.building = 2;
    s.flags.rentMult = 1;
    this.relayout();
    this.invalidateScene();
    this.setupWorldAgents();
    this.scene.focusBuilding(this.layout);
    this.ui.toast('🚚 Mudança concluída! Mesmas salas, remontadas num terreno bem maior.', 'good');
    this.addXP(50);
  }

  buildReception() {
    const p = this.s.plots[this.layout.hall];
    if (p.type === 'reception') return;
    if (!this.spend(2500, 'Obras e expansão')) return;
    p.items = p.items ?? [];
    p.type = 'reception';
    p.decor = Math.max(1, p.decor);
    p.owned = true;
    this.growRoom(p.index, 2);
    sfx.build();
    this.invalidateScene();
    const f = plotFloor(this.layout, p.index);
    this.scene.sparkle(plotCx(this.layout, p.index), f.y + 30, 24);
    this.ui.toast('🛎️ Recepção pronta! Agora os interessados esperam aqui.', 'good');
    this.addXP(20);
    this.placeStaff();
  }

  upgradeDecor(i: number) {
    const p = this.s.plots[i];
    const next = p.decor + 1;
    if (next > MAX_DECOR) return;
    const sk = DECOR_SKILL[next];
    if (sk && !this.has(sk)) { this.ui.toast('Precisa desbloquear na árvore de habilidades.', 'bad'); return; }
    if (!this.spend(DECOR_COST[next], 'Obras e expansão')) return;
    p.decor = next;
    // rooms get bigger as they level up (if there is free space beside them)
    let grew = false;
    const maxW = (ROOM_TYPES[p.type]?.w ?? p.w) + (this.has('expansao2') ? 3 : 2);
    if (next >= 2 && p.w < maxW && p.type !== 'hall') grew = this.growRoom(i, 1);
    sfx.build();
    this.invalidateScene();
    const f = plotFloor(this.layout, i);
    this.scene.sparkle(plotCx(this.layout, i), f.y + 30, 30);
    this.ui.toast(grew ? '✨ Sala reformada e AMPLIADA! Tudo subiu de nível junto.' : p.w < maxW && next >= 2 ? '✨ Sala reformada! (sem espaço livre ao lado para ampliar)' : '✨ Sala reformada! Móveis e equipamentos subiram de nível junto.', 'good');
    this.addXP(10);
    this.invalidateScene();
    this.placeStaff();
  }

  buyEquip(i: number, inst: InstrumentId, tier: number) {
    const p = this.s.plots[i];
    const cur = p.equip[inst];
    if (cur === undefined && Object.keys(p.equip).length >= 3) { this.ui.toast('Máximo de 3 instrumentos por sala.', 'bad'); return; }
    const price = INSTRUMENTS[inst].equipTiers[tier].cost - (cur !== undefined ? INSTRUMENTS[inst].equipTiers[cur].cost * 0.5 : 0);
    if (!this.spend(Math.round(price), 'Instrumentos')) return;
    p.equip[inst] = tier;
    sfx.build();
    this.ui.toast(`${INSTRUMENTS[inst].emoji} ${INSTRUMENTS[inst].equipTiers[tier].name} instalado!`, 'good');
    this.invalidateScene();
    this.processWaitlist();
  }

  removeEquip(i: number, inst: InstrumentId) {
    const p = this.s.plots[i];
    if (this.s.students.some((st) => st.plot === i && st.instrument === inst)) { this.ui.toast('Há alunos usando esse instrumento nesta sala.', 'bad'); return; }
    const t = p.equip[inst];
    if (t === undefined) return;
    delete p.equip[inst];
    this.addCash(Math.round(INSTRUMENTS[inst].equipTiers[t].cost * 0.3), 'Instrumentos');
    this.invalidateScene();
  }

  hireTeacher(t: Teacher) {
    const s = this.s;
    if (s.teachers.filter((x) => !x.isPlayer).length >= 14) { this.ui.toast('Equipe máxima atingida.', 'bad'); return; }
    s.candidates = s.candidates.filter((c) => c.id !== t.id);
    s.teachers.push(t);
    sfx.coin();
    this.ui.toast(`🤝 ${firstName(t.name)} entrou para a equipe!`, 'good');
    this.processWaitlist();
    this.dirtyUI = true;
  }

  fireTeacher(t: Teacher) {
    const s = this.s;
    const mine = s.students.filter((st) => st.teacherId === t.id);
    s.teachers = s.teachers.filter((x) => x !== t);
    let moved = 0, lost = 0;
    for (const st of mine) {
      s.students = s.students.filter((x) => x !== st);
      const slot = this.findSlot(st.instrument, st.kind);
      if (slot.ok) { Object.assign(st, { teacherId: slot.teacherId, plot: slot.plot, day: slot.day, hour: slot.hour }); st.sat -= 8; s.students.push(st); moved++; }
      else { lost++; this.news(`${firstName(st.name)} saiu por falta de professor.`, 'bad'); }
    }
    s.contracts = s.contracts.filter((c) => c.teacherId !== t.id);
    for (const o of s.teachers) if (!o.isPlayer) o.morale = Math.max(0, o.morale - 5);
    this.ui.toast(`${firstName(t.name)} saiu da equipe. ${moved} aluno(s) realocado(s), ${lost} perdido(s).`, lost ? 'bad' : 'info');
    this.dirtyUI = true;
  }

  hireStaff(st: Staff) {
    const s = this.s;
    if (!this.hasRoom('reception')) { this.ui.toast('Construa a Recepção primeiro.', 'bad'); return; }
    if (s.staff.filter((x) => x.role === st.role).length >= 2) { this.ui.toast('Máximo de 2 por função.', 'bad'); return; }
    s.staffCandidates = s.staffCandidates.filter((c) => c.id !== st.id);
    s.staffCandidates.push(this.makeStaff(st.role));
    s.staff.push(st);
    sfx.coin();
    this.ui.toast(`🤝 ${firstName(st.name)} contratado(a) como ${STAFF_ROLES[st.role].name}!`, 'good');
    this.placeStaff();
    this.dirtyUI = true;
  }

  fireStaff(st: Staff) {
    this.s.staff = this.s.staff.filter((x) => x !== st);
    this.placeStaff();
    this.dirtyUI = true;
  }

  launchCampaign(id: CampaignId, inst?: InstrumentId) {
    const c = CAMPAIGNS[id];
    if (c.skill && !this.has(c.skill)) return;
    if (this.s.campaigns.some((x) => x.id === id)) { this.ui.toast('Essa campanha já está rodando.', 'bad'); return; }
    if (!this.spend(c.cost, 'Marketing')) return;
    this.s.campaigns.push({ id, weeksLeft: c.weeks, instrument: inst });
    if (id === 'workshop') this.addXP(40);
    if (id === 'outdoor') this.addXP(60);
    sfx.coin();
    this.ui.toast(`${c.emoji} Campanha "${c.name}" no ar!`, 'good');
    this.dirtyUI = true;
  }

  async recordVideo() {
    const s = this.s;
    const limit = s.chapter === 2 ? 1 : this.hasRoom('studio') ? 3 : 1;
    if (s.youtube.videosThisWeek >= limit && s.chapter === 3) { this.ui.toast('Você já gravou vídeo(s) esta semana.', 'bad'); return; }
    if (s.chapter === 2 && s.flags['video_day'] === s.dayIndex) { this.ui.toast('Você já gravou um vídeo hoje. Volte amanhã!', 'bad'); return; }
    this.pause();
    const inst = s.playerInstruments[0];
    const score = await this.ui.minigame({ kind: 'ritmo', instrument: inst, title: 'Gravando vídeo pro YouTube 🎬', subtitle: 'Capriche na performance!', difficulty: Math.min(3, 1 + Math.floor(s.level / 4)), allowSkip: false });
    this.resume();
    s.flags['video_day'] = s.dayIndex;
    s.youtube.videosThisWeek++;
    let views = Math.round((120 + score * 5.5) * (this.has('youtube') ? 2 : 1) * (this.hasRoom('studio') ? 1.5 : 1) * (0.8 + Math.random() * 0.5));
    if (score >= 90 && Math.random() < 0.3) { views *= 3; this.ui.toast('🔥 O vídeo viralizou!', 'good'); }
    s.youtube.views += views;
    s.youtube.subs += Math.round(views / 12);
    if (score >= 60) s.youtube.boostWeeks = Math.max(s.youtube.boostWeeks, 1);
    this.addXP(Math.round(10 + score / 10));
    this.ui.toast(`🎬 Vídeo publicado: +${views} visualizações, +${Math.round(views / 12)} inscritos`, 'good');
    this.dirtyUI = true;
    await this.storyCheck(true);
  }

  teacherMeeting(agenda: 'metodo' | 'ouvir' | 'metas') {
    const s = this.s;
    if (s.meetingThisWeek) return;
    const staff = s.teachers.filter((t) => !t.isPlayer);
    const cost = 60 + staff.length * 40;
    if (!this.spend(cost, 'Reuniões')) return;
    s.meetingThisWeek = true;
    const mentor = staff.some((t) => t.traits.includes('mentor')) ? 2 : 1;
    for (const t of staff) {
      if (agenda === 'ouvir') t.morale = Math.min(100, t.morale + 15 * mentor);
      if (agenda === 'metodo') { t.morale = Math.min(100, t.morale + 4); if (Math.random() < 0.18 * mentor && t.skill < 5) { t.skill++; this.news(`📈 ${firstName(t.name)} evoluiu para ${t.skill}★ após a reunião.`, 'good'); } }
      if (agenda === 'metas') t.morale = Math.max(0, t.morale - 2);
    }
    if (agenda === 'metas') for (const st of s.students) st.sat = Math.min(100, st.sat + 4 * mentor);
    this.addXP(10);
    sfx.good();
    this.ui.toast('👥 Reunião de professores realizada!', 'good');
    this.dirtyUI = true;
  }

  scheduleRecital() {
    const s = this.s;
    if (!this.has('recital') || s.recital) return;
    if (s.students.length < 5) { this.ui.toast('Precisa de pelo menos 5 alunos para um recital.', 'bad'); return; }
    if (s.day === 5 && this.hour >= 15) { this.ui.toast('Muito em cima da hora! Agende na semana que vem.', 'bad'); return; }
    const cost = this.hasRoom('auditorium') ? 600 : 1500;
    if (!this.spend(cost, 'Eventos')) return;
    s.recital = { day: 5, week: s.week };
    this.ui.toast(`🎭 Recital marcado para sábado às 15h!`, 'good');
    this.dirtyUI = true;
  }

  async runRecital() {
    const s = this.s;
    const aud = s.plots.find((p) => p.owned && p.type === 'auditorium');
    const fest = this.has('festival') ? 2 : 1;
    const mult = (aud ? 1.4 : 1) * fest;
    if (aud) {
      const sp = this.scene.roomSpots(aud.index);
      const n = Math.min(sp?.audience.length ?? 0, 6 + Math.floor(s.students.length / 2));
      for (let k = 0; k < n; k++) {
        const t = sp!.audience[k];
        const a = this.scene.spawn(randomLook(), -12, SIDEWALK_Y, { tag: 'band', speed: 70 });
        const path = pathTo(this.layout, aud.index, t);
        a.x = path[0].x; a.y = path[0].y;
        a.data = { hour: 15, plot: aud.index };
        a.face = 'up';
        this.scene.walk(a, path.slice(1), () => { a.dir = 'up'; a.bubble = Math.random() < 0.3 ? 'heart' : null; });
      }
      for (let k = 0; k < 2; k++) {
        const t = sp!.stage[k];
        const a = this.scene.spawn(s.students[k % s.students.length].look, -12, SIDEWALK_Y, { tag: 'band', speed: 70 });
        const path = pathTo(this.layout, aud.index, t);
        a.x = path[0].x; a.y = path[0].y;
        a.data = { hour: 15, plot: aud.index };
        a.face = 'down';
        this.scene.walk(a, path.slice(1));
      }
      this.scene.setActive(aud.index, [], 50 / MIN_PER_SEC / Math.max(1, this.speed));
    }
    for (const st of s.students) st.sat = Math.min(100, st.sat + 10 * mult);
    s.youtube.boostWeeks = Math.max(s.youtube.boostWeeks, Math.round(1 * fest));
    this.addXP(Math.round(70 * mult));
    s.recital = null;
    sfx.levelUp();
    this.ui.toast(`🎭 ${fest > 1 ? 'Festival' : 'Recital'} foi um sucesso! Alunos +${Math.round(10 * mult)} satisfação e mais procura.`, 'good');
    this.news('🎭 Recital lotado! As famílias amaram.', 'good');
  }

  buySkill(id: string) {
    const s = this.s;
    const def = SKILL_MAP[id];
    if (!def || this.has(id)) return;
    if (def.minChapter && s.chapter < def.minChapter) { this.ui.toast('Disponível quando a escola abrir.', 'bad'); return; }
    if (!def.req.every((r) => this.has(r))) return;
    if (s.skillPoints < def.cost) { this.ui.toast('Notas musicais insuficientes.', 'bad'); return; }
    if (id === 'filial') {
      if (s.level < 8 || s.cash < 40000) { this.ui.toast('Requer reputação nível 8 e R$ 40.000 em caixa.', 'bad'); return; }
    }
    s.skillPoints -= def.cost;
    s.skills.push(id);
    sfx.levelUp();
    this.ui.toast(`🎼 Desbloqueado: ${def.name}`, 'level');
    if (id === 'expansao1' || id === 'expansao2') this.invalidateScene();
    if (id === 'filial') {
      this.addCash(-25000, 'Filial');
      this.victory();
    }
    this.dirtyUI = true;
  }

  async victory() {
    const s = this.s;
    this.pause();
    await this.ui.dialog([
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: `${firstName(s.playerName)}... eu já vi muita escola nascer e morrer. A sua não só sobreviveu: virou referência na cidade.` },
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: 'Assinei hoje o contrato da segunda unidade. A filial é sua. Parabéns, sócio.' },
      { who: s.playerName, look: s.playerLook, side: 'r', text: 'Lembro da salinha com caixas no canto, dando aula com meu próprio violão… E agora, duas escolas.' },
    ]);
    s.gameOver = 'won';
    saveGame(s);
    this.resume();
    this.ui.gameOver('won');
  }

  setPrice(kind: 'ind' | 'grp' | 'rehearsal', v: number) {
    this.s.prices[kind] = Math.max(kind === 'rehearsal' ? 20 : 60, Math.min(kind === 'rehearsal' ? 200 : 900, Math.round(v / 10) * 10));
    this.dirtyUI = true;
  }

  trainTeacher(t: Teacher) {
    if (t.skill >= 5) return;
    const cost = 600 + t.skill * 400;
    if (!this.spend(cost, 'Cursos')) return;
    t.skill++;
    t.morale = Math.min(100, t.morale + 10);
    t.wage += 4;
    sfx.good();
    this.ui.toast(`🎓 ${firstName(t.name)} fez o curso e agora é ${t.skill}★!`, 'good');
    this.dirtyUI = true;
  }

  raiseTeacher(t: Teacher) {
    t.wage += 3;
    t.morale = Math.min(100, t.morale + 12);
    this.ui.toast(`💸 ${firstName(t.name)} recebeu aumento (R$ ${t.wage}/aula).`, 'good');
    this.dirtyUI = true;
  }

  setPlayerHours(h: number) {
    const p = this.s.teachers.find((t) => t.isPlayer);
    if (!p) return;
    const load = this.teacherLoad(p);
    if (h < load) { this.ui.toast(`Você já tem ${load} aulas na agenda. Reduza depois que os alunos forem realocados.`, 'bad'); return; }
    p.hours = h;
    this.dirtyUI = true;
  }

  // ------------------------------------------------------------------ chapter flow
  ch1Tasks(day: number): Ch1Task[] {
    const insts = this.s.playerInstruments;
    const mk = (k: number): Ch1Task => {
      const inst = insts[k % insts.length];
      const name = randomName();
      return { id: 'l' + day + k, kind: 'lesson', label: `Aula de ${INSTRUMENTS[inst].name} — ${firstName(name)}`, instrument: inst, studentName: name, look: randomLook(), done: false };
    };
    const adm = (k: number): Ch1Task => ({ id: 'a' + day + k, kind: 'admin', label: k === 0 ? 'Organizar papelada da recepção' : 'Fechar o caixa do dia', done: false });
    if (day === 0) return [mk(0), adm(0), mk(1), mk(2)];
    if (day === 1) return [mk(0), adm(1), mk(1)];
    return [adm(0), mk(0)];
  }

  async ch1Start() {
    const s = this.s;
    s.ch1.tasks = this.ch1Tasks(s.ch1.day);
    this.setupWorldAgents();
    // students waiting in classrooms
    this.spawnCh1Students();
    this.dirtyUI = true;
  }

  spawnCh1Students() {
    for (const a of this.scene.agents) if (a.tag === 'ch1student') this.scene.removeAgent(a);
    const tasks = this.s.ch1.tasks.filter((t) => t.kind === 'lesson' && !t.done);
    tasks.forEach((t, k) => {
      const plot = k % 2 === 0 ? 1 : 3;
      const f = plotFloor(this.layout, plot);
      const a = this.scene.spawn(t.look!, f.x + 20 + (k * 30) % 80, f.y + f.h - 14, { tag: 'ch1student', clickable: true, bubble: 'note' });
      a.dir = 'down';
      a.onClick = () => this.doCh1Task(t);
      a.data = { task: t.id, plot };
    });
  }

  async doCh1Task(t: Ch1Task) {
    if (t.done || this.ch1Busy) return;
    this.ch1Busy = true;
    const s = this.s;
    let score: number;
    if (t.kind === 'lesson') {
      const agent = this.scene.agents.find((a) => a.data?.task === t.id);
      const plot = agent?.data?.plot ?? 1;
      const f = plotFloor(this.layout, plot);
      if (this.playerAgent) {
        this.movePlayerTo(plot, { x: (agent?.x ?? f.x + 40) + 16, y: agent?.y ?? f.y + 40 });
      }
      const kinds = INSTRUMENTS[t.instrument!].minigames;
      score = await this.ui.minigame({ kind: kinds[Math.floor(Math.random() * kinds.length)], instrument: t.instrument, title: `Aula com ${firstName(t.studentName!)}`, subtitle: 'Estúdio Som Maior', difficulty: s.ch1.day === 0 ? 0 : 1, allowSkip: false });
      const pay = Math.round(40 + score * 0.5);
      s.cash += pay;
      s.ch1.earned += pay;
      this.scene.addFloat(agent?.x ?? 200, (agent?.y ?? 200) - 28, '+R$' + pay);
      if (agent) { agent.bubble = score >= 70 ? 'heart' : null; agent.clickable = false; this.scene.walk(agent, pathToStreet(this.layout, plot, agent), () => this.scene.removeAgent(agent)); }
      this.addXP(score >= 85 ? 8 : 5);
    } else {
      if (this.playerAgent) {
        const f = plotFloor(this.layout, 2);
        this.movePlayerTo(2, { x: f.x + f.w - 50, y: f.y + 22 });
      }
      score = await this.ui.minigame({ kind: 'papelada', title: t.label, subtitle: 'Função de secretário', difficulty: s.ch1.day, allowSkip: false });
      const pay = Math.round(25 + score * 0.35);
      s.cash += pay;
      s.ch1.earned += pay;
      const f = plotFloor(this.layout, 2);
      this.scene.addFloat(f.x + f.w - 40, f.y + 10, '+R$' + pay);
      this.addXP(4);
    }
    t.done = true;
    t.score = score;
    sfx.coin();
    this.ch1Busy = false;
    this.dirtyUI = true;
    if (s.ch1.tasks.every((x) => x.done)) await this.ch1EndDay();
  }

  async ch1EndDay() {
    const s = this.s;
    const P = s.playerName;
    const me = { who: P, look: s.playerLook, side: 'r' as const };
    const boss = { who: 'Seu Válter', look: BOSS_LOOK };
    if (s.ch1.day === 0) {
      await this.ui.dialog([
        { ...boss, text: `Bom trabalho hoje, ${firstName(P)}. Os alunos gostam de você.` },
        { ...boss, text: 'Mas vou ser sincero: a procura aqui no estúdio anda fraca. Vamos ver como fica a semana.' },
      ]);
    } else if (s.ch1.day === 1) {
      await this.ui.dialog([
        { ...boss, text: `${firstName(P)}, preciso conversar com você… Dois alunos cancelaram e o aluguel subiu.` },
        { ...boss, text: 'A partir de amanhã vou ter que cortar suas aulas pela metade. Sinto muito.' },
        { ...me, text: '(Metade das aulas… assim não fecho o mês.)' },
      ]);
    } else {
      await this.ui.dialog([
        { ...me, text: '(Hoje foi só uma aula. Não dá pra continuar dependendo do estúdio.)' },
        { ...me, text: '(No meu bairro tem muita criança e adulto querendo aprender música… e tem uma salinha pra alugar perto de casa.)' },
        { who: 'Seu Jorge (proprietário)', look: LANDLORD_LOOK, text: 'A salinha do térreo? É sua por R$ 200 por semana. Caução de R$ 600. Tá meio largada, mas é um começo!' },
      ]);
      const ok = await this.ui.choice('Hora de arriscar?', `Você juntou R$ ${Math.round(s.cash)}. Alugar a salinha custa R$ 600 de caução + R$ 200/semana.`, [
        { label: '🔑 Alugar a salinha e começar por conta própria', sub: 'Capítulo 2: A Salinha do Bairro' },
      ]);
      void ok;
      await this.startChapter2();
      return;
    }
    s.ch1.day++;
    s.ch1.tasks = this.ch1Tasks(s.ch1.day);
    this.spawnCh1Students();
    saveGame(s);
    this.dirtyUI = true;
    const left = s.ch1.tasks.length;
    this.ui.toast(`☀️ Dia ${s.ch1.day + 1} no estúdio: ${left} tarefas.`, 'info');
  }

  async startChapter2() {
    const s = this.s;
    s.chapter = 2;
    s.cash = Math.max(250, s.cash - 600);
    // the building's shared entrance + the little rented room next to it
    s.plots = [
      { index: 0, owned: false, type: 'hall', decor: 0, equip: {}, items: [], side: 'bottom', col: 36, w: 6, h: 7, walls: 0 },
      { index: 1, owned: true, type: 'classroom', decor: 0, equip: {}, items: [], side: 'bottom', col: 42, w: 7, h: 7, walls: 0 },
    ];
    for (const i of s.playerInstruments) s.plots[1].equip[i] = 0;
    this.relayout();
    const me = playerTeacher(s);
    me.hours = 30;
    s.teachers = [me];
    s.week = 1; s.day = 0; s.dayIndex = 0; s.minute = 0;
    s.skillPoints += 1;
    s.stats = emptyStats();
    this.invalidateScene();
    this.setupWorldAgents();
    // two loyal students
    for (let k = 0; k < 2; k++) {
      const inst = s.playerInstruments[k % s.playerInstruments.length];
      this.enroll({ name: randomName(), look: randomLook(), instrument: inst, sens: 0.4 }, 'ind', 220, true);
    }
    saveGame(s);
    const P = s.playerName;
    await this.ui.dialog([
      { who: 'Capítulo 2', text: '🎸 A SALINHA DO BAIRRO' },
      { who: P, look: s.playerLook, side: 'r', text: 'Uma sala, meus instrumentos e muita vontade. Dois alunos do estúdio vieram comigo!' },
      { who: 'Dica', text: 'Interessados aparecem com ❓. Clique neles para conversar e matricular. Na hora da aula, clique no aluno com ♪ para dar a aula (minigame) — se não der tempo, a aula acontece no automático com qualidade menor.' },
      { who: 'Dica', text: 'Use 📣 Marketing para espalhar panfletos e 🎬 gravar vídeos pro YouTube. Meta: 8 alunos e 1.000 visualizações.' },
    ]);
    this.startDay();
    this.dirtyUI = true;
  }

  async storyCheck(immediate = false) {
    const s = this.s;
    if (s.chapter === 2 && s.students.length >= 8 && s.youtube.views >= 1000 && !s.flags.investorCalled) {
      s.flags.investorCalled = 1;
      await this.startChapter3();
    }
    void immediate;
  }

  async startChapter3() {
    const s = this.s;
    this.pause();
    const P = s.playerName;
    await this.ui.dialog([
      { who: '📱 Mensagem', text: '"Olá! Vi seu vídeo no YouTube. Posso te ligar? — Augusto Ferraz"' },
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: `${firstName(P)}, eu invisto em pequenos negócios. Vi seus vídeos e passei na sua salinha: ela está lotada.` },
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: 'Proposta: entro com R$ 25.000 e viramos sócios. Vocês ficam com o prédio inteiro para crescer.' },
      { who: 'Augusto Ferraz', look: INVESTOR_LOOK, text: 'Mas eu cobro resultado. Toda semana, no sábado, quero ver CAIXA e PREVISÃO DE LUCRO acima da meta. Se minha confiança zerar, eu tiro o dinheiro.' },
    ]);
    await this.ui.choice('Proposta do investidor', 'Aceitar a sociedade com Augusto Ferraz?', [{ label: '🤝 Aceitar e abrir a escola!', sub: 'Capítulo 3: A Escola' }], INVESTOR_LOOK);
    s.chapter = 3;
    s.cash += 25000;
    s.plots[0].owned = true;
    s.plots[0].type = 'hall';
    s.plots[0].decor = 0;
    this.relayout();
    s.skillPoints += 2;
    s.investor = { trust: 60, week: 1, goalCash: 3000, goalProfit: 100, streak: 0, met: 0 };
    s.schoolName = s.schoolName ?? `Escola ${firstName(s.playerName)}`;
    s.uniform = s.uniform ?? '#c24d6a';
    this.refreshCandidates();
    this.invalidateScene();
    this.setupWorldAgents();
    saveGame(s);
    await this.ui.identity(true);
    this.invalidateScene();
    this.setupWorldAgents();
    saveGame(s);
    await this.ui.dialog([
      { who: 'Capítulo 3', text: '🏫 A ESCOLA' },
      { who: 'Dica', text: 'O hall de entrada agora é seu: clique nele para construir a 🛎️ Recepção. Alugue os espaços vizinhos (clique neles) para novas salas.' },
      { who: 'Dica', text: 'Em 👥 Equipe você contrata professores (cada um atende certos instrumentos). Em 📊 Demanda você vê o que os alunos estão procurando e o que falta.' },
      { who: 'Dica', text: 'Estratégia é tudo: volume com turmas baratas ou poucos alunos pagando caro com aulas premium? Os rivais estão de olho. Boa sorte, sócio!' },
    ]);
    this.resume();
    this.dirtyUI = true;
  }

  // ------------------------------------------------------------------ click handling
  click(pt: Pt): { kind: 'agent' } | { kind: 'plot'; plot: number } | null {
    const a = this.scene.agentAt(pt);
    if (a && a.onClick) { sfx.click(); a.onClick(); return { kind: 'agent' }; }
    const p = this.scene.plotAt(pt);
    if (p >= 0) return { kind: 'plot', plot: p };
    return null;
  }

  // public helpers for UI
  studentsOf(t: Teacher) { return this.s.students.filter((st) => st.teacherId === t.id); }
}

export type { Pt };
