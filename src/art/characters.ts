// Procedural chibi characters (16x24 + outline) in 4 directions with walk frames.
import { Painter, makeCanvas, outline, shade, mix, flipH, OUTLINE } from './pixel';

export interface Look {
  skin: string;
  hair: string;
  hairStyle: number; // 0..6
  shirt: string;
  pants: string;
  shoes: string;
  extra: 'none' | 'glasses' | 'beard' | 'cap' | 'headphones';
  accent: string;
}

export type Dir = 'down' | 'up' | 'left' | 'right';

export const SKINS = ['#f7d6b8', '#efbf98', '#dca277', '#b97d52', '#8d5a3a', '#663f29'];
export const HAIRS = ['#2e2420', '#4b3226', '#7a4e2e', '#a8713f', '#e2b866', '#b5472c', '#9a96a0', '#3a3355', '#f0e4c8'];
export const SHIRTS = ['#e8604c', '#4f8fd8', '#58b06c', '#f2c14e', '#9b6bd1', '#ef8fb1', '#3fb7b0', '#f08a3e', '#e9e4da', '#55606e', '#c24d6a', '#7fa8e6'];
export const PANTS = ['#3d4a6b', '#2f3440', '#6b5a48', '#4a6b5a', '#8a6f52', '#3a2e3e', '#5b6f9a'];

export function randomLook(rnd: () => number = Math.random): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const r = rnd();
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS.slice(0, 8)),
    hairStyle: Math.floor(rnd() * 7),
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    shoes: pick(['#3a2a24', '#2a2a33', '#e8e2d6', '#8a3a2a']),
    extra: r < 0.12 ? 'glasses' : r < 0.2 ? 'beard' : r < 0.27 ? 'cap' : r < 0.32 ? 'headphones' : 'none',
    accent: pick(SHIRTS),
  };
}

const EYE = '#2a1e24';

function headRows(): [number, number][] {
  // [x0, x1] inclusive per row y=1..11
  return [
    [5, 10], [3, 12], [2, 13], [2, 13], [2, 13], [2, 13], [2, 13], [2, 13], [2, 13], [3, 12], [4, 11],
  ];
}

