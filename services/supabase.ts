
import { createClient } from '@supabase/supabase-js';
import { LeaderboardEntry } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseService = {
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!supabase) return [];

    // Check if table exists, otherwise return empty to prevent crash
    const { data, error } = await supabase
      .from('repita_leaderboard')
      .select('*')
      .order('total_xp', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
    return data as LeaderboardEntry[];
  },

  async updateScore(playerName: string, xpToAdd: number, pin?: string): Promise<number | null> {
    if (!supabase) return null;

    try {
      console.log(`[Supabase] Updating score for ${playerName}: +${xpToAdd}`);

      // First try to find the player using select().limit(1) to avoid .single() error
      const { data: users, error: fetchError } = await supabase
        .from('repita_leaderboard')
        .select('*')
        .eq('player_name', playerName)
        .limit(1);

      if (fetchError) throw fetchError;

      if (users && users.length > 0) {
        const existingUser = users[0];
        const newTotal = Number(existingUser.total_xp || 0) + Number(xpToAdd);

        const { error: updateError } = await supabase
          .from('repita_leaderboard')
          .update({
            total_xp: newTotal,
            last_played_at: new Date().toISOString(),
            pin: pin // Garantir que o PIN seja enviado para sincronização com a Galeria
          })
          .eq('id', existingUser.id);

        if (updateError) throw updateError;
        console.log(`[Supabase] Updated ${playerName} to ${newTotal} XP`);
        return newTotal;
      } else {
        const { error: insertError } = await supabase
          .from('repita_leaderboard')
          .insert({
            player_name: playerName,
            total_xp: xpToAdd,
            last_played_at: new Date().toISOString(),
            pin: pin
          });

        if (insertError) throw insertError;
        console.log(`[Supabase] Created entry for ${playerName} with ${xpToAdd} XP`);
        return xpToAdd;
      }
    } catch (err) {
      console.error('[Supabase Error] Score update failed:', err);
      return null;
    }
  },

  async getUser(playerName: string): Promise<LeaderboardEntry | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('repita_leaderboard')
        .select('*')
        .eq('player_name', playerName)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error("Error fetching user:", err);
      return null;
    }
  },

  async login(playerName: string, pin: string): Promise<LeaderboardEntry | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('repita_leaderboard')
        .select('*')
        .eq('player_name', playerName)
        .eq('pin', pin)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error("Login failed:", err);
      return null;
    }
  },

  async register(playerName: string, pin: string): Promise<boolean> {
    if (!supabase) return false;
    try {
      // Check if exists
      const existing = await this.getUser(playerName);
      if (existing) return false; // Already taken

      const { error } = await supabase
        .from('repita_leaderboard')
        .insert({
          player_name: playerName,
          pin: pin,
          total_xp: 0,
          last_played_at: new Date().toISOString()
        });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error("Registration failed:", err);
      return false;
    }
  },

  async getPlayerByPin(pin: string): Promise<{ name: string } | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('players')
        .select('name')
        .eq('recovery_pin', pin)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0 ? { name: data[0].name } : null;
    } catch (err) {
      console.error("Error verifying player PIN:", err);
      return null;
    }
  }
}

