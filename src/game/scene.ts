// World renderer: static building layer + y-sorted props and agents.
import { makeCanvas, Painter, shade, hash, pixelText, textWidth, mix } from '../art/pixel';
import { charSprite, charSit, Look, Dir } from '../art/characters';
import * as P from '../art/props';
import type { InstrumentId } from '../data/instruments';
import { INSTRUMENT_IDS, INSTRUMENTS } from '../data/instruments';
import type { RoomType } from '../data/content';
import {
  Layout, WORLD_W, WORLD_H, PLOT_W, TOP_WALL_Y, WALL_FACE, TOP_FLOOR_END, BOT_WALL_Y, FRONT_Y,
  SIDEWALK_Y, ROAD_Y, plotFloor, plotWall, plotRow, plotCx, plotArea, Pt, Rect,
} from './layout';

export interface PlotView {
  index: number;
  owned: boolean;
  type: RoomType;
  decor: number;
  equip: Partial<Record<InstrumentId, number>>;
  rentable?: boolean;
  shared?: boolean; // building hall used but not owned
}

export interface SceneModel {
  layout: Layout;
  plots: PlotView[];
  sign: string;
  signColor: string;
  version: number;
}

export type Bubble = 'q' | 'note' | 'excl' | 'zz' | 'heart' | 'coin' | 'sad' | null;

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
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const fit = Math.min(this.canvas.width / WORLD_W, this.canvas.height / (WORLD_H - 40));
    this.scale = Math.max(1, Math.floor(fit * 2) / 2) + this.zoom;
    this.g.imageSmoothingEnabled = false;
  }

  setZoom(delta: number) {
    this.zoom = Math.max(0, Math.min(4, this.zoom + delta));
    this.resize();
  }

  setModel(m: SceneModel, night: boolean) {
    const key = m.version + '|' + night;
    this.model = m;
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

    const bx0 = L.x0;
    const bx1 = L.x0 + L.cols * PLOT_W;
    // building shadow on grass
    g.fillStyle = 'rgba(40,50,30,0.18)';
    g.fillRect(bx1, TOP_WALL_Y, 6, FRONT_Y - TOP_WALL_Y + 8);

    // corridor
    const hallPlot = m.plots[L.hall];
    const ct = hallPlot.owned ? Math.max(1, hallPlot.decor) : 0;
    this.drawFloor(p, { x: bx0, y: TOP_FLOOR_END, w: bx1 - bx0, h: BOT_WALL_Y - TOP_FLOOR_END }, ct, 99, true);

    // plots
    for (const pv of m.plots) this.drawPlotStatic(p, g, pv, night);

    // outer walls: caps
    const cap = '#5e4b56';
    const capL = '#7a6670';
    p.rect(bx0 - 3, TOP_WALL_Y - 5, bx1 - bx0 + 6, 5, cap);
    p.hl(bx0 - 3, TOP_WALL_Y - 5, bx1 - bx0 + 6, capL);
    p.rect(bx0 - 3, TOP_WALL_Y - 5, 4, FRONT_Y - TOP_WALL_Y + 13, cap);
    p.rect(bx1 - 1, TOP_WALL_Y - 5, 4, FRONT_Y - TOP_WALL_Y + 13, cap);
    p.vl(bx0 - 3, TOP_WALL_Y - 5, FRONT_Y - TOP_WALL_Y + 13, capL);
    // interior side walls between plots
    for (let col = 1; col < L.cols; col++) {
      const x = bx0 + col * PLOT_W - 2;
      p.rect(x, TOP_WALL_Y - 4, 4, TOP_FLOOR_END - TOP_WALL_Y + 4, cap);
      p.vl(x, TOP_WALL_Y - 4, TOP_FLOOR_END - TOP_WALL_Y + 4, capL);
      p.rect(x, BOT_WALL_Y - 4, 4, FRONT_Y - BOT_WALL_Y + 4, cap);
      p.vl(x, BOT_WALL_Y - 4, FRONT_Y - BOT_WALL_Y + 4, capL);
    }
    // bottom row back-wall caps (corridor south edge)
    p.rect(bx0, BOT_WALL_Y - 4, bx1 - bx0, 4, cap);
    p.hl(bx0, BOT_WALL_Y - 4, bx1 - bx0, capL);

    // bushes & benches & sidewalk stuff left/right of building
    const sideStuff = (x: number, k: number) => {
      g.drawImage(P.tree(k + 3), x - 15, 120 + (k % 2) * 60);
      g.drawImage(P.bush(k), x - 9, 300);
      g.drawImage(P.bush(k + 1), x - 2, 90 + k * 13);
    };
    if (bx0 > 40) { sideStuff(bx0 / 2, 1); sideStuff(bx0 / 2 - 14, 4); }
    if (WORLD_W - bx1 > 40) { sideStuff(bx1 + (WORLD_W - bx1) / 2, 2); sideStuff(bx1 + (WORLD_W - bx1) / 2 + 12, 5); }
    for (let x = 6; x < WORLD_W; x += 160) g.drawImage(P.bench(), x, sw + 2);

    this.staticLayer = c;
    this.buildProps(night);
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
      const rc = tier === 3 ? '#8a3a4a' : '#5a7ab0';
      const rw = 56, rh = 26;
      const rx = cx - rw / 2, ry = f.y + f.h - rh - 8;
      p.rect(rx, ry, rw, rh, rc);
      p.rect(rx + 2, ry + 2, rw - 4, rh - 4, shade(rc, 0.2));
      p.rect(rx + 4, ry + 4, rw - 8, rh - 8, rc);
      for (let i = rx + 6; i < rx + rw - 6; i += 6) p.px(i, ry + rh / 2, shade(rc, 0.35));
      for (let i = rx; i < rx + rw; i += 2) { p.px(i, ry - 1, '#efe4cf'); p.px(i, ry + rh, '#efe4cf'); }
    }
    // wall decor
    const wd = (img: HTMLCanvasElement, x: number, yy: number) => g.drawImage(img, Math.round(x), Math.round(yy));
    const wy = w.y;
    if (!usable) {
      wd(P.signBoard('ALUGA-SE', '#c2412e'), cx - 22, wy + 8);
      g.drawImage(P.boxes(pv.index), f.x + 10, f.y + f.h - 26);
      g.drawImage(P.boxes(pv.index + 1), f.x + f.w - 34, f.y + 10);
      // dim
      g.fillStyle = 'rgba(40,28,44,0.38)';
      g.fillRect(w.x + 2, w.y, w.w - 4, f.y + f.h - w.y);
      if (pv.rentable) {
        g.fillStyle = 'rgba(255,230,140,0.10)';
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
    if (tier === 0) {
      wd(P.poster(pv.index), left + 8, wy + 8);
    } else if (tier === 1) {
      wd(P.poster(pv.index), left + 6, wy + 8);
      wd(P.wallClock(), right - 18, wy + 6);
      if (!isBottom) wd(P.windowSprite(night), cx - 11, wy + 7);
    } else if (tier === 2) {
      wd(P.windowSprite(night), left + 2, wy + 6);
      if (pv.type === 'classroom') wd(P.whiteboard(), isBottom ? right - 32 : cx - 15, wy + 7);
      else wd(P.poster(pv.index + 1), cx + (isBottom ? 18 : -6), wy + 7);
      if (!isBottom) wd(P.poster(pv.index + 3), right - 14, wy + 7);
      else wd(P.wallClock(), cx + 14, wy + 4);
    } else {
      wd(P.acousticPanel('#5a3e5a'), left, wy + 6);
      wd(P.acousticPanel('#5a3e5a'), left + 12, wy + 6);
      wd(P.sconce(), left + 26, wy + 8);
      wd(P.vinylFrame(pv.index), isBottom ? cx + 14 : cx - 7, wy + 8);
      wd(P.guitarWall('#d0473f'), isBottom ? cx + 30 : cx + 12, wy + 7);
      wd(P.sconce(), right - 30, wy + 8);
      wd(P.acousticPanel('#5a3e5a'), right - 22, wy + 6);
      wd(P.acousticPanel('#5a3e5a'), right - 10, wy + 6);
    }
    if (pv.type === 'reception') {
      wd(P.trophyShelf(), left + 30, wy + 12);
    }
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
          if (tier === 0) add(P.boxes(pv.index + 2), fx + fw - 14, fy + fh - 2);
          if (tier >= 1) add(P.plant(tier >= 3 ? 2 : tier >= 2 ? 1 : 0), fx + 8, fy + fh - 2);
          if (tier >= 1) add(P.chair('#c47a4a'), fx + fw - 10, fy + fh - 6);
          if (tier >= 2) add(P.musicStand(), cx - 30, fy + fh - 18);
          if (tier >= 3) add(P.floorLamp(), fx + fw - 6, fy + 26);
          break;
        }
        case 'hall':
        case 'reception': {
          const rec = pv.type === 'reception';
          if (rec) {
            add(P.counter(tier, 50), fx + fw - 30, fy + 34);
            sp.staff.push({ x: fx + fw - 40, y: fy + 20 }, { x: fx + fw - 22, y: fy + 20 }, { x: fx + fw - 50, y: fy + 18 });
            add(P.sofa(tier >= 2 ? '#3fb7b0' : '#8a7ab0'), fx + 24, fy + fh - 2);
            sp.wait.push({ x: fx + 14, y: fy + fh - 12 }, { x: fx + 26, y: fy + fh - 12 }, { x: fx + 38, y: fy + fh - 12 }, { x: fx + fw - 44, y: fy + 48 }, { x: fx + fw - 30, y: fy + 50 }, { x: fx + fw - 16, y: fy + 48 });
            add(P.waterCooler(), fx + 8, fy + 28);
            if (tier >= 1) add(P.plant(tier >= 2 ? 1 : 0), fx + fw - 6, fy + fh - 2);
            if (tier >= 2) add(P.coffeeTable(), fx + 30, fy + fh - 18 + 12);
            if (tier >= 3) add(P.plant(2), fx + 50, fy + 26);
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
        case 'rehearsal': {
          const t = Math.min(2, Math.max(0, tier - 1));
          add(P.drumKit(t), cx - 26, fy + 30);
          add(P.amp(t), fx + 14, fy + 26);
          add(P.amp(t, '#5a4a3a'), fx + fw - 14, fy + 26);
          add(P.micStand(t), cx + 16, fy + 40);
          add(P.keyboard(Math.min(1, t)), fx + fw - 24, fy + 50);
          add(P.stringOnStand('guitarra', t), fx + 10, fy + 56);
          sp.band.push({ x: cx - 26, y: fy + 22 }, { x: cx + 16, y: fy + 36 }, { x: fx + 30, y: fy + 46 }, { x: fx + fw - 24, y: fy + 44 });
          break;
        }
        case 'lounge': {
          add(P.cafeCounter(), fx + 26, fy + 28);
          sp.staff.push({ x: fx + 24, y: fy + 14 });
          add(P.cafeTable(), fx + 70, fy + 40);
          add(P.chair('#f08a3e'), fx + 60, fy + 42);
          add(P.chair('#f08a3e'), fx + 82, fy + 42);
          add(P.sofa('#e8a64a'), fx + fw - 26, fy + fh - 4);
          add(P.plant(1), fx + fw - 8, fy + 30);
          sp.wait.push({ x: fx + 60, y: fy + 36 }, { x: fx + 82, y: fy + 36 }, { x: fx + fw - 34, y: fy + fh - 12 }, { x: fx + fw - 20, y: fy + fh - 12 });
          break;
        }
        case 'auditorium': {
          add(P.stage(fw - 20), cx, fy + 26);
          add(P.keyboard(2), cx - 24, fy + 14);
          add(P.micStand(1), cx + 18, fy + 18);
          add(P.speaker(), fx + 14, fy + 18);
          add(P.speaker(), fx + fw - 14, fy + 18);
          sp.stage.push({ x: cx - 24, y: fy + 4 }, { x: cx + 18, y: fy + 10 }, { x: cx, y: fy + 12 }, { x: cx - 8, y: fy + 8 });
          for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
            if (k === 3) continue; // aisle
            const x = fx + 14 + k * 16;
            const y = fy + 42 + r * 12;
            add(P.audienceChair(tier >= 2 ? '#c24d6a' : '#8a6a5a'), x, y);
            sp.audience.push({ x, y: y - 4 });
          }
          break;
        }
        case 'studio': {
          add(P.mixingDesk(), fx + 30, fy + 30);
          add(P.speaker(), fx + 10, fy + 20);
          add(P.speaker(), fx + 50, fy + 20);
          add(P.micStand(2), fx + fw - 24, fy + 34);
          add(P.sofa('#4f8fd8'), fx + 30, fy + fh - 2);
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
    const bx0 = L.x0, bx1 = L.x0 + L.cols * PLOT_W;
    draws.push({ y: TOP_FLOOR_END + 1, draw: (gg) => this.drawFrontWalls(gg) });
    draws.push({ y: FRONT_Y + 2, draw: (gg) => this.drawFacade(gg, bx0, bx1) });

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
    this.ox = Math.round((cw - ww) / 2 + this.panX);
    this.oy = Math.round((ch - wh) / 2 + this.panY + 6 * this.dpr);
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
    const maxX = Math.max(0, (WORLD_W * s - this.canvas.width) / 2 + 40);
    const maxY = Math.max(0, (WORLD_H * s - this.canvas.height) / 2 + 80);
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
    const L = this.model!.layout;
    const p = new Painter(g);
    for (let c = 0; c < L.cols; c++) {
      const x = L.x0 + c * PLOT_W;
      const cx = x + PLOT_W / 2;
      const y = TOP_FLOOR_END - 1;
      const pv = this.model!.plots[c];
      const face = pv.owned && pv.decor >= 2 ? '#b47a4a' : pv.owned && pv.decor === 1 ? '#d8c8a8' : '#b8a88e';
      const seg = (x0: number, x1: number) => {
        p.rect(x0, y, x1 - x0, 3, '#5e4b56');
        p.hl(x0, y, x1 - x0, '#7a6670');
        p.rect(x0, y + 3, x1 - x0, 4, face);
        p.hl(x0, y + 6, x1 - x0, shade(face, -0.25));
      };
      seg(x - (c === 0 ? 3 : 2), cx - 10);
      seg(cx + 10, x + PLOT_W + (c === L.cols - 1 ? 3 : 2));
    }
  }

  drawFacade(g: CanvasRenderingContext2D, bx0: number, bx1: number) {
    const L = this.model!.layout;
    const p = new Painter(g);
    const hall = this.model!.plots[L.hall];
    const nice = hall.owned && hall.decor >= 1;
    const y = FRONT_Y;
    const hx = plotCx(L, L.hall);
    const col = nice ? (hall.decor >= 3 ? '#3a2e3e' : '#e8dcc4') : '#b5a58c';
    const seg = (x0: number, x1: number) => {
      p.rect(x0, y - 1, x1 - x0, 3, '#5e4b56');
      p.hl(x0, y - 1, x1 - x0, '#7a6670');
      p.rect(x0, y + 2, x1 - x0, 7, col);
      if (!nice) for (let x = x0; x < x1; x += 8) { p.vl(x, y + 2, 7, shade(col, -0.12)); p.hl(x0, y + 5, x1 - x0, shade(col, -0.1)); }
      p.hl(x0, y + 8, x1 - x0, shade(col, -0.3));
    };
    seg(bx0 - 3, hx - 12);
    seg(hx + 12, bx1 + 3);
    // door mat / glass door frame
    p.rect(hx - 12, y + 6, 24, 3, nice ? '#c24d6a' : '#8a7a6a');
    p.vl(hx - 12, y - 1, 9, '#5e4b56');
    p.vl(hx + 11, y - 1, 9, '#5e4b56');
  }

  // ------------------------------------------------------------------ input helpers
  toWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) * this.dpr;
    const sy = (clientY - r.top) * this.dpr;
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  agentAt(pt: Pt): Agent | null {
    let best: Agent | null = null;
    for (const a of this.agents) {
      if (!a.clickable || a.hidden) continue;
      if (pt.x >= a.x - 9 && pt.x <= a.x + 9 && pt.y >= a.y - 40 && pt.y <= a.y + 2) {
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
