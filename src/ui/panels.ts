// HTML renderers for the side panels.
import type { Game } from '../game/game';
import { BASE_PRICE, INVESTOR_LOOK } from '../game/game';
import type { Teacher, Staff, Plot } from '../game/state';
import { DAY_NAMES, firstName } from '../game/state';
import { INSTRUMENTS, INSTRUMENT_IDS, InstrumentId } from '../data/instruments';
import { CAMPAIGNS, CampaignId, DECOR_COST, DECOR_NAMES, DECOR_SKILL, PLOT_DEPOSIT, PLOT_RENT, ROOM_TYPES, RoomType, SKILL_MAP, STAFF_ROLES, TRAITS } from '../data/content';
import { portraitURL } from '../art/characters';
import { EVENT_DEFS } from '../game/events';

export const money = (n: number) => (n < 0 ? '-' : '') + 'R$ ' + Math.abs(Math.round(n)).toLocaleString('pt-BR');
const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
const bar = (v: number, color = '') => `<div class="bar ${color}"><div style="width:${Math.max(0, Math.min(100, v))}%"></div></div>`;
const instChip = (i: InstrumentId) => `<span class="ichip" style="--ic:${INSTRUMENTS[i].color}">${INSTRUMENTS[i].emoji} ${INSTRUMENTS[i].name}</span>`;

export function roomName(g: Game, p: Plot) {
  if (p.index === g.layout.hall) return p.type === 'reception' ? 'Recepção' : 'Hall de entrada';
  if (!p.owned) return 'Espaço disponível';
  if (p.type === 'empty') return 'Espaço vazio';
  return ROOM_TYPES[p.type]?.name ?? p.type;
}

