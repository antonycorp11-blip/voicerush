export type InstrumentId = 'violao' | 'guitarra' | 'baixo' | 'piano' | 'bateria' | 'canto' | 'violino' | 'ukulele';
export type MinigameKind = 'ritmo' | 'melodia' | 'afinacao' | 'acorde' | 'intrusa' | 'papelada';

export interface InstrumentDef {
  id: InstrumentId;
  name: string;
  emoji: string;
  color: string;
  popularity: number; // share of city demand
  equipTiers: { name: string; cost: number }[];
  minigames: MinigameKind[];
}

export const INSTRUMENTS: Record<InstrumentId, InstrumentDef> = {
  violao: { id: 'violao', name: 'Violão', emoji: '🎸', color: '#c98a4b', popularity: 0.24,
    equipTiers: [{ name: 'Violão de estudo', cost: 350 }, { name: 'Violão Takamine', cost: 1400 }, { name: 'Violão luthier', cost: 4200 }],
    minigames: ['ritmo', 'acorde', 'afinacao'] },
  guitarra: { id: 'guitarra', name: 'Guitarra', emoji: '⚡', color: '#e0503e', popularity: 0.15,
    equipTiers: [{ name: 'Guitarra + cubo', cost: 900 }, { name: 'Strato + valvulado', cost: 3200 }, { name: 'Les Paul + Marshall', cost: 8500 }],
    minigames: ['ritmo', 'afinacao', 'melodia'] },
  baixo: { id: 'baixo', name: 'Contrabaixo', emoji: '🎵', color: '#4f73c9', popularity: 0.07,
    equipTiers: [{ name: 'Baixo + cubo', cost: 1000 }, { name: 'Jazz Bass + amp', cost: 3400 }, { name: 'Baixo 5 cordas pro', cost: 7800 }],
    minigames: ['ritmo', 'afinacao'] },
  piano: { id: 'piano', name: 'Piano', emoji: '🎹', color: '#3a3448', popularity: 0.15,
    equipTiers: [{ name: 'Teclado 61 teclas', cost: 800 }, { name: 'Piano digital', cost: 4500 }, { name: 'Piano de cauda', cost: 16000 }],
    minigames: ['acorde', 'melodia', 'intrusa'] },
  bateria: { id: 'bateria', name: 'Bateria', emoji: '🥁', color: '#d0473f', popularity: 0.12,
    equipTiers: [{ name: 'Bateria de entrada', cost: 1800 }, { name: 'Bateria acústica', cost: 5200 }, { name: 'Kit profissional', cost: 12000 }],
    minigames: ['ritmo'] },
  canto: { id: 'canto', name: 'Canto', emoji: '🎤', color: '#d76aa8', popularity: 0.14,
    equipTiers: [{ name: 'Microfone + caixa', cost: 500 }, { name: 'Mic condensador', cost: 2200 }, { name: 'Cabine vocal', cost: 6500 }],
    minigames: ['melodia', 'intrusa', 'afinacao'] },
  violino: { id: 'violino', name: 'Violino', emoji: '🎻', color: '#9a4f2c', popularity: 0.06,
    equipTiers: [{ name: 'Violino estudante', cost: 900 }, { name: 'Violino de oficina', cost: 3800 }, { name: 'Violino de luthier', cost: 11000 }],
    minigames: ['afinacao', 'intrusa'] },
  ukulele: { id: 'ukulele', name: 'Ukulele', emoji: '🌺', color: '#e8a64a', popularity: 0.07,
    equipTiers: [{ name: 'Ukulele soprano', cost: 200 }, { name: 'Ukulele concert', cost: 800 }, { name: 'Ukulele koa', cost: 2600 }],
    minigames: ['acorde', 'ritmo', 'melodia'] },
};

export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];

export const MINIGAME_NAMES: Record<MinigameKind, string> = {
  ritmo: 'Ritmo Certo',
  melodia: 'Siga a Melodia',
  afinacao: 'Afinação',
  acorde: 'Monte o Acorde',
  intrusa: 'Nota Intrusa',
  papelada: 'Papelada',
};
