// World geometry: a corridor that grows sideways with prefab rooms of different
// sizes attached above it (back side) or below it (street side).
export const CELL = 16;
export let WORLD_W = 1280;
export function setWorldWidth(w: number) { WORLD_W = w; }
export const WORLD_H = 472;
export const WALL_FACE = 32;
export const CORR_TOP = 208; // corridor floor starts here (= south wall of back rooms)
export const CORR_H = 48;
export const CORRIDOR_Y = CORR_TOP + 26; // walking line
export const BOT_WALL_Y = CORR_TOP + CORR_H; // 256 – street-side rooms' back wall face
export const BOT_FLOOR_Y = BOT_WALL_Y + WALL_FACE; // 288
export const FRONT_Y = 368; // facade
export const BOT_FLOOR_END = FRONT_Y;
export const SIDEWALK_Y = FRONT_Y + 24;
export const ROAD_Y = FRONT_Y + 42;
export const TOP_FLOOR_END = CORR_TOP;
export const MAX_TOP_H = 11; // cells

export type Side = 'top' | 'bottom';
export interface RoomGeo { id: number; side: Side; col: number; w: number; h: number }

export interface Layout {
  rooms: Map<number, RoomGeo>;
  hall: number; // entrance room id
  minCol: number;
  maxCol: number;
}

export function makeLayout(rooms: RoomGeo[], hall: number): Layout {
  const m = new Map<number, RoomGeo>();
  let minCol = 1e9, maxCol = -1e9;
  for (const r of rooms) { m.set(r.id, r); minCol = Math.min(minCol, r.col); maxCol = Math.max(maxCol, r.col + r.w); }
  if (!rooms.length) { minCol = 36; maxCol = 44; }
  return { rooms: m, hall, minCol, maxCol };
}

export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number };

const geo = (L: Layout, i: number) => L.rooms.get(i)!;
export function roomTopY(r: { side: Side; h: number }) { return r.side === 'top' ? CORR_TOP - r.h * CELL : BOT_WALL_Y; }

export function plotRow(L: Layout, i: number) { return geo(L, i).side === 'top' ? 0 : 1; }
export function plotCx(L: Layout, i: number) { const r = geo(L, i); return (r.col + r.w / 2) * CELL; }

export function plotFloor(L: Layout, i: number): Rect {
  const r = geo(L, i);
  const x = r.col * CELL + 3;
  const w = r.w * CELL - 6;
  if (r.side === 'top') { const y = roomTopY(r) + WALL_FACE; return { x, y, w, h: CORR_TOP - y }; }
  return { x, y: BOT_FLOOR_Y, w, h: FRONT_Y - BOT_FLOOR_Y };
}
export function plotWall(L: Layout, i: number): Rect {
  const r = geo(L, i);
  return { x: r.col * CELL, y: roomTopY(r), w: r.w * CELL, h: WALL_FACE };
}
export function plotArea(L: Layout, i: number): Rect {
  const r = geo(L, i);
  const y = roomTopY(r);
  return { x: r.col * CELL, y, w: r.w * CELL, h: (r.side === 'top' ? CORR_TOP : FRONT_Y) - y };
}

function enter(L: Layout, i: number): Pt[] {
  const cx = plotCx(L, i);
  if (plotRow(L, i) === 0) return [{ x: cx, y: CORRIDOR_Y }, { x: cx, y: CORR_TOP - 6 }];
  return [{ x: cx, y: CORRIDOR_Y }, { x: cx, y: BOT_WALL_Y + 24 }, { x: cx, y: BOT_FLOOR_Y + 8 }];
}
function exit(L: Layout, i: number): Pt[] { return enter(L, i).reverse(); }

/** Where people appear/disappear on the sidewalk: a bit beyond the school, not the world edge. */
export function streetEnd(L: Layout, left: boolean) {
  const hx = plotCx(L, L.hall);
  return left ? Math.max(-12, Math.min(L.minCol * CELL - 90, hx - 260)) : Math.min(WORLD_W + 12, Math.max(L.maxCol * CELL + 90, hx + 260));
}

/** Path from the street to a point inside room i. */
export function pathTo(L: Layout, i: number, target: Pt, fromLeft = Math.random() < 0.5): Pt[] {
  const hx = plotCx(L, L.hall);
  const pts: Pt[] = [{ x: streetEnd(L, fromLeft), y: SIDEWALK_Y + (Math.random() * 6 - 3) }, { x: hx + (Math.random() * 6 - 3), y: SIDEWALK_Y }, { x: hx, y: FRONT_Y - 14 }];
  if (i === L.hall) { pts.push(target); return pts; }
  pts.push(...exit(L, L.hall).filter((p) => p.y < FRONT_Y - 14));
  pts.push(...enter(L, i), target);
  return pts;
}

export function pathBetween(L: Layout, a: number, from: Pt, b: number, target: Pt): Pt[] {
  if (a === b || !L.rooms.has(a)) return [target];
  return [...exit(L, a), ...enter(L, b), target];
}

export function pathToStreet(L: Layout, i: number, from: Pt): Pt[] {
  const hx = plotCx(L, L.hall);
  const pts: Pt[] = [];
  if (L.rooms.has(i) && i !== L.hall) pts.push(...exit(L, i), ...enter(L, L.hall));
  pts.push({ x: hx, y: FRONT_Y - 14 }, { x: hx, y: SIDEWALK_Y });
  pts.push({ x: streetEnd(L, Math.random() < 0.5), y: SIDEWALK_Y + (Math.random() * 6 - 3) });
  return pts;
}

/** Rooms on the same side whose walls touch (they share a wall). */
export function wallNeighbors(L: Layout, i: number): number[] {
  const r = geo(L, i);
  const out: number[] = [];
  for (const o of L.rooms.values()) if (o.id !== i && o.side === r.side && (o.col + o.w === r.col || r.col + r.w === o.col)) out.push(o.id);
  return out;
}