// ---------------------------------------------------------------- Room panel
export function roomPanel(g: Game, i: number): string {
  const s = g.s;
  const p = s.plots[i];
  const L = g.layout;
  let h = `<div class="ptitle">${p.owned && p.type !== 'empty' && p.type !== 'hall' ? (ROOM_TYPES[p.type]?.emoji ?? '🛎️') : '🏠'} ${roomName(g, p)} <small>espaço ${i + 1}</small></div>`;
  if (s.chapter === 1) return h + '<p class="muted">Este é o estúdio do Seu Válter. Você é só funcionário aqui… por enquanto.</p>';
  if (!p.owned) {
    if (i === L.hall) return h + '<p class="muted">Entrada do prédio, compartilhada com os vizinhos.</p>';
    if (g.canRentPlot(i)) {
      return h + `<p>Um espaço vazio, cheio de caixas. Alugue para expandir a escola.</p>
        <div class="kv"><span>Caução</span><b>${money(PLOT_DEPOSIT)}</b></div>
        <div class="kv"><span>Aluguel</span><b>${money(PLOT_RENT)}/semana</b></div>
        <button class="btn primary wide" data-act="rent" data-arg="${i}">🔑 Alugar espaço</button>`;
    }
    return h + `<p class="muted">${s.chapter < 3 ? 'Por enquanto você só tem sua salinha.' : 'Desbloqueie <b>Novos Espaços / Prédio Inteiro</b> na árvore de habilidades (Expansão).'}</p>`;
  }
  const decorBlock = () => {
    const next = p.decor + 1;
    let d = `<div class="sect">Ambiente: <b>${DECOR_NAMES[p.decor]}</b> ${'✦'.repeat(p.decor)}<span class="dim">${'✦'.repeat(3 - p.decor)}</span></div>`;
    if (next <= 3) {
      const sk = DECOR_SKILL[next];
      const locked = sk && !g.has(sk);
      d += `<button class="btn ${locked ? 'ghost' : 'accent'} wide" data-act="decor" data-arg="${i}" ${locked ? 'disabled' : ''}>✨ Reformar para "${DECOR_NAMES[next]}" — ${money(DECOR_COST[next])}${locked ? ` <small>(requer ${SKILL_MAP[sk!].name})</small>` : ''}</button>`;
    }
    return d;
  };
  if (p.type === 'hall') {
    return h + `<p>A porta de entrada da escola. Sem recepção, os interessados ficam esperando em pé e você atende tudo sozinho.</p>
      <button class="btn primary wide" data-act="reception">🛎️ Construir Recepção — ${money(2500)}</button>
      <p class="muted small">A recepção permite contratar vendedores e secretária, e deixa os interessados mais confortáveis.</p>`;
  }
  if (p.type === 'reception') {
    const staff = s.staff;
    h += `<p>Coração administrativo da escola. ${staff.length ? '' : 'Contrate equipe em 👥 Equipe.'}</p>`;
    h += decorBlock();
    if (staff.length) h += '<div class="sect">Equipe</div>' + staff.map((st) => `<div class="kv"><span>${STAFF_ROLES[st.role].emoji} ${st.name}</span><b>${STAFF_ROLES[st.role].name}</b></div>`).join('');
    return h;
  }
  if (p.type === 'empty') {
    h += '<p>O que vamos construir aqui?</p><div class="grid2">';
    for (const [type, def] of Object.entries(ROOM_TYPES) as [RoomType, NonNullable<(typeof ROOM_TYPES)[RoomType]>][]) {
      const locked = def.skill && !g.has(def.skill);
      h += `<button class="build-opt ${locked ? 'locked' : ''}" data-act="build" data-arg="${i}:${type}" ${locked ? 'disabled' : ''}>
        <div class="bo-emoji">${def.emoji}</div><div class="bo-name">${def.name}</div><div class="bo-cost">${money(def.cost)}</div>
        <div class="bo-desc">${locked ? '🔒 ' + SKILL_MAP[def.skill!].name : def.desc}</div></button>`;
    }
    return h + '</div>';
  }
  if (p.type === 'classroom') {
    const used = g.roomSlots(i).size;
    h += `<div class="kv"><span>Ocupação semanal</span><b>${used}/66 horários</b></div>${bar((used / 66) * 100)}`;
    h += decorBlock();
    h += '<div class="sect">Instrumentos da sala (máx. 3)</div>';
    const insts = Object.keys(p.equip) as InstrumentId[];
    for (const inst of insts) {
      const t = p.equip[inst]!;
      const def = INSTRUMENTS[inst];
      const n = s.students.filter((x) => x.plot === i && x.instrument === inst).length;
      h += `<div class="equip">
        <div class="eq-l">${instChip(inst)}<div class="eq-t">${def.equipTiers[t].name} <span class="tier t${t}">${['Básico', 'Bom', 'Pro'][t]}</span></div><div class="muted small">${n} aluno(s) nesta sala</div></div>
        <div class="eq-r">${t < 2 ? `<button class="btn small accent" data-act="equip" data-arg="${i}:${inst}:${t + 1}">⬆ ${money(def.equipTiers[t + 1].cost - def.equipTiers[t].cost * 0.5)}</button>` : '<span class="muted small">Topo de linha</span>'}
        <button class="btn small ghost" data-act="unequip" data-arg="${i}:${inst}" title="Vender (30%)">✕</button></div></div>`;
    }
    if (insts.length < 3) {
      h += '<div class="sect">Comprar instrumento</div><div class="grid4">';
      for (const inst of INSTRUMENT_IDS) {
        if (p.equip[inst] !== undefined) continue;
        h += `<button class="buy-inst" data-act="equip" data-arg="${i}:${inst}:0" style="--ic:${INSTRUMENTS[inst].color}"><span>${INSTRUMENTS[inst].emoji}</span><b>${INSTRUMENTS[inst].name}</b><small>${money(INSTRUMENTS[inst].equipTiers[0].cost)}</small></button>`;
      }
      h += '</div>';
    }
    const ls = s.students.filter((x) => x.plot === i).sort((a, b) => a.day - b.day || a.hour - b.hour);
    if (ls.length) {
      h += `<details class="sect"><summary>Agenda da sala (${ls.length} alunos)</summary>${ls.slice(0, 60).map((x) => `<div class="kv small"><span>${DAY_NAMES[x.day]} ${x.hour}h · ${INSTRUMENTS[x.instrument].emoji} ${x.name}${x.kind === 'grp' ? ' <i>(turma)</i>' : ''}</span><b>${firstName(g.teacher(x.teacherId)?.name ?? '')}</b></div>`).join('')}</details>`;
    }
    return h;
  }
  if (p.type === 'rehearsal') {
    h += `<p>Bandas alugam à noite (17h–20h) e aos sábados. Equipamento e ambiente melhores = mais reservas.</p>
      <div class="kv"><span>Preço por hora</span><b>${money(s.prices.rehearsal)}</b></div>
      <input type="range" min="20" max="160" step="10" value="${s.prices.rehearsal}" data-input="price-rehearsal" class="wide">
      <div class="kv"><span>Receita na semana passada</span><b>${money(s.lastWeek?.ledger['Sala de ensaio'] ?? 0)}</b></div>`;
    return h + decorBlock();
  }
  h += `<p>${ROOM_TYPES[p.type]?.desc ?? ''}</p>`;
  return h + decorBlock();
}

