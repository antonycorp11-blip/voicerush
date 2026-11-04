// Pixel-art toolkit: canvases, colour helpers, painter and auto-outline.

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** amt > 0 lightens, amt < 0 darkens (range -1..1). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  const k = 1 + amt;
  // darken towards a warm purple-brown instead of pure black (nicer pixel art)
  return rgbToHex(r * k + 40 * -amt * 0.35, g * k + 20 * -amt * 0.35, b * k + 45 * -amt * 0.35);
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

export class Painter {
  constructor(public g: Ctx, public ox = 0, public oy = 0) {}
  px(x: number, y: number, c: string) {
    this.g.fillStyle = c;
    this.g.fillRect(x + this.ox, y + this.oy, 1, 1);
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = c;
    this.g.fillRect(x + this.ox, y + this.oy, w, h);
  }
  hl(x: number, y: number, w: number, c: string) {
    this.rect(x, y, w, 1, c);
  }
  vl(x: number, y: number, h: number, c: string) {
    this.rect(x, y, 1, h, c);
  }
  /** Rect with light top/left edge and dark bottom/right edge. */
  box(x: number, y: number, w: number, h: number, c: string, lt = 0.18, dk = -0.25) {
    this.rect(x, y, w, h, c);
    this.hl(x, y, w, shade(c, lt));
    this.vl(x, y, h, shade(c, lt * 0.6));
    this.hl(x, y + h - 1, w, shade(c, dk));
    this.vl(x + w - 1, y, h, shade(c, dk * 0.7));
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = -ry; y <= ry; y++) {
      const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001))));
      this.rect(Math.round(cx - span), Math.round(cy + y), span * 2 + 1, 1, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: string) {
    this.ellipse(cx, cy, r, r, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 500; i++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Dither fill (checker) – used for soft shading. */
  dither(x: number, y: number, w: number, h: number, c: string, phase = 0) {
    this.g.fillStyle = c;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) if ((i + j + phase) % 2 === 0) this.g.fillRect(x + i + this.ox, y + j + this.oy, 1, 1);
  }
}

export const OUTLINE = '#2a1e24';

/**
 * Adds a 1px outline around every opaque region. The outline colour is the
 * neighbour colour heavily darkened and pulled toward OUTLINE, which gives the
 * soft "selective outline" look of modern pixel art.
 */
export function outline(c: HTMLCanvasElement, strength = 0.72) {
  const g = c.getContext('2d')!;
  const { width: w, height: h } = c;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const [or, og, ob] = hexToRgb(OUTLINE);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 40) continue;
      let nx = -1, ny = -1;
      if (a(x, y + 1) > 120) { nx = x; ny = y + 1; }
      else if (a(x, y - 1) > 120) { nx = x; ny = y - 1; }
      else if (a(x - 1, y) > 120) { nx = x - 1; ny = y; }
      else if (a(x + 1, y) > 120) { nx = x + 1; ny = y; }
      if (nx < 0) continue;
      const j = (ny * w + nx) * 4;
      out[i] = d[j] * (1 - strength) * 0.5 + or * strength;
      out[i + 1] = d[j + 1] * (1 - strength) * 0.5 + og * strength;
      out[i + 2] = d[j + 2] * (1 - strength) * 0.5 + ob * strength;
      out[i + 3] = 255;
    }
  }
  img.data.set(out);
  g.putImageData(img, 0, 0);
}

/** Create a sprite: draws into a padded canvas then outlines it. */
export function sprite(w: number, h: number, draw: (p: Painter) => void, doOutline = true): HTMLCanvasElement {
  const [c, g] = makeCanvas(w + 2, h + 2);
  draw(new Painter(g, 1, 1));
  if (doOutline) outline(c);
  return c;
}

export function flipH(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Tiny 3x5 pixel font (uppercase, digits, a few symbols) for in-world signs.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', '!': '010010010000010',
  '♪': '011010010110110', '&': '010101010101011', "'": '010010000000000', ':': '000010000010000',
};
const ACCENTS: Record<string, string> = { Á: 'A', À: 'A', Ã: 'A', Â: 'A', É: 'E', Ê: 'E', Í: 'I', Ó: 'O', Õ: 'O', Ô: 'O', Ú: 'U', Ç: 'C' };

export function textWidth(s: string): number {
  return s.length * 4 - 1;
}

export function pixelText(p: Painter, s: string, x: number, y: number, c: string) {
  s = s.toUpperCase();
  for (let k = 0; k < s.length; k++) {
    const ch = ACCENTS[s[k]] ?? s[k];
    const glyph = FONT[ch] ?? FONT[' '];
    for (let i = 0; i < 15; i++) if (glyph[i] === '1') p.px(x + k * 4 + (i % 3), y + Math.floor(i / 3), c);
  }
}

/** Deterministic pseudo random (for textures). */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}
