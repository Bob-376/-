
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, BrainCircuit, Lightbulb, Play, Pause, RotateCcw, Coffee, PenTool as Pen, Layout as LayoutIcon, Feather } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onResetLayout: () => void;
  onTogglePins: () => void;
  onToggleDrafts: () => void;
  onToggleMemory: () => void;
  onToggleWorkshop: () => void;
  pinCount: number;
  projectName?: string;
}

const Header: React.FC<HeaderProps> = ({ onReset, onResetLayout, onToggleMemory, onToggleWorkshop, pinCount, projectName }) => {
  const [mode, setMode] = useState<'work' | 'rest'>('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
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

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const switchMode = () => {
    const newMode = mode === 'work' ? 'rest' : 'work';
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(newMode === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <header className="bg-himalaya-red text-himalaya-cream p-4 shadow-xl border-b-4 border-himalaya-gold sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 px-2">
        
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-himalaya-gold flex items-center justify-center shadow-lg border-2 border-white/20">
             <Feather className="text-himalaya-red w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold tracking-widest font-tibetan">
              བོད་ཀྱི་ཡིག་རིགས་创作助手
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs text-himalaya-gold font-bold uppercase tracking-[0.2em] opacity-80">
                Tibetan Master Scribe
              </span>
              {projectName && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 bg-black/20 rounded-full border border-white/10">
                  <div className="w-1.5 h-1.5 bg-himalaya-gold rounded-full" />
                  <span className="text-[8px] font-bold text-white/60 uppercase tracking-wider truncate max-w-[100px] font-light">
                    {projectName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-2xl border border-white/10 shadow-inner">
          <div className="flex flex-col items-center mr-2">
             <span className={`text-[8px] font-bold uppercase tracking-widest ${mode === 'work' ? 'text-himalaya-gold' : 'text-emerald-400'}`}>
                {mode === 'work' ? '专注创作 ལས་ཀ།' : '静心休憩 ངལ་གསོ།'}
             </span>
             <div className="text-xl font-mono font-bold tracking-tighter w-16 text-center" aria-live="off">
                {formatTime(timeLeft)}
             </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={toggleTimer} className={`p-2 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-himalaya-gold text-himalaya-red'}`}>
              {isActive ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
            </button>
            <button onClick={switchMode} className="p-2 bg-white/5 rounded-lg text-himalaya-gold">
              {mode === 'work' ? <Coffee size={16} /> : <Pen size={16} />}
            </button>
            <button onClick={resetTimer} className="p-2 bg-white/5 rounded-lg text-white/40 hover:text-white">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
        
        <nav className="flex items-center gap-1 md:gap-3">
          <button onClick={onResetLayout} className="p-2 md:px-4 md:py-2 bg-white/5 rounded-xl flex items-center gap-2 text-himalaya-gold" title="重置窗口位置">
            <LayoutIcon className="w-5 h-5" />
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">重置布局</span>
          </button>

          <button onClick={onToggleWorkshop} className="p-2 md:px-4 md:py-2 bg-white/5 rounded-xl flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-himalaya-gold" />
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">研讨会</span>
          </button>
          
          <button onClick={onToggleMemory} className="p-2 md:px-4 md:py-2 bg-white/5 rounded-xl flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-himalaya-gold" />
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">记忆库</span>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          
          <button onClick={onReset} className="p-2 bg-white/5 rounded-xl" title="重置对话">
            <RefreshCcw className="w-5 h-5 text-himalaya-gold" />
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;
