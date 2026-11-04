// Radial, music-themed skill tree rendered as SVG.
import type { Game } from '../game/game';
import { BRANCHES, SKILLS, SKILL_MAP, SkillDef, BranchId } from '../data/content';

const R0 = 46;
const RSTEP = 70;

export function skillPos(sk: SkillDef): { x: number; y: number } {
  const sameTier = SKILLS.filter((x) => x.branch === sk.branch && x.tier === sk.tier);
  const k = sameTier.indexOf(sk);
  const n = sameTier.length;
  const r = R0 + sk.tier * RSTEP;
  const spread = ((82 / r) * 180) / Math.PI;
  const ang = (BRANCHES[sk.branch].angle + (k - (n - 1) / 2) * spread) * (Math.PI / 180);
  return { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
}

export function skillState(g: Game, sk: SkillDef): 'owned' | 'available' | 'locked' {
  if (g.has(sk.id)) return 'owned';
  if (sk.req.every((r) => g.has(r))) return 'available';
  return 'locked';
}

const GLYPH: Record<BranchId, string> = { pedagogia: '♩', ambiente: '♪', marketing: '♫', palco: '♬', expansao: '♯', gestao: '♭' };

export function skillTreeSVG(g: Game, selected: string | null): string {
  const lines: string[] = [];
  const nodes: string[] = [];
  const labels: string[] = [];
  // staff rings
  for (let t = 1; t <= 5; t++) lines.push(`<circle cx="0" cy="0" r="${R0 + t * RSTEP}" fill="none" stroke="var(--staff)" stroke-width="1.2" stroke-dasharray="2 6"/>`);
  for (const [id, b] of Object.entries(BRANCHES) as [BranchId, (typeof BRANCHES)[BranchId]][]) {
    const a = (b.angle * Math.PI) / 180;
    const lx = Math.cos(a) * 38, ly = Math.sin(a) * 38;
    // root line
    const first = SKILLS.filter((s) => s.branch === id && s.tier === 1);
    for (const f of first) {
      const p = skillPos(f);
      const st = skillState(g, f);
      lines.push(staffLine(0, 0, p.x, p.y, b.color, st !== 'locked'));
    }
    const maxT = Math.max(...SKILLS.filter((x) => x.branch === id).map((x) => x.tier));
    const lr = R0 + 5.55 * RSTEP; void maxT;
    labels.push(`<text x="${Math.cos(a) * lr}" y="${Math.sin(a) * lr}" class="st-branch" fill="${b.color}" text-anchor="middle" dominant-baseline="middle">${b.name.toUpperCase()}</text>`);
    void lx; void ly;
  }
  for (const sk of SKILLS) {
    const p = skillPos(sk);
    for (const r of sk.req) {
      const q = skillPos(SKILL_MAP[r]);
      lines.push(staffLine(q.x, q.y, p.x, p.y, BRANCHES[sk.branch].color, g.has(r)));
    }
  }
  for (const sk of SKILLS) {
    const p = skillPos(sk);
    const st = skillState(g, sk);
    const col = BRANCHES[sk.branch].color;
    const affordable = st === 'available' && g.s.skillPoints >= sk.cost;
    const sel = selected === sk.id;
    const fill = st === 'owned' ? col : st === 'available' ? 'var(--node)' : 'var(--locked)';
    const stroke = st === 'owned' ? '#f2c94c' : st === 'available' ? col : 'var(--lockedStroke)';
    nodes.push(`<g class="st-node ${st} ${affordable ? 'afford' : ''} ${sel ? 'sel' : ''}" data-skill="${sk.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})" style="--c:${col}">
      ${affordable ? `<circle r="26" fill="none" stroke="${col}" stroke-width="2" class="st-pulse"/>` : ''}
      <circle r="20" fill="${fill}" stroke="${stroke}" stroke-width="${st === 'owned' ? 4 : 3}"/>
      <text y="1" text-anchor="middle" dominant-baseline="middle" class="st-glyph" fill="${st === 'owned' ? '#fff' : st === 'available' ? col : '#a99fa6'}">${st === 'locked' ? '🔒' : GLYPH[sk.branch]}</text>
      <g class="st-cost"><circle cx="15" cy="-15" r="8.5" fill="${st === 'owned' ? '#f2c94c' : '#2e2433'}"/><text x="15" y="-14.5" text-anchor="middle" dominant-baseline="middle">${st === 'owned' ? '✓' : sk.cost}</text></g>
      <text y="32" text-anchor="middle" class="st-label">${twoLines(sk.name)}</text>
    </g>`);
  }
  // center clef
  const center = `<g class="st-center"><circle r="30" fill="#2e2433" stroke="#f2c94c" stroke-width="4"/><text y="5" text-anchor="middle" dominant-baseline="middle" fill="#f2c94c" font-size="40" font-family="serif">𝄞</text></g>`;
  const ext = R0 + 5 * RSTEP + 66;
  return `<svg class="st-svg" viewBox="${-ext} ${-ext} ${ext * 2} ${ext * 2}">${lines.join('')}${labels.join('')}${center}${nodes.join('')}</svg>`;
}

function twoLines(name: string) {
  if (name.length <= 12 || !name.includes(' ')) return name;
  const words = name.split(' ');
  let best = 1, diff = 1e9;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ').length, b = words.slice(k).join(' ').length;
    if (Math.abs(a - b) < diff) { diff = Math.abs(a - b); best = k; }
  }
  return `<tspan x="0">${words.slice(0, best).join(' ')}</tspan><tspan x="0" dy="1.1em">${words.slice(best).join(' ')}</tspan>`;
}

function staffLine(x1: number, y1: number, x2: number, y2: number, color: string, on: boolean) {
  // five thin parallel lines like a music staff
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  let s = '';
  for (let k = -2; k <= 2; k++) {
    const o = k * 2.2;
    s += `<line x1="${(x1 + nx * o).toFixed(1)}" y1="${(y1 + ny * o).toFixed(1)}" x2="${(x2 + nx * o).toFixed(1)}" y2="${(y2 + ny * o).toFixed(1)}" stroke="${on ? color : 'var(--lockedStroke)'}" stroke-width="1.1" opacity="${on ? 0.95 : 0.55}"/>`;
  }
  return s;
}

export function skillDetail(g: Game, id: string | null): string {
  if (!id) return `<div class="st-help"><b>Árvore da Escola</b><p>Cada nível de reputação rende 1 <b>Nota Musical</b> 🎵. Gaste notas para desbloquear melhorias. Não dá para ter tudo — escolha sua estratégia!</p></div>`;
  const sk = SKILL_MAP[id];
  const st = skillState(g, sk);
  const b = BRANCHES[sk.branch];
  const reqs = sk.req.map((r) => `${g.has(r) ? '✅' : '⬜'} ${SKILL_MAP[r].name}`).join('<br>');
  let btn = '';
  if (st === 'owned') btn = '<div class="tag green">Desbloqueado</div>';
  else if (st === 'locked') btn = `<div class="tag">Requer:<br>${reqs}</div>`;
  else if (sk.minChapter && g.s.chapter < sk.minChapter) btn = '<div class="tag">Disponível quando a escola abrir</div>';
  else btn = `<button class="btn primary wide" data-act="buySkill" data-arg="${sk.id}" ${g.s.skillPoints < sk.cost ? 'disabled' : ''}>Desbloquear — ${sk.cost} 🎵</button>`;
  return `<div class="st-help" style="--c:${b.color}"><div class="st-bn" style="color:${b.color}">${b.icon} ${b.name}</div><b class="st-name">${sk.name}</b><p>${sk.desc}</p>${btn}</div>`;
}
