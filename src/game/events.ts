// Random situations the player resolves (or delegates to the secretary).
import type { Game } from './game';
import type { PendingEvent, Student, Teacher } from './state';
import { firstName, randomName } from './state';
import { INSTRUMENTS, INSTRUMENT_IDS, InstrumentId } from '../data/instruments';
import { randomLook } from '../art/characters';

export interface EventOption {
  label: string;
  hint?: string;
  apply: (g: Game, ev: PendingEvent) => string;
  disabled?: (g: Game, ev: PendingEvent) => string | false;
}
export interface EventDef {
  id: string;
  category: 'admin' | 'professor' | 'aluno' | 'oportunidade' | 'mercado';
  emoji: string;
  title: (g: Game, ev: PendingEvent) => string;
  text: (g: Game, ev: PendingEvent) => string;
  options: EventOption[];
  auto?: number; // option the secretary picks
  ignore?: number; // option applied when it expires
  urgent?: boolean;
  weight?: number;
  when?: (g: Game) => any | null; // returns data if eligible
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const st = (g: Game, ev: PendingEvent): Student | undefined => g.s.students.find((x) => x.id === ev.data.studentId);
const tc = (g: Game, ev: PendingEvent): Teacher | undefined => g.s.teachers.find((x) => x.id === ev.data.teacherId);
const randStudent = (g: Game) => (g.s.students.length ? { studentId: pick(g.s.students).id } : null);
const randTeacher = (g: Game) => {
  const l = g.s.teachers.filter((t) => !t.isPlayer);
  return l.length ? { teacherId: pick(l).id } : null;
};
const fmt = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR');

export const EVENT_DEFS: Record<string, EventDef> = {
  falta: {
    id: 'falta', category: 'professor', emoji: '🤒', urgent: true, ignore: 2,
    title: (g, ev) => `${firstName(tc(g, ev)?.name ?? 'Professor')} faltou hoje!`,
    text: (g, ev) => {
      const t = tc(g, ev);
      const n = t ? g.s.students.filter((x) => x.teacherId === t.id && x.day === g.s.day).length : 0;
      return `${t?.name ?? 'O professor'} mandou mensagem: está doente. São ${n} aluno(s) na agenda de hoje. O que fazer?`;
    },
    options: [
      { label: '🎸 Eu assumo as aulas', hint: 'Você dá as aulas dele (minigames). Se não der tempo, vira aula no automático.',
        apply: (g, ev) => { const t = tc(g, ev); if (t) t.cover = 'player'; return 'Você vai assumir a agenda dele hoje.'; },
        disabled: (g, ev) => { const t = tc(g, ev); if (!t) return false; return t.instruments.some((i) => g.s.playerInstruments.includes(i)) ? false : 'Você não toca os instrumentos dele'; } },
      { label: '📞 Chamar substituto', hint: 'Custa 50% a mais por aula e a qualidade cai um pouco.',
        apply: (g, ev) => { const t = tc(g, ev); if (t) t.cover = 'sub'; return 'Um substituto vai cobrir.'; } },
      { label: '❌ Cancelar as aulas de hoje', hint: 'Alunos ficam chateados (-12 satisfação).',
        apply: (g, ev) => {
          const t = tc(g, ev);
          if (t) { t.cover = 'cancel'; for (const s of g.s.students) if (s.teacherId === t.id && s.day === g.s.day) s.sat = Math.max(0, s.sat - 12); }
          return 'Aulas canceladas. Alunos insatisfeitos.';
        } },
    ],
  },
  desconto: {
    id: 'desconto', category: 'admin', emoji: '💸', auto: 1, ignore: 2, weight: 3,
    when: randStudent,
    title: (g, ev) => `${firstName(st(g, ev)?.name ?? 'Aluno')} pediu desconto`,
    text: (g, ev) => `${st(g, ev)?.name} está apertado(a) este mês e pediu 20% de desconto na mensalidade (${fmt(st(g, ev)?.fee ?? 0)}).`,
    options: [
      { label: 'Dar 20%', apply: (g, ev) => { const s = st(g, ev); if (s) { s.fee = Math.round(s.fee * 0.8); s.sat = Math.min(100, s.sat + 15); } return 'Aluno muito grato (+15 satisfação).'; } },
      { label: 'Dar 10%', apply: (g, ev) => { const s = st(g, ev); if (s) { s.fee = Math.round(s.fee * 0.9); s.sat = Math.min(100, s.sat + 6); } return 'Meio-termo aceito.'; } },
      { label: 'Negar', apply: (g, ev) => { const s = st(g, ev); if (s) s.sat -= 12; return 'Aluno ficou chateado (-12).'; } },
    ],
  },
  inadimplencia: {
    id: 'inadimplencia', category: 'admin', emoji: '🧾', auto: 0, ignore: 2,
    title: (g, ev) => `Mensalidade atrasada: ${firstName(st(g, ev)?.name ?? '')}`,
    text: (g, ev) => `${st(g, ev)?.name} não pagou e continua vindo às aulas. Enquanto isso, as aulas dele(a) não geram receita.`,
    options: [
      { label: 'Cobrar com jeitinho', hint: '70% de chance de pagar.', apply: (g, ev) => { const s = st(g, ev); if (!s) return 'Resolvido.'; if (Math.random() < 0.7) { s.unpaid = false; g.addCash(s.fee / 4, 'Mensalidades'); return 'Pagou! 💰'; } s.sat -= 5; return 'Prometeu pagar semana que vem.'; } },
      { label: 'Perdoar a dívida', apply: (g, ev) => { const s = st(g, ev); if (s) { s.unpaid = false; s.sat = Math.min(100, s.sat + 10); } return 'Gesto bonito (+10 satisfação).'; } },
      { label: 'Suspender aulas até pagar', apply: (g, ev) => { const s = st(g, ev); if (!s) return ''; if (Math.random() < 0.5) { s.unpaid = false; g.addCash(s.fee / 4, 'Mensalidades'); return 'Pagou na hora.'; } g.removeStudent(s, `${firstName(s.name)} saiu após suspensão.`); return 'Aluno saiu da escola.'; } },
    ],
  },
  renovacao: {
    id: 'renovacao', category: 'admin', emoji: '📝', auto: 1, ignore: 2,
    title: (g, ev) => `Renovação: ${firstName(st(g, ev)?.name ?? '')}`,
    text: (g, ev) => { const s = st(g, ev); return `O contrato de ${s?.name} (${s ? INSTRUMENTS[s.instrument].name : ''}) venceu. Satisfação: ${Math.round(s?.sat ?? 0)}%. Ele(a) está em dúvida.`; },
    options: [
      { label: 'Oferecer 10% para renovar', hint: '85% de chance.', apply: (g, ev) => { const s = st(g, ev); if (!s) return ''; if (Math.random() < 0.85) { s.fee = Math.round(s.fee * 0.9); s.weeksLeft = g.has('semestral') ? 24 : 12; return 'Renovou com desconto!'; } g.removeStudent(s, `${firstName(s.name)} não renovou.`); return 'Não quis renovar.'; } },
      { label: 'Conversar sobre a evolução dele(a)', hint: 'Chance depende da satisfação.', apply: (g, ev) => { const s = st(g, ev); if (!s) return ''; if (Math.random() < Math.min(0.95, (s.sat - 10) / 60)) { s.weeksLeft = g.has('semestral') ? 24 : 12; s.sat = Math.min(100, s.sat + 5); return 'Renovou animado(a)!'; } g.removeStudent(s, `${firstName(s.name)} não renovou.`); return 'Decidiu parar.'; } },
      { label: 'Deixar decidir sozinho(a)', apply: (g, ev) => { const s = st(g, ev); if (!s) return ''; if (Math.random() < Math.max(0.1, (s.sat - 30) / 70)) { s.weeksLeft = 12; return 'Renovou.'; } g.removeStudent(s, `${firstName(s.name)} não renovou.`); return 'Não renovou.'; } },
    ],
  },
  horario: {
    id: 'horario', category: 'admin', emoji: '🗓️', auto: 0, ignore: 1, weight: 2,
    when: randStudent,
    title: (g, ev) => `${firstName(st(g, ev)?.name ?? '')} precisa trocar de horário`,
    text: (g, ev) => `${st(g, ev)?.name} mudou de emprego/escola e não consegue mais vir no horário atual.`,
    options: [
      { label: 'Reorganizar a agenda', apply: (g, ev) => {
        const s = st(g, ev); if (!s) return '';
        g.s.students = g.s.students.filter((x) => x !== s);
        const slot = g.findSlot(s.instrument, s.kind);
        g.s.students.push(s);
        if (slot.ok && !slot.join) { Object.assign(s, { teacherId: slot.teacherId, plot: slot.plot, day: slot.day, hour: slot.hour }); s.sat = Math.min(100, s.sat + 5); return 'Novo horário encaixado!'; }
        s.sat -= 6; return 'Não havia horário livre… aluno ficou chateado.';
      } },
      { label: 'Não dá para mudar', apply: (g, ev) => { const s = st(g, ev); if (s) { s.sat -= 15; if (Math.random() < 0.3) { g.removeStudent(s, `${firstName(s.name)} saiu por causa do horário.`); return 'Aluno saiu.'; } } return 'Aluno insatisfeito.'; } },
    ],
  },
  aumento: {
    id: 'aumento', category: 'professor', emoji: '💰', ignore: 2, weight: 2,
    when: (g) => { const l = g.s.teachers.filter((t) => !t.isPlayer && t.weeks >= 3 && !t.raiseAsked); if (!l.length) return null; const t = pick(l); t.raiseAsked = true; return { teacherId: t.id }; },
    title: (g, ev) => `${firstName(tc(g, ev)?.name ?? '')} pediu aumento`,
    text: (g, ev) => `${tc(g, ev)?.name} (R$ ${tc(g, ev)?.wage}/aula) acha que merece R$ 6 a mais por aula.`,
    options: [
      { label: 'Aceitar (+R$6/aula)', apply: (g, ev) => { const t = tc(g, ev); if (t) { t.wage += 6; t.morale = Math.min(100, t.morale + 20); } return 'Professor motivado (+20 moral).'; } },
      { label: 'Contraproposta (+R$3)', apply: (g, ev) => { const t = tc(g, ev); if (!t) return ''; t.wage += 3; if (Math.random() < 0.6) { t.morale = Math.min(100, t.morale + 8); return 'Aceitou a contraproposta.'; } t.morale -= 10; return 'Aceitou, mas ficou chateado.'; } },
      { label: 'Negar', apply: (g, ev) => { const t = tc(g, ev); if (t) t.morale -= 22; return 'Moral do professor caiu bastante.'; } },
    ],
  },
  proposta_rival: {
    id: 'proposta_rival', category: 'professor', emoji: '🕵️', ignore: 2, urgent: true,
    title: (g, ev) => `${ev.data.rival} quer levar ${firstName(tc(g, ev)?.name ?? '')}!`,
    text: (g, ev) => `${tc(g, ev)?.name} recebeu uma proposta da ${ev.data.rival} e está balançado(a).`,
    options: [
      { label: 'Cobrir a oferta (+R$8/aula)', apply: (g, ev) => { const t = tc(g, ev); if (t) { t.wage += 8; t.morale = Math.min(100, t.morale + 25); } return 'Ficou! E motivado.'; } },
      { label: 'Apelar pela amizade', apply: (g, ev) => { const t = tc(g, ev); if (!t) return ''; if (Math.random() < t.morale / 60 + 0.2) { t.morale += 10; return 'Ficou pela equipe ❤️'; } g.fireTeacher(t); return 'Foi embora para o rival.'; } },
      { label: 'Deixar ir', apply: (g, ev) => { const t = tc(g, ev); if (t) g.fireTeacher(t); return 'Professor saiu.'; } },
    ],
  },
  conflito: {
    id: 'conflito', category: 'aluno', emoji: '😤', ignore: 2, weight: 2,
    when: (g) => { const s = g.s.students.filter((x) => { const t = g.teacher(x.teacherId); return t && !t.isPlayer; }); if (!s.length) return null; const a = pick(s); return { studentId: a.id, teacherId: a.teacherId }; },
    title: (g, ev) => `Reclamação sobre ${firstName(tc(g, ev)?.name ?? '')}`,
    text: (g, ev) => `A mãe de ${firstName(st(g, ev)?.name ?? '')} reclamou que o professor ${firstName(tc(g, ev)?.name ?? '')} chega atrasado e não passa exercícios.`,
    options: [
      { label: 'Conversar com o professor', apply: (g, ev) => { const t = tc(g, ev); if (t) { t.morale -= 5; for (const s of g.s.students) if (s.teacherId === t.id) s.sat = Math.min(100, s.sat + 6); } return 'Professor ajustou a postura.'; } },
      { label: 'Dar uma aula bônus ao aluno', hint: 'Custa R$ 60.', apply: (g, ev) => { g.addCash(-60, 'Bonificações'); const s = st(g, ev); if (s) s.sat = Math.min(100, s.sat + 15); return 'Família satisfeita.'; } },
      { label: 'Ignorar', apply: (g, ev) => { const s = st(g, ev); if (s) s.sat -= 14; return 'A família ficou insatisfeita.'; } },
    ],
  },
  curso: {
    id: 'curso', category: 'professor', emoji: '🎓', ignore: 2, weight: 1,
    when: (g) => { const l = g.s.teachers.filter((t) => !t.isPlayer && t.skill < 5); return l.length ? { teacherId: pick(l).id } : null; },
    title: (g, ev) => `${firstName(tc(g, ev)?.name ?? '')} quer fazer um curso`,
    text: (g, ev) => `Um workshop com um músico famoso. ${tc(g, ev)?.name} pede ajuda com R$ 800.`,
    options: [
      { label: 'Pagar o curso (R$ 800)', apply: (g, ev) => { const t = tc(g, ev); g.addCash(-800, 'Cursos'); if (t) { t.skill = Math.min(5, t.skill + 1); t.morale = Math.min(100, t.morale + 10); } return 'Professor evoluiu +1★!'; } },
      { label: 'Pagar metade (R$ 400)', apply: (g, ev) => { const t = tc(g, ev); g.addCash(-400, 'Cursos'); if (t && Math.random() < 0.5) { t.skill = Math.min(5, t.skill + 1); return 'Fez o curso e evoluiu!'; } return 'Não conseguiu completar o valor.'; } },
      { label: 'Agora não', apply: (g, ev) => { const t = tc(g, ev); if (t) t.morale -= 8; return 'Ficou desapontado.'; } },
    ],
  },
  prodigio: {
    id: 'prodigio', category: 'aluno', emoji: '🌟', ignore: 2, weight: 1,
    when: (g) => { const l = g.s.students.filter((s) => s.sat > 70); return l.length ? { studentId: pick(l).id } : null; },
    title: (g, ev) => `${firstName(st(g, ev)?.name ?? '')} é um prodígio!`,
    text: (g, ev) => `Tem um concurso estadual de ${INSTRUMENTS[st(g, ev)?.instrument ?? 'violao'].name} no mês que vem. Vencer daria muita visibilidade.`,
    options: [
      { label: 'Aulas extras de preparação (R$ 300)', hint: '65% de chance de vencer.', apply: (g, ev) => { g.addCash(-300, 'Eventos'); if (Math.random() < 0.65) { g.addXP(120); g.s.youtube.boostWeeks += 2; g.news(`🏆 ${firstName(st(g, ev)?.name ?? '')} venceu o concurso estadual!`, 'good'); return 'VENCEU! 🏆 Reputação e procura em alta.'; } return 'Ficou em 3º lugar. Mesmo assim, orgulho!'; } },
      { label: 'Inscrever sem preparação', hint: '30% de chance.', apply: (g) => { if (Math.random() < 0.3) { g.addXP(120); g.s.youtube.boostWeeks += 2; return 'VENCEU mesmo assim! 🏆'; } return 'Não passou da primeira fase.'; } },
      { label: 'Não participar', apply: () => 'Fica para a próxima.' },
    ],
  },
  grupo_colegio: {
    id: 'grupo_colegio', category: 'oportunidade', emoji: '🏫', ignore: 2, weight: 1,
    when: (g) => {
      if (g.s.chapter < 3) return null;
      if (!g.has('parcerias') && !g.has('corporativo') && Math.random() < 0.6) return null;
      const corp = g.has('corporativo') && Math.random() < 0.5;
      const inst: InstrumentId = corp ? pick(['canto', 'violao', 'piano'] as InstrumentId[]) : pick(['violao', 'canto', 'ukulele', 'piano'] as InstrumentId[]);
      const size = corp ? 6 : 8 + Math.floor(Math.random() * 6);
      const weekly = Math.round((corp ? 520 + Math.random() * 300 : 280 + size * 20) / 10) * 10;
      const name = corp ? pick(['TechNova', 'Banco Horizonte', 'Construtora Pilar', 'Hospital Vida']) : 'Colégio ' + pick(['São Bento', 'Santa Clara', 'Objetivo Norte', 'Monteiro Lobato']);
      return { inst, size, weekly, name, corp };
    },
    title: (g, ev) => `${ev.data.name} quer uma turma fechada`,
    text: (g, ev) => `${ev.data.corp ? 'Aulas corporativas' : 'Musicalização'} de ${INSTRUMENTS[ev.data.inst as InstrumentId].name} para ${ev.data.size} pessoas, 1h por semana, por 10 semanas. Pagam ${fmt(ev.data.weekly)}/semana. Precisa de professor e sala livres.`,
    options: [
      { label: 'Aceitar', apply: (g, ev) => {
        const slot = g.findSlot(ev.data.inst, 'ind');
        if (!slot.ok) return 'Sem professor/sala disponível… proposta perdida.';
        g.s.contracts.push({ id: g.id(), name: ev.data.name, instrument: ev.data.inst, weekly: ev.data.weekly, teacherId: slot.teacherId, plot: slot.plot, day: slot.day, hour: slot.hour, weeksLeft: 10, size: ev.data.size });
        g.addXP(30);
        return `Contrato fechado! ${fmt(ev.data.weekly)}/semana.`;
      } },
      { label: 'Negociar +20%', hint: '50% de chance de desistirem.', apply: (g, ev) => {
        if (Math.random() < 0.5) return 'Eles desistiram.';
        const slot = g.findSlot(ev.data.inst, 'ind');
        if (!slot.ok) return 'Aceitaram, mas não havia horário livre!';
        const weekly = Math.round(ev.data.weekly * 1.2);
        g.s.contracts.push({ id: g.id(), name: ev.data.name, instrument: ev.data.inst, weekly, teacherId: slot.teacherId, plot: slot.plot, day: slot.day, hour: slot.hour, weeksLeft: 10, size: ev.data.size });
        return `Fechado por ${fmt(weekly)}/semana!`;
      } },
      { label: 'Recusar', apply: () => 'Proposta recusada.' },
    ],
  },
  grupo_amigos: {
    id: 'grupo_amigos', category: 'oportunidade', emoji: '👯', ignore: 1, weight: 1,
    when: (g) => (g.has('turmas') ? { inst: pick(INSTRUMENT_IDS) } : null),
    title: (g, ev) => `4 amigos querem turma de ${INSTRUMENTS[ev.data.inst as InstrumentId].name}`,
    text: (g, ev) => `Um grupo de amigos quer começar junto, numa turma. Preço de turma atual: ${fmt(g.s.prices.grp)}/mês cada.`,
    options: [
      { label: 'Fechar com 10% de desconto', apply: (g, ev) => {
        let n = 0;
        for (let k = 0; k < 4; k++) if (g.enroll({ name: randomName(), look: randomLook(), instrument: ev.data.inst, sens: 0.5 }, 'grp', g.s.prices.grp * 0.9, true)) n++;
        return n ? `${n} matrículas na turma!` : 'Sem capacidade para essa turma 😕';
      } },
      { label: 'Preço cheio', hint: '60% de chance.', apply: (g, ev) => {
        if (Math.random() > 0.6) return 'Acharam caro e foram para outra escola.';
        let n = 0;
        for (let k = 0; k < 4; k++) if (g.enroll({ name: randomName(), look: randomLook(), instrument: ev.data.inst, sens: 0.5 }, 'grp', g.s.prices.grp, true)) n++;
        return n ? `${n} matrículas!` : 'Sem capacidade 😕';
      } },
      { label: 'Recusar', apply: () => 'Recusado.' },
    ],
  },
  vizinho: {
    id: 'vizinho', category: 'mercado', emoji: '🔊', ignore: 2, weight: 2,
    when: (g) => (!g.has('acustica') && g.s.plots.some((p) => p.owned && (p.equip.bateria !== undefined || p.type === 'rehearsal' || p.type === 'booth')) ? {} : null),
    title: () => 'Vizinho reclamou do barulho!',
    text: () => 'O vizinho do lado ameaça chamar a fiscalização por causa da bateria. (Tratamento Acústico na árvore resolve isso de vez.)',
    options: [
      { label: 'Espuma acústica emergencial (R$ 600)', apply: (g) => { g.addCash(-600, 'Manutenção'); return 'Barulho reduzido.'; } },
      { label: 'Pedir desculpas com um bolo', hint: '50% de chance de multa.', apply: (g) => { if (Math.random() < 0.5) { g.addCash(-900, 'Multas'); return 'Veio multa de R$ 900 😬'; } return 'Vizinho aceitou o bolo 🍰'; } },
      { label: 'Ignorar', apply: (g) => { g.addCash(-1200, 'Multas'); return 'Multa de R$ 1.200!'; } },
    ],
  },
  quebrou: {
    id: 'quebrou', category: 'mercado', emoji: '🔧', ignore: 1, weight: 2,
    when: (g) => {
      const opts: { plot: number; inst: InstrumentId }[] = [];
      for (const p of g.s.plots) if (p.owned) for (const i of Object.keys(p.equip) as InstrumentId[]) opts.push({ plot: p.index, inst: i });
      return opts.length ? pick(opts) : null;
    },
    title: (g, ev) => `${INSTRUMENTS[ev.data.inst as InstrumentId].emoji} Instrumento quebrou`,
    text: (g, ev) => { const p = g.s.plots[ev.data.plot]; const t = p.equip[ev.data.inst as InstrumentId] ?? 0; return `${INSTRUMENTS[ev.data.inst as InstrumentId].equipTiers[t].name} da sala ${ev.data.plot + 1} precisa de reparo.`; },
    options: [
      { label: 'Consertar no luthier', apply: (g, ev) => { const p = g.s.plots[ev.data.plot]; const t = p.equip[ev.data.inst as InstrumentId] ?? 0; g.addCash(-Math.round(INSTRUMENTS[ev.data.inst as InstrumentId].equipTiers[t].cost * 0.2), 'Manutenção'); return 'Novinho de novo.'; } },
      { label: 'Improvisar', hint: 'Alunos desse instrumento -10 satisfação.', apply: (g, ev) => { for (const s of g.s.students) if (s.plot === ev.data.plot && s.instrument === ev.data.inst) s.sat -= 10; return 'Aulas seguiram, meio capengas.'; } },
    ],
  },
  influencer: {
    id: 'influencer', category: 'oportunidade', emoji: '📸', ignore: 1, weight: 1,
    when: (g) => (g.s.chapter >= 2 ? {} : null),
    title: () => 'Influencer quer parceria',
    text: () => 'Uma influencer local (40 mil seguidores) quer uma aula grátis em troca de um post.',
    options: [
      { label: 'Aceitar', apply: (g) => { g.s.youtube.boostWeeks = Math.max(g.s.youtube.boostWeeks, 1); g.s.youtube.subs += 150; g.addXP(20); return 'Post bombou! +procura esta semana.'; } },
      { label: 'Recusar', apply: () => 'Talvez outra hora.' },
    ],
  },
  viral: {
    id: 'viral', category: 'aluno', emoji: '🔥', ignore: 1, weight: 1,
    when: (g) => { const l = g.s.students.filter((s) => s.sat > 75); return l.length ? { studentId: pick(l).id } : null; },
    title: (g, ev) => `Vídeo de ${firstName(st(g, ev)?.name ?? '')} viralizou!`,
    text: (g, ev) => `${st(g, ev)?.name} postou um vídeo tocando e marcou a escola. Já são 30 mil views!`,
    options: [
      { label: 'Repostar com a marca da escola', apply: (g) => { g.s.youtube.subs += 300; g.s.youtube.boostWeeks = Math.max(1, g.s.youtube.boostWeeks); return '+300 inscritos e procura em alta.'; } },
      { label: 'Dar um mimo ao aluno', apply: (g, ev) => { const s = st(g, ev); if (s) s.sat = Math.min(100, s.sat + 15); return 'Aluno radiante.'; } },
    ],
  },
  pais: {
    id: 'pais', category: 'aluno', emoji: '👨‍👩‍👧', ignore: 1, weight: 1,
    when: (g) => (g.s.students.length >= 4 ? {} : null),
    title: () => 'Pais pedem uma apresentação',
    text: () => 'Alguns pais querem ver o progresso dos filhos numa mini-apresentação na sala.',
    options: [
      { label: 'Fazer mini-apresentação (R$ 200)', apply: (g) => { g.addCash(-200, 'Eventos'); for (const s of g.s.students) s.sat = Math.min(100, s.sat + 6); g.addXP(20); return 'Todos amaram (+6 satisfação geral).'; } },
      { label: 'Agora não', apply: (g) => { for (const s of g.s.students) s.sat -= 2; return 'Alguns pais ficaram desapontados.'; } },
    ],
  },
  trend: {
    id: 'trend', category: 'mercado', emoji: '📺', ignore: 0, weight: 1,
    when: (g) => (g.s.trend ? null : { inst: pick(INSTRUMENT_IDS) }),
    title: (g, ev) => `${INSTRUMENTS[ev.data.inst as InstrumentId].name} está na moda!`,
    text: (g, ev) => `Uma série de TV fez a procura por ${INSTRUMENTS[ev.data.inst as InstrumentId].name} dobrar nas próximas 3 semanas. Tem professor e sala para isso?`,
    options: [
      { label: 'Entendido!', apply: (g, ev) => { g.s.trend = { instrument: ev.data.inst, weeks: 3 }; return 'Procura em alta.'; } },
    ],
  },
  aluguel: {
    id: 'aluguel', category: 'mercado', emoji: '🏢', ignore: 1, urgent: true, weight: 4,
    when: (g) => (g.s.chapter === 3 && g.s.building === 1 && (g.s.investor?.week ?? 0) >= 6 && !g.s.flags.rentEvent ? ((g.s.flags.rentEvent = 1), {}) : null),
    title: () => 'O dono do prédio quer reajustar o aluguel!',
    text: () => 'O proprietário avisou: o aluguel vai subir 70% no mês que vem. Um corretor ofereceu um prédio novo e moderno, num terreno muito maior (dá para crescer o dobro e fazer salas mais altas), com aluguel 10% mais barato. A mudança é feita por uma empresa: todas as salas, instrumentos e móveis são remontados do mesmo jeito lá.',
    options: [
      { label: '🚚 Mudar para o prédio novo (R$ 6.000)', hint: 'Terreno maior, fachada moderna, muito mais espaço para crescer.', apply: (g) => {
        if (!g.spend(6000, 'Mudança de prédio')) { g.s.flags.rentMult = 1.7; return 'Sem dinheiro para a mudança… o aluguel subiu 70%.'; }
        g.moveBuilding(); return 'Bem-vindo ao prédio novo! 🎉';
      } },
      { label: '✍️ Aceitar o reajuste (+70%)', apply: (g) => { g.s.flags.rentMult = 1.7; return 'Aluguel reajustado.'; } },
      { label: '🤝 Tentar negociar', hint: '50%: reajuste de 30%. 50%: ele fica bravo (+90%).', apply: (g) => { if (Math.random() < 0.5) { g.s.flags.rentMult = 1.3; return 'Negociação boa: só +30%.'; } g.s.flags.rentMult = 1.9; return 'Ele não gostou… +90%.'; } },
    ],
  },
  aporte: {
    id: 'aporte', category: 'oportunidade', emoji: '🤝', ignore: 1,
    title: () => 'O investidor está empolgado',
    text: () => 'Augusto Ferraz: "4 semanas batendo meta! Quero colocar mais R$ 15.000 para acelerar. Mas a meta sobe junto."',
    options: [
      { label: 'Aceitar o aporte', apply: (g) => { g.addCash(15000, 'Aporte do investidor'); if (g.s.investor) g.s.investor.goalProfit = Math.round(g.s.investor.goalProfit * 1.15); return '+R$ 15.000 em caixa!'; } },
      { label: 'Agradecer e recusar', apply: (g) => { if (g.s.investor) g.s.investor.trust = Math.min(100, g.s.investor.trust + 5); return 'Ele gostou da prudência (+5 confiança).'; } },
    ],
  },
};

export function rollEvent(g: Game): PendingEvent | null {
  const cands: { def: EventDef; data: any; w: number }[] = [];
  for (const def of Object.values(EVENT_DEFS)) {
    if (!def.when || !def.weight) continue;
    if (g.s.events.some((e) => e.defId === def.id)) continue;
    const data = def.when(g);
    if (data) cands.push({ def, data, w: def.weight });
  }
  if (!cands.length) return null;
  let r = Math.random() * cands.reduce((a, b) => a + b.w, 0);
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return { uid: g.id(), defId: c.def.id, data: c.data, expires: g.s.dayIndex + 2 };
  }
  return null;
}