// ---------------------------------------------------------------- Team panel
export function teacherCard(g: Game, t: Teacher, mode: 'team' | 'hire'): string {
  const main = INSTRUMENTS[t.instruments[0]];
  const load = mode === 'team' ? g.teacherLoad(t) : 0;
  const traits = t.traits.map((tr) => `<span class="trait ${TRAITS[tr].good ? 'good' : 'bad'}" title="${TRAITS[tr].desc}">${TRAITS[tr].name}</span>`).join('');
  const mood = t.morale >= 70 ? '😄' : t.morale >= 45 ? '🙂' : t.morale >= 25 ? '😕' : '😠';
  let actions = '';
  if (mode === 'hire') actions = `<button class="btn primary small wide" data-act="hire" data-arg="${t.id}">Contratar</button>`;
  else if (t.isPlayer) {
    actions = `<div class="small muted">Suas horas de aula por semana: <b>${t.hours}h</b></div>
      <input type="range" min="0" max="30" step="2" value="${t.hours}" data-input="player-hours" class="wide">`;
  } else {
    actions = `<div class="row gap">
      ${t.skill < 5 ? `<button class="btn small accent" data-act="train" data-arg="${t.id}" title="Curso de especialização">🎓 ${money(600 + t.skill * 400)}</button>` : ''}
      <button class="btn small" data-act="raise" data-arg="${t.id}" title="Aumento de R$3/aula">💸 +3</button>
      <button class="btn small ghost" data-act="fire" data-arg="${t.id}">Demitir</button></div>`;
  }
  return `<div class="tcard ${t.isPlayer ? 'me' : ''}" style="--tc:${main.color}">
    <div class="tc-top">
      <img class="tc-face pix" src="${portraitURL(t.look)}">
      <div class="tc-stars" title="Habilidade">${stars(t.skill)}</div>
      ${t.isPlayer ? '<div class="tc-badge">VOCÊ</div>' : ''}
      ${t.absent ? '<div class="tc-badge red">FALTOU</div>' : ''}
    </div>
    <div class="tc-name">${t.name}</div>
    <div class="tc-insts">${t.instruments.map((i) => `<span title="${INSTRUMENTS[i].name}" style="--ic:${INSTRUMENTS[i].color}" class="tc-i">${INSTRUMENTS[i].emoji}<b>${INSTRUMENTS[i].name}</b></span>`).join('')}</div>
    <div class="tc-stats">
      <div><small>Custo</small><b>${t.isPlayer ? '—' : money(t.wage) + '/aula'}</b></div>
      <div><small>Agenda</small><b>${mode === 'team' ? `${load}/${t.hours}h` : `${t.hours}h/sem`}</b></div>
      <div><small>Moral</small><b>${mood} ${Math.round(t.morale)}</b></div>
    </div>
    ${mode === 'team' ? bar((load / Math.max(1, t.hours)) * 100, load >= t.hours ? 'red' : '') : ''}
    <div class="tc-traits">${traits || '<span class="muted small">Sem traços marcantes</span>'}</div>
    <div class="tc-act">${actions}</div>
  </div>`;
}

function staffCard(g: Game, st: Staff, mode: 'team' | 'hire'): string {
  const r = STAFF_ROLES[st.role];
  const locked = !g.has(r.skill);
  return `<div class="tcard staff" style="--tc:#3fb7b0">
    <div class="tc-top"><img class="tc-face pix" src="${portraitURL(st.look)}"><div class="tc-stars">${stars(st.skill)}</div></div>
    <div class="tc-name">${st.name}</div>
    <div class="tc-role">${r.emoji} ${r.name}</div>
    <div class="small muted">${r.desc}</div>
    <div class="tc-stats"><div><small>Salário</small><b>${money(st.wage)}/sem</b></div></div>
    <div class="tc-act">${mode === 'hire'
      ? `<button class="btn primary small wide" data-act="hireStaff" data-arg="${st.id}" ${locked ? 'disabled' : ''}>${locked ? '🔒 ' + SKILL_MAP[r.skill].name : 'Contratar'}</button>`
      : `<button class="btn small ghost wide" data-act="fireStaff" data-arg="${st.id}">Dispensar</button>`}</div>
  </div>`;
}

