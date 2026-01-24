
import React, { useEffect, useState } from 'react';
import { supabaseService } from '../services/supabase';
import { LeaderboardEntry } from '../types';

interface RankingProps {
    onBack: () => void;
    currentPlayerName?: string;
    currentSessionScore?: number;
}

const Ranking: React.FC<RankingProps> = ({ onBack, currentPlayerName, currentSessionScore }) => {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            // 1. Initial Load from Local Storage (Instant)
            const localRaw = localStorage.getItem('repita_local_scores') || '{}';
            let localScores: Record<string, number> = {};
            try {
                localScores = JSON.parse(localRaw);
            } catch (e) {
                console.error("Error parsing local scores:", e);
            }

            // Convert local scores to list
            const localList: LeaderboardEntry[] = Object.keys(localScores).map(name => ({
                id: `local-${name}`,
                player_name: name,
                total_xp: localScores[name],
                last_played_at: new Date().toISOString()
            }));

            // Show local data immediately if available
            if (localList.length > 0) {
                const sortedLocal = [...localList].sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));
                setLeaderboard(sortedLocal);
                setLoading(false);
            }

            // 2. Fetch Cloud Data check
            try {
                const cloudData = await supabaseService.getLeaderboard();

                // 3. Merge Logic (Cloud + Local)
                const merged: LeaderboardEntry[] = [...cloudData];

                Object.keys(localScores).forEach(name => {
                    const existingIndex = merged.findIndex(e => e.player_name === name);
                    if (existingIndex >= 0) {
                        // Keep the higher score
                        if (localScores[name] > (merged[existingIndex].total_xp || 0)) {
                            merged[existingIndex] = {
                                ...merged[existingIndex],
                                total_xp: localScores[name]
                            };
                        }
                    } else {
                        // Add local-only player
                        merged.push({
                            id: `local-${name}`,
                            player_name: name,
                            total_xp: localScores[name],
                            last_played_at: new Date().toISOString()
                        });
                    }
                });

                // Final Sort
                merged.sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0));
                setLeaderboard(merged);
            } catch (err) {
                console.error("Ranking fetch error:", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);



    return (
        <div className="h-full flex flex-col items-center p-6 w-full max-w-md mx-auto" style={{ height: 'var(--app-height)' }}>
            <header className="w-full flex justify-between items-center mb-8 pt-4">
                <button onClick={onBack} className="text-zinc-500 hover:text-white p-2">
                    <i className="fas fa-arrow-left text-xl"></i>
                </button>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Ranking Global</h2>
                <div className="w-8"></div>
            </header>

            {currentSessionScore !== undefined && currentSessionScore > 0 && (
                <div className="w-full mb-8 bg-[#FF6B00]/10 border border-[#FF6B00] p-6 rounded-3xl text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#FF6B00]/20 to-transparent animate-pulse-slow"></div>
                    <p className="text-[#FF6B00] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Sessão Finalizada</p>
                    <p className="text-5xl font-black text-white italic tracking-tighter">+{currentSessionScore}</p>
                    <p className="text-zinc-400 text-xs mt-2 uppercase font-bold">Pontos adicionados ao seu perfil</p>
                </div>
            )}

            <div className="flex-1 w-full overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                    <div className="text-center py-20">
                        <i className="fas fa-circle-notch fa-spin text-4xl text-[#FF6B00] mb-4"></i>
                        <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">Carregando...</p>
                    </div>
                ) : leaderboard.length === 0 ? (
                    <div className="text-center py-20 opacity-50">
                        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Sem Ranking ainda.</p>
                        <button onClick={() => window.location.reload()} className="mt-4 text-[#FF6B00] text-xs underline">Recarregar</button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaderboard.map((entry, index) => {
                            const isMe = entry.player_name === currentPlayerName;
                            return (
                                <div
                                    key={entry.id || index}
                                    className={`flex items-center justify-between p-4 rounded-2xl border ${isMe ? 'bg-[#FF6B00] border-[#FF6B00] text-[#121212]' : 'bg-[#0A0A0A] border-[#1A120D] text-white'}`}
                                >
                                    <div className="flex items-center space-x-4">
                                        <span className={`font-black text-xl italic w-8 text-center ${isMe ? 'text-[#121212]' : 'text-zinc-700'}`}>#{index + 1}</span>
                                        <span className="font-bold uppercase tracking-tight truncate max-w-[140px]">{entry.player_name}</span>
                                    </div>
                                    <span className={`font-black tracking-tighter ${isMe ? 'text-[#121212]' : 'text-[#FF6B00]'}`}>{entry.total_xp} XP</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="w-full space-y-3 mt-6">
                <button
                    onClick={onBack}
                    className="w-full py-5 bg-[#FF6B00] text-[#121212] rounded-2xl font-black text-sm uppercase tracking-widest active:scale-95 shadow-lg"
                >
                    Voltar ao Início
                </button>
            </div>
        </div>
    );
};

export default Ranking;
