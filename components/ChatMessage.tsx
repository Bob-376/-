
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Message, MediaItem } from '../types';
import { 
  Bot, User, Copy, Trash2, Clock, ShieldCheck, Check, Volume2, 
  Loader2, ExternalLink, Languages, Sparkles, X, Info, FileSearch, SearchCode,
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, ChevronDown, MousePointer2
} from 'lucide-react';
import { generateSpeech, quickExplain, translateText } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
  onOCR?: (media: MediaItem) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete, onOCR }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Selection & UI States
  const [selectionRange, setSelectionRange] = useState<{ x: number, y: number, text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  // Translation States
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [activeTranslateLang, setActiveTranslateLang] = useState<'English' | 'Chinese' | null>(null);

  // Lightbox States
  const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const countHumanWords = (text: string): number => {
    if (!text) return 0;
    const tshegs = (text.match(/་/g) || []).length;
    const hanzi = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (text.match(/[a-zA-Z0-9'-]+/g) || []).length;
    return tshegs + hanzi + words;
  };

  const currentWordCount = useMemo(() => countHumanWords(message.text), [message.text]);

  const handleCopy = () => {
    const clean = message.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "").trim();
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const audioData = await generateSpeech(message.text.substring(0, 1000));
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const dataInt16 = new Int16Array(audioData.buffer);
      const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    }
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionRange({
        x: rect.left + window.scrollX + (rect.width / 2),
        y: rect.top + window.scrollY - 10,
        text: selection.toString().trim()
      });
    } else {
      setSelectionRange(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selectedText
      });
    }
  };

  const runQuickExplain = async (textToExplain?: string) => {
    const targetText = textToExplain || selectionRange?.text || contextMenu?.text;
    if (!targetText) return;
    
    setContextMenu(null);
    setSelectionRange(null);
    setIsExplaining(true);
    
    try {
      const result = await quickExplain(targetText);
      setExplanation(result);
    } catch (err) {
      setExplanation("Analysis failed. Please try again.");
    } finally {
      setIsExplaining(false);
    }
  };

  const handleTranslate = async (lang: 'English' | 'Chinese') => {
    setShowTranslateMenu(false);
    if (activeTranslateLang === lang && translation) {
      setTranslation(null);
      setActiveTranslateLang(null);
      return;
    }
    
    setIsTranslating(true);
    try {
      const result = await translateText(message.text, lang);
      setTranslation(result);
      setActiveTranslateLang(lang);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslating(false);
    }
  };

  const adjustZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(5, Math.max(0.5, prev + delta)));
  };

  // Keyboard, Wheel, and Global Click Handlers
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      window.addEventListener('click', handleClickOutside);
      window.addEventListener('scroll', handleClickOutside, true);
    }

    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleClickOutside, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!previewImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const panStep = 60;
      const container = imageContainerRef.current;

      switch(e.key) {
        case '+':
        case '=':
          e.preventDefault();
          adjustZoom(0.25);
          break;
        case '-':
        case '_':
          e.preventDefault();
          adjustZoom(-0.25);
          break;
        case '0':
          e.preventDefault();
          setZoomLevel(1);
          break;
        case 'Escape':
          setPreviewImage(null);
          setZoomLevel(1);
          break;
        case 'ArrowUp':
          if (container) { e.preventDefault(); container.scrollTop -= panStep; }
          break;
        case 'ArrowDown':
          if (container) { e.preventDefault(); container.scrollTop += panStep; }
          break;
        case 'ArrowLeft':
          if (container) { e.preventDefault(); container.scrollLeft -= panStep; }
          break;
        case 'ArrowRight':
          if (container) { e.preventDefault(); container.scrollLeft += panStep; }
          break;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        adjustZoom(e.deltaY > 0 ? -0.25 : 0.25);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [previewImage]);

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500 relative group`}>
      <div className={`flex items-start gap-3 max-w-[92%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${isUser ? 'bg-himalaya-gold border-himalaya-red/10 text-himalaya-red' : 'bg-himalaya-red border-himalaya-gold text-himalaya-gold shadow-md'}`}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>
        
        <div className={`p-6 md:p-8 rounded-[1.5rem] shadow-xl ${isUser ? 'bg-himalaya-gold/15 backdrop-blur-sm border border-himalaya-gold/25 text-himalaya-dark rounded-tr-none' : 'bg-white text-himalaya-dark rounded-tl-none border border-gray-100'}`}>
          <div className="flex justify-between items-center mb-4 opacity-30">
            <span className="text-[7px] font-black uppercase tracking-widest">{isUser ? 'User Manuscript' : 'System Record'}</span>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button 
                  onClick={() => setShowTranslateMenu(!showTranslateMenu)}
                  className={`transition-colors ${isTranslating ? 'text-himalaya-red' : 'text-gray-400 hover:text-himalaya-red'}`}
                  title="ཡིག་སྒྱུར། | Translate scholarly content"
                >
                  {isTranslating ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                </button>
                {showTranslateMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-100 shadow-2xl rounded-xl p-1 z-50 flex flex-col min-w-[100px] animate-in fade-in zoom-in-95">
                    <button onClick={() => handleTranslate('English')} className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-600 hover:bg-gray-50 hover:text-himalaya-red rounded-lg text-left">English</button>
                    <button onClick={() => handleTranslate('Chinese')} className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-600 hover:bg-gray-50 hover:text-himalaya-red rounded-lg text-left">Chinese</button>
                  </div>
                )}
              </div>
              {!isUser && (
                <button 
                  onClick={handlePlayAudio} 
                  className={`transition-colors ${isPlaying ? 'text-himalaya-red animate-pulse' : 'text-gray-400 hover:text-himalaya-red'}`}
                  title="སྒྲ་ཀློག་པ། | Listen: Convert Tibetan text to natural audio speech"
                >
                  {isPlaying ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                </button>
              )}
              <button 
                onClick={handleCopy} 
                className={`transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`}
                title="འདྲ་བཤུས་བྱེད་པ། | Copy this message to your clipboard"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button 
                onClick={() => onDelete?.(message.id)} 
                className="text-gray-400 hover:text-red-600"
                title="བསུབ་པ། | Delete this message from the current session"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {message.mediaItems && message.mediaItems.length > 0 && (
            <div className={`mb-4 grid gap-2 ${message.mediaItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {message.mediaItems.map((item, idx) => (
                <div key={idx} className="overflow-hidden rounded-xl border border-himalaya-gold/20 shadow-lg relative group/media cursor-zoom-in" title="Preview image in full-screen lens">
                   {item.type === 'image' ? (
                     <div className="relative">
                       <img 
                         src={`data:${item.mimeType};base64,${item.data}`} 
                         alt="Attached retrieval artifact" 
                         className="w-full h-auto max-h-[400px] object-contain bg-gray-50 hover:opacity-95 transition-opacity"
                         onClick={() => setPreviewImage(item)}
                       />
                       {/* OCR Quick Action Button */}
                       {onOCR && (
                         <button 
                           onClick={(e) => { e.stopPropagation(); onOCR(item); }}
                           className="absolute top-3 right-3 p-2 bg-white/70 hover:bg-himalaya-red hover:text-white backdrop-blur-md rounded-full text-himalaya-red shadow-lg transition-all opacity-0 group-hover/media:opacity-100 scale-90 group-hover/media:scale-100 flex items-center gap-2"
                           title="བོད་ཡིག་原文提取 | Extract original Tibetan script using philological OCR"
                         >
                           <SearchCode size={16} />
                           <span className="text-[10px] font-black uppercase pr-1">བོད་ཡིག་原文</span>
                         </button>
                       )}
                     </div>
                   ) : (
                     <div className="aspect-video bg-gray-900 flex items-center justify-center text-white">
                        <span className="text-[10px] font-black uppercase">Video Record</span>
                     </div>
                   )}
                   <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[8px] text-white font-black uppercase tracking-widest pointer-events-none">
                     {item.type === 'image' ? 'Image' : 'Video'}
                   </div>
                </div>
              ))}
            </div>
          )}
          
          <div 
            ref={contentRef}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            className="message-content text-himalaya-dark whitespace-pre-wrap leading-[1.8] font-tibetan text-[1.2rem] selection:bg-himalaya-gold/30"
          >
            {message.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "")}
          </div>

          {translation && (
            <div className="mt-6 pt-6 border-t border-himalaya-gold/10 animate-in slide-in-from-top-2 duration-300">
               <div className="flex items-center gap-2 mb-3">
                  <span className="text-[8px] font-black uppercase bg-himalaya-gold/20 text-himalaya-red px-2 py-0.5 rounded-full tracking-widest">
                    Translation ({activeTranslateLang})
                  </span>
                  <button onClick={() => setTranslation(null)} className="text-gray-300 hover:text-red-500"><X size={10} /></button>
               </div>
               <div className={`whitespace-pre-wrap leading-relaxed ${activeTranslateLang === 'Chinese' ? 'font-sans text-[1.1rem]' : 'font-serif text-[1rem]'} text-gray-700 italic`}>
                 {translation}
               </div>
            </div>
          )}

          {message.groundingChunks && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Sources & Citations</span>
              <div className="flex flex-wrap gap-2">
                {message.groundingChunks.map((chunk, idx) => chunk.web && (
                  <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[9px] text-blue-600 hover:bg-blue-50 transition-colors" title={`ཕྱི་འབྲེལ་དྲ་ཚིག | Open source: ${chunk.web.title}`}>
                    <ExternalLink size={10} />
                    {chunk.web.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {!isUser && !message.isStreaming && (
            <div className="flex flex-col items-center pt-6 mt-6 border-t border-gray-100 gap-2">
               <div className="flex items-center gap-2 px-4 py-1.5 bg-himalaya-red text-himalaya-gold rounded-full border border-himalaya-gold/40 shadow-md" title="Verification of scholarly content generation">
                  <ShieldCheck size={12} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Master Scribe Authorized</span>
                  <div className="w-px h-3 bg-himalaya-gold/30 mx-0.5" />
                  <span className="text-[10px] font-bold tabular-nums">+{currentWordCount} ཚིག།</span>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Trigger (Selection Button) */}
      {selectionRange && !explanation && !contextMenu && (
        <button
          onClick={() => runQuickExplain()}
          style={{ position: 'fixed', left: selectionRange.x, top: selectionRange.y, transform: 'translate(-50%, -100%)' }}
          className="z-[300] bg-himalaya-gold text-himalaya-red p-2.5 rounded-full shadow-2xl border border-himalaya-red/20 animate-in zoom-in slide-in-from-bottom-2 duration-200 hover:scale-110 active:scale-95 flex items-center gap-2 group"
          title="ཤེས་རིག་གནད་བསྡུས། | Philologist's Lens: Analyze the selected text segment"
        >
          {isExplaining ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
          <span className="text-[9px] font-black uppercase tracking-widest overflow-hidden max-w-0 group-hover:max-w-[100px] transition-all duration-300">Quick Lens</span>
        </button>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
          className="z-[500] bg-himalaya-dark/95 backdrop-blur-md border border-himalaya-gold/50 rounded-2xl shadow-2xl p-1.5 min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => runQuickExplain()}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-himalaya-gold/20 text-himalaya-gold rounded-xl transition-all group"
          >
            <Sparkles size={16} className="group-hover:scale-125 transition-transform" />
            <div className="flex flex-col items-start">
              <span className="font-tibetan text-sm leading-none mb-0.5">ཤེས་རིག་གནད་བསྡུས།</span>
              <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Philologist's Lens</span>
            </div>
          </button>
          
          <div className="h-px bg-himalaya-gold/10 my-1 mx-2" />
          
          <button 
            onClick={() => { handleCopy(); setContextMenu(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-white/70 hover:text-white rounded-xl transition-all"
          >
            <Copy size={16} />
            <div className="flex flex-col items-start">
              <span className="font-tibetan text-sm leading-none mb-0.5">འདྲ་བཤུས་བྱེད་པ།</span>
              <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Copy Selection</span>
            </div>
          </button>
        </div>
      )}

      {/* Image Lightbox / Zoom Overlay */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[600] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => { setPreviewImage(null); setZoomLevel(1); }}
        >
          <div className="absolute top-6 left-6 z-[610] flex items-center gap-3">
            <div className="p-2 bg-himalaya-red rounded-xl text-himalaya-gold shadow-2xl">
              <Sparkles size={20} />
            </div>
            <span className="text-[11px] font-black text-white uppercase tracking-[0.2em] shadow-sm">Artifact Lens Viewer</span>
          </div>

          <button 
            onClick={() => { setPreviewImage(null); setZoomLevel(1); }}
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-himalaya-red text-white rounded-full transition-all z-[610] hover:scale-110"
            title="སྒོ་རྒྱག་པ། | Close viewer (Esc)"
          >
            <X size={24} />
          </button>

          {/* Zoom Controls Toolbar */}
          <div 
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-himalaya-dark/80 backdrop-blur-md border border-white/10 rounded-2xl p-2 flex items-center gap-4 z-[610] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => adjustZoom(-0.25)} 
              className="p-2 hover:bg-white/10 text-white rounded-xl transition-colors" 
              title="ཆུང་དུ་གཏོང་བ། | Zoom Out (-)"
            >
              <ZoomOut size={20} />
            </button>
            <div className="w-px h-6 bg-white/10" />
            <div className="px-2 min-w-[60px] text-center" title="Current zoom level">
              <span className="text-[10px] font-black text-himalaya-gold uppercase">{Math.round(zoomLevel * 100)}%</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <button 
              onClick={() => adjustZoom(0.25)} 
              className="p-2 hover:bg-white/10 text-white rounded-xl transition-colors" 
              title="ཆེ་རུ་གཏོང་བ། | Zoom In (+)"
            >
              <ZoomIn size={20} />
            </button>
            <div className="w-px h-6 bg-white/10" />
            <button 
              onClick={() => setZoomLevel(1)} 
              className="p-2 hover:bg-white/10 text-white rounded-xl transition-colors" 
              title="བསྐྱར་སྒྲིག | Reset Zoom (0)"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          <div 
            ref={imageContainerRef}
            className="relative w-full h-full flex items-center justify-center overflow-auto custom-scrollbar no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={`data:${previewImage.mimeType};base64,${previewImage.data}`}
              alt="Preview"
              className="max-w-none transition-transform duration-200 ease-out shadow-2xl cursor-grab active:cursor-grabbing"
              style={{ transform: `scale(${zoomLevel})` }}
              draggable={false}
              onMouseDown={(e) => {
                const target = e.currentTarget;
                let startX = e.clientX;
                let startY = e.clientY;
                let scrollLeft = target.parentElement?.scrollLeft || 0;
                let scrollTop = target.parentElement?.scrollTop || 0;

                const onMouseMove = (moveEvent: MouseEvent) => {
                  if (target.parentElement) {
                    target.parentElement.scrollLeft = scrollLeft - (moveEvent.clientX - startX);
                    target.parentElement.scrollTop = scrollTop - (moveEvent.clientY - startY);
                  }
                };

                const onMouseUp = () => {
                  window.removeEventListener('mousemove', onMouseMove);
                  window.removeEventListener('mouseup', onMouseUp);
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
              }}
            />
          </div>
        </div>
      )}

      {/* Quick Explain Result Modal */}
      {(explanation || isExplaining) && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-himalaya-dark/20 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl border-4 border-himalaya-gold overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <div className="h-14 bg-himalaya-red flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-himalaya-gold rounded-lg text-himalaya-red">
                  <Sparkles size={16} />
                </div>
                <span className="text-[10px] font-bold text-himalaya-gold uppercase tracking-widest font-tibetan">ཤེས་རིག་གནད་བསྡུས། (Philologist's Lens)</span>
              </div>
              <button 
                onClick={() => { setExplanation(null); setSelectionRange(null); }} 
                className="text-himalaya-gold/60 hover:text-himalaya-gold"
                title="སྒོ་རྒྱག་པ། | Close analysis window"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                 <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Selected Passage</span>
                 <p className="font-tibetan text-lg text-himalaya-dark leading-relaxed">"{selectionRange?.text || contextMenu?.text}"</p>
              </div>

              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 size={40} className="animate-spin text-himalaya-gold" />
                  <span className="text-[10px] font-black text-himalaya-gold uppercase tracking-[0.2em] animate-pulse">Analyzing Scripts...</span>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="prose prose-sm prose-himalaya max-w-none">
                      <div className="text-himalaya-dark font-tibetan text-[1.1rem] leading-relaxed whitespace-pre-wrap">
                        {explanation}
                      </div>
                   </div>
                   <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                      <Info size={14} />
                      <span className="text-[9px] font-bold">This analysis is powered by the Marathon Philology engine for precise cross-lingual context.</span>
                   </div>
                </div>
              )}
            </div>
            
            <div className="h-12 bg-gray-50 border-t border-gray-100 flex items-center justify-center">
               <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">Intelligent Retrieval System © 2025</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ChatMessage;