export function teamPanel(g: Game): string {
  const s = g.s;
  let h = '<div class="ptitle">👥 Equipe</div>';
  if (s.chapter < 3) {
    h += '<p class="muted">Na salinha, você é o único professor. Quando a escola abrir, poderá contratar uma equipe!</p>';
    return h + `<div class="cards">${s.teachers.map((t) => teacherCard(g, t, 'team')).join('')}</div>`;
  }
  const staff = s.teachers.filter((t) => !t.isPlayer);
  const cost = 60 + staff.length * 40;
  h += `<div class="row between"><div class="sect">Professores (${staff.length})</div>
    <button class="btn small accent" data-act="meeting" ${s.meetingThisWeek || !staff.length ? 'disabled' : ''}>👥 Reunião de professores ${s.meetingThisWeek ? '(feita)' : money(cost)}</button></div>`;
  h += `<div class="cards">${s.teachers.map((t) => teacherCard(g, t, 'team')).join('')}</div>`;
  h += `<div class="row between"><div class="sect">Candidatos da semana</div><button class="btn small ghost" data-act="reroll">📢 Anunciar vaga (${money(150)})</button></div>`;
  h += `<div class="cards">${s.candidates.map((t) => teacherCard(g, t, 'hire')).join('') || '<p class="muted">Sem candidatos — novos chegam toda semana.</p>'}</div>`;
  h += `<div class="sect">Funcionários</div>`;
  if (!g.hasRoom('reception')) h += '<p class="muted">Construa a 🛎️ Recepção para contratar funcionários.</p>';
  h += `<div class="cards">${s.staff.map((st) => staffCard(g, st, 'team')).join('')}${s.staffCandidates.map((st) => staffCard(g, st, 'hire')).join('')}</div>`;
  return h;
}

export function meetingChoices(): string {
  return `<div class="grid3">
    <button class="build-opt" data-act="meet" data-arg="metodo"><div class="bo-emoji">📚</div><div class="bo-name">Alinhar metodologia</div><div class="bo-desc">Chance de professores subirem de nível.</div></button>
    <button class="build-opt" data-act="meet" data-arg="ouvir"><div class="bo-emoji">💬</div><div class="bo-name">Ouvir a equipe</div><div class="bo-desc">+15 de moral para todos.</div></button>
    <button class="build-opt" data-act="meet" data-arg="metas"><div class="bo-emoji">🎯</div><div class="bo-name">Metas de retenção</div><div class="bo-desc">+4 satisfação para todos os alunos.</div></button>
  </div>`;
}

