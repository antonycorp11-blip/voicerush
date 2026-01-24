
export type GameState = 'START' | 'VOICE_SELECTION' | 'IDLE' | 'PLAYING_TARGET' | 'LISTENING' | 'ANALYZING' | 'FEEDBACK' | 'REGISTRATION' | 'RANKING';

export type VoiceType = 'MALE' | 'FEMALE';

export interface NoteInfo {
  name: string;
  frequency: number;
  register: 'LOW' | 'MID' | 'HIGH';
  fileUrl?: string;
}

export interface FeedbackData {
  diff: number;
  message: string;
  color: string;
  score: number;
}

export interface PitchResult {
  pitch: number | null;
  clarity: number;
}

export interface LeaderboardEntry {
  id?: string;
  player_name: string;
  total_xp: number;
  last_played_at: string;
  pin?: string;
}
