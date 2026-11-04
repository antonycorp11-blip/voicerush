// Static game content: names, traits, rooms, staff, campaigns, skill tree.
import type { InstrumentId } from './instruments';

export const FIRST_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Larissa', 'Lucas',
  'Mariana', 'Mateus', 'Nina', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Thiago', 'Valentina', 'Vinícius', 'Yasmin',
  'Bernardo', 'Clara', 'Davi', 'Elisa', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Kauã', 'Letícia', 'Miguel',
  'Natália', 'Pedro', 'Renata', 'Samuel', 'Tatiane', 'Wesley', 'Alice', 'Caio', 'Débora', 'Enzo', 'Lívia', 'Murilo',
  'Rebeca', 'Arthur', 'Beatriz', 'Cecília', 'Daniel', 'Henrique', 'Lorena', 'Manuela', 'Nicolas', 'Olívia', 'Raí',
];
export const LAST_NAMES = [
  'Silva', 'Souza', 'Oliveira', 'Santos', 'Lima', 'Pereira', 'Costa', 'Rocha', 'Almeida', 'Ferreira', 'Ribeiro',
  'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Barbosa', 'Cardoso', 'Teixeira', 'Moreira', 'Nunes', 'Freitas', 'Mendes',
];

export type TraitId = 'pontual' | 'faltoso' | 'carismatico' | 'virtuoso' | 'paciente' | 'influencer' | 'estressado' | 'mentor';
export const TRAITS: Record<TraitId, { name: string; desc: string; good: boolean }> = {
  pontual: { name: 'Pontual', desc: 'Nunca falta.', good: true },
  faltoso: { name: 'Faltoso', desc: 'Falta com frequência.', good: false },
  carismatico: { name: 'Carismático', desc: '+satisfação dos alunos.', good: true },
  virtuoso: { name: 'Virtuoso', desc: '+15% qualidade de aula.', good: true },
  paciente: { name: 'Paciente', desc: 'Ótimo com turmas em grupo.', good: true },
  influencer: { name: 'Influencer', desc: 'Traz +8% de interessados.', good: true },
  estressado: { name: 'Estressado', desc: 'A moral cai mais rápido.', good: false },
  mentor: { name: 'Mentor', desc: 'Reuniões rendem o dobro.', good: true },
};

export type RoomType = 'empty' | 'hall' | 'reception' | 'classroom' | 'rehearsal' | 'auditorium' | 'lounge' | 'studio' | 'office';

export interface RoomTypeDef {
  name: string;
  emoji: string;
  cost: number;
  desc: string;
  skill?: string;
}
export const ROOM_TYPES: Partial<Record<RoomType, RoomTypeDef>> = {
  classroom: { name: 'Sala de Aula', emoji: '🎼', cost: 3000, desc: 'Até 3 instrumentos. 60 horas-aula por semana.' },
  rehearsal: { name: 'Sala de Ensaio', emoji: '🎚️', cost: 6000, desc: 'Bandas alugam por hora à noite e aos sábados.', skill: 'ensaio' },
  lounge: { name: 'Café & Lounge', emoji: '☕', cost: 5000, desc: '+6 satisfação para todos e vende cafés.', skill: 'lounge' },
  auditorium: { name: 'Auditório', emoji: '🎭', cost: 14000, desc: 'Recitais muito melhores e mais baratos.', skill: 'auditorio' },
  studio: { name: 'Estúdio de Gravação', emoji: '🎙️', cost: 16000, desc: 'Gravações pagas + vídeos melhores.', skill: 'estudio' },
};

export const PLOT_RENT = 150; // per week per rented plot
export const PLOT_DEPOSIT = 1500; // to rent a new space
export const DECOR_COST = [0, 1200, 3500, 8500, 18000];
export const DECOR_SKILL = [null, 'pintura', 'acustica', 'premium', 'conforto'];
export const DECOR_NAMES = ['Abandonado', 'Pintado', 'Aconchegante', 'Premium', 'Luxo'];
export const MAX_DECOR = 4;
export const DECOR_WHAT = [
  'Concreto rachado, caixas, lâmpada pendurada.',
  'Piso de madeira, paredes pintadas, mobília simples.',
  'Piso de cerâmica, rodapé de madeira, janela, tapete e lousa.',
  'Painéis acústicos de madeira, LED, monitores de estúdio, parquet.',
  'Mármore, paredes azul-marinho com dourado, lustre de cristal, poltronas de veludo.',
];