// ---------------------------------------------------------------- Demand panel
export function demandPanel(g: Game): string {
  const s = g.s;
  const wl = g.weeklyLeads();
  let h = '<div class="ptitle">📊 Demanda & Alunos</div>';
  const alerts: string[] = [];
  const rows = INSTRUMENT_IDS.map((i) => {
    const cap = g.capacity(i);
    const st = s.stats.byInst[i];
    const lw = s.lastWeek?.byInst[i];
    const enrolled = s.students.filter((x) => x.instrument === i).length;
    const demand = wl[i];
    const lost = (lw?.lostCap ?? 0) + st.lostCap;
    let status = '';
    if (cap.free <= 0 && demand >= 1) {
      status = `<span class="tag red">${cap.reason}</span>`;
      if (demand >= 1.5) alerts.push(`Sua escola tem demanda de <b>${INSTRUMENTS[i].name}</b> (${demand.toFixed(1)}/sem) — ${cap.reason.toLowerCase()}!`);
    } else if (cap.free > 0) status = `<span class="tag green">${cap.free} vagas</span>`;
    else status = '<span class="tag">—</span>';
    return `<tr><td>${INSTRUMENTS[i].emoji} ${INSTRUMENTS[i].name}${s.trend?.instrument === i ? ' 🔥' : ''}</td>
      <td><div class="dbar"><div style="width:${Math.min(100, demand * 8)}%;background:${INSTRUMENTS[i].color}"></div><span>${demand.toFixed(1)}</span></div></td>
      <td>${enrolled}</td><td>${st.leads}</td><td>${lost ? `<b class="red">${lost}</b>` : '0'}</td><td>${status}</td></tr>`;
  }).join('');
  if (alerts.length) h += `<div class="alerts">${alerts.map((a) => `<div class="alert">⚠️ ${a}</div>`).join('')}</div>`;
  h += `<table class="dtable"><thead><tr><th>Instrumento</th><th>Procura/sem</th><th>Alunos</th><th>Interessados<br><small>esta sem.</small></th><th>Perdidos<br><small>sem vaga</small></th><th>Capacidade</th></tr></thead><tbody>${rows}</tbody></table>`;
  h += `<div class="kv"><span>📋 Lista de espera</span><b>${s.waitlist.length} pessoas</b></div>`;
  if (s.waitlist.length) h += `<div class="small muted">${Object.entries(s.waitlist.reduce((a, w) => { a[w.instrument] = (a[w.instrument] ?? 0) + 1; return a; }, {} as Record<string, number>)).map(([k, v]) => `${INSTRUMENTS[k as InstrumentId].emoji} ${v}`).join(' · ')} — entram sozinhos quando abrir vaga.</div>`;

  // pricing
  const fairI = g.fairPrice('ind'), fairG = g.fairPrice('grp');
  const ci = g.conversion({ pref: 'ind', sens: 0.6 }, 'ind', s.prices.ind);
  const cg = g.conversion({ pref: 'grp', sens: 0.6 }, 'grp', s.prices.grp);
  h += `<div class="sect">💲 Preços (mensalidade)</div>
    <div class="price-row"><div><b>Aula individual</b><div class="small muted">Preço justo hoje ≈ ${money(fairI)} · conversão média ~${Math.round(ci * 100)}%</div></div><b class="big">${money(s.prices.ind)}</b></div>
    <input type="range" min="100" max="800" step="10" value="${s.prices.ind}" data-input="price-ind" class="wide">`;
  if (g.has('turmas')) {
    h += `<div class="price-row"><div><b>Turma (até ${g.groupSize()} alunos)</b><div class="small muted">Preço justo ≈ ${money(fairG)} · conversão ~${Math.round(cg * 100)}%</div></div><b class="big">${money(s.prices.grp)}</b></div>
      <input type="range" min="60" max="500" step="10" value="${s.prices.grp}" data-input="price-grp" class="wide">`;
  } else h += '<p class="muted small">🔒 Desbloqueie <b>Aulas em Grupo</b> (Pedagogia) para vender turmas: ticket menor, volume maior.</p>';
  h += `<p class="small muted">Preço alto = menos matrículas, mas cada aluno rende mais — e espera aulas melhores. Preço baixo = volume. Novos preços valem para novas matrículas.</p>`;

  // students list
  const avg = s.students.length ? s.students.reduce((a, b) => a + b.sat, 0) / s.students.length : 0;
  h += `<div class="sect">🎓 Alunos (${s.students.length}) · satisfação média ${Math.round(avg)}%</div>`;
  const list = [...s.students].sort((a, b) => a.sat - b.sat).slice(0, 80);
  h += `<div class="slist">${list.map((x) => `<div class="srow"><img class="pix sface" src="${portraitURL(x.look)}"><div class="sinfo"><b>${x.name}</b><small>${INSTRUMENTS[x.instrument].emoji} ${x.kind === 'grp' ? 'Turma' : 'Individual'} · ${DAY_NAMES[x.day]} ${x.hour}h · ${money(x.fee)}/mês${x.unpaid ? ' · <b class="red">atrasado</b>' : ''}</small></div><div class="ssat">${bar(x.sat, x.sat < 40 ? 'red' : x.sat > 75 ? 'green' : '')}</div></div>`).join('')}</div>`;
  if (s.contracts.length) h += `<div class="sect">🏫 Turmas fechadas</div>${s.contracts.map((c) => `<div class="kv"><span>${c.name} · ${INSTRUMENTS[c.instrument].emoji} ${c.size} pessoas · ${DAY_NAMES[c.day]} ${c.hour}h</span><b>${money(c.weekly)}/sem · ${c.weeksLeft} sem.</b></div>`).join('')}`;
  return h;
}

