// World geometry (tilted top-down, 3/4 view).
export const WORLD_W = 640;
export const WORLD_H = 400;
export const PLOT_W = 128;
export const TOP_WALL_Y = 44; // top of back-wall face (top row)
export const WALL_FACE = 32;
export const TOP_FLOOR_Y = TOP_WALL_Y + WALL_FACE; // 76
export const TOP_FLOOR_END = 152;
export const CORRIDOR_Y = 178; // walking line
export const BOT_WALL_Y = 200; // top of back wall face (bottom row)
export const BOT_FLOOR_Y = BOT_WALL_Y + WALL_FACE; // 232
export const BOT_FLOOR_END = 304;
export const FRONT_Y = 304;
export const SIDEWALK_Y = 326;
export const ROAD_Y = 344;

export interface Layout {
  cols: number;
  x0: number;
  hall: number; // plot index of entrance hall
}

export function makeLayout(cols: number): Layout {
  return { cols, x0: Math.round((WORLD_W - cols * PLOT_W) / 2), hall: cols };
}

export function plotRow(L: Layout, i: number) {
  return i < L.cols ? 0 : 1;
}
export function plotCol(L: Layout, i: number) {
  return i % L.cols;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Floor rectangle of a plot (walkable interior). */
export function plotFloor(L: Layout, i: number): Rect {
  const c = plotCol(L, i);
  const x = L.x0 + c * PLOT_W + 3;
  if (plotRow(L, i) === 0) return { x, y: TOP_FLOOR_Y, w: PLOT_W - 6, h: TOP_FLOOR_END - TOP_FLOOR_Y };
  return { x, y: BOT_FLOOR_Y, w: PLOT_W - 6, h: BOT_FLOOR_END - BOT_FLOOR_Y };
}

/** Back wall face rectangle of a plot. */
export function plotWall(L: Layout, i: number): Rect {
  const c = plotCol(L, i);
  const x = L.x0 + c * PLOT_W;
  const y = plotRow(L, i) === 0 ? TOP_WALL_Y : BOT_WALL_Y;
  return { x, y, w: PLOT_W, h: WALL_FACE };
}

/** Whole clickable area of a plot. */
export function plotArea(L: Layout, i: number): Rect {
  const w = plotWall(L, i);
  const f = plotFloor(L, i);
  return { x: w.x, y: w.y, w: PLOT_W, h: f.y + f.h - w.y };
}

export function plotCx(L: Layout, i: number) {
  return L.x0 + plotCol(L, i) * PLOT_W + PLOT_W / 2;
}

export type Pt = { x: number; y: number };

/** Path from the street to a point inside plot i. */
export function pathTo(L: Layout, i: number, target: Pt, fromLeft = Math.random() < 0.5): Pt[] {
  const hx = plotCx(L, L.hall);
  const pts: Pt[] = [];
  const startX = fromLeft ? -12 : WORLD_W + 12;
  pts.push({ x: startX, y: SIDEWALK_Y + (Math.random() * 6 - 3) });
  pts.push({ x: hx + (Math.random() * 6 - 3), y: SIDEWALK_Y });
  pts.push({ x: hx, y: 290 });
  if (i === L.hall) {
    pts.push(target);
    return pts;
  }
  pts.push({ x: hx, y: BOT_FLOOR_Y + 8 });
  pts.push({ x: hx, y: CORRIDOR_Y });
  const cx = plotCx(L, i);
  pts.push({ x: cx, y: CORRIDOR_Y + (Math.random() * 6 - 3) });
  if (plotRow(L, i) === 0) {
    pts.push({ x: cx, y: TOP_FLOOR_END - 6 });
  } else {
    pts.push({ x: cx, y: BOT_WALL_Y + 24 });
    pts.push({ x: cx, y: BOT_FLOOR_Y + 8 });
  }
  pts.push(target);
  return pts;
}

/** Path from inside plot a to plot b (via corridor). */
export function pathBetween(L: Layout, a: number, from: Pt, b: number, target: Pt): Pt[] {
  if (a === b) return [target];
  const pts: Pt[] = [];
  const exitPlot = (i: number) => {
    const cx = plotCx(L, i);
    if (i === L.hall) return [{ x: cx, y: BOT_FLOOR_Y + 8 }, { x: cx, y: BOT_WALL_Y + 24 }, { x: cx, y: CORRIDOR_Y }];
    if (plotRow(L, i) === 0) return [{ x: cx, y: TOP_FLOOR_END - 6 }, { x: cx, y: CORRIDOR_Y }];
    return [{ x: cx, y: BOT_FLOOR_Y + 8 }, { x: cx, y: BOT_WALL_Y + 24 }, { x: cx, y: CORRIDOR_Y }];
  };
  const enter = (i: number) => exitPlot(i).reverse();
  pts.push(...exitPlot(a));
  pts.push(...enter(b));
  pts.push(target);
  return pts;
}

export function pathToStreet(L: Layout, i: number, from: Pt): Pt[] {
  const hx = plotCx(L, L.hall);
  const pts: Pt[] = [];
  if (i !== L.hall) {
    const cx = plotCx(L, i);
    if (plotRow(L, i) === 0) pts.push({ x: cx, y: TOP_FLOOR_END - 6 }, { x: cx, y: CORRIDOR_Y });
    else pts.push({ x: cx, y: BOT_FLOOR_Y + 8 }, { x: cx, y: BOT_WALL_Y + 24 }, { x: cx, y: CORRIDOR_Y });
    pts.push({ x: hx, y: CORRIDOR_Y }, { x: hx, y: BOT_FLOOR_Y + 8 });
  }
  pts.push({ x: hx, y: 290 }, { x: hx, y: SIDEWALK_Y });
  pts.push({ x: Math.random() < 0.5 ? -14 : WORLD_W + 14, y: SIDEWALK_Y + (Math.random() * 6 - 3) });
  return pts;
}