export type ItemId = 'cadeiras' | 'som' | 'clima' | 'luz' | 'estante' | 'plantas' | 'sofa' | 'tv';
export interface ItemDef { name: string; emoji: string; cost: number; desc: string; types: RoomType[] }
/** Prefab items: each one has a fixed place in the room and follows the room level visually. */
export const ROOM_ITEMS: Record<ItemId, ItemDef> = {
  cadeiras: { name: 'Cadeiras', emoji: '🪑', cost: 300, desc: '+1 satisfação por aula. Necessárias para turmas confortáveis.', types: ['classroom', 'auditorium', 'lounge'] },
  som: { name: 'Caixas de som', emoji: '🔊', cost: 500, desc: '+2 qualidade nas aulas / mais reservas.', types: ['classroom', 'rehearsal', 'auditorium', 'studio', 'reception', 'lounge'] },
  clima: { name: 'Climatização', emoji: '❄️', cost: 600, desc: '+1 satisfação por aula (ninguém sofre no calor).', types: ['classroom', 'rehearsal', 'reception', 'lounge', 'auditorium', 'studio'] },
  luz: { name: 'Iluminação', emoji: '💡', cost: 350, desc: '+2 qualidade / ambiente mais bonito.', types: ['classroom', 'rehearsal', 'reception', 'lounge', 'auditorium', 'studio'] },
  estante: { name: 'Estante de partituras', emoji: '📚', cost: 400, desc: '+2 qualidade nas aulas.', types: ['classroom', 'studio'] },
  plantas: { name: 'Plantas', emoji: '🪴', cost: 150, desc: '+1 satisfação. Deixa tudo mais vivo.', types: ['classroom', 'reception', 'lounge', 'rehearsal', 'studio', 'auditorium'] },
  sofa: { name: 'Sofá de espera', emoji: '🛋️', cost: 700, desc: 'Interessados esperam mais e convertem melhor.', types: ['reception', 'studio', 'lounge'] },
  tv: { name: 'TV com vídeos da escola', emoji: '📺', cost: 900, desc: '+5% de conversão na recepção / mais reservas.', types: ['reception', 'rehearsal', 'lounge'] },
};

export type StaffRole = 'vendedor' | 'secretaria' | 'coordenador';
export const STAFF_ROLES: Record<StaffRole, { name: string; wage: number; desc: string; skill: string; emoji: string }> = {
  vendedor: { name: 'Vendedor(a)', wage: 260, emoji: '🤝', skill: 'vendedor', desc: 'Atende interessados na recepção automaticamente.' },
  secretaria: { name: 'Secretária(o)', wage: 300, emoji: '📋', skill: 'secretaria', desc: 'Resolve situações administrativas, renovações e cobranças.' },
  coordenador: { name: 'Coordenador(a)', wage: 550, emoji: '🎓', skill: 'coordenador', desc: '+8% qualidade nas aulas e moral estável.' },
};

export type CampaignId = 'panfletos' | 'workshop' | 'instagram' | 'focada' | 'google' | 'outdoor';
export const CAMPAIGNS: Record<CampaignId, { name: string; emoji: string; cost: number; weeks: number; mult: number; desc: string; skill?: string; focused?: boolean }> = {
  panfletos: { name: 'Panfletos no bairro', emoji: '📄', cost: 120, weeks: 1, mult: 0.35, desc: 'Barato e local. +35% de interessados por 1 semana.' },
  workshop: { name: 'Workshop gratuito', emoji: '🎪', cost: 450, weeks: 1, mult: 0.45, desc: '+45% interessados e +XP de reputação.' },
  instagram: { name: 'Anúncios no Instagram', emoji: '📱', cost: 700, weeks: 2, mult: 0.8, desc: '+80% interessados por 2 semanas.', skill: 'instagram' },
  focada: { name: 'Campanha focada', emoji: '🎯', cost: 900, weeks: 2, mult: 2.0, desc: 'Triplica a procura por UM instrumento.', skill: 'instagram', focused: true },
  google: { name: 'Google Ads', emoji: '🔎', cost: 1400, weeks: 2, mult: 1.2, desc: '+120% interessados por 2 semanas.', skill: 'google' },
  outdoor: { name: 'Outdoor + Rádio', emoji: '📻', cost: 4500, weeks: 3, mult: 2.2, desc: '+220% interessados por 3 semanas e reputação.', skill: 'outdoor' },
};