// ---------------------------------------------------------------- Marketing panel
export function marketingPanel(g: Game): string {
  const s = g.s;
  let h = '<div class="ptitle">📣 Marketing & Mercado</div>';
  h += `<div class="yt"><div class="yt-l">▶</div><div><b>Seu canal</b><div class="small">${s.youtube.views.toLocaleString('pt-BR')} visualizações · ${s.youtube.subs.toLocaleString('pt-BR')} inscritos</div></div>
    <button class="btn accent" data-act="video">🎬 Gravar vídeo</button></div>`;
  h += '<div class="sect">Campanhas</div><div class="grid2">';
  for (const [id, c] of Object.entries(CAMPAIGNS) as [CampaignId, (typeof CAMPAIGNS)[CampaignId]][]) {
    const locked = c.skill && !g.has(c.skill);
    const running = s.campaigns.find((x) => x.id === id);
    h += `<div class="camp ${locked ? 'locked' : ''} ${running ? 'running' : ''}">
      <div class="bo-emoji">${c.emoji}</div><div class="bo-name">${c.name}</div><div class="bo-desc">${c.desc}</div>
      ${running ? `<div class="tag green">No ar · ${running.weeksLeft} sem.${running.instrument ? ' · ' + INSTRUMENTS[running.instrument].emoji : ''}</div>`
        : locked ? `<div class="tag">🔒 ${SKILL_MAP[c.skill!].name}</div>`
        : c.focused ? `<select data-input="focus-inst">${INSTRUMENT_IDS.map((i) => `<option value="${i}">${INSTRUMENTS[i].emoji} ${INSTRUMENTS[i].name}</option>`).join('')}</select><button class="btn small primary" data-act="campaign" data-arg="${id}">${money(c.cost)}</button>`
        : `<button class="btn small primary" data-act="campaign" data-arg="${id}">${money(c.cost)}</button>`}
    </div>`;
  }
  h += '</div>';
  // events
  h += '<div class="sect">🎭 Eventos</div>';
  if (g.has('recital')) {
    const cost = g.hasRoom('auditorium') ? 600 : 1500;
    h += s.recital ? '<div class="tag green">Recital marcado para sábado 15h</div>'
      : `<button class="btn accent wide" data-act="recital">🎭 Organizar recital no sábado — ${money(cost)}${g.hasRoom('auditorium') ? ' (no seu auditório)' : ' (salão alugado)'}</button>`;
  } else h += '<p class="muted small">🔒 Desbloqueie <b>Recitais</b> (Palco) na árvore.</p>';
  // market
  const share = g.marketShare();
  h += `<div class="sect">🏙️ Participação no mercado</div><div class="share">${share.map((x) => `<div style="width:${x.share * 100}%;background:${x.color}" title="${x.name} ${Math.round(x.share * 100)}%"></div>`).join('')}</div>`;
  h += share.map((x) => `<div class="kv"><span><i class="dot" style="background:${x.color}"></i>${x.name}${x.me ? ' (você)' : ''}</span><b>${Math.round(x.share * 100)}%</b></div>`).join('');
  h += '<div class="sect">⚔️ Escolas rivais</div>';
  for (const r of s.rivals) {
    h += `<div class="rival ${r.alive ? '' : 'dead'}" style="--rc:${r.color}"><div class="rv-h"><b>${r.name}</b>${!r.alive ? '<span class="tag">Fechou</span>' : r.promo > 0 ? '<span class="tag red">PROMOÇÃO</span>' : ''}</div>
      <div class="rv-s"><span>💲 ${money(r.price)}/mês</span><span>⭐ Qualidade ${Math.round(r.quality)}</span><span>📢 Mkt ×${r.marketing.toFixed(1)}</span></div>
      <div class="small muted">${({ premium: 'Estratégia: premium (poucos alunos, ticket alto)', volume: 'Estratégia: volume (turmas cheias, preço baixo)', balanced: 'Estratégia: equilibrada' } as Record<string, string>)[r.style]}</div></div>`;
  }
  return h;
}

