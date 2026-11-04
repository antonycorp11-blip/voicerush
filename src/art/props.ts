// Procedural pixel-art props: instruments, furniture, decor, street things.
import { Painter, sprite, shade, mix, makeCanvas, hash } from './pixel';

const W = { base: '#b0703f', light: '#cf9460', dark: '#7d4a2b' };
const BLACK = '#33303d';
const METAL = '#b9bdc9';
const METALD = '#727889';

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) { c = make(); cache.set(key, c); }
  return c;
}

// ---------------------------------------------------------------- instruments
export function keyboard(tier: number) {
  return cached('piano' + tier, () => {
    if (tier === 0) {
      return sprite(28, 16, (p) => {
        // X stand
        p.line(4, 15, 22, 7, METALD); p.line(23, 15, 5, 7, METALD);
        p.line(5, 15, 23, 7, METAL); p.line(22, 15, 4, 7, METAL);
        // keyboard
        p.rect(0, 2, 28, 6, '#3b3846');
        p.rect(0, 2, 28, 1, '#57536a');
        p.rect(1, 4, 26, 3, '#f4f1ea');
        for (let i = 1; i < 27; i += 2) p.px(i, 6, '#c9c4bb');
        for (let i = 2; i < 26; i += 3) if (i % 7 !== 5) p.rect(i, 4, 1, 2, '#2a2733');
        p.px(3, 3, '#e05a4a'); p.px(5, 3, '#5ac06a'); p.rect(19, 3, 6, 1, '#7ad0e0');
      });
    }
    if (tier === 1) {
      return sprite(30, 22, (p) => {
        p.box(0, 0, 30, 7, '#2f2c38', 0.12);
        p.rect(1, 1, 28, 1, '#4b475a');
        p.rect(1, 5, 28, 4, '#f6f3ec');
        for (let i = 1; i < 29; i += 2) p.px(i, 8, '#cfc9bf');
        for (let i = 2; i < 28; i += 3) if (i % 7 !== 5) p.rect(i, 5, 1, 2, '#262330');
        p.box(0, 9, 30, 9, '#3a3645', 0.1);
        p.rect(2, 18, 2, 4, '#2f2c38'); p.rect(26, 18, 2, 4, '#2f2c38');
        p.rect(12, 19, 6, 2, METALD);
        p.px(14, 3, '#6ae0b0');
      });
    }
    return sprite(44, 34, (p) => {
      // grand piano – curved black body seen from 3/4
      const body = '#26232e';
      p.ellipse(24, 13, 19, 11, body);
      p.rect(4, 13, 36, 10, body);
      p.ellipse(24, 12, 17, 9, '#36323f');
      p.line(10, 6, 38, 4, '#5d5870');
      p.line(10, 7, 30, 1, '#7d7890');
      // lid prop
      p.line(30, 1, 30, 8, METAL);
      // keys
      p.rect(5, 22, 34, 4, '#f6f3ec');
      for (let i = 6; i < 38; i += 3) if (i % 7 !== 6) p.rect(i, 22, 1, 2, '#1f1c26');
      p.rect(4, 26, 36, 2, '#1d1a24');
      // legs + pedals
      p.rect(6, 27, 2, 6, body); p.rect(36, 27, 2, 6, body); p.rect(21, 28, 2, 4, body);
      p.rect(20, 32, 4, 1, '#d8b04a');
      p.px(14, 10, '#9e98b2'); p.px(15, 10, '#9e98b2');
    });
  });
}