function drawHead(p: Painter, L: Look, dir: Dir, by: number) {
  const skin = L.skin;
  const skinD = shade(skin, -0.14);
  const hair = L.hair;
  const hairL = shade(hair, 0.22);
  const hairD = shade(hair, -0.25);
  const rows = headRows();
  const side = dir === 'left' || dir === 'right';
  // skull
  rows.forEach(([a, b], i) => {
    const y = by + 1 + i;
    if (side) p.rect(a + 1, y, b - a - 1, 1, skin);
    else p.rect(a, y, b - a + 1, 1, skin);
  });
  // jaw shadow
  if (!side) p.rect(4, by + 11, 8, 1, skinD);

  const H = (x: number, y: number, w: number, h = 1, c = hair) => p.rect(x, by + y, w, h, c);
  const st = L.hairStyle;

  if (dir === 'up') {
    // back of head – mostly hair
    rows.forEach(([a, b], i) => { if (i < 10) p.rect(a, by + 1 + i, b - a + 1, 1, hair); });
    H(5, 1, 6, 1, hairL);
    H(4, 2, 3, 1, hairL);
    if (st === 2 || st === 6) { H(2, 10, 12, 4); H(3, 14, 10, 1, hairD); }
    if (st === 3) { p.circle(8, by + 2, 2, hair); p.px(7, by + 1, hairL); }
    if (st === 4) { H(1, 2, 14, 7); H(2, 1, 12, 1); H(1, 9, 14, 1, hairD); }
    p.px(2, by + 7, skin); p.px(13, by + 7, skin);
  } else if (dir === 'down') {
    // top hair
    H(5, 1, 6); H(3, 2, 10); H(2, 3, 12); H(2, 4, 12);
    H(5, 1, 4, 1, hairL); H(4, 2, 4, 1, hairL);
    switch (st) {
      case 0: H(2, 5, 2); H(12, 5, 2); H(4, 5, 4); H(2, 6, 1); H(13, 6, 1); break; // short with fringe
      case 1: p.px(4, by, hair); p.px(7, by, hair); p.px(10, by, hair); H(2, 5, 3); H(6, 5, 2); H(11, 5, 3); p.px(9, by + 5, hair); break;
      case 2: H(2, 5, 3); H(11, 5, 3); H(6, 5, 3); H(1, 5, 2, 9); H(13, 5, 2, 9); H(1, 13, 2, 1, hairD); H(13, 13, 2, 1, hairD); break; // long
      case 3: p.circle(8, by + 0, 2, hair); p.px(7, by - 1, hairL); H(2, 5, 2); H(12, 5, 2); H(3, 5, 9, 1); break; // bun
      case 4: H(1, 1, 14, 5); H(3, 0, 10, 1); H(1, 6, 2, 3); H(13, 6, 2, 3); H(2, 0, 1, 1, hairL); H(4, 1, 3, 1, hairL); break; // curly
      case 5: H(2, 4, 12, 1, hairD); break; // buzz (only top)
      case 6: H(2, 5, 12, 1); H(2, 6, 2, 5); H(12, 6, 2, 5); H(5, 6, 1); break; // bob
    }
    // eyes
    p.rect(5, by + 7, 1, 2, EYE);
    p.rect(10, by + 7, 1, 2, EYE);
    p.px(5, by + 7, '#5a4a5a');
    p.px(10, by + 7, '#5a4a5a');
    // blush + mouth
    p.px(4, by + 9, mix(skin, '#ff7a7a', 0.38));
    p.px(11, by + 9, mix(skin, '#ff7a7a', 0.38));
    p.rect(7, by + 10, 2, 1, shade(skin, -0.3));
  } else {
    // side (drawn facing right, flipped for left)
    H(4, 1, 6); H(3, 2, 9); H(3, 3, 10); H(3, 4, 10); H(3, 5, 5); H(3, 6, 4); H(3, 7, 3); H(3, 8, 3);
    H(5, 1, 4, 1, hairL);
    p.rect(10, by + 5, 3, 1, hair);
    if (st === 2 || st === 6) { H(2, 6, 3, 7); H(2, 13, 3, 1, hairD); }
    if (st === 3) { p.circle(4, by + 2, 2, hair); }
    if (st === 4) { H(2, 1, 11, 6); H(2, 7, 4, 3); H(3, 0, 8, 1); }
    if (st === 1) { p.px(5, by, hair); p.px(9, by, hair); }
    // ear
    p.px(7, by + 7, skinD);
    p.rect(11, by + 7, 1, 2, EYE);
    p.px(11, by + 9, mix(skin, '#ff7a7a', 0.38));
    p.px(13, by + 6, skin); // nose
  }

  // extras
  if (L.extra === 'glasses' && dir !== 'up') {
    const fc = '#2e2a36';
    if (dir === 'down') { p.rect(4, by + 6, 3, 1, fc); p.rect(9, by + 6, 3, 1, fc); p.rect(4, by + 8, 3, 1, fc); p.rect(9, by + 8, 3, 1, fc); p.px(4, by + 7, fc); p.px(6, by + 7, fc); p.px(9, by + 7, fc); p.px(11, by + 7, fc); p.rect(7, by + 7, 2, 1, fc); }
    else { p.rect(10, by + 6, 3, 1, fc); p.rect(10, by + 8, 3, 1, fc); p.px(12, by + 7, fc); p.rect(7, by + 7, 3, 1, fc); }
  }
  if (L.extra === 'beard' && dir !== 'up') {
    if (dir === 'down') { p.rect(3, by + 9, 10, 2, hair); p.rect(4, by + 11, 8, 1, hair); p.rect(6, by + 10, 4, 1, shade(skin, -0.3)); p.rect(7, by + 9, 2, 1, skin); }
    else { p.rect(8, by + 9, 5, 2, hair); p.rect(8, by + 11, 4, 1, hair); }
  }
  if (L.extra === 'cap') {
    const c = L.accent;
    if (dir === 'down') { p.rect(3, by + 1, 10, 4, c); p.rect(5, by + 0, 6, 1, c); p.rect(3, by + 1, 10, 1, shade(c, 0.25)); p.rect(2, by + 5, 12, 1, shade(c, -0.25)); }
    else if (dir === 'up') { p.rect(3, by + 1, 10, 4, c); p.rect(5, by + 0, 6, 1, c); p.rect(6, by + 5, 4, 1, shade(c, -0.25)); }
    else { p.rect(4, by + 1, 8, 4, c); p.rect(5, by + 0, 6, 1, c); p.rect(10, by + 5, 5, 1, shade(c, -0.25)); }
  }
  if (L.extra === 'headphones') {
    const c = L.accent;
    if (dir === 'down' || dir === 'up') { p.rect(3, by + 0, 10, 1, '#3a3440'); p.rect(1, by + 5, 2, 4, c); p.rect(13, by + 5, 2, 4, c); }
    else { p.rect(4, by + 0, 7, 1, '#3a3440'); p.rect(6, by + 5, 3, 4, c); }
  }
}

