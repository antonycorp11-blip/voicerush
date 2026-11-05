// World renderer: static building layer + y-sorted props and agents.
import { makeCanvas, Painter, shade, hash, pixelText, textWidth, mix } from '../art/pixel';
import { charSprite, charSit, Look, Dir } from '../art/characters';
import * as P from '../art/props';
import type { InstrumentId } from '../data/instruments';
import { INSTRUMENT_IDS, INSTRUMENTS } from '../data/instruments';
import type { RoomType } from '../data/content';
import {
  Layout, WORLD_W, WORLD_H, WALL_FACE, TOP_FLOOR_END, BOT_WALL_Y, FRONT_Y, CELL, CORR_TOP, CORR_H,
  SIDEWALK_Y, ROAD_Y, plotFloor, plotWall, plotRow, plotCx, plotArea, roomTopY, Pt, Rect,
} from './layout';

export interface PlotView {
  index: number;
  owned: boolean;
  type: RoomType;
  decor: number;
  equip: Partial<Record<InstrumentId, number>>;
  rentable?: boolean;
  shared?: boolean; // building hall used but not owned
  items?: string[];
  walls?: number;
}

export interface SceneModel {
  layout: Layout;
  plots: PlotView[];
  sign: string;
  signColor: string;
  version: number;
  building?: number;
}

export type Bubble = 'q' | 'note' | 'excl' | 'zz' | 'heart' | 'coin' | 'sad' | 'noise' | null;

export interface Agent {
  id: number;
  look: Look;
  x: number;
  y: number;
  path: Pt[];
  speed: number;
  dir: Dir;
  anim: number;
  moving: boolean;
  sit?: boolean;
  bubble: Bubble;
  held?: InstrumentId | null;
  onArrive?: (() => void) | null;
  remove?: boolean;
  clickable?: boolean;
  onClick?: (() => void) | null;
  tag?: string;
  data?: any;
  face?: Dir;
  hidden?: boolean;
  label?: string;
}

interface Drawable { y: number; draw: (g: CanvasRenderingContext2D) => void }
interface PropPlace { img: HTMLCanvasElement; x: number; y: number; hideWhen?: string }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; img: HTMLCanvasElement }
interface FloatText { x: number; y: number; text: string; color: string; t: number }

export interface RoomSpots {
  slots: { inst: InstrumentId; x: number; y: number; kind: 'sit' | 'hold' }[];
  teacher: Pt;
  chairs: Pt[];
  wait: Pt[];
  staff: Pt[];
  band: Pt[];
  audience: Pt[];
  stage: Pt[];
  idle: Pt[];
}

const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const NOTE_COLORS = ['#9b6bd1', '#4f8fd8', '#e8607a', '#f2a63a', '#3fb7b0'];

export class Scene {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  world: HTMLCanvasElement;
  wg: CanvasRenderingContext2D;
  staticLayer: HTMLCanvasElement | null = null;
  staticKey = '';
  model: SceneModel | null = null;
  props: PropPlace[] = [];
  spots: Map<number, RoomSpots> = new Map();
  agents: Agent[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  activeRooms: Map<number, { inst: InstrumentId[]; until: number }> = new Map();
  cars: { x: number; y: number; vx: number; color: string }[] = [];
  nextId = 1;
  time = 0;
  hour = 9;
  scale = 2;
  zoom = 0;
  panX = 0;
  panY = 0;
  ox = 0;
  oy = 0;
  hoverPlot = -1;
  highlightPlots: Set<number> = new Set();
  plotLabels: Map<number, string> = new Map();
  dpr = 1;
  camX = 320;
  camY = 220;
  viewW = 640;
  viewH = 360;
  focusKey = '';
  ghosts: { id: number; side: 'top' | 'bottom'; col: number; w: number; h: number; label: string }[] = [];
  railX = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    [this.world, this.wg] = makeCanvas(WORLD_W, WORLD_H);
    for (let i = 0; i < 3; i++) this.cars.push(this.newCar(Math.random() * WORLD_W));
  }

  newCar(x?: number) {
    const lane = Math.random() < 0.5;
    const colors = ['#e05a4a', '#4f8fd8', '#f2c14e', '#58b06c', '#e9e4da', '#9b6bd1', '#3a3644'];
    return { x: x ?? (lane ? -50 : WORLD_W + 50), y: lane ? ROAD_Y + 22 : ROAD_Y + 40, vx: (lane ? 1 : -1) * (24 + Math.random() * 18), color: colors[Math.floor(Math.random() * colors.length)] };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const rail = h <= 520 ? 68 * dpr : 0;
    this.railX = -rail / 2;
    const fit = Math.min((this.canvas.width - rail) / this.viewW, this.canvas.height / this.viewH);
    this.scale = Math.max(1, Math.floor(fit * 2) / 2) + this.zoom;
    this.g.imageSmoothingEnabled = false;
  }

  /** Frame the camera on the school (it grows sideways, so the view follows). */
  focusBuilding(L: Layout, extra: { side: 'top' | 'bottom'; col: number; w: number; h: number }[] = []) {
    let bx0 = L.minCol * CELL, bx1 = L.maxCol * CELL;
    let top = CORR_TOP - WALL_FACE - 8;
    for (const r of [...L.rooms.values(), ...extra]) {
      if (r.side === 'top') top = Math.min(top, roomTopY(r) - 8);
      bx0 = Math.min(bx0, r.col * CELL); bx1 = Math.max(bx1, (r.col + r.w) * CELL);
    }
    const bottom = ROAD_Y + 20;
    this.viewW = Math.max(560, bx1 - bx0 + 96);
    this.viewH = Math.max(330, bottom - top);
    this.camX = (bx0 + bx1) / 2;
    this.camY = (top + bottom) / 2;
    this.panX = this.panY = 0;
    this.zoom = 0;
    this.focusKey = extra.length ? 'ghost' : `${bx0}|${bx1}|${top}`;
    this.resize();
  }

  setZoom(delta: number) {
    this.zoom = Math.max(0, Math.min(4, this.zoom + delta));
    this.resize();
  }

  setModel(m: SceneModel, night: boolean) {
    if (this.world.width !== WORLD_W) { [this.world, this.wg] = makeCanvas(WORLD_W, WORLD_H); this.resize(); }
    const key = m.version + '|' + night + '|' + WORLD_W;
    this.model = m;
    const L = m.layout;
    let top = CORR_TOP;
    for (const r of L.rooms.values()) if (r.side === 'top') top = Math.min(top, roomTopY(r));
    if (this.focusKey !== 'ghost' && `${L.minCol * CELL}|${L.maxCol * CELL}|${top - 8}` !== this.focusKey) this.focusBuilding(L);
    if (key === this.staticKey && this.staticLayer) return;
    this.staticKey = key;
    this.buildStatic(night);
  }