export function drumKit(tier: number) {
  return cached('drums' + tier, () => sprite(34, 26, (p) => {
    const shell = ['#5a6f9a', '#c0393b', '#2d2a35'][tier];
    const shellL = shade(shell, 0.25);
    const head = '#efe8dc';
    const brass = ['#c9a640', '#e0b84a', '#f0c94f'][tier];
    // cymbal stands
    p.vl(3, 6, 18, METALD); p.vl(30, 4, 20, METALD);
    p.ellipse(3, 6, 5, 1, brass); p.hl(0, 6, 7, shade(brass, 0.3));
    p.ellipse(30, 4, 5, 1, brass); p.hl(27, 4, 7, shade(brass, 0.3));
    if (tier >= 1) { p.vl(24, 2, 10, METALD); p.ellipse(24, 2, 4, 1, brass); }
    // floor tom
    p.rect(25, 13, 7, 10, shell); p.ellipse(28, 13, 3, 1, head); p.vl(26, 14, 9, shellL);
    // snare
    p.rect(3, 13, 8, 4, METAL); p.ellipse(7, 13, 4, 1, head); p.vl(4, 17, 6, METALD); p.vl(9, 17, 6, METALD);
    // kick drum
    p.ellipse(17, 17, 7, 7, shell);
    p.ellipse(17, 17, 5, 5, head);
    p.ellipse(17, 17, 2, 2, shade(head, -0.08));
    if (tier === 2) p.ellipse(17, 17, 3, 3, '#e0b84a'), p.ellipse(17, 17, 2, 2, head);
    p.hl(10, 24, 15, METALD);
    // rack toms
    p.rect(10, 6, 6, 5, shell); p.ellipse(13, 6, 3, 1, head); p.vl(11, 7, 4, shellL);
    p.rect(18, 6, 6, 5, shell); p.ellipse(21, 6, 3, 1, head); p.vl(19, 7, 4, shellL);
    // throne
    p.rect(14, 24, 6, 1, BLACK);
  }));
}

/** Stringed instrument on a stand. kind: violao, guitarra, baixo, ukulele, violino */
export function stringOnStand(kind: string, tier = 0) {
  return cached('str' + kind + tier, () => {
    const tall = kind === 'baixo' ? 30 : kind === 'ukulele' || kind === 'violino' ? 18 : 26;
    return sprite(14, tall, (p) => {
      const body = kind === 'violao' ? ['#d49a5c', '#c47a3c', '#8a4a26'][tier]
        : kind === 'guitarra' ? ['#e0503e', '#3f8fd0', '#b2462a'][tier]
        : kind === 'baixo' ? ['#4f73c9', '#e0e0e8', '#2d2a35'][tier]
        : kind === 'ukulele' ? ['#e8a64a', '#d08a3a', '#9a5a2a'][tier]
        : ['#a44a22', '#8a3a1c', '#6e2a14'][tier];
      const neckLen = tall - (kind === 'ukulele' || kind === 'violino' ? 10 : 14);
      const cx = 7;
      // stand legs
      p.line(cx, tall - 4, cx - 4, tall - 1, METALD);
      p.line(cx, tall - 4, cx + 4, tall - 1, METALD);
      // neck + head
      p.rect(cx - 1, 2, 2, neckLen, kind === 'baixo' ? '#3a2820' : '#5a3826');
      p.rect(cx - 2, 0, 4, 3, shade(body, -0.3));
      p.px(cx - 2, 1, METAL); p.px(cx + 1, 1, METAL);
      const by = neckLen;
      if (kind === 'violino') {
        p.ellipse(cx, by + 2, 3, 2, body);
        p.ellipse(cx, by + 6, 4, 3, body);
        p.px(cx - 2, by + 5, BLACK); p.px(cx + 2, by + 5, BLACK);
        p.vl(cx, by - 4, 9, '#2a1e1a');
        p.px(cx - 1, by + 1, shade(body, 0.3));
      } else if (kind === 'ukulele') {
        p.ellipse(cx, by + 2, 3, 2, body);
        p.ellipse(cx, by + 5, 4, 3, body);
        p.circle(cx, by + 3, 1, '#3a2418');
        p.px(cx - 2, by + 2, shade(body, 0.3));
      } else if (kind === 'violao') {
        p.ellipse(cx, by + 3, 4, 3, body);
        p.ellipse(cx, by + 8, 6, 4, body);
        p.circle(cx, by + 5, 1, '#3a2418');
        p.hl(cx - 2, by + 9, 5, '#3a2418');
        p.px(cx - 3, by + 2, shade(body, 0.35)); p.px(cx - 4, by + 7, shade(body, 0.35));
      } else {
        // electric / bass solid body
        p.ellipse(cx, by + 4, 5, 3, body);
        p.ellipse(cx, by + 8, 6, 4, body);
        p.rect(cx - 3, by + 5, 6, 1, '#eee8dc');
        p.rect(cx - 3, by + 8, 6, 1, '#eee8dc');
        p.px(cx + 3, by + 10, METAL); p.px(cx + 4, by + 9, METAL);
        p.px(cx - 4, by + 6, shade(body, 0.35));
      }
    });
  });
}

