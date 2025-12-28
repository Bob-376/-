
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, BrainCircuit, Play, Pause, RotateCcw, Coffee, PenTool as Pen, Layout as LayoutIcon, Feather, Search, ArrowDownToLine } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onResetLayout: () => void;
  onToggleMemory: () => void;
  onToggleAutoScroll: () => void;
  autoScrollEnabled: boolean;
  totalCharacters: number;
  totalTshegs: number;
  epicGoal: number;
}

const Header: React.FC<HeaderProps> = ({ 
  onReset, 
  onResetLayout, 
  onToggleMemory,
  onToggleAutoScroll,
  autoScrollEnabled,
  totalCharacters,
  totalTshegs,
  epicGoal
}) => {
  const [mode, setMode] = useState<'work' | 'rest'>('work');
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [isActive, setIsActive] = useState(false);
  const [wasActiveBeforeHidden, setWasActiveBeforeHidden] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, timeLeft]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (isActive) {
          setIsActive(false);
          setWasActiveBeforeHidden(true);
        }
      } else {
        if (wasActiveBeforeHidden) {
          setIsActive(true);
          setWasActiveBeforeHidden(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isActive, wasActiveBeforeHidden]);

  useEffect(() => {
    const handleActivity = () => {
      if (!isActive && mode === 'work' && !document.hidden && timeLeft > 0) {
        setIsActive(true);
      }
    };
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    return () => {
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
    };
  }, [isActive, mode, timeLeft]);

  const toggleTimer = () => {
    setIsActive(!isActive);
    setWasActiveBeforeHidden(false);
  };
  
  const resetTimer = () => {
    setIsActive(false);
    setWasActiveBeforeHidden(false);
    setTimeLeft(60 * 60);
  };

  const switchMode = () => {
    const newMode = mode === 'work' ? 'rest' : 'work';
    setMode(newMode);
    setIsActive(false);
    setWasActiveBeforeHidden(false);
    setTimeLeft(60 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = Math.min(100, (totalCharacters / epicGoal) * 100);

  return (
    <header className="bg-himalaya-red text-himalaya-cream p-3 shadow-xl border-b-4 border-himalaya-gold sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 px-2">
        
        {/* Left Section: Clean Logo & Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-himalaya-gold flex items-center justify-center shadow-lg">
             <Search className="text-himalaya-red w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-widest font-tibetan leading-tight">
              ཤེས་རིག་བཙལ་བཤེར་མ་ལག
            </h1>
            <span className="text-[9px] text-himalaya-gold font-bold uppercase tracking-wider opacity-80">
              Intelligent Retrieval System
            </span>
          </div>
        </div>

        {/* Center Section: Progress Counter */}
        <div className="flex items-center gap-4 bg-black/20 px-4 py-1.5 rounded-xl border border-white/5 shadow-inner flex-1 max-w-md">
          <div className="flex flex-col items-start min-w-[90px]">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black text-himalaya-gold leading-none tabular-nums">{totalCharacters.toLocaleString()}</span>
              <span className="text-[7px] font-bold text-white/40 uppercase">/ {epicGoal/1000}K</span>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full bg-himalaya-gold transition-all duration-700" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex flex-col items-start">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black text-white leading-none tabular-nums">{totalTshegs.toLocaleString()}</span>
              <span className="text-[7px] font-bold text-white/40 uppercase tracking-tighter">ཚེག།</span>
            </div>
            <span className="text-[6px] font-black uppercase tracking-widest text-white/20">RETRIEVED TSHEGS</span>
          </div>
        </div>

        {/* Right Section: Timer & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-xl border border-white/5">
             <div className="flex flex-col items-center mr-1">
               <span className={`text-[6px] font-black uppercase tracking-tighter ${mode === 'work' ? 'text-himalaya-gold' : 'text-green-400'}`}>
                 {mode === 'work' ? 'Focus' : 'Rest'}
               </span>
               <div className="text-base font-mono font-bold w-12 text-center tabular-nums">
                  {formatTime(timeLeft)}
               </div>
             </div>
             <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5">
               <button onClick={toggleTimer} className={`p-1 transition-colors ${isActive ? 'text-himalaya-gold' : 'text-white/60 hover:text-white'}`}>
                 {isActive ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
               </button>
               <button onClick={switchMode} className="p-1 text-white/60 hover:text-himalaya-gold transition-colors" title="Switch Mode">
                 {mode === 'work' ? <Coffee size={14} /> : <Pen size={14} />}
               </button>
               <button onClick={resetTimer} className="p-1 text-white/40 hover:text-white transition-colors" title="Reset Timer">
                 <RotateCcw size={12} />
               </button>
             </div>
          </div>

          <div className="w-px h-6 bg-white/10 mx-1"></div>

          <nav className="flex items-center gap-1.5">
            <button 
              onClick={onToggleAutoScroll} 
              className={`p-2 rounded-lg flex items-center gap-1.5 transition-all ${autoScrollEnabled ? 'bg-white/10 text-himalaya-gold' : 'bg-white/5 text-white/40 hover:text-white'}`} 
              title={autoScrollEnabled ? "Disable Auto-Scroll" : "Enable Auto-Scroll"}
            >
              <ArrowDownToLine size={16} className={autoScrollEnabled ? 'animate-bounce' : ''} />
              <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-widest">Scroll</span>
            </button>
            <button onClick={onResetLayout} className="p-2 bg-white/5 rounded-lg text-himalaya-gold hover:bg-white/10 flex items-center gap-1.5 group" title="Reset Layout">
              <LayoutIcon size={16} />
              <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-widest">Layout</span>
            </button>
            <button onClick={onToggleMemory} className="p-2 bg-white/5 rounded-lg text-himalaya-gold hover:bg-white/10 flex items-center gap-1.5" title="Intelligence Memory">
              <BrainCircuit size={16} />
              <span className="hidden lg:inline text-[9px] font-bold uppercase tracking-widest">Memory</span>
            </button>
            <button onClick={onReset} className="p-2 bg-white/5 rounded-lg text-himalaya-gold hover:bg-white/10" title="Clear Context">
              <RefreshCcw size={16} />
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