function drawBody(p: Painter, L: Look, dir: Dir, frame: number) {
  const shirt = L.shirt;
  const shirtL = shade(shirt, 0.2);
  const shirtD = shade(shirt, -0.22);
  const pants = L.pants;
  const pantsD = shade(pants, -0.25);
  const skin = L.skin;
  const step = frame === 1 ? 1 : frame === 3 ? -1 : 0; // 1 = left foot fwd, -1 = right
  const bob = frame === 1 || frame === 3 ? 1 : 0;
  const by = 12 + bob;

  if (dir === 'down' || dir === 'up') {
    // torso
    p.rect(4, by, 8, 6, shirt);
    p.rect(4, by, 8, 1, shirtL);
    p.rect(11, by + 1, 1, 5, shirtD);
    if (dir === 'down') {
      p.rect(7, by, 2, 1, shade(skin, -0.1)); // neckline
      p.rect(5, by + 3, 6, 1, L.accent === shirt ? shirtD : mix(shirt, L.accent, 0.55)); // print stripe
    }
    // arms (swing)
    const la = step === -1 ? -1 : step === 1 ? 1 : 0;
    p.rect(3, by + la, 1, 3, shirtD);
    p.rect(3, by + 3 + la, 1, 2, skin);
    p.rect(12, by - la, 1, 3, shirtD);
    p.rect(12, by + 3 - la, 1, 2, skin);
    // pants
    p.rect(4, by + 6, 8, 2, pants);
    p.rect(4, by + 7, 8, 1, pantsD);
    const ly = 20 + bob;
    const lUp = step === 1 ? 1 : 0;
    const rUp = step === -1 ? 1 : 0;
    p.rect(4, by + 8, 3, 2 - lUp, pants);
    p.rect(9, by + 8, 3, 2 - rUp, pants);
    p.rect(4, ly + 2 - lUp - bob, 3, 1, L.shoes);
    p.rect(9, ly + 2 - rUp - bob, 3, 1, L.shoes);
  } else {
    // side facing right
    p.rect(5, by, 6, 6, shirt);
    p.rect(5, by, 6, 1, shirtL);
    p.rect(5, by + 1, 1, 5, shirtD);
    const sw = step;
    // back arm
    p.rect(6 - sw, by + 1, 1, 3, shirtD);
    // pants
    p.rect(5, by + 6, 6, 2, pants);
    if (step === 0) {
      p.rect(6, by + 8, 4, 2, pants);
      p.rect(6, 22, 5, 1, L.shoes);
    } else {
      p.rect(4, by + 8, 3, 1, pants); p.rect(9, by + 8, 3, 1, pants);
      p.rect(3, by + 9, 3, 1, pantsD); p.rect(10, by + 9, 3, 1, pants);
      p.rect(2, 22, 3, 1, L.shoes); p.rect(11, 22, 3, 1, L.shoes);
    }
    // front arm
    p.rect(8 + sw, by + 1, 2, 3, shirt);
    p.rect(8 + sw, by + 4, 2, 1, skin);
  }
}

const cache = new Map<string, HTMLCanvasElement>();

function lookKey(L: Look) {
  return [L.skin, L.hair, L.hairStyle, L.shirt, L.pants, L.shoes, L.extra, L.accent].join('|');
}

export function charSprite(L: Look, dir: Dir, frame: number): HTMLCanvasElement {
  const key = lookKey(L) + dir + frame;
  let c = cache.get(key);
  if (c) return c;
  if (dir === 'left') {
    c = flipH(charSprite(L, 'right', frame));
  } else {
    const [cv, g] = makeCanvas(18, 27);
    const p = new Painter(g, 1, 2);
    const bob = frame === 1 || frame === 3 ? 1 : 0;
    drawBody(p, L, dir, frame);
    drawHead(p, L, dir, bob);
    outline(cv);
    c = cv;
  }
  cache.set(key, c);
  return c;
}

/** Sitting pose (down facing, legs bent) used by students in lessons. */
export function charSit(L: Look): HTMLCanvasElement {
  const key = lookKey(L) + 'sit';
  let c = cache.get(key);
  if (c) return c;
  const [cv, g] = makeCanvas(18, 27);
  const p = new Painter(g, 1, 2);
  drawBody(p, L, 'down', 0);
  // cover legs: shorter (seated)
  g.clearRect(0, 2 + 19, 18, 6);
  p.rect(4, 19, 8, 2, L.pants);
  p.rect(4, 20, 8, 1, shade(L.pants, -0.25));
  p.rect(4, 21, 3, 1, L.shoes);
  p.rect(9, 21, 3, 1, L.shoes);
  drawHead(p, L, 'down', 0);
  outline(cv);
  cache.set(key, cv);
  return cv;
}

const portraitCache = new Map<string, string>();
export function portraitURL(L: Look): string {
  const key = lookKey(L);
  const hit = portraitCache.get(key);
  if (hit) return hit;
  const src = charSprite(L, 'down', 0);
  const [c, g] = makeCanvas(18, 20);
  g.drawImage(src, 0, 0);
  const url = c.toDataURL();
  portraitCache.set(key, url);
  return url;
}

export function spriteURL(L: Look): string {
  return charSprite(L, 'down', 0).toDataURL();
}

export { OUTLINE };