export function amp(tier = 0, color = '#3a3540') {
  return cached('amp' + tier + color, () => sprite(16, 15, (p) => {
    const tolex = tier === 2 ? '#2a2630' : color;
    p.box(0, 0, 16, 15, tolex, 0.15);
    p.rect(1, 1, 14, 3, tier === 2 ? '#d8b56a' : '#4a4553');
    for (let i = 2; i < 14; i += 3) p.px(i, 2, tier === 2 ? '#7a5a2a' : '#c9c4cc');
    p.rect(2, 5, 12, 8, '#4c4652');
    for (let y = 6; y < 13; y += 2) for (let x = 3; x < 14; x += 2) p.px(x, y, '#5f5866');
    if (tier === 2) p.rect(4, 13, 8, 1, '#d8b56a');
  }));
}

export function micStand(tier = 0) {
  return cached('mic' + tier, () => sprite(10, 26, (p) => {
    p.line(5, 22, 1, 25, METALD); p.line(5, 22, 9, 25, METALD); p.vl(5, 22, 4, METALD);
    p.vl(5, 6, 17, METAL);
    p.line(5, 7, 8, 4, METAL);
    p.rect(7, 1, 3, 4, tier >= 1 ? '#d8d8e0' : '#4a4652');
    p.rect(7, 1, 3, 1, '#f4f4f8');
    if (tier === 2) p.circle(8, 3, 3, 'rgba(60,50,70,0.6)'), p.rect(7, 1, 3, 4, '#e8e8f0');
  }));
}

export function musicStand() {
  return cached('mstand', () => sprite(12, 20, (p) => {
    p.line(6, 16, 2, 19, METALD); p.line(6, 16, 10, 19, METALD);
    p.vl(6, 6, 11, METALD);
    p.rect(0, 0, 12, 7, '#4a4652');
    p.rect(1, 1, 10, 5, '#f7f2e6');
    for (let y = 2; y < 6; y += 1) p.hl(2, y, 8, y % 2 ? '#b8b0a0' : '#f7f2e6');
    p.px(4, 3, BLACK); p.px(7, 2, BLACK); p.px(9, 4, BLACK);
  }));
}

// ---------------------------------------------------------------- furniture
export function chair(color = '#c47a4a') {
  return cached('chair' + color, () => sprite(10, 14, (p) => {
    p.box(1, 0, 8, 6, color, 0.2);
    p.rect(0, 6, 10, 3, shade(color, 0.12));
    p.hl(0, 6, 10, shade(color, 0.3));
    p.rect(1, 9, 1, 5, shade(color, -0.35)); p.rect(8, 9, 1, 5, shade(color, -0.35));
  }));
}

export function stool() {
  return cached('stool', () => sprite(8, 10, (p) => {
    p.ellipse(4, 1, 3, 1, '#2f2c38');
    p.vl(1, 2, 8, METALD); p.vl(6, 2, 8, METALD); p.hl(1, 6, 6, METALD);
  }));
}

export function counter(tier: number, w = 56) {
  return cached('counter' + tier + w, () => sprite(w, 26, (p) => {
    const top = ['#b8a58a', '#d9b98a', '#f2ece0', '#3a3440'][tier];
    const front = ['#9a8a74', W.base, '#3fa6a0', '#5a3a28'][tier];
    p.rect(0, 8, w, 4, top);
    p.hl(0, 8, w, shade(top, 0.3));
    p.box(0, 12, w, 14, front, 0.1);
    if (tier >= 2) for (let x = 4; x < w - 2; x += 8) p.vl(x, 13, 12, shade(front, -0.12));
    if (tier === 3) p.hl(0, 12, w, '#e8c26a');
    // monitor
    p.box(8, 0, 12, 8, '#3a3644', 0.15); p.rect(9, 1, 10, 5, tier >= 1 ? '#7ad0e8' : '#8fa0a8');
    p.rect(13, 8, 2, 1, METALD);
    // bell + papers
    p.rect(30, 7, 7, 1, '#f6f2ea'); p.rect(31, 6, 6, 1, '#efe8d8');
    p.ellipse(44, 7, 2, 1, '#e8c04a');
    if (tier >= 1) { p.rect(w - 9, 3, 5, 4, '#c4683e'); p.circle(w - 7, 1, 2, '#5aa04a'); p.px(w - 8, 0, '#8ccf5e'); }
  }));
}

