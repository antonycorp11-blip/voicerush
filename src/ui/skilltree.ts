// Skill tree: full-screen, one tab per branch, readable cards laid out by tier
// (left → right) like notes on a staff.
import type { Game } from '../game/game';
import { BRANCHES, SKILLS, SKILL_MAP, SkillDef, BranchId } from '../data/content';

export function skillState(g: Game, sk: SkillDef): 'owned' | 'available' | 'locked' {
  if (g.has(sk.id)) return 'owned';
  if (sk.req.every((r) => g.has(r))) return 'available';
  return 'locked';
}

const ICON: Record<string, string> = {
  metodo: '📘', turmas: '👥', apostilas: '📚', turmasG: '👨‍👩‍👧‍👦', avaliacao: '📝', coordenador: '🎓', mestre: '🏅',
  pintura: '🖌️', acustica: '🧱', lounge: '☕', premium: '✨', conforto: '💎',
  instagram: '📱', indique: '🗣️', youtube: '▶️', google: '🔎', parcerias: '🏫', outdoor: '📻', marca: '⭐',
  planilha: '📊', vendedor: '🤝', secretaria: '📋', semestral: '📆', cobranca: '💳', precificacao: '🎯',
  recital: '🎤', ensaio: '🥁', auditorio: '🎭', estudio: '🎙️', festival: '🎪',
  expansao1: '🧭', corporativo: '🏢', expansao2: '📐', filial: '🏆',
};

export function skillTreeHTML(g: Game, branch: BranchId): string {
  const s = g.s;
  const tabs = (Object.keys(BRANCHES) as BranchId[]).map((b) => {
    const list = SKILLS.filter((x) => x.branch === b);
    const owned = list.filter((x) => g.has(x.id)).length;
    const canBuy = list.some((x) => skillState(g, x) === 'available' && s.skillPoints >= x.cost && !(x.minChapter && s.chapter < x.minChapter));
    return `<button class="st-tab ${b === branch ? 'on' : ''}" data-branch="${b}" style="--c:${BRANCHES[b].color}">
      <span class="st-tab-i">${BRANCHES[b].icon}</span><span class="st-tab-n">${BRANCHES[b].name}</span><small>${owned}/${list.length}</small>${canBuy ? '<i class="st-dot"></i>' : ''}</button>`;
  }).join('');
  const color = BRANCHES[branch].color;
  const list = SKILLS.filter((x) => x.branch === branch);
  const maxTier = Math.max(...list.map((x) => x.tier));
  let cols = '';
  for (let t = 1; t <= maxTier; t++) {
    const cards = list.filter((x) => x.tier === t).map((sk) => card(g, sk)).join('');
    cols += `<div class="st-col">${cards}</div>${t < maxTier ? '<div class="st-arrow">➜</div>' : ''}`;
  }
  return `<div class="st-tabs">${tabs}</div>
    <div class="st-lane" style="--c:${color}"><div class="st-staff"></div>${cols}</div>`;
}

function card(g: Game, sk: SkillDef): string {
  const s = g.s;
  const st = skillState(g, sk);
  const chapterLock = sk.minChapter && s.chapter < sk.minChapter;
  let action = '';
  if (st === 'owned') action = '<div class="st-owned">✓ Desbloqueado</div>';
  else if (st === 'locked') action = `<div class="st-req">🔒 Antes: ${sk.req.filter((r) => !g.has(r)).map((r) => SKILL_MAP[r].name).join(' + ')}</div>`;
  else if (chapterLock) action = '<div class="st-req">🔒 Libera quando a escola abrir</div>';
  else action = `<button class="btn ${s.skillPoints >= sk.cost ? 'primary' : ''} st-buy" data-act="buySkill" data-arg="${sk.id}" ${s.skillPoints >= sk.cost ? '' : 'disabled'}>${s.skillPoints >= sk.cost ? 'Desbloquear' : 'Faltam notas'} · ${sk.cost} 🎵</button>`;
  return `<div class="st-card ${st} ${chapterLock && st !== 'owned' ? 'locked' : ''}">
    <div class="st-card-h"><span class="st-ico">${ICON[sk.id] ?? '🎵'}</span><b>${sk.name}</b><span class="st-cost">${sk.cost}🎵</span></div>
    <div class="st-desc">${sk.desc}</div>
    ${action}
  </div>`;
}