  // ------------------------------------------------------------------ static layer
  buildStatic(night: boolean) {
    const m = this.model!;
    const L = m.layout;
    const [c, g] = makeCanvas(WORLD_W, WORLD_H);
    const p = new Painter(g);
    // grass
    p.rect(0, 0, WORLD_W, WORLD_H, '#8cc265');
    for (let y = 0; y < WORLD_H; y += 2) for (let x = 0; x < WORLD_W; x += 2) {
      const h = hash(x, y, 7);
      if (h < 0.06) p.px(x, y, '#7ab056');
      else if (h > 0.97) p.px(x, y, '#a6d67a');
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i, 3, 11) * WORLD_W);
      const y = Math.floor(hash(i, 5, 11) * WORLD_H);
      p.px(x, y, '#6aa04a'); p.px(x + 1, y - 1, '#6aa04a'); p.px(x + 2, y, '#6aa04a');
      if (i % 7 === 0) { p.px(x + 4, y - 2, '#f2e6a0'); p.px(x + 4, y - 3, '#fff'); }
    }
    // sidewalk
    const sw = FRONT_Y + 8;
    p.rect(0, sw, WORLD_W, ROAD_Y - sw, '#d9d1c3');
    for (let x = 0; x < WORLD_W; x += 16) p.vl(x, sw, ROAD_Y - sw, '#c8bfb0');
    for (let y = sw + 8; y < ROAD_Y; y += 10) p.hl(0, y, WORLD_W, '#cfc6b8');
    p.rect(0, ROAD_Y - 3, WORLD_W, 3, '#b0a898');
    p.hl(0, ROAD_Y - 3, WORLD_W, '#e8e2d6');
    // road
    p.rect(0, ROAD_Y, WORLD_W, WORLD_H - ROAD_Y, '#5d5966');
    for (let y = ROAD_Y; y < WORLD_H; y += 2) for (let x = 0; x < WORLD_W; x += 3) if (hash(x, y, 2) < 0.08) p.px(x, y, '#686472');
    for (let x = 0; x < WORLD_W; x += 28) p.rect(x, ROAD_Y + 29, 14, 2, '#e8e0c8');
    p.rect(0, WORLD_H - 4, WORLD_W, 4, '#d9d1c3');

    // background trees (top band)
    for (let i = 0; i < 14; i++) {
      const x = i * 48 - 10 + Math.floor(hash(i, 1, 4) * 16);
      g.drawImage(P.tree(i), x, -14 + Math.floor(hash(i, 2, 4) * 8));
    }

    const bx0 = L.minCol * CELL;
    const bx1 = L.maxCol * CELL;
    const geo = [...L.rooms.values()];
    const topCover = (x: number) => geo.some((r) => r.side === 'top' && x >= r.col * CELL && x < (r.col + r.w) * CELL);
    const botCover = (x: number) => geo.some((r) => r.side === 'bottom' && x >= r.col * CELL && x < (r.col + r.w) * CELL);
    const topY = Math.min(CORR_TOP - WALL_FACE, ...geo.filter((r) => r.side === 'top').map((r) => roomTopY(r)));
    // garden trees around the school (never under it)
    for (let x = 8; x < WORLD_W - 20; x += 72) {
      const k = Math.floor(x / 72);
      const tx = x + Math.floor(hash(k, 9, 3) * 30);
      const ty = 60 + Math.floor(hash(k, 4, 3) * 150);
      const timg = P.tree(k);
      const inside = tx + timg.width > bx0 - 6 && tx < bx1 + 6 && ty + timg.height > topY - 8;
      if (!inside) g.drawImage(timg, tx, ty);
      if (tx + 18 < bx0 - 10 || tx > bx1 + 10) g.drawImage(P.bush(k), tx + 6, FRONT_Y - 20);
    }
    // building shadow
    g.fillStyle = 'rgba(40,50,30,0.16)';
    g.fillRect(bx1 + 2, topY, 6, FRONT_Y - topY + 8);

    // corridor floor
    const hallPlot = m.plots.find((x) => x.index === L.hall) ?? m.plots[0];
    const ct = hallPlot && hallPlot.owned ? Math.max(1, hallPlot.decor) : 0;
    this.drawFloor(p, { x: bx0, y: CORR_TOP, w: bx1 - bx0, h: CORR_H }, ct, 99, true);
    // corridor back wall where there is no room behind it (interior face with windows)
    for (let x = bx0; x < bx1; x += CELL) {
      if (topCover(x)) continue;
      let x2 = x; while (x2 < bx1 && !topCover(x2)) x2 += CELL;
      this.drawWall(p, { x, y: CORR_TOP - WALL_FACE, w: x2 - x, h: WALL_FACE }, ct, x, '#f2c14e');
      for (let wx = x + 6; wx + 22 < x2; wx += 48) g.drawImage(P.windowSprite(night), wx, CORR_TOP - WALL_FACE + 6);
      p.rect(x, CORR_TOP - WALL_FACE - 4, x2 - x, 4, '#5e4b56');
      p.hl(x, CORR_TOP - WALL_FACE - 4, x2 - x, '#7a6670');
      x = x2 - CELL;
    }
    // little gardens in the gaps between street-side rooms
    for (let x = bx0; x < bx1; x += CELL) {
      if (botCover(x)) continue;
      let x2 = x; while (x2 < bx1 && !botCover(x2)) x2 += CELL;
      p.rect(x, BOT_WALL_Y + 8, x2 - x, FRONT_Y - BOT_WALL_Y - 8, '#86bd5e');
      for (let yy = BOT_WALL_Y + 20; yy < FRONT_Y - 10; yy += 8) for (let xx = x + 4; xx < x2 - 4; xx += 6) if (hash(xx, yy, 5) < 0.3) p.px(xx, yy, '#a6d67a');
      g.drawImage(P.bush(x), x + (x2 - x) / 2 - 9, FRONT_Y - 24);
      if (x2 - x >= 48) g.drawImage(P.tree(x), x + (x2 - x) / 2 - 15, BOT_WALL_Y + 8);
      x = x2 - CELL;
    }

    // rooms
    for (const pv of m.plots) this.drawPlotStatic(p, g, pv, night);

    // walls: caps around each room; shared walls show their acoustic level
    const wallsOf = (id: number) => m.plots.find((x) => x.index === id)?.walls ?? 0;
    for (const r of geo) {
      const y0 = roomTopY(r) - (r.side === 'top' ? 5 : 4);
      const y1 = r.side === 'top' ? CORR_TOP : FRONT_Y;
      const x0 = r.col * CELL, x1 = (r.col + r.w) * CELL;
      if (r.side === 'top') { p.rect(x0 - 2, y0, x1 - x0 + 4, 5, '#5e4b56'); p.hl(x0 - 2, y0, x1 - x0 + 4, '#7a6670'); }
      const lvlL = Math.max(wallsOf(r.id), ...geo.filter((o) => o.side === r.side && o.col + o.w === r.col).map((o) => wallsOf(o.id)));
      const lvlR = Math.max(wallsOf(r.id), ...geo.filter((o) => o.side === r.side && o.col === r.col + r.w).map((o) => wallsOf(o.id)));
      this.capV(p, x0, y0, y1, lvlL);
      this.capV(p, x1, y0, y1, lvlR);
    }
    // corridor south edge cap where street-side rooms are
    for (const r of geo) if (r.side === 'bottom') { p.rect(r.col * CELL, BOT_WALL_Y - 4, r.w * CELL, 4, '#5e4b56'); p.hl(r.col * CELL, BOT_WALL_Y - 4, r.w * CELL, '#7a6670'); }
    // corridor ends
    this.capV(p, bx0, CORR_TOP - WALL_FACE - 4, BOT_WALL_Y + 4, 0);
    this.capV(p, bx1, CORR_TOP - WALL_FACE - 4, BOT_WALL_Y + 4, 0);

    for (let x = 6; x < WORLD_W; x += 160) g.drawImage(P.bench(), x, sw + 2);

    this.staticLayer = c;
    this.buildProps(night);
  }

  /** Vertical wall cap; level shows acoustic insulation (0 simple, 1 foam, 2 pro). */
  capV(p: Painter, x: number, y0: number, y1: number, level: number) {
    const h = y1 - y0;
    if (level <= 0) { p.rect(x - 2, y0, 4, h, '#5e4b56'); p.vl(x - 2, y0, h, '#7a6670'); return; }
    if (level === 1) {
      p.rect(x - 3, y0, 6, h, '#5a3e6a'); p.vl(x - 3, y0, h, '#7a5e8a');
      for (let y = y0 + 2; y < y1 - 1; y += 3) p.px(x + (y % 2), y, '#9a7aba');
      return;
    }
    p.rect(x - 4, y0, 8, h, '#6a4028'); p.vl(x - 4, y0, h, '#9a6440'); p.vl(x + 3, y0, h, '#4a2a1a');
    p.rect(x - 1, y0, 2, h, '#5a3e6a');
    for (let y = y0 + 3; y < y1 - 1; y += 6) p.px(x, y, '#e8c25a');
  }

  drawFloor(p: Painter, r: Rect, tier: number, seed: number, corridor = false) {
    const { x, y, w, h } = r;
    if (tier <= 0) {
      p.rect(x, y, w, h, '#bdb5a9');
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const v = hash(x + i, y + j, seed);
        if (v < 0.05) p.px(x + i, y + j, '#ada597');
        else if (v > 0.985) p.px(x + i, y + j, '#cbc4b8');
      }
      for (let i = 16; i < w; i += 16) p.vl(x + i, y, h, '#b1a99d');
      for (let j = 16; j < h; j += 16) p.hl(x, y + j, w, '#b1a99d');
      if (!corridor) {
        // cracks + stain
        for (let k = 0; k < 2; k++) {
          let cx = x + 10 + Math.floor(hash(k, seed, 1) * (w - 20));
          let cy = y + 6 + Math.floor(hash(seed, k, 2) * (h - 12));
          for (let s = 0; s < 9; s++) { p.px(cx, cy, '#948c80'); cx += hash(s, k, seed) > 0.5 ? 1 : 0; cy += 1; if (s % 3 === 2) cx -= 1; }
        }
        p.dither(x + 20 + Math.floor(hash(seed, 3, 3) * (w - 50)), y + h - 18, 18, 8, '#a89f92');
      }
    } else if (tier === 1) {
      const cols = ['#cc9d68', '#c4935f', '#d1a571'];
      for (let row = 0, yy = y; yy < y + h; row++, yy += 6) {
        const hh = Math.min(6, y + h - yy);
        p.rect(x, yy, w, hh, cols[row % 3]);
        p.hl(x, yy, w, shade(cols[row % 3], 0.12));
        if (hh === 6) p.hl(x, yy + 5, w, '#9f7247');
        let bx = x + Math.floor(hash(row, seed, 5) * 30);
        while (bx < x + w) { p.vl(bx, yy, hh - 1, '#a7784b'); bx += 28 + Math.floor(hash(bx, row, seed) * 18); }
      }
    } else if (tier === 2) {
      for (let j = 0; j < h; j += 16) for (let i = 0; i < w; i += 16) {
        const dark = ((i + j) / 16) % 2 === 1;
        const c = dark ? '#ddc598' : '#ecdbb8';
        p.rect(x + i, y + j, Math.min(16, w - i), Math.min(16, h - j), c);
        p.hl(x + i, y + j, Math.min(16, w - i), shade(c, 0.12));
        p.vl(x + i, y + j, Math.min(16, h - j), shade(c, 0.06));
      }
    } else if (tier >= 4) {
      // marble with gold inlays
      for (let j = 0; j < h; j += 16) for (let i = 0; i < w; i += 16) {
        const dark = ((i + j) / 16) % 2 === 1;
        const c = dark ? '#ddd6cc' : '#f4f0ea';
        p.rect(x + i, y + j, Math.min(16, w - i), Math.min(16, h - j), c);
        for (let k = 0; k < 6; k++) { const vx = x + i + Math.floor(hash(i, j + k, seed) * 15); const vy = y + j + Math.floor(hash(j, i + k, seed) * 15); if (vx < x + w && vy < y + h) p.px(vx, vy, dark ? '#c4bcb0' : '#d8d2c8'); }
        p.hl(x + i, y + j, Math.min(16, w - i), '#c9a640');
        p.vl(x + i, y + j, Math.min(16, h - j), '#c9a640');
      }
      p.dither(x, y, w, 3, 'rgba(255,240,200,0.35)');
    } else {
      // basket-weave parquet
      const cols = ['#a4683d', '#985f37', '#ae7346'];
      for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 8) {
        const hor = ((i + j) / 8) % 2 === 0;
        for (let k = 0; k < 2; k++) {
          const c = cols[Math.floor(hash(i + k, j, seed) * 3)];
          if (hor) { p.rect(x + i, y + j + k * 4, Math.min(8, w - i), Math.min(4, h - j - k * 4), c); p.hl(x + i, y + j + k * 4, Math.min(8, w - i), shade(c, 0.15)); }
          else { p.rect(x + i + k * 4, y + j, Math.min(4, w - i - k * 4), Math.min(8, h - j), c); p.vl(x + i + k * 4, y + j, Math.min(8, h - j), shade(c, 0.15)); }
        }
      }
      p.dither(x, y, w, 2, 'rgba(255,240,200,0.25)');
    }
  }

  drawWall(p: Painter, r: Rect, tier: number, seed: number, accent: string) {
    const { x, y, w, h } = r;
    if (tier <= 0) {
      p.rect(x, y, w, h, '#cbbda3');
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (hash(x + i, y + j, seed + 3) < 0.05) p.px(x + i, y + j, '#bdae93');
      p.dither(x + 8 + Math.floor(hash(seed, 1, 9) * (w - 40)), y + 4, 20, 10, '#b8a98d');
      // exposed bricks
      const bx = x + 70 + Math.floor(hash(seed, 2, 9) * 30);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) p.rect(bx + i * 6 + (j % 2) * 3, y + 10 + j * 4, 5, 3, '#b0664a');
      // crack
      let cx = x + 30 + Math.floor(hash(seed, 3, 9) * 30), cy = y + 2;
      for (let s = 0; s < 12; s++) { p.px(cx, cy, '#8f8068'); cy++; cx += s % 3 === 0 ? 1 : 0; }
      p.rect(x, y + h - 3, w, 3, '#928674');
    } else if (tier === 1) {
      const c = mix('#efe2c4', accent, 0.12);
      p.rect(x, y, w, h, c);
      p.hl(x, y, w, shade(c, 0.3));
      p.hl(x, y + 1, w, shade(c, 0.15));
      p.rect(x, y + h - 3, w, 3, '#a8673a');
      p.hl(x, y + h - 3, w, '#c98a55');
    } else if (tier === 2) {
      const c = mix('#f6ecd6', accent, 0.15);
      p.rect(x, y, w, h, c);
      p.hl(x, y, w, shade(c, 0.3));
      const wy = y + h - 13;
      p.rect(x, wy, w, 13, '#b47a4a');
      p.hl(x, wy, w, '#d8a06a');
      p.hl(x, wy + 1, w, '#c48a56');
      for (let i = x + 4; i < x + w - 4; i += 16) { p.rect(i, wy + 3, 12, 7, '#a86e40'); p.hl(i, wy + 3, 12, '#9a6238'); }
      p.rect(x, y + h - 2, w, 2, '#7a4a2c');
    } else if (tier >= 4) {
      p.rect(x, y, w, h, '#2c3458');
      p.rect(x, y, w, 3, '#f4ecd6'); p.hl(x, y + 3, w, '#e8c25a');
      for (let i = x + 4; i < x + w - 8; i += 22) { p.rect(i, y + 7, 18, 13, '#323c64'); p.hl(i, y + 7, 18, '#c9a640'); p.hl(i, y + 19, 18, '#c9a640'); p.vl(i, y + 7, 13, '#c9a640'); p.vl(i + 17, y + 7, 13, '#c9a640'); }
      p.rect(x, y + h - 8, w, 8, '#1e2440'); p.hl(x, y + h - 8, w, '#e8c25a'); p.hl(x, y + h - 1, w, '#c9a640');
    } else {
      p.rect(x, y, w, h, '#4a2e22');
      for (let i = 0; i < w; i += 4) { p.rect(x + i, y + 3, 3, h - 6, i % 8 === 0 ? '#8e5836' : '#9c6440'); p.vl(x + i, y + 3, h - 6, '#b07448'); }
      p.rect(x, y, w, 3, '#3a2a30');
      p.hl(x, y + 3, w, '#ffe9b0');
      p.dither(x, y + 4, w, 2, 'rgba(255,230,160,0.5)');
      p.rect(x, y + h - 3, w, 3, '#2e2228');
    }
  }

  drawPlotStatic(p: Painter, g: CanvasRenderingContext2D, pv: PlotView, night: boolean) {
    const L = this.model!.layout;
    const f = plotFloor(L, pv.index);
    const w = plotWall(L, pv.index);
    const usable = pv.owned || pv.shared;
    const tier = usable ? pv.decor : 0;
    const accent = pv.type === 'reception' ? '#3fb7b0' : pv.type === 'lounge' ? '#f08a3e' : pv.type === 'rehearsal' ? '#9b6bd1' : pv.type === 'auditorium' ? '#c24d6a' : pv.type === 'studio' ? '#4f8fd8' : '#f2c14e';
    this.drawFloor(p, f, tier, pv.index * 13 + 1);
    this.drawWall(p, { x: w.x + 2, y: w.y, w: w.w - 4, h: WALL_FACE }, tier, pv.index * 7 + 2, accent);
    const cx = plotCx(L, pv.index);
    // doorway in back wall for bottom row
    if (plotRow(L, pv.index) === 1) {
      const dx = cx - 9;
      const dy = w.y + 6;
      p.rect(dx - 2, dy - 2, 22, WALL_FACE - 4, tier >= 2 ? '#8a5634' : '#9a8a74');
      p.rect(dx, dy, 18, WALL_FACE - 6, '#3e2c30');
      p.rect(dx, dy, 18, 2, '#2e2026');
      g.fillStyle = 'rgba(255,240,200,0.08)';
      g.fillRect(dx, dy + 6, 18, WALL_FACE - 12);
    }
    // rugs
    if (usable && tier >= 2 && (pv.type === 'classroom' || pv.type === 'reception' || pv.type === 'lounge' || pv.type === 'studio')) {
      const rc = tier >= 4 ? '#7a1e2e' : tier === 3 ? '#8a3a4a' : '#5a7ab0';
      const rw = 56, rh = 26;
      const rx = cx - rw / 2, ry = f.y + f.h - rh - 8;
      p.rect(rx, ry, rw, rh, rc);
      p.rect(rx + 2, ry + 2, rw - 4, rh - 4, shade(rc, 0.2));
      p.rect(rx + 4, ry + 4, rw - 8, rh - 8, rc);
      for (let i = rx + 6; i < rx + rw - 6; i += 6) p.px(i, ry + rh / 2, shade(rc, 0.35));
      for (let i = rx; i < rx + rw; i += 2) { p.px(i, ry - 1, tier >= 4 ? '#e8c25a' : '#efe4cf'); p.px(i, ry + rh, tier >= 4 ? '#e8c25a' : '#efe4cf'); }
    }
    // wall decor
    const wd = (img: HTMLCanvasElement, x: number, yy: number) => g.drawImage(img, Math.round(x), Math.round(yy));
    const wy = w.y;
    if (!usable) {
      if (pv.rentable) wd(P.signBoard('EXPANDIR +', '#3f9a52'), cx - 24, wy + 8);
      else wd(P.signBoard('ALUGA-SE', '#c2412e'), cx - 22, wy + 8);
      g.drawImage(P.boxes(pv.index), f.x + 10, f.y + f.h - 26);
      g.drawImage(P.boxes(pv.index + 1), f.x + f.w - 34, f.y + 10);
      // dim
      g.fillStyle = 'rgba(40,28,44,0.38)';
      g.fillRect(w.x + 2, w.y, w.w - 4, f.y + f.h - w.y);
      if (pv.rentable) {
        g.fillStyle = 'rgba(140,255,160,0.16)';
        g.fillRect(f.x, f.y, f.w, f.h);
      }
      return;
    }
    const left = w.x + 8;
    const right = w.x + w.w - 8;
    const isBottom = plotRow(L, pv.index) === 1;
    if (pv.type === 'empty') {
      wd(P.signBoard('CONSTRUA AQUI', '#3f9a52'), cx - 30, wy + 8);
      g.drawImage(P.boxes(pv.index + 4), f.x + 8, f.y + f.h - 24);
      return;
    }
    if (pv.type === 'hall' && !pv.owned) {
      wd(P.poster(pv.index + 2), left + 6, wy + 8);
      return;
    }
    const items = pv.items ?? [];
    const has = (k: string) => items.includes(k);
    const zoneC = isBottom ? cx + 20 : cx - 15; // free wall spot (bottom rooms have a door in the middle)
    if (tier === 0) {
      wd(P.poster(pv.index), left + 4, wy + 9);
    } else if (tier === 1) {
      wd(P.poster(pv.index), left + 4, wy + 8);
      if (!isBottom) wd(P.windowSprite(night), cx - 11, wy + 7);
      else wd(P.poster(pv.index + 2), cx + 22, wy + 8);
    } else if (tier === 2) {
      wd(P.windowSprite(night), left, wy + 6);
      if (pv.type === 'classroom') wd(P.whiteboard(), isBottom ? right - 62 : cx - 15, wy + 7);
      else wd(P.poster(pv.index + 1), zoneC, wy + 7);
      wd(P.wallClock(), right - 28, wy + 6);
    } else if (tier === 3) {
      wd(P.acousticPanel('#5a3e5a'), left, wy + 6);
      wd(P.acousticPanel('#5a3e5a'), left + 12, wy + 6);
      wd(P.sconce(), left + 26, wy + 8);
      wd(P.vinylFrame(pv.index), isBottom ? cx + 14 : cx - 7, wy + 8);
      wd(P.guitarWall('#d0473f'), isBottom ? cx + 30 : cx + 12, wy + 7);
      wd(P.acousticPanel('#5a3e5a'), right - 22, wy + 6);
      wd(P.acousticPanel('#5a3e5a'), right - 10, wy + 6);
    } else {
      wd(P.curtainWindow(4, night), left - 2, wy + 5);
      wd(P.framedArt(pv.index, true), isBottom ? cx + 16 : cx - 8, wy + 8);
      wd(P.sconce(), isBottom ? cx + 36 : cx + 12, wy + 9);
      wd(P.framedArt(pv.index + 1, true), right - 18, wy + 8);
    }
    if (pv.type === 'reception' && tier >= 1) wd(P.trophyShelf(), isBottom ? cx + 18 : left + 30, wy + 12);
    if (has('tv')) { const tv = P.tvL(tier); wd(tv, isBottom ? cx + 14 : cx - tv.width / 2, wy + 5); }
    if (has('clima')) { const c = P.climaL(tier); wd(c, right - c.width - 2, wy + (tier >= 2 ? 1 : 3)); }
    const lamp = P.luzL(has('luz') ? tier : 0);
    if (has('luz') || tier === 0) wd(lamp, left + 46 - lamp.width / 2, wy);
  }

  // ------------------------------------------------------------------ props
  buildProps(night: boolean) {
    const m = this.model!;
    const L = m.layout;
    this.props = [];
    this.spots.clear();
    for (const pv of m.plots) {
      const f = plotFloor(L, pv.index);
      const cx = plotCx(L, pv.index);
      const sp: RoomSpots = { slots: [], teacher: { x: cx, y: f.y + 40 }, chairs: [], wait: [], staff: [], band: [], audience: [], stage: [], idle: [] };
      this.spots.set(pv.index, sp);
      const add = (img: HTMLCanvasElement, x: number, y: number, hideWhen?: string) => this.props.push({ img, x: Math.round(x), y: Math.round(y), hideWhen });
      const usable = pv.owned || pv.shared;
      const isBottom = plotRow(L, pv.index) === 1;
      // keep doorway lane free: center x ± 10
      if (!usable) continue;
      const tier = pv.decor;
      const fx = f.x, fy = f.y, fw = f.w, fh = f.h;
      const items = pv.items ?? [];
      const has = (k: string) => items.includes(k);
      const plantImg = () => P.plant(tier >= 3 ? 2 : tier >= 2 ? 1 : 0);
      const speakersAt = (x1: number, x2: number, y: number) => { add(P.speakerL(tier), x1, y); add(P.speakerL(tier), x2, y); };
      sp.idle.push({ x: cx - 30, y: fy + fh - 14 }, { x: cx + 30, y: fy + fh - 14 }, { x: cx, y: fy + fh - 20 });
      switch (pv.type) {
        case 'classroom': {
          const insts = INSTRUMENT_IDS.filter((i) => pv.equip[i] !== undefined).slice(0, 3);
          const xs = insts.length === 1 ? [cx - 20] : insts.length === 2 ? [fx + 26, fx + fw - 30] : [fx + 20, cx + 2, fx + fw - 22];
          insts.forEach((inst, k) => {
            const t = pv.equip[inst]!;
            const x = xs[k];
            const y = fy + 30;
            if (inst === 'piano') { add(P.keyboard(t), x, y + (t === 2 ? 6 : 0)); sp.slots.push({ inst, x, y: y - 8, kind: 'sit' }); }
            else if (inst === 'bateria') { add(P.drumKit(t), x, y + 2); sp.slots.push({ inst, x, y: y - 8, kind: 'sit' }); }
            else if (inst === 'canto') { add(P.micStand(t), x, y + 4); add(P.speaker(), x + 12, y - 4); sp.slots.push({ inst, x: x - 1, y: y - 2, kind: 'sit' }); }
            else {
              add(P.stringOnStand(inst, t), x, y, 'hold:' + inst);
              if (inst === 'guitarra' || inst === 'baixo') add(P.amp(t), x + 13, y - 2);
              sp.slots.push({ inst, x, y: y + 2, kind: 'hold' });
            }
          });
          sp.teacher = { x: cx + 14, y: fy + 46 };
          for (let j = 0; j < 6; j++) sp.chairs.push({ x: fx + 18 + j * 17, y: fy + fh - 6 });
          // prefab item spots (fixed positions, style follows room level)
          if (has('som')) speakersAt(fx + 6, fx + fw - 6, fy + 22);
          if (has('plantas')) { add(plantImg(), fx + 8, fy + fh - 2); if (tier >= 3) add(P.plant(1), fx + fw - 30, fy + fh - 2); }
          if (has('estante')) add(P.estanteL(tier), fx + fw - 14, fy + fh - 2);
          else if (tier === 0) add(P.boxes(pv.index + 2), fx + fw - 14, fy + fh - 2);
          if (has('cadeiras')) for (const x of [fx + 24, fx + 38, fx + fw - 52, fx + fw - 38]) add(P.chairL(tier, ['#c47a4a', '#c47a4a', '#3fb7b0', '#2e2a36', '#8a2a3e'][tier]), x, fy + fh - 5);
          else if (tier >= 1) add(P.chairL(0), fx + fw - 34, fy + fh - 5);
          if (tier >= 2) add(P.musicStand(), cx - 30, fy + fh - 20);
          if (tier >= 3) add(P.floorLamp(), fx + 6, fy + 50);
          break;
        }
        case 'hall':
        case 'reception': {
          const rec = pv.type === 'reception';
          if (rec) {
            add(P.counter(Math.min(3, tier), 50), fx + fw - 30, fy + 34);
            sp.staff.push({ x: fx + fw - 40, y: fy + 20 }, { x: fx + fw - 22, y: fy + 20 }, { x: fx + fw - 50, y: fy + 18 });
            if (has('sofa')) { add(P.sofaL(tier), fx + 24, fy + fh - 2); if (tier >= 2) add(P.coffeeTable(), fx + 50, fy + fh - 4); }
            else add(P.chairL(0), fx + 20, fy + fh - 6);
            sp.wait.push({ x: fx + 14, y: fy + fh - 12 }, { x: fx + 26, y: fy + fh - 12 }, { x: fx + 38, y: fy + fh - 12 }, { x: fx + fw - 44, y: fy + 48 }, { x: fx + fw - 30, y: fy + 50 }, { x: fx + fw - 16, y: fy + 48 });
            if (tier >= 1) add(P.waterCooler(), fx + 8, fy + 28);
            if (has('plantas')) { add(plantImg(), fx + fw - 6, fy + fh - 2); if (tier >= 3) add(P.plant(2), fx + 50, fy + 26); }
            if (has('som')) add(P.speakerL(tier), fx + 22, fy + 22);
            if (tier >= 4) add(P.floorLamp(), fx + 6, fy + 50);
          } else {
            add(P.plant(0), fx + 8, fy + 30);
            add(P.boxes(3), fx + fw - 16, fy + 30);
            sp.wait.push({ x: fx + 22, y: fy + fh - 14 }, { x: fx + 36, y: fy + fh - 12 }, { x: fx + fw - 30, y: fy + fh - 14 });
          }
          break;
        }
        case 'office': {
          add(P.bookshelf(pv.index), fx + 16, fy + 6);
          add(P.counter(1, 40), cx + 10, fy + 34);
          add(P.chair('#6a4a6a'), cx + 10, fy + 18);
          add(P.plant(1), fx + fw - 8, fy + 30);
          sp.staff.push({ x: cx + 10, y: fy + 20 });
          break;
        }
        case 'booth': {
          const t = Math.min(2, Math.max(0, tier - 1));
          add(P.drumKit(t), cx - 6, fy + 30);
          add(P.amp(t), fx + 10, fy + 52);
          add(P.micStand(t), fx + fw - 10, fy + 44);
          if (has('som')) add(P.speakerL(tier), fx + 6, fy + 24);
          if (has('plantas')) add(plantImg(), fx + fw - 6, fy + fh - 2);
          sp.band.push({ x: cx - 6, y: fy + 22 }, { x: fx + fw - 12, y: fy + 40 }, { x: fx + 22, y: fy + 50 });
          break;
        }
        case 'rehearsal': {
          const t = Math.min(2, Math.max(0, tier - 1));
          add(P.drumKit(t), cx - 26, fy + 30);
          add(P.amp(t), fx + 14, fy + 26);
          add(P.amp(t, '#5a4a3a'), fx + fw - 14, fy + 26);
          add(P.micStand(t), cx + 16, fy + 40);
          add(P.keyboard(Math.min(1, t)), fx + fw - 24, fy + 50);
          add(P.stringOnStand('guitarra', t), fx + 10, fy + 56);
          if (has('som')) speakersAt(fx + 4, fx + fw - 4, fy + 46);
          if (has('plantas')) add(plantImg(), fx + 8, fy + fh - 2);
          if (has('luz') && tier >= 2) { add(P.heldSpotlight(), fx + 30, fy + fh - 2); add(P.heldSpotlight(), fx + fw - 30, fy + fh - 2); }
          sp.band.push({ x: cx - 26, y: fy + 22 }, { x: cx + 16, y: fy + 36 }, { x: fx + 30, y: fy + 46 }, { x: fx + fw - 24, y: fy + 44 });
          break;
        }
        case 'lounge': {
          add(P.cafeCounter(), fx + 26, fy + 28);
          sp.staff.push({ x: fx + 24, y: fy + 14 });
          add(P.cafeTable(), fx + 70, fy + 40);
          add(P.chairL(has('cadeiras') ? tier : 0, '#f08a3e'), fx + 60, fy + 42);
          add(P.chairL(has('cadeiras') ? tier : 0, '#f08a3e'), fx + 82, fy + 42);
          if (has('sofa')) add(P.sofaL(tier), fx + fw - 26, fy + fh - 4);
          if (has('plantas')) add(plantImg(), fx + fw - 8, fy + 30);
          if (has('som')) add(P.speakerL(tier), fx + 8, fy + fh - 4);
          sp.wait.push({ x: fx + 60, y: fy + 36 }, { x: fx + 82, y: fy + 36 }, { x: fx + fw - 34, y: fy + fh - 12 }, { x: fx + fw - 20, y: fy + fh - 12 });
          break;
        }
        case 'auditorium': {
          add(P.stage(fw - 20), cx, fy + 26);
          add(P.keyboard(2), cx - 24, fy + 14);
          add(P.micStand(1), cx + 18, fy + 18);
          if (has('som')) speakersAt(fx + 8, fx + fw - 8, fy + 22);
          else { add(P.speaker(), fx + 14, fy + 18); add(P.speaker(), fx + fw - 14, fy + 18); }
          if (has('plantas')) { add(plantImg(), fx + 6, fy + fh - 2); add(plantImg(), fx + fw - 6, fy + fh - 2); }
          sp.stage.push({ x: cx - 24, y: fy + 4 }, { x: cx + 18, y: fy + 10 }, { x: cx, y: fy + 12 }, { x: cx - 8, y: fy + 8 });
          const ncol = Math.max(3, Math.min(9, Math.floor((fw - 16) / 20)));
          const nrow = Math.max(2, Math.min(4, Math.floor((fh - 50) / 16)));
          const aisle = Math.floor(ncol / 2);
          for (let r = 0; r < nrow; r++) for (let k = 0; k < ncol; k++) {
            if (k === aisle) continue; // aisle
            const x = fx + 10 + k * 20 + (fw - 20 - ncol * 20) / 2;
            const y = fy + 48 + r * 16;
            add(has('cadeiras') ? P.chairL(Math.max(1, tier), '#c24d6a') : P.audienceChair('#8a6a5a'), x, y);
            sp.audience.push({ x, y: y - 4 });
          }
          break;
        }
        case 'studio': {
          add(P.mixingDesk(), fx + 30, fy + 30);
          if (has('som')) speakersAt(fx + 10, fx + 50, fy + 22);
          else { add(P.speaker(), fx + 10, fy + 20); add(P.speaker(), fx + 50, fy + 20); }
          add(P.micStand(2), fx + fw - 24, fy + 34);
          if (has('sofa')) add(P.sofaL(tier), fx + 30, fy + fh - 2);
          if (has('estante')) add(P.estanteL(tier), fx + fw - 12, fy + fh - 2);
          if (has('plantas')) add(plantImg(), fx + 6, fy + fh - 2);
          sp.staff.push({ x: fx + 30, y: fy + 18 });
          sp.band.push({ x: fx + fw - 28, y: fy + 30 }, { x: fx + fw - 14, y: fy + 40 });
          break;
        }
      }
      void isBottom; void night;
    }
  }

  // ------------------------------------------------------------------ agents
  spawn(look: Look, x: number, y: number, opts: Partial<Agent> = {}): Agent {
    const a: Agent = { id: this.nextId++, look, x, y, path: [], speed: 46, dir: 'down', anim: 0, moving: false, bubble: null, ...opts };
    this.agents.push(a);
    return a;
  }

  walk(a: Agent, path: Pt[], onArrive?: () => void) {
    a.path = path.map((p) => ({ ...p }));
    a.onArrive = onArrive ?? null;
    a.sit = false;
    a.moving = a.path.length > 0;
  }

  removeAgent(a: Agent) { a.remove = true; }

  roomSpots(plot: number) { return this.spots.get(plot); }

  setActive(plot: number, inst: InstrumentId[], dur: number) {
    this.activeRooms.set(plot, { inst, until: this.time + dur });
  }

  addFloat(x: number, y: number, text: string, color = '#ffe08a') {
    this.floats.push({ x, y, text, color, t: 0 });
  }

  sparkle(x: number, y: number, n = 12) {
    for (let i = 0; i < n; i++) {
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 0, max: 1 + Math.random(), img: P.noteParticle(NOTE_COLORS[i % NOTE_COLORS.length]) });
    }
  }

  update(dt: number, gameSpeed: number) {
    this.time += dt;
    const sp = Math.max(1, gameSpeed);
    for (const a of this.agents) {
      if (a.path.length) {
        const t = a.path[0];
        const dx = t.x - a.x, dy = t.y - a.y;
        const d = Math.hypot(dx, dy);
        const step = a.speed * dt * Math.min(sp, 4);
        if (d <= step) {
          a.x = t.x; a.y = t.y;
          a.path.shift();
          if (!a.path.length) {
            a.moving = false;
            if (a.face) a.dir = a.face;
            const cb = a.onArrive; a.onArrive = null; cb?.();
          }
        } else {
          a.x += (dx / d) * step; a.y += (dy / d) * step;
          a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          a.moving = true;
        }
        a.anim += dt * 8 * Math.min(sp, 3);
      }
    }
    this.agents = this.agents.filter((a) => !a.remove);
    // lesson note particles
    for (const [plot, act] of this.activeRooms) {
      if (this.time > act.until) { this.activeRooms.delete(plot); continue; }
      if (Math.random() < dt * 2.2) {
        const s = this.spots.get(plot);
        if (s && s.slots.length) {
          const slot = s.slots.find((q) => act.inst.includes(q.inst)) ?? s.slots[0];
          this.particles.push({ x: slot.x + (Math.random() * 10 - 5), y: slot.y - 18, vx: (Math.random() - 0.5) * 8, vy: -14 - Math.random() * 8, life: 0, max: 1.6, img: P.noteParticle(NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]) });
        } else if (s) {
          const c = { x: plotCx(this.model!.layout, plot), y: plotFloor(this.model!.layout, plot).y + 20 };
          this.particles.push({ x: c.x + (Math.random() * 40 - 20), y: c.y, vx: (Math.random() - 0.5) * 8, vy: -14, life: 0, max: 1.6, img: P.noteParticle(NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]) });
        }
      }
    }
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 4 * dt; }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.8);
    for (const c of this.cars) {
      c.x += c.vx * dt;
      if (c.x < -80 || c.x > WORLD_W + 80) Object.assign(c, this.newCar());
    }
  }

  // ------------------------------------------------------------------ render
  render() {
    const m = this.model;
    if (!m || !this.staticLayer) return;
    const g = this.wg;
    g.clearRect(0, 0, WORLD_W, WORLD_H);
    g.drawImage(this.staticLayer, 0, 0);
    const L = m.layout;
    const draws: Drawable[] = [];
    const activeHold = new Set<string>();
    for (const a of this.agents) if (a.held && !a.moving) activeHold.add('hold:' + a.held + '@' + Math.round(a.x / 4));
    for (const pr of this.props) {
      if (pr.hideWhen) {
        // hide stand instrument while a student is holding it in that spot
        const near = this.agents.some((a) => a.held && !a.moving && 'hold:' + a.held === pr.hideWhen && Math.abs(a.x - pr.x) < 6 && Math.abs(a.y - pr.y) < 8);
        if (near) continue;
      }
      const img = pr.img;
      draws.push({ y: pr.y, draw: (gg) => gg.drawImage(img, pr.x - Math.floor(img.width / 2), pr.y - img.height + 1) });
    }
    for (const a of this.agents) {
      if (a.hidden) continue;
      draws.push({ y: a.y, draw: (gg) => this.drawAgent(gg, a) });
    }
    for (const c of this.cars) {
      const img = P.car(c.color);
      draws.push({ y: c.y, draw: (gg) => {
        if (c.vx < 0) { gg.save(); gg.translate(Math.round(c.x), 0); gg.scale(-1, 1); gg.drawImage(img, -img.width / 2, c.y - img.height); gg.restore(); }
        else gg.drawImage(img, Math.round(c.x - img.width / 2), c.y - img.height);
      } });
    }
    // lamps on sidewalk
    for (let x = 90; x < WORLD_W; x += 200) {
      const img = P.streetLamp();
      draws.push({ y: SIDEWALK_Y - 4, draw: (gg) => gg.drawImage(img, x, SIDEWALK_Y - 4 - img.height) });
    }
    // sign by the entrance
    const hx = plotCx(L, L.hall);
    const sign = P.signBoard(m.sign, m.signColor);
    draws.push({ y: SIDEWALK_Y - 6, draw: (gg) => {
      const sx = hx + 22;
      gg.fillStyle = '#4a4a58'; gg.fillRect(sx + 4, SIDEWALK_Y - 18, 2, 14); gg.fillRect(sx + sign.width - 6, SIDEWALK_Y - 18, 2, 14);
      gg.drawImage(sign, sx, SIDEWALK_Y - 28);
    } });
    // top-row front walls (with door gaps) & building facade
    draws.push({ y: TOP_FLOOR_END + 1, draw: (gg) => this.drawFrontWalls(gg) });
    draws.push({ y: BOT_WALL_Y + 1, draw: (gg) => this.drawGapWalls(gg) });
    draws.push({ y: FRONT_Y + 2, draw: (gg) => this.drawFacade(gg) });

    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.draw(g);

    // bubbles on top
    for (const a of this.agents) {
      if (!a.bubble || a.hidden) continue;
      const img = P.bubble(a.bubble);
      const bob = Math.round(Math.sin(this.time * 4 + a.id) * 1.5);
      g.drawImage(img, Math.round(a.x - img.width / 2), Math.round(a.y - 39 + bob));
    }
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, 1 - p.life / p.max);
      g.drawImage(p.img, Math.round(p.x), Math.round(p.y));
    }
    g.globalAlpha = 1;
    // build-mode ghosts (prefab spots)
    for (const gh of this.ghosts) {
      const r = this.ghostRect(gh);
      const a = 0.18 + (Math.sin(this.time * 4) + 1) * 0.08;
      g.fillStyle = `rgba(110,220,130,${a})`;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = 'rgba(40,140,60,0.95)';
      g.setLineDash([3, 2]);
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      g.setLineDash([]);
    }
    // hover/highlight
    for (const i of this.highlightPlots) this.outlinePlot(g, i, 'rgba(255,214,90,0.95)', true);
    if (this.hoverPlot >= 0) this.outlinePlot(g, this.hoverPlot, 'rgba(255,255,255,0.85)', false);

    // day/night tint
    const h = this.hour;
    if (h >= 16) {
      const t = Math.min(1, (h - 16) / 4);
      g.fillStyle = `rgba(${Math.round(255 - 180 * t)},${Math.round(140 - 60 * t)},${Math.round(60 + 100 * t)},${0.08 + 0.14 * t})`;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    // lit windows effect at night: warm glow inside rooms
    if (h >= 18) {
      g.fillStyle = 'rgba(255,210,120,0.07)';
      for (const pv of m.plots) if (pv.owned || pv.shared) { const a = plotArea(L, pv.index); g.fillRect(a.x, a.y, a.w, a.h); }
    }

    // to screen
    const sg = this.g;
    const cw = this.canvas.width, ch = this.canvas.height;
    sg.fillStyle = '#8cc265';
    sg.fillRect(0, 0, cw, ch);
    const s = this.scale;
    const ww = WORLD_W * s, wh = WORLD_H * s;
    this.ox = Math.round(cw / 2 - this.camX * s + this.panX + this.railX);
    this.oy = Math.round(ch / 2 - this.camY * s + this.panY);
    this.clampPan();
    sg.imageSmoothingEnabled = false;
    sg.drawImage(this.world, 0, 0, WORLD_W, WORLD_H, this.ox, this.oy, ww, wh);

    // floating texts (screen space for crisp font)
    sg.textAlign = 'center';
    const fs = Math.max(12, Math.round(7 * s));
    sg.font = `${fs}px Silkscreen, monospace`;
    for (const f of this.floats) {
      const a = 1 - Math.max(0, f.t - 1.1) / 0.7;
      const sx = this.ox + f.x * s;
      const sy = this.oy + (f.y - f.t * 14) * s;
      sg.globalAlpha = Math.max(0, a);
      sg.fillStyle = 'rgba(42,30,36,0.85)';
      sg.fillText(f.text, sx + s * 0.6, sy + s * 0.6);
      sg.fillStyle = f.color;
      sg.fillText(f.text, sx, sy);
    }
    sg.globalAlpha = 1;
    // ghost labels
    if (this.ghosts.length) {
      const gfs = Math.max(14, Math.round(9 * s));
      sg.font = `${gfs}px Silkscreen, monospace`;
      for (const gh of this.ghosts) {
        const r = this.ghostRect(gh);
        const sx = this.ox + (r.x + r.w / 2) * s;
        const sy = this.oy + (r.y + r.h / 2) * s;
        sg.fillStyle = 'rgba(40,120,60,0.92)';
        sg.beginPath(); sg.arc(sx, sy, gfs * 0.95, 0, Math.PI * 2); sg.fill();
        sg.fillStyle = '#fff';
        sg.fillText('+' + (gh.id + 1), sx, sy + gfs * 0.35);
      }
    }
    // plot labels
    if (this.plotLabels.size) {
      const lfs = Math.max(9, Math.round(4.2 * s));
      sg.font = `${lfs}px Silkscreen, monospace`;
      for (const [i, text] of this.plotLabels) {
        const a = plotArea(L, i);
        const sx = this.ox + (a.x + a.w / 2) * s;
        const sy = this.oy + (a.y + a.h / 2 + 8) * s;
        const tw = sg.measureText(text).width + 16;
        sg.fillStyle = 'rgba(42,30,36,0.78)';
        roundRect(sg, sx - tw / 2, sy - lfs, tw, lfs * 1.8, 6 * this.dpr);
        sg.fill();
        sg.fillStyle = '#ffe9a8';
        sg.fillText(text, sx, sy + lfs * 0.35);
      }
    }
  }

  clampPan() {
    const s = this.scale;
    const maxX = Math.max(80, this.viewW * s * 0.6);
    const maxY = Math.max(60, this.viewH * s * 0.5);
    this.panX = Math.max(-maxX, Math.min(maxX, this.panX));
    this.panY = Math.max(-maxY, Math.min(maxY, this.panY));
  }

  outlinePlot(g: CanvasRenderingContext2D, i: number, color: string, pulse: boolean) {
    const a = plotArea(this.model!.layout, i);
    g.strokeStyle = color;
    g.lineWidth = 1;
    const o = pulse ? Math.round((Math.sin(this.time * 5) + 1) * 1) : 0;
    g.strokeRect(a.x + 2.5 - o, a.y - 3.5 - o, a.w - 5 + o * 2, a.h + 6 + o * 2);
  }

  drawAgent(g: CanvasRenderingContext2D, a: Agent) {
    const frame = a.moving ? [1, 0, 3, 0][Math.floor(a.anim) % 4] : 0;
    const sh = P.shadowBlob(14);
    g.drawImage(sh, Math.round(a.x - 7), Math.round(a.y - 2));
    const img = a.sit ? charSit(a.look) : charSprite(a.look, a.dir, frame);
    const playing = !!a.held && !a.moving;
    const bob = playing ? (Math.sin(this.time * 6 + a.id) > 0.6 ? 1 : 0) : 0;
    g.drawImage(img, Math.round(a.x - 9), Math.round(a.y - 26 + bob));
    if (playing && a.held) {
      const hi = heldSprite(a.held);
      if (hi) g.drawImage(hi, Math.round(a.x - 9), Math.round(a.y - 14 + bob));
    }
  }

  drawFrontWalls(g: CanvasRenderingContext2D) {
    const m = this.model!;
    const L = m.layout;
    const p = new Painter(g);
    const y = TOP_FLOOR_END - 1;
    for (const r of L.rooms.values()) {
      if (r.side !== 'top') continue;
      const pv = m.plots.find((x) => x.index === r.id);
      const x = r.col * CELL, x1 = (r.col + r.w) * CELL;
      const cx = (x + x1) / 2;
      const d = pv?.decor ?? 0;
      const face = d >= 4 ? '#2c3458' : d >= 2 ? '#b47a4a' : d === 1 ? '#d8c8a8' : '#b8a88e';
      const seg = (x0: number, xe: number) => {
        p.rect(x0, y, xe - x0, 3, '#5e4b56');
        p.hl(x0, y, xe - x0, '#7a6670');
        p.rect(x0, y + 3, xe - x0, 4, face);
        p.hl(x0, y + 6, xe - x0, shade(face, -0.25));
        if (d >= 4) p.hl(x0, y + 3, xe - x0, '#e8c25a');
      };
      seg(x - 2, cx - 10);
      seg(cx + 10, x1 + 2);
    }
  }

  /** Corridor south wall where there is no street-side room (garden behind it). */
  drawGapWalls(g: CanvasRenderingContext2D) {
    const L = this.model!.layout;
    const p = new Painter(g);
    const geo = [...L.rooms.values()];
    const cover = (x: number) => geo.some((r) => r.side === 'bottom' && x >= r.col * CELL && x < (r.col + r.w) * CELL);
    for (let x = L.minCol * CELL; x < L.maxCol * CELL; x += CELL) {
      if (cover(x)) continue;
      p.rect(x, BOT_WALL_Y - 4, CELL, 3, '#5e4b56');
      p.hl(x, BOT_WALL_Y - 4, CELL, '#7a6670');
      p.rect(x, BOT_WALL_Y - 1, CELL, 9, '#d8c8a8');
      p.rect(x + 4, BOT_WALL_Y + 1, 8, 4, '#9fd4f2');
      p.hl(x, BOT_WALL_Y + 7, CELL, '#a89878');
    }
  }

  drawFacade(g: CanvasRenderingContext2D) {
    const m = this.model!;
    const L = m.layout;
    const p = new Painter(g);
    const hall = m.plots.find((x) => x.index === L.hall);
    const nice = !!hall && hall.owned && hall.decor >= 1;
    const y = FRONT_Y;
    const modern = (m.building ?? 1) >= 2;
    for (const r of L.rooms.values()) {
      if (r.side !== 'bottom') continue;
      const pv = m.plots.find((x) => x.index === r.id);
      const d = pv?.decor ?? 0;
      const col = modern ? '#3a4a5e' : d >= 4 ? '#2c3458' : d >= 3 ? '#3a2e3e' : d >= 1 ? '#e8dcc4' : '#b5a58c';
      const x0 = r.col * CELL - 2, x1 = (r.col + r.w) * CELL + 2;
      const seg = (a: number, b: number) => {
        p.rect(a, y - 1, b - a, 3, '#5e4b56');
        p.hl(a, y - 1, b - a, '#7a6670');
        p.rect(a, y + 2, b - a, 7, col);
        if (modern || d >= 2) for (let x = a + 3; x < b - 7; x += 12) { p.rect(x, y + 3, 7, 4, '#9fd4f2'); p.px(x + 1, y + 3, '#e8f6ff'); }
        else if (d === 0) for (let x = a; x < b; x += 8) { p.vl(x, y + 2, 7, shade(col, -0.12)); }
        if (d >= 4) p.hl(a, y + 2, b - a, '#e8c25a');
        p.hl(a, y + 8, b - a, shade(col, -0.3));
      };
      if (r.id === L.hall) {
        const hx = plotCx(L, r.id);
        seg(x0, hx - 12);
        seg(hx + 12, x1);
        p.rect(hx - 12, y + 6, 24, 3, nice ? '#c24d6a' : '#8a7a6a');
        p.vl(hx - 12, y - 1, 9, '#5e4b56');
        p.vl(hx + 11, y - 1, 9, '#5e4b56');
      } else seg(x0, x1);
    }
  }

  // ------------------------------------------------------------------ input helpers
  toWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) * this.dpr;
    const sy = (clientY - r.top) * this.dpr;
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  ghostRect(gh: { side: 'top' | 'bottom'; col: number; w: number; h: number }): Rect {
    const y = gh.side === 'top' ? CORR_TOP - gh.h * CELL : BOT_WALL_Y;
    return { x: gh.col * CELL, y, w: gh.w * CELL, h: (gh.side === 'top' ? CORR_TOP : FRONT_Y) - y };
  }

  ghostAt(pt: Pt): number {
    for (const gh of this.ghosts) { const r = this.ghostRect(gh); if (pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h) return gh.id; }
    return -1;
  }

  agentAt(pt: Pt): Agent | null {
    let best: Agent | null = null;
    for (const a of this.agents) {
      if (!a.clickable || a.hidden) continue;
      const pad = TOUCH ? 12 : 3;
      if (pt.x >= a.x - 9 - pad && pt.x <= a.x + 9 + pad && pt.y >= a.y - 40 - pad && pt.y <= a.y + 2 + pad) {
        if (!best || a.y > best.y) best = a;
      }
    }
    return best;
  }

  plotAt(pt: Pt): number {
    const m = this.model;
    if (!m) return -1;
    for (const pv of m.plots) {
      const a = plotArea(m.layout, pv.index);
      if (pt.x >= a.x && pt.x < a.x + a.w && pt.y >= a.y && pt.y < a.y + a.h) return pv.index;
    }
    return -1;
  }

  /** Screen position (CSS px) of a world point – used to anchor DOM tips. */
  toScreen(pt: Pt): Pt {
    return { x: (this.ox + pt.x * this.scale) / this.dpr, y: (this.oy + pt.y * this.scale) / this.dpr };
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const heldCache = new Map<string, HTMLCanvasElement | null>();
function heldSprite(inst: InstrumentId): HTMLCanvasElement | null {
  if (heldCache.has(inst)) return heldCache.get(inst)!;
  let c: HTMLCanvasElement | null = null;
  const col = INSTRUMENTS[inst].color;
  const [cv, g] = makeCanvas(18, 10);
  const p = new Painter(g, 0, 0);
  if (inst === 'violao' || inst === 'guitarra' || inst === 'baixo' || inst === 'ukulele') {
    const small = inst === 'ukulele';
    p.ellipse(5, 5, small ? 3 : 4, small ? 2 : 3, col);
    p.ellipse(5, 5, 1, 1, '#3a2418');
    p.rect(8, 3, small ? 6 : 9, 2, '#5a3826');
    p.rect(small ? 14 : 16, 2, 2, 3, shade(col, -0.3));
    p.hl(2, 2, 3, shade(col, 0.3));
    c = cv;
  } else if (inst === 'violino') {
    p.ellipse(10, 3, 3, 2, col);
    p.rect(3, 2, 5, 1, '#3a2418');
    p.line(4, 8, 15, 0, '#d8c8a0');
    c = cv;
  }
  if (c) {
    // outline
    const [o, og] = makeCanvas(18, 10);
    og.drawImage(c, 0, 0);
    c = o;
  }
  heldCache.set(inst, c);
  return c;
}

export { pixelText, textWidth };