export function sofa(color = '#7a6bc4') {
  return cached('sofa' + color, () => sprite(36, 18, (p) => {
    p.box(2, 0, 32, 8, shade(color, -0.05), 0.2);
    p.rect(2, 8, 32, 5, color);
    p.hl(2, 8, 32, shade(color, 0.25));
    p.vl(18, 8, 5, shade(color, -0.2));
    p.box(0, 3, 4, 12, shade(color, -0.12), 0.2);
    p.box(32, 3, 4, 12, shade(color, -0.12), 0.2);
    p.rect(2, 13, 32, 3, shade(color, -0.3));
    p.rect(3, 16, 2, 2, W.dark); p.rect(31, 16, 2, 2, W.dark);
    p.px(8, 4, shade(color, 0.3)); p.px(26, 4, shade(color, 0.3));
  }));
}

export function coffeeTable() {
  return cached('ctable', () => sprite(18, 10, (p) => {
    p.rect(0, 0, 18, 5, W.light); p.hl(0, 0, 18, shade(W.light, 0.3));
    p.rect(0, 5, 18, 2, W.dark);
    p.rect(1, 7, 2, 3, W.dark); p.rect(15, 7, 2, 3, W.dark);
    p.rect(4, 1, 4, 2, '#f2eee4'); p.circle(13, 2, 1, '#e05a4a');
  }));
}

export function bookshelf(seed = 1) {
  return cached('shelf' + seed, () => sprite(22, 30, (p) => {
    p.box(0, 0, 22, 30, W.base, 0.15);
    p.rect(2, 2, 18, 26, W.dark);
    const cols = ['#e05a4a', '#4f8fd8', '#f2c14e', '#58b06c', '#9b6bd1', '#efe8dc', '#ef8fb1'];
    for (let s = 0; s < 3; s++) {
      const y = 2 + s * 9;
      p.hl(1, y + 8, 20, W.light);
      let x = 3;
      let k = 0;
      while (x < 19) {
        const bw = 1 + Math.floor(hash(x, s, seed) * 2);
        const bh = 5 + Math.floor(hash(s, x, seed) * 3);
        p.rect(x, y + 8 - bh, bw, bh, cols[Math.floor(hash(x + k, s * 3, seed) * cols.length)]);
        x += bw + (hash(x, k, seed) > 0.8 ? 1 : 0);
        k++;
      }
    }
  }));
}

export function plant(kind: number) {
  return cached('plant' + kind, () => {
    if (kind === 0)
      return sprite(12, 16, (p) => {
        p.box(3, 10, 6, 6, '#c4683e', 0.2);
        p.ellipse(6, 6, 5, 4, '#4f9a44');
        p.ellipse(5, 5, 3, 2, '#6cbf54');
        p.px(4, 3, '#9ad86a'); p.px(8, 6, '#3a7a36');
        p.px(2, 8, '#3a7a36'); p.px(10, 7, '#4f9a44');
      });
    if (kind === 1)
      return sprite(16, 28, (p) => {
        p.box(4, 20, 8, 8, '#e9e4da', 0.15);
        p.hl(4, 22, 8, '#c9c2b4');
        p.vl(8, 10, 10, '#5a7a3a');
        const leaf = (x: number, y: number, r: number) => { p.ellipse(x, y, r, r - 1, '#3f8a40'); p.ellipse(x - 1, y - 1, r - 1, r - 2, '#5bb04e'); };
        leaf(5, 12, 4); leaf(11, 10, 4); leaf(8, 5, 4); leaf(4, 5, 3); leaf(12, 16, 3);
        p.px(7, 3, '#9ad86a');
      });
    // tall tree in pot (ficus)
    return sprite(16, 30, (p) => {
      p.box(4, 23, 8, 7, '#a8673a', 0.2);
      p.vl(8, 14, 9, '#6b4a2a');
      p.ellipse(8, 9, 7, 8, '#3f7a3a');
      p.ellipse(7, 7, 5, 5, '#55a048');
      p.ellipse(6, 5, 2, 2, '#7cc55a');
      p.px(11, 12, '#2f6a32'); p.px(3, 11, '#2f6a32');
    });
  });
}