// ------------------------------------------------------------------ skill tree
export type BranchId = 'pedagogia' | 'ambiente' | 'marketing' | 'gestao' | 'palco' | 'expansao';
export const BRANCHES: Record<BranchId, { name: string; color: string; icon: string; angle: number }> = {
  pedagogia: { name: 'Pedagogia', color: '#4f8fd8', icon: '♩', angle: -90 },
  ambiente: { name: 'Ambiente', color: '#58b06c', icon: '♪', angle: -30 },
  marketing: { name: 'Marketing', color: '#e8607a', icon: '♫', angle: 30 },
  palco: { name: 'Palco', color: '#9b6bd1', icon: '𝄞', angle: 90 },
  expansao: { name: 'Expansão', color: '#f08a3e', icon: '♬', angle: 150 },
  gestao: { name: 'Gestão', color: '#d8a63a', icon: '♭', angle: 210 },
};

export interface SkillDef {
  id: string;
  name: string;
  branch: BranchId;
  tier: number;
  cost: number;
  req: string[];
  desc: string;
  minChapter?: number;
}

export const SKILLS: SkillDef[] = [
  // Pedagogia
  { id: 'metodo', name: 'Método Próprio', branch: 'pedagogia', tier: 1, cost: 1, req: [], desc: '+5% de qualidade em todas as aulas.' },
  { id: 'turmas', name: 'Aulas em Grupo', branch: 'pedagogia', tier: 2, cost: 1, req: ['metodo'], desc: 'Libera turmas de até 4 alunos por horário (ticket menor, volume maior).' },
  { id: 'apostilas', name: 'Apostilas', branch: 'pedagogia', tier: 2, cost: 1, req: ['metodo'], desc: '+5% qualidade e +3 satisfação semanal.' },
  { id: 'turmasG', name: 'Turmas Maiores', branch: 'pedagogia', tier: 3, cost: 2, req: ['turmas'], desc: 'Turmas passam a ter até 6 alunos.' },
  { id: 'avaliacao', name: 'Avaliação Trimestral', branch: 'pedagogia', tier: 3, cost: 2, req: ['apostilas'], desc: '-30% de cancelamentos.' },
  { id: 'coordenador', name: 'Coordenação', branch: 'pedagogia', tier: 4, cost: 2, req: ['avaliacao'], desc: 'Libera contratar Coordenador(a) pedagógico.', minChapter: 3 },
  { id: 'mestre', name: 'Metodologia de Referência', branch: 'pedagogia', tier: 5, cost: 3, req: ['coordenador'], desc: '+10% qualidade e alunos aceitam preços 15% maiores.' },
  // Ambiente
  { id: 'pintura', name: 'Reforma Básica', branch: 'ambiente', tier: 1, cost: 1, req: [], desc: 'Libera decoração nível 1 (pintura e piso de madeira).' },
  { id: 'acustica', name: 'Tratamento Acústico', branch: 'ambiente', tier: 2, cost: 1, req: ['pintura'], desc: 'Decoração nível 2. Bateria sem reclamação de vizinhos.' },
  { id: 'lounge', name: 'Café & Lounge', branch: 'ambiente', tier: 2, cost: 2, req: ['pintura'], desc: 'Libera construir um Café & Lounge.', minChapter: 3 },
  { id: 'premium', name: 'Design Premium', branch: 'ambiente', tier: 3, cost: 2, req: ['acustica'], desc: 'Decoração nível 3: o ambiente mais bonito da cidade.' },
  { id: 'conforto', name: 'Experiência Premium', branch: 'ambiente', tier: 4, cost: 3, req: ['premium'], desc: 'Decoração nível 4 (Luxo), +4 satisfação semanal e alunos aceitam preços 10% maiores.' },
  // Marketing
  { id: 'instagram', name: 'Instagram', branch: 'marketing', tier: 1, cost: 1, req: [], desc: 'Libera anúncios no Instagram e campanhas focadas.' },
  { id: 'indique', name: 'Indique um Amigo', branch: 'marketing', tier: 2, cost: 1, req: ['instagram'], desc: '+15% interessados (boca a boca).' },
  { id: 'youtube', name: 'Canal no YouTube', branch: 'marketing', tier: 2, cost: 1, req: ['instagram'], desc: 'Vídeos rendem o dobro de alcance.' },
  { id: 'google', name: 'Google Ads', branch: 'marketing', tier: 3, cost: 2, req: ['indique'], desc: 'Libera campanhas no Google.' },
  { id: 'parcerias', name: 'Parcerias com Colégios', branch: 'marketing', tier: 3, cost: 2, req: ['youtube'], desc: 'Mais propostas de turmas fechadas.' },
  { id: 'outdoor', name: 'Outdoor & Rádio', branch: 'marketing', tier: 4, cost: 2, req: ['google'], desc: 'Libera campanha gigante de Outdoor + Rádio.', minChapter: 3 },
  { id: 'marca', name: 'Marca Forte', branch: 'marketing', tier: 4, cost: 3, req: ['google', 'parcerias'], desc: '+25% de atratividade contra rivais.' },
  // Gestão
  { id: 'planilha', name: 'Planilha de Fluxo', branch: 'gestao', tier: 1, cost: 1, req: [], desc: '-8% em aluguel e manutenção.' },
  { id: 'vendedor', name: 'Equipe Comercial', branch: 'gestao', tier: 2, cost: 1, req: ['planilha'], desc: 'Libera contratar Vendedores.', minChapter: 3 },
  { id: 'secretaria', name: 'Secretaria', branch: 'gestao', tier: 2, cost: 1, req: ['planilha'], desc: 'Libera contratar Secretária para delegar situações.', minChapter: 3 },
  { id: 'semestral', name: 'Contratos Semestrais', branch: 'gestao', tier: 3, cost: 2, req: ['secretaria'], desc: 'Contratos de 24 semanas: menos renovações perdidas.' },
  { id: 'cobranca', name: 'Cobrança Automática', branch: 'gestao', tier: 3, cost: 1, req: ['secretaria'], desc: 'Acaba a inadimplência.' },
  { id: 'precificacao', name: 'Venda Consultiva', branch: 'gestao', tier: 4, cost: 2, req: ['vendedor'], desc: '+10% de conversão em matrículas.' },
  // Palco
  { id: 'recital', name: 'Recitais', branch: 'palco', tier: 1, cost: 1, req: [], desc: 'Libera organizar recitais (satisfação + reputação).' },
  { id: 'ensaio', name: 'Sala de Ensaio', branch: 'palco', tier: 2, cost: 1, req: ['recital'], desc: 'Libera construir Sala de Ensaio para alugar a bandas.', minChapter: 3 },
  { id: 'auditorio', name: 'Auditório', branch: 'palco', tier: 2, cost: 2, req: ['recital'], desc: 'Libera construir um Auditório.', minChapter: 3 },
  { id: 'estudio', name: 'Estúdio de Gravação', branch: 'palco', tier: 3, cost: 2, req: ['ensaio'], desc: 'Libera construir Estúdio de Gravação.' },
  { id: 'festival', name: 'Festival Anual', branch: 'palco', tier: 3, cost: 3, req: ['auditorio'], desc: 'Recitais viram festivais: o dobro de efeito.' },
  // Expansão
  { id: 'expansao1', name: 'Novos Espaços', branch: 'expansao', tier: 1, cost: 1, req: [], desc: 'Libera alugar as salas do andar de cima (2 espaços).', minChapter: 3 },
  { id: 'corporativo', name: 'Aulas Corporativas', branch: 'expansao', tier: 2, cost: 2, req: ['expansao1'], desc: 'Empresas contratam turmas fechadas (ticket alto).' },
  { id: 'expansao2', name: 'Prédio Inteiro', branch: 'expansao', tier: 2, cost: 2, req: ['expansao1'], desc: 'Libera os 2 últimos espaços do prédio.' },
  { id: 'filial', name: 'Abrir Filial', branch: 'expansao', tier: 3, cost: 4, req: ['expansao2', 'corporativo'], desc: 'O grande sonho: abrir a segunda unidade. Requer nível 8 e R$ 60.000 em caixa.' },
];

export const SKILL_MAP: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const RIVAL_DEFS = [
  { id: 'allegro', name: 'Conservatório Allegro', color: '#9b6bd1', style: 'premium', price: 420, quality: 78, marketing: 1.1, rep: 6, desc: 'Tradicional e caro. Foco em piano e violino.' },
  { id: 'turbo', name: 'Rock School Turbo', color: '#e0503e', style: 'volume', price: 160, quality: 48, marketing: 1.6, rep: 5, desc: 'Turmas lotadas e preço baixo. Guitarra e bateria.' },
  { id: 'bairro', name: 'Musical do Bairro', color: '#58b06c', style: 'balanced', price: 230, quality: 58, marketing: 0.8, rep: 3, desc: 'Pequena e simpática. Violão e canto.' },
] as const;

export const RIVAL_FOCUS: Record<string, InstrumentId[]> = {
  allegro: ['piano', 'violino', 'canto'],
  turbo: ['guitarra', 'bateria', 'baixo'],
  bairro: ['violao', 'canto', 'ukulele'],
};
