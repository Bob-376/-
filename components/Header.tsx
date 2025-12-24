
import React from 'react';
import { RefreshCcw, BrainCircuit, Lightbulb } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onTogglePins: () => void;
  onToggleDrafts: () => void;
  onToggleMemory: () => void;
  onToggleWorkshop: () => void;
  pinCount: number;
  projectName?: string;
}

const Header: React.FC<HeaderProps> = ({ onReset, onToggleMemory, onToggleWorkshop, pinCount, projectName }) => {
  return (
    <header className="bg-himalaya-red text-himalaya-cream p-4 shadow-xl border-b-4 border-himalaya-gold sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-2">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-himalaya-gold flex items-center justify-center shadow-lg transform -rotate-3 border-2 border-white/20">
             <FeatherIcon className="text-himalaya-red w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold tracking-widest font-tibetan">
              བོད་ཀྱི་ཡིག་རིགས་创作助手
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] md:text-xs text-himalaya-gold font-bold uppercase tracking-[0.2em] opacity-80">
                Tibetan Master Scribe Engine
              </span>
              {projectName && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/20 rounded-full border border-white/10 animate-in fade-in slide-in-from-left-2">
                  <div className="w-1.5 h-1.5 bg-himalaya-gold rounded-full animate-pulse shadow-[0_0_8px_#D4AF37]" />
                  <span className="text-[9px] font-bold text-white/80 uppercase tracking-wider truncate max-w-[120px]">
                    {projectName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 md:gap-3">
          <button
            onClick={onToggleWorkshop}
            className="p-2 md:px-4 md:py-2 hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 group"
            title="创作研讨"
          >
            <Lightbulb className="w-5 h-5 text-himalaya-gold group-hover:scale-110 transition-transform" />
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">研讨会</span>
          </button>
          
          <button
            onClick={onToggleMemory}
            className="p-2 md:px-4 md:py-2 hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 group"
            title="作品记忆"
          >
            <BrainCircuit className="w-5 h-5 text-himalaya-gold group-hover:scale-110 transition-transform" />
            <span className="hidden md:inline text-[10px] font-bold uppercase tracking-widest">记忆库</span>
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          
          <button
            onClick={onReset}
            className="p-2 hover:bg-white/10 rounded-xl transition-all group"
            title="重置创作"
          >
            <RefreshCcw className="w-5 h-5 text-himalaya-gold group-hover:rotate-180 transition-transform duration-700" />
          </button>
        </div>
      </div>
    </header>
  );
};

const FeatherIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
    <line x1="16" y1="8" x2="2" y2="22" />
    <line x1="17.5" y1="15" x2="9" y2="15" />
  </svg>
);

export default Header;