export function floorLamp() {
  return cached('flamp', () => sprite(10, 30, (p) => {
    p.ellipse(5, 28, 3, 1, '#7a5a3a');
    p.vl(5, 8, 20, '#8a6a4a');
    p.rect(0, 0, 10, 8, '#f3e6c4'); p.rect(0, 0, 10, 1, '#fff6dc'); p.rect(1, 7, 8, 1, '#d8c69a');
    p.vl(2, 1, 6, '#e8d8b0'); p.vl(6, 1, 6, '#e8d8b0');
  }));
}

export function waterCooler() {
  return cached('cooler', () => sprite(10, 22, (p) => {
    p.rect(2, 0, 6, 7, '#8fd0f0'); p.rect(2, 0, 2, 6, '#c4ecff'); p.rect(3, 0, 4, 1, '#3a80b0');
    p.box(1, 7, 8, 15, '#e8e8ee', 0.15);
    p.px(3, 10, '#4f8fd8'); p.px(6, 10, '#e05a4a');
  }));
}

export function boxes(seed = 0) {
  return cached('boxes' + seed, () => sprite(22, 18, (p) => {
    const c = '#c49a64';
    p.box(0, 6, 12, 12, c, 0.15); p.hl(0, 11, 12, '#a07a4a'); p.vl(5, 6, 5, '#e8d0a0');
    p.box(10, 9, 12, 9, shade(c, -0.08), 0.15); p.vl(15, 9, 4, '#e8d0a0');
    if (seed % 2 === 0) p.box(3, 0, 10, 7, shade(c, 0.05), 0.15);
  }));
}

export function stage(w: number) {
  return cached('stage' + w, () => sprite(w, 16, (p) => {
    p.rect(0, 0, w, 10, '#8a5634');
    for (let x = 0; x < w; x += 6) p.vl(x, 0, 10, '#7a4a2c');
    p.hl(0, 0, w, '#b07a4a');
    p.rect(0, 10, w, 6, '#4a2e22');
    p.hl(0, 10, w, '#e8c26a');
  }, true));
}

export function speaker() {
  return cached('speaker', () => sprite(10, 16, (p) => {
    p.box(0, 0, 10, 16, '#2e2b36', 0.15);
    p.circle(5, 4, 2, '#4a4652'); p.px(5, 4, '#8a8696');
    p.circle(5, 11, 3, '#4a4652'); p.circle(5, 11, 1, '#8a8696');
  }));
}

export function mixingDesk() {
  return cached('mixer', () => sprite(30, 16, (p) => {
    p.rect(0, 2, 30, 6, '#3a3644');
    for (let x = 2; x < 28; x += 3) { p.vl(x, 3, 4, '#5a5666'); p.px(x, 3 + ((x * 7) % 3), '#e8e4f0'); }
    p.px(26, 3, '#5ae07a'); p.px(26, 5, '#f2c14e'); p.px(27, 4, '#e05a4a');
    p.box(0, 8, 30, 8, '#2e2b36', 0.1);
    p.box(2, 0, 7, 3, '#2e2b36'); p.box(21, 0, 7, 3, '#2e2b36');
  }));
}

export function cafeCounter() {
  return cached('cafe', () => sprite(40, 26, (p) => {
    p.rect(0, 9, 40, 4, '#e9e2d4'); p.hl(0, 9, 40, '#fffaf0');
    p.box(0, 13, 40, 13, '#6a4a3a', 0.1);
    for (let x = 3; x < 38; x += 5) p.vl(x, 14, 11, '#5a3e30');
    // espresso machine
    p.box(4, 0, 12, 9, '#c9ccd6', 0.2); p.rect(6, 2, 8, 2, '#3a3644'); p.px(8, 6, '#e05a4a');
    // cups + cake dome
    p.rect(20, 7, 2, 2, '#fff'); p.rect(23, 7, 2, 2, '#fff');
    p.ellipse(33, 6, 4, 3, 'rgba(220,240,255,0.9)'); p.rect(30, 7, 6, 2, '#e8a0b0');
  }));
}

