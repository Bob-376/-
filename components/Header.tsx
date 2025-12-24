
import React from 'react';
import { RefreshCcw, Bookmark, Archive, BrainCircuit, Lightbulb } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onTogglePins: () => void;
  onToggleDrafts: () => void;
  onToggleMemory: () => void;
  onToggleWorkshop: () => void;
  pinCount: number;
}

const Header: React.FC<HeaderProps> = ({ onReset, onTogglePins, onToggleDrafts, onToggleMemory, onToggleWorkshop, pinCount }) => {
  return (
    <header className="bg-himalaya-red text-himalaya-cream p-4 shadow-lg border-b-4 border-himalaya-gold sticky top-0 z-10">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl md:text-2xl font-bold tracking-wide">
            བོད་ཀྱི་ཡིག་རིགས་创作助手
          </h1>
          <div className="flex flex-col md:flex-row md:items-center md:gap-3 mt-1">
            <span className="text-xs md:text-sm text-himalaya-gold opacity-90 font-sans font-medium">
              西藏文学创作助手
            </span>
            <span className="hidden md:block text-himalaya-gold/40">|</span>
            <span className="text-[10px] md:text-xs text-himalaya-gold opacity-80 font-sans tracking-wider uppercase">
              Creative Continuity Engine
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleWorkshop}
            className="p-2 hover:bg-black/20 rounded-xl transition-all duration-200 group flex items-center gap-2"
            title="创作研讨 (Writing Workshop)"
          >
            <Lightbulb className="w-6 h-6 text-himalaya-gold" />
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-widest text-himalaya-gold">研讨</span>
          </button>
          <button
            onClick={onToggleMemory}
            className="p-2 hover:bg-black/20 rounded-xl transition-all duration-200 group flex items-center gap-2"
            title="记忆与连贯性 (Memory & Continuity)"
          >
            <BrainCircuit className="w-6 h-6 text-himalaya-gold" />
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-widest text-himalaya-gold">记忆</span>
          </button>
          <button
            onClick={onToggleDrafts}
            className="p-2 hover:bg-black/20 rounded-xl transition-all duration-200 group flex items-center gap-2"
          >
            <Archive className="w-6 h-6 text-himalaya-gold" />
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-widest text-himalaya-gold">草稿</span>
          </button>
          <button
            onClick={onTogglePins}
            className="p-2 hover:bg-black/20 rounded-xl transition-all duration-200 group flex items-center gap-2"
          >
            <div className="relative">
              <Bookmark className="w-6 h-6 text-himalaya-gold" />
              {pinCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-himalaya-red text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-himalaya-gold">
                  {pinCount}
                </span>
              )}
            </div>
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-widest text-himalaya-gold">收藏</span>
          </button>
          <div className="w-px h-6 bg-himalaya-gold/20 mx-1"></div>
          <button
            onClick={onReset}
            className="p-2 hover:bg-black/20 rounded-xl transition-colors duration-200 group"
          >
            <RefreshCcw className="w-6 h-6 text-himalaya-gold group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
