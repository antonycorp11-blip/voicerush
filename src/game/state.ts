import type { Look } from '../art/characters';
import { randomLook } from '../art/characters';
import type { InstrumentId } from '../data/instruments';
import { INSTRUMENT_IDS } from '../data/instruments';
import type { TraitId, RoomType, StaffRole, CampaignId } from '../data/content';
import { RIVAL_DEFS, FIRST_NAMES, LAST_NAMES } from '../data/content';

export interface Teacher {
  id: number;
  name: string;
  look: Look;
  instruments: InstrumentId[];
  skill: number; // 1..5
  hours: number; // max lessons per week
  wage: number; // per lesson hour
  morale: number; // 0..100
  traits: TraitId[];
  isPlayer?: boolean;
  absent?: boolean;
  cover?: 'player' | 'cancel' | 'sub' | null;
  weeks: number;
  raiseAsked?: boolean;
}

export interface Student {
  id: number;
  name: string;
  look: Look;
  instrument: InstrumentId;
  kind: 'ind' | 'grp';
  fee: number; // monthly
  teacherId: number;
  plot: number;
  day: number; // 0..5
  hour: number; // 8..19
  sat: number; // 0..100
  weeksLeft: number;
  unpaid?: boolean;
}

export interface Contract {
  id: number;
  name: string;
  instrument: InstrumentId;
  weekly: number;
  teacherId: number;
  plot: number;
  day: number;
  hour: number;
  weeksLeft: number;
  size: number;
}

export interface Plot {
  index: number;
  owned: boolean;
  type: RoomType;
  decor: number;
  equip: Partial<Record<InstrumentId, number>>; // tier
  items: string[];
}

export interface Staff {
  id: number;
  role: StaffRole;
  name: string;
  look: Look;
  skill: number;
  wage: number;
}

export interface Rival {
  id: string;
  name: string;
  color: string;
  style: string;
  price: number;
  quality: number;
  marketing: number;
  rep: number;
  alive: boolean;
  promo: number; // weeks of promo left
}

export interface InstStats { leads: number; enrolled: number; lostCap: number; lostPrice: number }
export interface WeekStats {
  revenue: number;
  costs: number;
  leads: number;
  enrolled: number;
  lostCap: number;
  lostPrice: number;
  churned: number;
  lessons: number;
  quality: number; // sum
  byInst: Record<InstrumentId, InstStats>;
  ledger: Record<string, number>;
}

export interface PendingEvent {
  uid: number;
  defId: string;
  data: any;
  expires: number; // absolute day index
}

export interface WaitEntry {
  name: string;
  look: Look;
  instrument: InstrumentId;
  kind: 'ind' | 'grp';
  sens: number;
  since: number;
}

export interface GameState {
  version: number;
  playerName: string;
  playerLook: Look;
  playerInstruments: InstrumentId[];
  chapter: 1 | 2 | 3;
  week: number;
  day: number; // 0..5 (Seg..Sáb)
  minute: number; // minutes since 8:00 (0..720)
  dayIndex: number; // absolute
  cash: number;
  xp: number;
  level: number;
  skillPoints: number;
  skills: string[];
  teachers: Teacher[];
  students: Student[];
  contracts: Contract[];
  staff: Staff[];
  plots: Plot[];
  rivals: Rival[];
  campaigns: { id: CampaignId; weeksLeft: number; instrument?: InstrumentId }[];
  events: PendingEvent[];
  waitlist: WaitEntry[];
  prices: { ind: number; grp: number; rehearsal: number };
  stats: WeekStats;
  lastWeek: WeekStats | null;
  history: { week: number; cash: number; profit: number; students: number }[];
  investor: null | { trust: number; week: number; goalCash: number; goalProfit: number; streak: number; met: number };
  ch1: { day: number; tasks: Ch1Task[]; earned: number };
  youtube: { views: number; subs: number; videosThisWeek: number; boostWeeks: number };
  recital: null | { day: number; week: number };
  meetingThisWeek: boolean;
  candidates: Teacher[];
  staffCandidates: Staff[];
  flags: Record<string, number>;
  news: { day: number; text: string; kind: string }[];
  nextId: number;
  trend: { instrument: InstrumentId; weeks: number } | null;
  gameOver: null | 'lost' | 'won';
  totalStudentsEver: number;
  building: 1 | 2;
}

export interface Ch1Task {
  id: string;
  kind: 'lesson' | 'admin';
  label: string;
  instrument?: InstrumentId;
  studentName?: string;
  look?: Look;
  done: boolean;
  score?: number;
}

export const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DAY_FULL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 20;
export const DAY_MINUTES = (CLOSE_HOUR - OPEN_HOUR) * 60;

export function emptyStats(): WeekStats {
  const byInst = {} as Record<InstrumentId, InstStats>;
  for (const i of INSTRUMENT_IDS) byInst[i] = { leads: 0, enrolled: 0, lostCap: 0, lostPrice: 0 };
  return { revenue: 0, costs: 0, leads: 0, enrolled: 0, lostCap: 0, lostPrice: 0, churned: 0, lessons: 0, quality: 0, byInst, ledger: {} };
}

export function randomName(rnd = Math.random) {
  return FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)] + ' ' + LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)];
}
export function firstName(full: string) {
  return full.split(' ')[0];
}

export function newGame(name: string, look: Look, instruments: InstrumentId[]): GameState {
  const plots: Plot[] = [];
  for (let i = 0; i < 8; i++) plots.push({ index: i, owned: false, type: 'empty', decor: 0, equip: {}, items: [] });
  const s: GameState = {
    version: 1,
    playerName: name,
    playerLook: look,
    playerInstruments: instruments,
    chapter: 1,
    week: 1,
    day: 0,
    minute: 0,
    dayIndex: 0,
    cash: 350,
    xp: 0,
    level: 1,
    skillPoints: 0,
    skills: [],
    teachers: [],
    students: [],
    contracts: [],
    staff: [],
    plots,
    rivals: RIVAL_DEFS.map((r) => ({ id: r.id, name: r.name, color: r.color, style: r.style, price: r.price, quality: r.quality, marketing: r.marketing, rep: r.rep, alive: true, promo: 0 })),
    campaigns: [],
    events: [],
    waitlist: [],
    prices: { ind: 280, grp: 160, rehearsal: 50 },
    stats: emptyStats(),
    lastWeek: null,
    history: [],
    investor: null,
    ch1: { day: 0, tasks: [], earned: 0 },
    youtube: { views: 0, subs: 0, videosThisWeek: 0, boostWeeks: 0 },
    recital: null,
    meetingThisWeek: false,
    candidates: [],
    staffCandidates: [],
    flags: {},
    news: [],
    nextId: 1,
    trend: null,
    gameOver: null,
    totalStudentsEver: 0,
    building: 1,
  };
  return s;
}

export function playerTeacher(s: GameState): Teacher {
  return {
    id: 0,
    name: s.playerName,
    look: s.playerLook,
    instruments: s.playerInstruments,
    skill: 3,
    hours: 30,
    wage: 0,
    morale: 100,
    traits: ['carismatico'],
    isPlayer: true,
    weeks: 0,
  };
}

const SAVE_KEY = 'escola-musica-tycoon-v1';
export function saveGame(s: GameState) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    s.building = s.building ?? 1;
    for (const p of s.plots) p.items = p.items ?? [];
    return s;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export { randomLook };