export function cafeTable() {
  return cached('ctab', () => sprite(14, 14, (p) => {
    p.ellipse(7, 3, 6, 3, '#f2ece0'); p.hl(2, 2, 10, '#fffaf2');
    p.vl(7, 6, 7, METALD); p.hl(4, 13, 7, METALD);
    p.rect(5, 1, 2, 2, '#8a5a3a');
  }));
}

export function audienceChair(color: string) {
  return cached('aud' + color, () => sprite(8, 11, (p) => {
    p.box(0, 0, 8, 6, color, 0.2);
    p.rect(0, 6, 8, 2, shade(color, 0.15));
    p.rect(1, 8, 1, 3, METALD); p.rect(6, 8, 1, 3, METALD);
  }));
}

export function trophyShelf() {
  return cached('trophy', () => sprite(20, 14, (p) => {
    p.rect(0, 11, 20, 3, W.base); p.hl(0, 11, 20, W.light);
    p.rect(2, 4, 4, 4, '#f0c94f'); p.rect(3, 8, 2, 3, '#c9a640'); p.px(1, 5, '#f0c94f'); p.px(6, 5, '#f0c94f');
    p.rect(9, 6, 3, 3, '#c0c4d0'); p.rect(10, 9, 1, 2, '#9ea2ae');
    p.rect(14, 2, 4, 5, '#d08a4a'); p.rect(15, 7, 2, 4, '#a86a3a');
  }));
}

export function rehearsalSet(tier: number) {
  // amp stack + extra for rehearsal rooms (keys + bass amp)
  return amp(tier, '#4a3f52');
}

// ---------------------------------------------------------------- outdoor
export function tree(seed = 0) {
  return cached('tree' + seed, () => sprite(30, 42, (p) => {
    p.ellipse(15, 40, 9, 2, 'rgba(0,0,0,0)');
    p.rect(13, 26, 4, 15, '#7a5236'); p.vl(13, 26, 15, '#9a6a46');
    const g1 = seed % 2 ? '#4f9a44' : '#5aa04a';
    p.ellipse(15, 15, 13, 12, shade(g1, -0.2));
    p.ellipse(14, 13, 11, 10, g1);
    p.ellipse(11, 9, 6, 5, shade(g1, 0.18));
    p.ellipse(9, 7, 2, 2, shade(g1, 0.4));
    p.px(20, 18, shade(g1, -0.35)); p.px(6, 17, shade(g1, -0.35));
    if (seed % 3 === 0) { p.px(19, 9, '#f08aa0'); p.px(8, 15, '#f08aa0'); p.px(22, 14, '#f08aa0'); }
  }));
}

export function bush(seed = 0) {
  return cached('bush' + seed, () => sprite(18, 11, (p) => {
    p.ellipse(9, 6, 8, 4, '#3f8a40');
    p.ellipse(8, 5, 6, 3, '#55a54a');
    p.ellipse(6, 4, 2, 1, '#86cc62');
    if (seed % 2) { p.px(12, 4, '#f2c14e'); p.px(4, 7, '#f2c14e'); }
  }));
}

export function streetLamp() {
  return cached('slamp', () => sprite(10, 44, (p) => {
    p.rect(3, 40, 4, 4, '#3a3a46');
    p.vl(5, 6, 34, '#4a4a58'); p.vl(4, 6, 34, '#5a5a6a');
    p.rect(1, 2, 8, 5, '#4a4a58'); p.rect(2, 6, 6, 1, '#fff2b0');
  }));
}

export function bench() {
  return cached('bench', () => sprite(26, 12, (p) => {
    p.rect(0, 0, 26, 3, W.base); p.hl(0, 0, 26, W.light);
    p.rect(0, 5, 26, 3, W.light); p.hl(0, 7, 26, W.dark);
    p.rect(2, 8, 2, 4, '#3a3a46'); p.rect(22, 8, 2, 4, '#3a3a46');
  }));
}

