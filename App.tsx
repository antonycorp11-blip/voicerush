
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NOTES, MAX_SINGING_TIME } from './constants';
import { GameState, NoteInfo, FeedbackData, VoiceType } from './types';
import { audioEngine } from './services/audioEngine';
import PitchDial from './components/PitchDial';
import UserRegistration from './components/UserRegistration';
import Ranking from './components/Ranking';
import { supabaseService } from './services/supabase';

// Logo
import logoImg from './Logo Laranja.png';

const App: React.FC = () => {
  // --- STATES ---
  const [gameState, setGameState] = useState<GameState>('START');
  const [voiceType, setVoiceType] = useState<VoiceType | null>(null);
  const [targetNote, setTargetNote] = useState<NoteInfo | null>(null);
  const [userPitch, setUserPitch] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(5000);
  const [playerName, setPlayerName] = useState<string | null>(localStorage.getItem('repita_playerName'));
  const [playerPin, setPlayerPin] = useState<string | null>(localStorage.getItem('repita_playerPin'));
  const [isPlayingPhase, setIsPlayingPhase] = useState(false);
  const [showRanking, setShowRanking] = useState(false);
  const [realTimeAccuracy, setRealTimeAccuracy] = useState<number>(0);
  const [showModal, setShowModal] = useState(false);
  const [scorePop, setScorePop] = useState(false);
  const [showInstructions, setShowInstructions] = useState(!localStorage.getItem('repita_tutorial_seen'));

  // --- AUTH STATES ---
  const [isLocked, setIsLocked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // --- REFS ---
  const lastNoteRef = useRef<string | null>(null);
  const pitchHistory = useRef<number[]>([]);
  const requestRef = useRef<number>();
  const timerRef = useRef<number | null>(null);
  const isListeningRef = useRef(false);
  const playTimerRef = useRef<number | null>(null);
  const voiceTypeRef = useRef<VoiceType | null>(null);
  const gameStateRef = useRef<GameState>('START');
  const targetNoteRef = useRef<NoteInfo | null>(null);

  // Sync refs
  useEffect(() => { voiceTypeRef.current = voiceType; }, [voiceType]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { targetNoteRef.current = targetNote; }, [targetNote]);

  // Mobile Height Fix
  useEffect(() => {
    const handleResize = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- AUTH CHECK ---
  useEffect(() => {
    const checkAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlPin = params.get('pin');

      if (urlPin) {
        setIsCheckingAuth(true);
        const player = await supabaseService.getPlayerByPin(urlPin);

        if (player && player.name) {
          setPlayerName(player.name);
          setPlayerPin(urlPin);
          localStorage.setItem('repita_playerName', player.name);
          localStorage.setItem('repita_playerPin', urlPin);
          setIsLocked(false);
        } else {
          setIsLocked(true);
        }
        setIsCheckingAuth(false);
      } else {
        const savedName = localStorage.getItem('repita_playerName');
        if (savedName) {
          setIsLocked(false);
        } else {
          setIsLocked(true);
        }
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, []);

  // Sync PIN & authoritative score
  useEffect(() => {
    if (playerName) {
      supabaseService.getUser(playerName).then(user => {
        if (user) {
          if (user.pin && user.pin !== playerPin) {
            // Legacy sync removed: URL/Session PIN is now authoritative.
            // Check performed on mount ensures validity.
          }
          if (user.total_xp !== undefined) {
            const raw = localStorage.getItem('repita_local_scores') || '{}';
            try {
              const localScores = JSON.parse(raw);
              localScores[playerName] = user.total_xp;
              localStorage.setItem('repita_local_scores', JSON.stringify(localScores));
            } catch (e) { }
          }
        }
      });
    }
  }, [playerName]);

  // --- PITCH ENGINE ---
  const updatePitchLoop = useCallback(() => {
    if (isListeningRef.current) {
      const result = audioEngine.getPitch();
      if (result.pitch) {
        setUserPitch(result.pitch);
        pitchHistory.current.push(result.pitch);

        if (targetNoteRef.current) {
          const diff = Math.abs(result.pitch - targetNoteRef.current.frequency);
          const acc = Math.max(0, 100 - (diff * 1.5));
          setRealTimeAccuracy(acc);
        }
      }
      requestRef.current = requestAnimationFrame(updatePitchLoop);
    }
  }, []);

  useEffect(() => {
    if (gameState === 'LISTENING') {
      isListeningRef.current = true;
      requestRef.current = requestAnimationFrame(updatePitchLoop);
    } else {
      isListeningRef.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      isListeningRef.current = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, updatePitchLoop]);

  // --- ACTIONS ---
  const handleRegistrationComplete = (name: string, pin: string) => {
    setPlayerName(name);
    setPlayerPin(pin);
    localStorage.setItem('repita_playerName', name);
    localStorage.setItem('repita_playerPin', pin);
    setGameState('START');
    requestMicrophone(); // Check mic after registration
  };

  const requestMicrophone = async () => {
    // Check for Secure Context (Microphone requirement)
    if (!window.isSecureContext && !window.location.hostname.includes('localhost')) {
      alert("⚠️ ATENÇÃO: O microfone só funciona em conexões seguras (HTTPS). Para testar no celular, você precisará de uma URL HTTPS (ex: Vercel) ou usar o computador.");
      return;
    }

    try {
      await audioEngine.init();
      // Explicitly trigger the browser prompt
      const success = await audioEngine.startMic();

      if (success) {
        audioEngine.stopMic(); // Just checking permission
        setShowInstructions(false);
        localStorage.setItem('repita_tutorial_seen', 'true');
      } else {
        alert("Não conseguimos acessar o microfone. No celular, você deve clicar em 'Permitir' quando o navegador perguntar.");
      }
    } catch (e) {
      alert("Erro ao pedir permissão de microfone. Verifique as configurações do seu aparelho.");
    }
  };

  const startVoiceSelection = async () => {
    if (!playerName) {
      setGameState('REGISTRATION');
      return;
    }

    try {
      await audioEngine.init();
      const success = await audioEngine.startMic();

      if (success) {
        audioEngine.stopMic(); // Release for the selection screen
        setGameState('VOICE_SELECTION');
      } else {
        // Broad check for Secure Context + Permission blocking
        if (!window.isSecureContext && !window.location.hostname.includes('localhost')) {
          alert("⚠️ O microfone só funciona em conexões seguras (HTTPS). Acesse pelo link seguro para jogar.");
        } else {
          alert("⚠️ Microfone não autorizado. Clique no ícone de cadeado/ajustes ao lado da URL do site e permita o acesso ao Microfone.");
        }
      }
    } catch (err) {
      alert("Erro ao ativar microfone. Verifique se outro app está usando ele.");
    }
  };

  const selectVoice = (type: VoiceType) => {
    setVoiceType(type);
    voiceTypeRef.current = type;
    setSessionScore(0);
    startRound(type);
  };

  const startRound = async (type: VoiceType | null = voiceTypeRef.current) => {
    const effectiveType = type || voiceTypeRef.current;
    if (!effectiveType) return;

    const filteredNotes = NOTES.filter(note => {
      if (effectiveType === 'MALE') return note.register === 'LOW' || note.register === 'MID';
      return note.register === 'MID' || note.register === 'HIGH';
    });
    let availableNotes = filteredNotes.filter(n => n.name !== lastNoteRef.current);
    if (availableNotes.length === 0) availableNotes = filteredNotes;
    const randomNote = availableNotes[Math.floor(Math.random() * availableNotes.length)];

    lastNoteRef.current = randomNote.name;
    setTargetNote(randomNote);
    setFeedback(null);
    setUserPitch(null);
    setRealTimeAccuracy(0);
    setShowModal(false);
    pitchHistory.current = [];

    setGameState('PLAYING_TARGET');
    setIsPlayingPhase(true);

    await audioEngine.playSample(randomNote.fileUrl || '', 2.5);
    setTimeout(() => {
      if (gameStateRef.current === 'PLAYING_TARGET') {
        audioEngine.playSample(randomNote.fileUrl || '', 2.5);
      }
    }, 2500);

    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    setTimeLeft(5000);

    playTimerRef.current = window.setTimeout(async () => {
      setIsPlayingPhase(false);
      await startListening();
    }, 5000);
  };

  const startListening = async () => {
    if (gameStateRef.current === 'RANKING') return;

    setGameState('LISTENING');
    setTimeLeft(5000);
    const success = await audioEngine.startMic();
    if (!success) {
      setFeedback({ diff: 0, message: "ERRO MICROFONE", color: "text-red-500", score: 0 });
      setTimeout(() => evaluateRound(), 2500);
      return;
    }

    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 5000 - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        evaluateRound();
      }
    }, 50);
  };

  const evaluateRound = async () => {
    if (gameStateRef.current === 'RANKING') return;

    audioEngine.stopMic();
    setGameState('ANALYZING');
    await new Promise(r => setTimeout(r, 800));

    if (pitchHistory.current.length > 15) {
      const sorted = [...pitchHistory.current].sort((a, b) => a - b);
      const medianPitch = sorted[Math.floor(sorted.length / 2)];

      if (targetNoteRef.current) {
        const diff = medianPitch - targetNoteRef.current.frequency;
        const absDiff = Math.abs(diff);
        let roundXP = 0;
        let result: FeedbackData;

        if (absDiff <= 15) {
          roundXP = 150;
          result = { diff, message: "PERFEIÇÃO TOTAL!", color: "text-[#39FF14]", score: 150 };
        } else if (absDiff <= 30) {
          roundXP = 100;
          result = { diff, message: "AFINADO!", color: "text-[#39FF14]", score: 100 };
        } else if (absDiff <= 55) {
          roundXP = 60;
          result = { diff, message: "MUITO BOM!", color: "text-[#FF6B00]", score: 60 };
        } else if (absDiff <= 85) {
          roundXP = 30;
          result = { diff, message: "BOM!", color: "text-orange-400", score: 30 };
        } else if (absDiff <= 110) {
          roundXP = 10;
          result = { diff, message: "QUASE LÁ", color: "text-zinc-500", score: 10 };
        } else {
          roundXP = 0;
          result = { diff, message: "FORA DE TOM", color: "text-red-500", score: 0 };
        }

        const accuracyPerc = Math.max(0, 100 - (absDiff * 0.8)).toFixed(0);
        result.message += ` (${accuracyPerc}%)`;

        setUserPitch(medianPitch);
        setFeedback(result);
        setSessionScore(prev => prev + roundXP);
        setScorePop(true);
        setTimeout(() => setScorePop(false), 600);

        if (playerName && roundXP > 0) {
          supabaseService.updateScore(playerName, roundXP, playerPin || undefined).then(newTotal => {
            if (newTotal !== null) {
              const raw = localStorage.getItem('repita_local_scores') || '{}';
              try {
                const localScores = JSON.parse(raw);
                localScores[playerName] = newTotal;
                localStorage.setItem('repita_local_scores', JSON.stringify(localScores));
              } catch (e) { }
            }
          });
        }
      }
    } else {
      setFeedback({ diff: 0, message: "SILÊNCIO?", color: "text-zinc-500", score: 0 });
    }

    setShowModal(true);
    setGameState('FEEDBACK');
    setRealTimeAccuracy(0);

    setTimeout(() => {
      if (gameStateRef.current !== 'RANKING') {
        setShowModal(false);
        startRound();
      }
    }, 4000);
  };

  const endSession = async () => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState('RANKING');
    setShowRanking(true);
    audioEngine.stopMic();
  };

  // --- RENDER HELPERS ---
  const currentDiffHz = (userPitch && targetNote) ? (userPitch - targetNote.frequency) : 0;
  const timerProgress = 1 - (timeLeft / 5000);
  const secondsLeft = Math.ceil(timeLeft / 1000);

  // --- RENDER ---
  if (isCheckingAuth) {
    return (
      <div className="min-h-full bg-[#050505] flex items-center justify-center p-4 text-[#FF6B00]" style={{ minHeight: 'var(--app-height)' }}>
        <div className="animate-spin w-8 h-8 boundary-t-2 border-current rounded-full border-t-transparent border-2"></div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-full bg-[#050505] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden" style={{ minHeight: 'var(--app-height)' }}>
        <div className="absolute inset-0 bg-[#FF6B00] blur-[100px] opacity-10"></div>

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-24 h-24 mb-6 rounded-3xl bg-[#0A0A0A] border border-[#1A120D] flex items-center justify-center shadow-2xl">
            <i className="fas fa-lock text-4xl text-[#FF6B00]"></i>
          </div>

          <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-2">Acesso Restrito</h1>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-8 max-w-[200px] leading-relaxed">
            Este jogo é exclusivo para alunos da Acorde Gallery.
          </p>

          <a
            href="https://acordegallery.com"
            className="px-8 py-4 bg-[#FF6B00] text-[#121212] rounded-xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(255,107,0,0.2)]"
          >
            Acesse via Gallery
          </a>
        </div>
      </div>
    );
  }

  if (gameState === 'REGISTRATION') return <UserRegistration onComplete={handleRegistrationComplete} />;

  if (gameState === 'RANKING' || showRanking) {
    return <Ranking
      onBack={() => { setShowRanking(false); setGameState('START'); }}
      currentPlayerName={playerName || ''}
      currentSessionScore={sessionScore}
    />;
  }

  if (gameState === 'START') {
    return (
      <div className="min-h-full bg-[#050505] flex flex-col items-center justify-center p-4 relative" style={{ minHeight: 'var(--app-height)' }}>
        <button onClick={() => setShowRanking(true)} className="absolute top-6 right-6 text-zinc-600 hover:text-[#FF6B00] active:scale-90 z-20">
          <i className="fas fa-trophy text-2xl"></i>
        </button>

        <div className="bg-[#0A0A0A] p-6 py-10 rounded-[3rem] shadow-2xl border border-[#1A120D] max-w-sm w-full text-center relative overflow-hidden my-auto">

          {/* Logo - Shrunk for mobile */}
          <div className="mx-auto mb-6 w-32 h-32 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-[#FF6B00] blur-3xl opacity-20"></div>
            <img src={logoImg} alt="Logo" className="w-full h-full object-contain relative z-10 drop-shadow-2xl" />
          </div>

          <h1 className="text-3xl font-black text-white mb-1 tracking-tighter uppercase italic">VoiceRush</h1>
          <p className="text-zinc-600 mb-8 text-[8px] font-black uppercase tracking-[0.4em]">Treino Auditivo Pro</p>

          <button
            onPointerDown={startVoiceSelection}
            className="w-full py-5 bg-[#FF6B00] text-[#121212] rounded-2xl font-black text-base active:scale-95 shadow-orange-500/20 shadow-lg uppercase italic mb-6 leading-none"
          >
            {playerName ? `JOGAR COMO ${playerName.split(' ')[0]}` : 'COMEÇAR AGORA'}
          </button>

          {playerName && (
            <div className="mb-6 flex flex-col items-center justify-center space-y-1.5">
              <span className="text-zinc-600 text-[8px] uppercase font-black tracking-widest">Seu PIN de Acesso</span>
              {playerPin ? (
                <div className="bg-[#0F0F0F] border border-zinc-900 px-4 py-2.5 rounded-xl shadow-inner relative overflow-hidden group w-full">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                  <span className="text-[#FF6B00] font-mono text-2xl tracking-[0.4em] font-black">{playerPin}</span>
                </div>
              ) : (
                <div className="bg-[#0F0F0F] border border-zinc-900 px-4 py-2.5 rounded-xl shadow-inner animate-pulse w-full">
                  <span className="text-zinc-800 font-mono text-[10px] tracking-widest uppercase">Puxando PIN...</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowRanking(true)}
            className="w-full py-4 bg-[#141414] text-zinc-500 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-zinc-900 transition-colors"
          >
            <i className="fas fa-trophy mr-2 text-[9px]"></i> Ranking Global
          </button>

          {/* Secure Context Warning (Mobile Help) */}
          {!window.isSecureContext && !window.location.hostname.includes('localhost') && (
            <div className="mt-6 p-3 bg-red-950/20 border border-red-900/40 rounded-xl">
              <p className="text-red-500 text-[8px] font-black uppercase tracking-wider leading-relaxed">
                ⚠️ Microfone bloqueado (Site não é HTTPS).<br />Use no PC ou acesse via link seguro.
              </p>
            </div>
          )}

          {playerName && (
            <button
              onClick={() => {
                localStorage.removeItem('repita_playerName');
                localStorage.removeItem('repita_playerPin');
                setPlayerName(null);
                setPlayerPin(null);
                window.location.reload();
              }}
              className="mt-6 text-zinc-800 hover:text-red-500 text-[8px] uppercase tracking-widest font-black transition-colors"
            >
              Sair da Conta
            </button>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'VOICE_SELECTION') {
    return (
      <div className="h-full bg-[#050505] flex flex-col items-center justify-center p-8 text-center" style={{ height: 'var(--app-height)' }}>
        <h2 className="text-2xl font-black text-[#FF6B00] mb-12 uppercase italic tracking-[0.3em]">Tipo de Voz</h2>
        <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
          <button onPointerDown={() => selectVoice('MALE')} className="p-6 bg-[#0A0A0A] border-2 border-[#1A120D] active:border-[#FF6B00] rounded-[2.5rem] flex items-center justify-between shadow-xl active:scale-95">
            <div className="text-left">
              <p className="text-[#FF6B00] text-[9px] font-black uppercase tracking-widest mb-1">Grave</p>
              <p className="text-white text-xl font-black uppercase italic">Masculino</p>
            </div>
            <i className="fas fa-mars text-2xl text-zinc-800"></i>
          </button>
          <button onPointerDown={() => selectVoice('FEMALE')} className="p-6 bg-[#0A0A0A] border-2 border-[#1A120D] active:border-[#FF6B00] rounded-[2.5rem] flex items-center justify-between shadow-xl active:scale-95">
            <div className="text-left">
              <p className="text-[#FF6B00] text-[9px] font-black uppercase tracking-widest mb-1">Agudo</p>
              <p className="text-white text-xl font-black uppercase italic">Feminino</p>
            </div>
            <i className="fas fa-venus text-2xl text-zinc-800"></i>
          </button>
        </div>
        <button onClick={() => setGameState('START')} className="mt-12 text-zinc-600 font-bold uppercase text-[10px] tracking-widest">Voltar</button>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#050505] flex flex-col items-center overflow-hidden p-6 relative select-none" style={{ height: 'var(--app-height)' }}>
      {/* HUD */}
      <div className="w-full max-w-sm flex justify-between items-center mb-6 z-20">
        <div className="flex flex-col">
          <p className="text-zinc-500 text-[9px] font-black uppercase tracking-widest">Sessão</p>
          <p className={`text-[#FF6B00] text-3xl font-black tracking-tighter italic transition-all ${scorePop ? 'scale-110 shadow-orange-500' : ''}`}>
            {sessionScore} XP
          </p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full border border-zinc-800 flex items-center justify-center relative">
            <span className={`text-base font-black italic ${secondsLeft <= 2 ? 'text-red-500 animate-pulse' : 'text-zinc-500'}`}>
              {secondsLeft}s
            </span>
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="20" cy="20" r="19" fill="none" stroke="#FF6B00" strokeWidth="2" strokeDasharray="120" strokeDashoffset={120 * (1 - timerProgress)} />
            </svg>
          </div>
        </div>
        <button onPointerDown={endSession} className="bg-[#121212]/50 border border-zinc-900 px-4 py-2 rounded-xl text-zinc-500 font-black text-[9px] uppercase tracking-widest">
          Sair
        </button>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 w-full max-w-sm flex flex-col items-center justify-center space-y-8 z-10">
        {isPlayingPhase ? (
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Ouça a nota</p>
            {targetNote && (
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-[#FF6B00] blur-3xl opacity-20"></div>
                <div className="relative bg-[#0A0A0A] border border-white/5 px-10 py-5 rounded-[2.5rem] shadow-2xl">
                  <p className="text-[#FF6B00] text-6xl font-black italic tracking-tighter uppercase tabular-nums">
                    {targetNote.name}
                  </p>
                </div>
              </div>
            )}
            <div className="w-24 h-24 bg-[#FF6B00]/5 rounded-full flex items-center justify-center border border-[#FF6B00]/20 mb-6 animate-pulse">
              <i className="fas fa-volume-up text-2xl text-[#FF6B00]"></i>
            </div>
            <div className="h-1 w-32 bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full bg-[#FF6B00] transition-all duration-100 ease-linear" style={{ width: `${(timerProgress * 100)}%` }}></div>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <div className="relative mb-4 scale-90">
              <PitchDial
                diff={currentDiffHz}
                isActive={gameState === 'LISTENING'}
                currentFreq={userPitch}
                timerProgress={timerProgress}
              />
              {targetNote && gameState === 'LISTENING' && (
                <div className="absolute -top-2 -right-2 z-30 animate-in zoom-in-50 duration-300">
                  <div className="bg-gradient-to-br from-[#FF6B00] to-[#FF8C33] p-0.5 rounded-[1.2rem] shadow-xl">
                    <div className="bg-[#0A0A0A] px-4 py-2 rounded-[1.1rem] border border-white/10 flex flex-col items-center justify-center">
                      <span className="text-[18px] font-black text-white italic tracking-tighter leading-none">{targetNote.name}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full px-4 text-center min-h-[80px]">
              {gameState === 'LISTENING' && (
                <div className="space-y-4">
                  <p className="text-[#FF6B00] font-black uppercase italic tracking-[0.3em] text-[11px] animate-pulse">Cante Agora!</p>
                  <div className="w-full h-2.5 bg-zinc-900 rounded-full border border-zinc-800 p-0.5 overflow-hidden shadow-inner relative">
                    <div
                      className="h-full bg-gradient-to-r from-[#FF6B00] to-[#39FF14] rounded-full transition-all duration-300"
                      style={{ width: `${realTimeAccuracy}%` }}
                    />
                    <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/10"></div>
                  </div>
                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Afinação: {realTimeAccuracy.toFixed(0)}%</p>
                </div>
              )}
              {gameState === 'ANALYZING' && (
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-4 h-4 border-2 border-[#FF6B00] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-white/60 font-black uppercase italic tracking-[0.2em] text-[10px]">Analisando...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quote Footer */}
      <div className="mt-auto w-full max-w-sm text-center pb-4 opacity-20">
        <p className="text-[8px] text-zinc-500 font-black tracking-[0.4em] uppercase max-w-[200px] mx-auto leading-relaxed">
          Prática leva à perfeição
        </p>
      </div>

      {/* Round Result Modal */}
      {showModal && feedback && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-[#050505]/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-[300px] bg-[#0A0A0A] border-2 border-[#1A120D] rounded-[3rem] p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FF6B00] to-transparent"></div>

            <p className={`text-3xl font-black italic tracking-tighter mb-4 ${feedback.color}`}>
              {feedback.message.split(' (')[0]}
            </p>

            <div className="bg-[#0F0F0F] rounded-[2rem] py-6 mb-6 border border-zinc-900/50 shadow-inner">
              <p className="text-zinc-600 text-[9px] uppercase font-black tracking-widest mb-1">Score</p>
              <p className={`text-5xl font-black tracking-tighter italic ${feedback.score > 0 ? 'text-white' : 'text-zinc-800'}`}>
                +{feedback.score}<span className="text-[#FF6B00] text-xl ml-1">XP</span>
              </p>
            </div>

            <p className="text-zinc-700 text-[8px] uppercase font-black tracking-[0.3em] animate-pulse">Próximo round...</p>
          </div>
        </div>
      )}

      {/* Instruction Modal Overlay */}
      {showInstructions && (
        <div className="absolute inset-0 z-[100] bg-[#050505] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="w-full max-w-sm bg-[#0A0A0A] border-2 border-[#1A120D] rounded-[3rem] p-8 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#FF6B00] via-[#FF8C33] to-[#FF6B00]"></div>

            <div className="w-16 h-16 bg-[#FF6B00]/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#FF6B00]/30">
              <i className="fas fa-microphone-alt text-2xl text-[#FF6B00]"></i>
            </div>

            <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase mb-1">Treino Auditivo</h2>
            <p className="text-zinc-600 text-[9px] font-black uppercase tracking-[0.2em] mb-8">Permita o uso do microfone</p>

            <div className="space-y-4 text-left mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 rounded-full bg-[#111] border border-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-[#FF6B00]">1</span>
                </div>
                <p className="text-zinc-300 text-xs font-bold font-black tabular-nums">OUÇA A NOTA</p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 rounded-full bg-[#111] border border-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-[#FF6B00]">2</span>
                </div>
                <p className="text-zinc-300 text-xs font-bold font-black tabular-nums">CANTE COM CLAREZA</p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="w-5 h-5 rounded-full bg-[#111] border border-zinc-800 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-black text-[#FF6B00]">3</span>
                </div>
                <p className="text-zinc-300 text-xs font-bold font-black tabular-nums">GANHE XP NO RANKING</p>
              </div>
            </div>

            <button
              onClick={requestMicrophone}
              className="w-full py-4 bg-[#FF6B00] text-[#121212] rounded-xl font-black text-base uppercase italic tracking-wider active:scale-95 shadow-[0_10px_20px_rgba(255,107,0,0.2)]"
            >
              Autorizar e Começar
            </button>
          </div>
        </div>
      )}

      {/* App Structure Global Styles */}
      <style>{`
        .mobile-container {
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default App;
