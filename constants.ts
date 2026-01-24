
import { NoteInfo } from './types';

export const NOTES: NoteInfo[] = [
  // --- REGISTRO MASCULINO (Grave/Médio) ---
  { name: 'Mi (E2)', frequency: 82.41, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/E2.mp3' },
  { name: 'Fá (F2)', frequency: 87.31, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/F2.mp3' },
  { name: 'Fá# (F#2)', frequency: 92.50, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Gb2.mp3' },
  { name: 'Sol (G2)', frequency: 98.00, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/G2.mp3' },
  { name: 'Sol# (G#2)', frequency: 103.83, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Ab2.mp3' },
  { name: 'Lá (A2)', frequency: 110.00, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/A2.mp3' },
  { name: 'Lá# (A#2)', frequency: 116.54, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Bb2.mp3' },
  { name: 'Si (B2)', frequency: 123.47, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/B2.mp3' },
  { name: 'Dó (C3)', frequency: 130.81, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/C3.mp3' },
  { name: 'Dó# (C#3)', frequency: 138.59, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Db3.mp3' },
  { name: 'Ré (D3)', frequency: 146.83, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/D3.mp3' },
  { name: 'Ré# (D#3)', frequency: 155.56, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Eb3.mp3' },
  { name: 'Mi (E3)', frequency: 164.81, register: 'LOW', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/E3.mp3' },
  { name: 'Fá (F3)', frequency: 174.61, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/F3.mp3' },
  { name: 'Sol (G3)', frequency: 196.00, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/G3.mp3' },
  { name: 'Lá (A3)', frequency: 220.00, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/A3.mp3' },
  { name: 'Si (B3)', frequency: 246.94, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/B3.mp3' },

  // --- REGISTRO FEMININO (Médio/Agudo) ---
  { name: 'Sol (G3)', frequency: 196.00, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/G3.mp3' },
  { name: 'Lá (A3)', frequency: 220.00, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/A3.mp3' },
  { name: 'Si (B3)', frequency: 246.94, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/B3.mp3' },
  { name: 'Dó (C4)', frequency: 261.63, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/C4.mp3' },
  { name: 'Dó# (C#4)', frequency: 277.18, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Db4.mp3' },
  { name: 'Ré (D4)', frequency: 293.66, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/D4.mp3' },
  { name: 'Ré# (D#4)', frequency: 311.13, register: 'MID', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Eb4.mp3' },
  { name: 'Mi (E4)', frequency: 329.63, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/E4.mp3' },
  { name: 'Fá (F4)', frequency: 349.23, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/F4.mp3' },
  { name: 'Fá# (F#4)', frequency: 369.99, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Gb4.mp3' },
  { name: 'Sol (G4)', frequency: 392.00, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/G4.mp3' },
  { name: 'Sol# (G#4)', frequency: 415.30, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Ab4.mp3' },
  { name: 'Lá (A4)', frequency: 440.00, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/A4.mp3' },
  { name: 'Lá# (A#4)', frequency: 466.16, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/Bb4.mp3' },
  { name: 'Si (B4)', frequency: 493.88, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/B4.mp3' },
  { name: 'Dó (C5)', frequency: 523.25, register: 'HIGH', fileUrl: 'https://raw.githubusercontent.com/fuhton/piano-mp3/master/piano-mp3/C5.mp3' },
];

export const EDUCATIONAL_QUOTES = [
  "A música é a alma da geometria",
  "Seu ouvido é o seu melhor professor",
  "A paciência é a chave da afinação",
  "Cada tentativa é um novo aprendizado",
  "Sinta a frequência em seu corpo"
];

export const SAMPLE_RATE = 44100;
export const MAX_SINGING_TIME = 5000;