// ---------------------------------------------------------------- Finance panel
export function financePanel(g: Game): string {
  const s = g.s;
  const fc = g.forecast();
  let h = '<div class="ptitle">💰 Finanças</div>';
  if (s.investor) {
    const inv = s.investor;
    h += `<div class="inv-card"><img class="pix inv-face" src="${portraitURL(INVESTOR_LOOK)}"><div class="inv-r"><b>Augusto Ferraz</b> <small>investidor · semana ${inv.week}</small>
      <div class="kv"><span>Confiança</span><b>${Math.round(inv.trust)}%</b></div>${bar(inv.trust, inv.trust < 30 ? 'red' : inv.trust > 70 ? 'green' : '')}
      <div class="kv"><span>${s.cash >= inv.goalCash ? '✅' : '❌'} Caixa ≥ ${money(inv.goalCash)}</span><b>${money(s.cash)}</b></div>
      <div class="kv"><span>${fc.profit >= inv.goalProfit ? '✅' : '❌'} Lucro previsto ≥ ${money(inv.goalProfit)}</span><b>${money(fc.profit)}</b></div>
      <div class="small muted">Revisão todo sábado às 20h. Se a confiança zerar, ele retira o investimento (fim de jogo).</div></div></div>`;
  }
  const P = fc.parts;
  h += `<div class="sect">📈 Previsão semanal (com a agenda atual)</div>
    <div class="kv"><span>Mensalidades</span><b class="green">${money(P.tuition)}</b></div>
    ${P.contracts ? `<div class="kv"><span>Turmas fechadas</span><b class="green">${money(P.contracts)}</b></div>` : ''}
    ${P.rehearsal ? `<div class="kv"><span>Sala de ensaio (média)</span><b class="green">${money(P.rehearsal)}</b></div>` : ''}
    ${P.studio ? `<div class="kv"><span>Estúdio (média)</span><b class="green">${money(P.studio)}</b></div>` : ''}
    <div class="kv"><span>Professores</span><b class="red">-${money(P.teacherCost)}</b></div>
    <div class="kv"><span>Aluguel</span><b class="red">-${money(P.rent)}</b></div>
    ${P.staff ? `<div class="kv"><span>Funcionários</span><b class="red">-${money(P.staff)}</b></div>` : ''}
    ${P.mkt ? `<div class="kv"><span>Marketing (média)</span><b class="red">-${money(P.mkt)}</b></div>` : ''}
    <div class="kv total"><span>Lucro previsto</span><b class="${fc.profit >= 0 ? 'green' : 'red'}">${money(fc.profit)}</b></div>`;
  const led = Object.entries(s.stats.ledger).sort((a, b) => b[1] - a[1]);
  h += `<div class="sect">🧾 Esta semana até agora</div>${led.map(([k, v]) => `<div class="kv small"><span>${k}</span><b class="${v >= 0 ? 'green' : 'red'}">${money(v)}</b></div>`).join('') || '<p class="muted small">Nada ainda.</p>'}`;
  if (s.history.length) {
    const max = Math.max(1, ...s.history.map((x) => Math.abs(x.profit)));
    h += `<div class="sect">📊 Lucro por semana</div><div class="hist">${s.history.slice(-12).map((x) => `<div class="hb" title="Semana ${x.week}: ${money(x.profit)}"><div class="${x.profit >= 0 ? 'pos' : 'neg'}" style="height:${(Math.abs(x.profit) / max) * 100}%"></div><small>${x.week}</small></div>`).join('')}</div>`;
  }
  return h;
}

// ---------------------------------------------------------------- Events panel
export function eventsPanel(g: Game): string {
  const s = g.s;
  let h = '<div class="ptitle">❗ Situações</div>';
  if (!s.events.length) h += '<p class="muted">Tudo tranquilo por aqui. 🎶</p>';
  for (const ev of s.events) {
    const def = EVENT_DEFS[ev.defId];
    if (!def) continue;
    const left = ev.expires - s.dayIndex;
    h += `<div class="ev-card" data-act="openEvent" data-arg="${ev.uid}"><div class="ev-e">${def.emoji}</div><div><b>${def.title(g, ev)}</b><div class="small muted">${left <= 0 ? 'Resolva hoje!' : `Expira em ${left} dia(s)`}</div></div><span class="btn small">Resolver</span></div>`;
  }
  h += '<div class="sect">📰 Notícias</div>';
  h += s.news.slice(0, 25).map((n) => `<div class="news ${n.kind}">${n.text}</div>`).join('') || '<p class="muted small">Sem notícias.</p>';
  return h;
}

export { BASE_PRICE };