export function car(color: string) {
  return cached('car' + color, () => sprite(40, 20, (p) => {
    p.ellipse(20, 18, 18, 2, 'rgba(0,0,0,0)');
    p.rect(1, 8, 38, 8, color);
    p.hl(1, 8, 38, shade(color, 0.25));
    p.rect(8, 2, 22, 7, shade(color, -0.05));
    p.rect(10, 3, 8, 5, '#a8d8f0'); p.rect(20, 3, 8, 5, '#a8d8f0');
    p.px(11, 3, '#e8f6ff'); p.px(21, 3, '#e8f6ff');
    p.rect(1, 13, 38, 1, shade(color, -0.25));
    p.circle(9, 16, 3, '#2a2730'); p.circle(9, 16, 1, '#8a8696');
    p.circle(31, 16, 3, '#2a2730'); p.circle(31, 16, 1, '#8a8696');
    p.rect(37, 10, 2, 2, '#fff2b0'); p.rect(1, 10, 2, 2, '#e05a4a');
  }));
}

export function signBoard(text: string, color: string) {
  return cached('sign' + text + color, () => {
    const w = text.length * 4 + 9;
    return sprite(w, 11, (p) => {
      p.box(0, 0, w, 11, color, 0.2);
      p.rect(2, 2, w - 4, 7, shade(color, -0.25));
      // text drawn by caller-provided font
      const s = text.toUpperCase();
      import_text(p, s, 4, 3);
    });
  });
}

// late-bound to avoid circular import
import { pixelText } from './pixel';
function import_text(p: Painter, s: string, x: number, y: number) {
  pixelText(p, s, x + 1, y + 1, 'rgba(0,0,0,0.35)');
  pixelText(p, s, x, y, '#fff6dc');
}

// ---------------------------------------------------------------- wall decor (no outline needed but nicer with)
export function windowSprite(night = false) {
  return cached('win' + night, () => sprite(22, 16, (p) => {
    p.box(0, 0, 22, 16, '#f4ecdc', 0.1);
    const sky = night ? '#2c3a68' : '#9fd4f2';
    p.rect(2, 2, 18, 11, sky);
    p.rect(2, 2, 18, 3, night ? '#3a4a80' : '#c4e6fa');
    if (!night) { p.rect(4, 8, 6, 2, '#ffffff'); p.rect(5, 7, 3, 1, '#ffffff'); }
    else { p.px(6, 4, '#fff6c8'); p.px(15, 7, '#fff6c8'); p.px(11, 3, '#fff6c8'); }
    p.vl(10, 2, 11, '#e8ddc8'); p.vl(11, 2, 11, '#d8cbb0');
    p.rect(0, 13, 22, 3, '#e2d6bf'); p.hl(0, 13, 22, '#fff8ea');
  }));
}

export function poster(seed: number) {
  return cached('poster' + seed, () => sprite(12, 15, (p) => {
    const bgs = ['#f2c14e', '#4f8fd8', '#e05a4a', '#58b06c', '#9b6bd1', '#ef8fb1'];
    const bg = bgs[seed % bgs.length];
    p.rect(0, 0, 12, 15, bg);
    p.rect(1, 1, 10, 13, shade(bg, 0.15));
    // music note
    const c = '#2a2433';
    p.ellipse(4, 10, 2, 1, c); p.vl(6, 3, 7, c); p.hl(6, 3, 3, c); p.px(9, 4, c);
    p.hl(2, 12, 8, shade(bg, -0.3));
  }));
}

export function vinylFrame(seed: number) {
  return cached('vinyl' + seed, () => sprite(12, 12, (p) => {
    p.rect(0, 0, 12, 12, '#e8c26a');
    p.rect(1, 1, 10, 10, '#f6efe0');
    p.circle(6, 6, 4, '#2a2632'); p.circle(6, 6, 1, ['#e05a4a', '#4f8fd8', '#58b06c'][seed % 3]);
    p.px(4, 4, '#5a5666');
  }));
}

export function wallClock() {
  return cached('clock', () => sprite(10, 10, (p) => {
    p.circle(5, 5, 4, '#3a3644'); p.circle(5, 5, 3, '#fbf7ee');
    p.vl(5, 3, 3, '#2a2433'); p.hl(5, 5, 2, '#e05a4a');
  }));
}

