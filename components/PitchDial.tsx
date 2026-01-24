
import React, { useEffect, useState } from 'react';

interface PitchDialProps {
  diff: number;  // Difference in Hz
  isActive: boolean;
  currentFreq: number | null;
  timerProgress: number; // 0 to 1
}

const PitchDial: React.FC<PitchDialProps> = ({ diff, isActive, currentFreq, timerProgress }) => {
  const [smoothDiff, setSmoothDiff] = useState(0);

  useEffect(() => {
    // Reset or smooth
    if (isActive && diff !== 0) {
      setSmoothDiff(prev => prev + (diff - prev) * 0.15); // Smoother response
    } else if (!isActive) {
      setSmoothDiff(0);
    }
  }, [diff, isActive]);

  // Map diff (-50 to +50 Hz) to Rotation (-90deg to +90deg)
  // Clamp rigorously to prevent visual glitches
  const clampedDiff = Math.max(-50, Math.min(50, smoothDiff));
  const rotation = (clampedDiff / 50) * 90;

  const getStatusColor = () => {
    const abs = Math.abs(smoothDiff);
    if (!isActive || !currentFreq) return '#333';
    if (abs < 5) return '#39FF14'; // Perfect
    if (abs < 15) return '#FF6B00'; // Good
    return '#EF4444'; // Bad
  };

  const statusColor = getStatusColor();

  return (
    <div className="w-72 h-72 relative mx-auto flex items-center justify-center">

      {/* Outer Glow Ring (Timer) */}
      <div className="absolute inset-0 rounded-full border border-zinc-900 shadow-2xl bg-[#030303]"></div>

      <svg className="absolute w-full h-full -rotate-90 pointer-events-none">
        {/* Background Track */}
        <circle
          cx="144"
          cy="144"
          r="135"
          stroke="#111"
          strokeWidth="4"
          fill="none"
        />
        {/* Progress Timer */}
        <circle
          cx="144"
          cy="144"
          r="135"
          stroke={isActive ? (timerProgress > 0.8 ? '#EF4444' : '#FF6B00') : '#333'}
          strokeWidth="4"
          fill="none"
          strokeDasharray={2 * Math.PI * 135}
          strokeDashoffset={2 * Math.PI * 135 * (1 - timerProgress)}
          strokeLinecap="round"
          className="transition-all duration-200 ease-linear"
          style={{ filter: isActive ? 'drop-shadow(0 0 4px rgba(255, 107, 0, 0.4))' : 'none' }}
        />
      </svg>

      {/* Inner Tuning Arc Interface */}
      <div className="w-60 h-60 rounded-full bg-gradient-to-b from-[#141414] to-[#050505] border border-zinc-800/50 shadow-[inset_0_4px_20px_black] flex items-center justify-center relative">

        {/* Tick Marks & Zones */}
        <div className="absolute w-full h-full rounded-full">
          {/* Center Perfect Zone */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-[2px] bg-[#39FF14] shadow-[0_0_10px_#39FF14]"></div>

          {/* Zones Background Arc (using conic gradient hack or just CSS) */}
          <div className="absolute inset-4 rounded-full border-[16px] border-transparent border-t-zinc-900/50 opacity-50"></div>
        </div>

        {/* Ticks */}
        {[...Array(9)].map((_, i) => {
          // -40, -30, -20, -10, 0, 10, 20, 30, 40
          const val = -40 + (i * 10);
          const rot = (val / 50) * 90;
          const isCenter = val === 0;
          return (
            <div
              key={i}
              className={`absolute origin-bottom ${isCenter ? 'h-3 w-1 bg-zinc-600' : 'h-2 w-[1px] bg-zinc-800'}`}
              style={{
                height: isCenter ? '12px' : '8px',
                left: '50%',
                bottom: '50%',
                transform: `rotate(${rot}deg) translate(0, -96px)`
              }}
            />
          )
        })}

        {/* Labels - Flat / Sharp */}
        <div className="absolute bottom-12 w-full flex justify-between px-16 text-[8px] font-black tracking-[0.2em] text-zinc-700 opacity-60">
          <span>♭</span>
          <span>♯</span>
        </div>

        {/* Digital Readout */}
        <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10">
          <div className="h-6 flex items-center justify-center mb-1">
            {isActive && (Math.abs(smoothDiff) < 5) && (
              <span className="text-[10px] font-black text-[#39FF14] uppercase tracking-widest animate-pulse">Perfeito</span>
            )}
          </div>
          <p className={`text-4xl font-black italic tracking-tighter tabular-nums transition-colors duration-200`} style={{ color: isActive && currentFreq ? statusColor : '#222' }}>
            {isActive && currentFreq ? currentFreq.toFixed(0) : '---'}
          </p>
          <p className="text-[9px] font-bold text-zinc-700 uppercase tracking-widest mt-1">Hertz</p>
        </div>

        {/* Needle Container - Rotates */}
        <div
          className="absolute top-0 left-0 w-full h-full pointer-events-none transition-transform duration-[50ms] ease-out will-change-transform"
          style={{
            transform: `rotate(${rotation}deg)`
          }}
        >
          {/* The Needle Graphic */}
          <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-0.5 h-24 origin-bottom flex flex-col items-center">
            <div
              className="w-1.5 h-16 rounded-full shadow-[0_0_15px_currentColor]"
              style={{ backgroundColor: statusColor }}
            ></div>
            {/* Connection line to center (invisible/faint) */}
            <div className="w-[1px] h-full bg-gradient-to-b from-current to-transparent opacity-20" style={{ color: statusColor }}></div>
          </div>
        </div>

        {/* Center Pivot Cap */}
        <div className="absolute w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 shadow-lg z-20"></div>

      </div>
    </div>
  );
};

export default PitchDial;
