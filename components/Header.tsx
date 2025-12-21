
import React from 'react';
import { RefreshCcw } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
}

const Header: React.FC<HeaderProps> = ({ onReset }) => {
  return (
    <header className="bg-himalaya-red text-himalaya-cream p-4 shadow-lg border-b-4 border-himalaya-gold sticky top-0 z-10">
      <div className="max-w-3xl mx-auto flex justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl md:text-2xl font-bold tracking-wide">
            བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག།
          </h1>
          <div className="flex flex-col md:flex-row md:items-center md:gap-3 mt-1">
            <span className="text-xs md:text-sm text-himalaya-gold opacity-90 font-sans font-medium">
              西藏文献检索系统
            </span>
            <span className="hidden md:block text-himalaya-gold/40">|</span>
            <span className="text-[10px] md:text-xs text-himalaya-gold opacity-80 font-sans tracking-wider uppercase">
              Tibetan Document Retrieval System
            </span>
          </div>
        </div>
        <button
          onClick={onReset}
          className="p-2 hover:bg-black/20 rounded-full transition-colors duration-200 group"
          title="གསར་དུ་འགོ་འཛུགས། (Start Over)"
          aria-label="Reset Chat"
        >
          <RefreshCcw className="w-6 h-6 text-himalaya-gold group-hover:rotate-180 transition-transform duration-500" />
        </button>
      </div>
    </header>
  );
};

export default Header;