export function whiteboard() {
  return cached('wboard', () => sprite(30, 15, (p) => {
    p.rect(0, 0, 30, 14, '#c9ccd6'); p.rect(1, 1, 28, 11, '#fbfbfd');
    for (let y = 3; y < 9; y += 1.5) p.hl(3, Math.round(y), 14, '#9aa6c0');
    p.ellipse(6, 7, 1, 1, '#2a2a3a'); p.vl(7, 3, 4, '#2a2a3a'); p.ellipse(12, 5, 1, 1, '#2a2a3a'); p.vl(13, 2, 3, '#2a2a3a');
    p.rect(20, 3, 7, 1, '#e05a4a'); p.rect(20, 6, 5, 1, '#4f8fd8'); p.rect(20, 9, 6, 1, '#58b06c');
    p.rect(2, 12, 26, 2, '#a8acb8');
  }));
}

export function acousticPanel(color = '#6a4a6a') {
  return cached('apanel' + color, () => sprite(10, 18, (p) => {
    p.rect(0, 0, 10, 18, color);
    for (let y = 1; y < 17; y += 3) for (let x = 1; x < 9; x += 3) { p.rect(x, y, 2, 2, shade(color, 0.15)); p.px(x + 1, y + 1, shade(color, -0.2)); }
  }));
}

export function sconce() {
  return cached('sconce', () => sprite(6, 7, (p) => {
    p.rect(1, 3, 4, 4, '#d8b56a'); p.rect(0, 0, 6, 4, '#fff1c4'); p.hl(0, 0, 6, '#ffffff');
  }));
}

export function guitarWall(color: string) {
  return cached('gwall' + color, () => sprite(8, 18, (p) => {
    p.rect(3, 0, 2, 9, '#5a3826'); p.rect(2, 0, 4, 2, shade(color, -0.3));
    p.ellipse(4, 11, 3, 2, color); p.ellipse(4, 14, 4, 3, color); p.circle(4, 12, 1, '#2a1e1a');
  }));
}

export function bubble(kind: 'q' | 'note' | 'excl' | 'zz' | 'heart' | 'coin' | 'sad') {
  return cached('bubble' + kind, () => sprite(11, 11, (p) => {
    p.rect(1, 0, 9, 8, '#fffaf0'); p.rect(0, 1, 11, 6, '#fffaf0');
    p.rect(4, 8, 3, 1, '#fffaf0'); p.px(5, 9, '#fffaf0');
    const c = kind === 'q' ? '#4f8fd8' : kind === 'excl' ? '#e05a4a' : kind === 'heart' ? '#e8607a' : kind === 'coin' ? '#d8a63a' : kind === 'sad' ? '#7a7a9a' : '#9b6bd1';
    if (kind === 'q') { p.hl(4, 1, 3, c); p.px(7, 2, c); p.px(6, 3, c); p.px(5, 4, c); p.px(5, 6, c); }
    if (kind === 'excl') { p.vl(5, 1, 4, c); p.px(5, 6, c); }
    if (kind === 'note') { p.ellipse(4, 5, 1, 1, c); p.vl(5, 1, 4, c); p.hl(5, 1, 2, c); p.px(7, 2, c); }
    if (kind === 'zz') { p.hl(3, 2, 4, c); p.px(5, 3, c); p.px(4, 4, c); p.hl(3, 5, 4, c); }
    if (kind === 'heart') { p.rect(3, 2, 2, 1, c); p.rect(6, 2, 2, 1, c); p.rect(2, 3, 7, 2, c); p.rect(3, 5, 5, 1, c); p.px(5, 6, c); }
    if (kind === 'coin') { p.circle(5, 4, 3, c); p.circle(5, 4, 2, '#f2d06a'); p.vl(5, 3, 3, c); }
    if (kind === 'sad') { p.px(3, 3, c); p.px(7, 3, c); p.hl(4, 6, 3, c); p.px(3, 7, c); p.px(7, 7, c); }
  }));
}

export function noteParticle(color: string) {
  return cached('np' + color, () => sprite(5, 7, (p) => {
    p.ellipse(1, 5, 1, 1, color); p.vl(2, 0, 5, color); p.hl(2, 0, 2, color); p.px(4, 1, color);
  }, false));
}

export function shadowBlob(w: number) {
  return cached('shadow' + w, () => {
    const [c, g] = makeCanvas(w, 4);
    g.fillStyle = 'rgba(60,40,50,0.22)';
    const p = new Painter(g);
    p.ellipse(w / 2, 2, w / 2 - 0.5, 1.5, 'rgba(60,40,50,0.22)');
    return c;
  });
}

export { mix };
