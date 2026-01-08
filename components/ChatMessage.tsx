
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Message, MediaItem } from '../types';
import { 
  Bot, User, Copy, Trash2, Clock, ShieldCheck, Check, Volume2, 
  Loader2, ExternalLink, Languages, Sparkles, X, Info, FileSearch, SearchCode,
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, ChevronDown, MousePointer2,
  Film, Wand2, Edit, Search, Scan, MapPin
} from 'lucide-react';
import { generateSpeech, quickExplain, translateText } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
  onOCR?: (media: MediaItem) => Promise<void> | void;
  onAnimate?: (media: MediaItem) => void;
  onEdit?: (media: MediaItem, prompt: string) => void;
  onAddHotspot?: (msgId: string, mediaIndex: number, hotspot: {x: number, y: number, label: string}) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete, onOCR, onAnimate, onEdit, onAddHotspot }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [showEditInput, setShowEditInput] = useState<string | null>(null);
  const [loadingOCRIndex, setLoadingOCRIndex] = useState<number | null>(null);
  
  // Hotspot States
  const [hotspotMode, setHotspotMode] = useState<{ idx: number, x?: number, y?: number } | null>(null);
  const [hotspotLabel, setHotspotLabel] = useState("");

  // Selection UI States
  const [selectionRange, setSelectionRange] = useState<{ x: number, y: number, text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  
  // Translation States
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [activeTranslateLang, setActiveTranslateLang] = useState<'English' | 'Chinese' | null>(null);

  const [previewImage, setPreviewImage] = useState<MediaItem | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hotspotInputRef = useRef<HTMLInputElement>(null);

  const currentWordCount = useMemo(() => {
    const text = message.text || "";
    const tshegs = (text.match(/་/g) || []).length;
    const hanzi = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (text.match(/[a-zA-Z0-9'-]+/g) || []).length;
    return tshegs + hanzi + words;
  }, [message.text]);

  const handlePlayAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const audioData = await generateSpeech(message.text.substring(0, 500));
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = audioContext.createBuffer(1, audioData.length / 2, 24000);
      const dataInt16 = new Int16Array(audioData.buffer);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (e) { console.error(e); setIsPlaying(false); }
  };

  const handleTranslate = async (lang: 'English' | 'Chinese') => {
    setShowTranslateMenu(false);
    setIsTranslating(true);
    try {
      const result = await translateText(message.text, lang);
      setTranslation(result);
      setActiveTranslateLang(lang);
    } catch (err) { console.error(err); } finally { setIsTranslating(false); }
  };

  const handleOCRClick = async (item: MediaItem, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingOCRIndex !== null) return;
    setLoadingOCRIndex(idx);
    try {
      if (onOCR) {
        await Promise.all([
          Promise.resolve(onOCR(item)),
          new Promise(resolve => setTimeout(resolve, 2000)) // Minimum duration for effect
        ]);
      }
    } catch (error) {
      console.error("OCR failed", error);
    } finally {
      setLoadingOCRIndex(null);
    }
  };

  const handleImageClick = (e: React.MouseEvent, idx: number) => {
    if (hotspotMode?.idx !== idx) return;
    if (hotspotMode.x !== undefined) return; // Already placed point, waiting for input

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setHotspotMode({ idx, x, y });
    
    // Focus next tick
    setTimeout(() => hotspotInputRef.current?.focus(), 50);
  };

  const saveHotspot = () => {
    if (hotspotMode && hotspotMode.x !== undefined && hotspotLabel.trim()) {
      onAddHotspot?.(message.id, hotspotMode.idx, { x: hotspotMode.x, y: hotspotMode.y!, label: hotspotLabel });
      setHotspotMode(null);
      setHotspotLabel("");
    }
  };

  // Selection Logic
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

  const handleTranslateSelection = async (lang: 'English' | 'Chinese') => {
    const targetText = selectionRange?.text || contextMenu?.text;
    if (!targetText) return;
    
    setContextMenu(null);
    setSelectionRange(null);
    setIsTranslating(true);
    
    try {
      const result = await translateText(targetText, lang);
      setExplanation(`Translation (${lang}):\n\n${result}`);
    } catch (err) {
      setExplanation("Translation failed.");
    } finally {
      setIsTranslating(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 relative group`}>
      <div className={`flex items-start gap-3 max-w-[92%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${isUser ? 'bg-himalaya-gold border-himalaya-gold/20 text-himalaya-red' : 'bg-himalaya-red border-himalaya-gold text-himalaya-gold shadow-md'}`}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>
        
        <div className={`p-6 md:p-8 rounded-[1.5rem] shadow-xl ${isUser ? 'bg-himalaya-gold/15 backdrop-blur-sm border border-himalaya-gold/25 text-himalaya-dark rounded-tr-none' : 'bg-white text-himalaya-dark rounded-tl-none border border-gray-100'}`}>
          <div className="flex justify-between items-center mb-4 opacity-30">
            <span className="text-[7px] font-black uppercase tracking-widest">{isUser ? 'Manuscript' : 'Record'}</span>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button onClick={() => setShowTranslateMenu(!showTranslateMenu)} className="text-gray-400 hover:text-himalaya-red" title="Translate Message">
                  {isTranslating ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
                </button>
                {showTranslateMenu && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-100 shadow-2xl rounded-xl p-1 z-50 flex flex-col min-w-[100px] animate-in fade-in zoom-in-95">
                    <button onClick={() => handleTranslate('English')} className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-600 hover:bg-gray-50 hover:text-himalaya-red rounded-lg text-left">English</button>
                    <button onClick={() => handleTranslate('Chinese')} className="px-3 py-1.5 text-[10px] font-black uppercase text-gray-600 hover:bg-gray-50 hover:text-himalaya-red rounded-lg text-left">Chinese</button>
                  </div>
                )}
              </div>
              {!isUser && <button onClick={handlePlayAudio} className="text-gray-400 hover:text-himalaya-red">{isPlaying ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}</button>}
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(message.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }} 
                className={`transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button onClick={() => onDelete?.(message.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
            </div>
          </div>

          {message.mediaItems && message.mediaItems.length > 0 && (
            <div className={`mb-4 grid gap-2 ${message.mediaItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {message.mediaItems.map((item, idx) => (
                <div key={idx} className="overflow-hidden rounded-xl border border-himalaya-gold/20 relative group/media">
                   {item.type === 'image' ? (
                     <div className="relative" onClick={(e) => handleImageClick(e, idx)} style={{ cursor: hotspotMode?.idx === idx && hotspotMode.x === undefined ? 'crosshair' : 'default' }}>
                       <img src={item.data.startsWith('data:') ? item.data : `data:${item.mimeType};base64,${item.data}`} alt="Artifact" className="w-full h-auto max-h-[400px] object-contain bg-gray-50" onClick={(e) => { if(!hotspotMode) setPreviewImage(item); }} />
                       
                       {/* Hotspots Rendering */}
                       {item.hotspots?.map((hs, hIdx) => (
                         <div 
                            key={hIdx}
                            className="absolute z-20 group/hotspot"
                            style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
                         >
                            <div className="relative -ml-2 -mt-2 w-4 h-4 rounded-full bg-himalaya-red border-2 border-himalaya-gold shadow-lg cursor-help animate-pulse hover:scale-125 transition-transform">
                              <div className="absolute inset-0 bg-white opacity-20 rounded-full animate-ping"></div>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-black/90 text-himalaya-gold text-xs font-tibetan rounded-lg opacity-0 group-hover/hotspot:opacity-100 transition-opacity whitespace-nowrap z-30 pointer-events-none">
                               {hs.label}
                               <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/90 rotate-45"></div>
                            </div>
                         </div>
                       ))}

                       {/* Hotspot Creation Input */}
                       {hotspotMode?.idx === idx && hotspotMode.x !== undefined && (
                         <div className="absolute z-30" style={{ left: `${hotspotMode.x}%`, top: `${hotspotMode.y}%` }}>
                           <div className="relative -ml-2 -mt-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white mb-1 shadow-lg"></div>
                           <input
                             ref={hotspotInputRef}
                             type="text"
                             value={hotspotLabel}
                             onChange={(e) => setHotspotLabel(e.target.value)}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') saveHotspot();
                               if (e.key === 'Escape') { setHotspotMode(null); setHotspotLabel(""); }
                             }}
                             placeholder="Label this point..."
                             className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white text-black text-xs px-2 py-1 rounded shadow-xl border border-blue-500 min-w-[120px] focus:outline-none"
                             onClick={(e) => e.stopPropagation()}
                           />
                         </div>
                       )}
                       
                       {/* OCR Loading Overlay */}
                       {loadingOCRIndex === idx && (
                         <div className="absolute inset-0 bg-himalaya-dark/80 backdrop-blur-sm flex flex-col items-center justify-center text-himalaya-gold z-20 animate-in fade-in duration-300">
                           <div className="relative mb-3">
                             <div className="absolute inset-0 bg-himalaya-gold/30 blur-xl rounded-full animate-pulse"></div>
                             <Scan size={40} className="animate-pulse relative z-10" />
                             <Loader2 size={40} className="animate-spin absolute inset-0 z-10 opacity-50" />
                           </div>
                           <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Scanning Tibetan Script...</span>
                         </div>
                       )}

                       <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover/media:opacity-100 transition-opacity z-10">
                         <button onClick={(e) => { e.stopPropagation(); onAnimate?.(item); }} className="p-2 bg-black/60 text-white rounded-full hover:bg-himalaya-red shadow-lg" title="Veo Animation"><Film size={14} /></button>
                         <button 
                           onClick={(e) => handleOCRClick(item, idx, e)} 
                           className={`p-2 rounded-full shadow-lg transition-all ${loadingOCRIndex === idx ? 'bg-himalaya-gold text-himalaya-red' : 'bg-black/60 text-white hover:bg-green-600'}`} 
                           title="བོད་ཡིག་原文提取 | Tibetan OCR Analysis"
                           disabled={loadingOCRIndex === idx}
                         >
                           <SearchCode size={14} />
                         </button>
                         <button 
                           onClick={(e) => { e.stopPropagation(); setHotspotMode(prev => prev?.idx === idx ? null : { idx }); }} 
                           className={`p-2 rounded-full shadow-lg transition-all ${hotspotMode?.idx === idx ? 'bg-blue-600 text-white ring-2 ring-white' : 'bg-black/60 text-white hover:bg-blue-500'}`} 
                           title="Add Interactive Hotspot"
                         >
                           <MapPin size={14} />
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); setShowEditInput(idx.toString()); }} className="p-2 bg-black/60 text-white rounded-full hover:bg-blue-600 shadow-lg" title="Edit with Flash Image"><Edit size={14} /></button>
                       </div>
                       {showEditInput === idx.toString() && (
                         <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80 flex gap-2 z-30" onClick={e => e.stopPropagation()}>
                           <input value={editPrompt} onChange={e => setEditPrompt(e.target.value)} placeholder="Edit prompt..." className="flex-1 bg-white/10 text-white text-xs p-1 rounded border border-white/20" />
                           <button onClick={() => { onEdit?.(item, editPrompt); setShowEditInput(null); setEditPrompt(""); }} className="bg-himalaya-red text-white p-1 rounded text-[10px] px-2 font-bold">Edit</button>
                         </div>
                       )}
                     </div>
                   ) : (
                     <video src={item.data} controls className="w-full h-auto rounded-lg shadow-inner bg-black" />
                   )}
                </div>
              ))}
            </div>
          )}
          
          <div 
            ref={contentRef}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            className="text-himalaya-dark font-tibetan text-[1.2rem] leading-relaxed whitespace-pre-wrap selection:bg-himalaya-gold/30"
          >
            {message.text}
          </div>

          {translation && <div className="mt-6 pt-6 border-t border-himalaya-gold/10 italic text-gray-700 font-tibetan leading-relaxed">{translation}</div>}
          
          {!isUser && !message.isStreaming && (
            <div className="flex flex-col items-center pt-6 mt-6 border-t border-gray-100">
               <div className="flex items-center gap-2 px-4 py-1.5 bg-himalaya-red text-himalaya-gold rounded-full shadow-md">
                  <ShieldCheck size={12} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Scholar Authorized</span>
                  <div className="w-px h-3 bg-himalaya-gold/30 mx-1" />
                  <span className="text-[10px] font-bold">+{currentWordCount} ཚིག།</span>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Selection Trigger */}
      {selectionRange && !explanation && !contextMenu && (
        <button
          onClick={() => runQuickExplain()}
          style={{ position: 'fixed', left: selectionRange.x, top: selectionRange.y, transform: 'translate(-50%, -100%)' }}
          className="z-[300] bg-himalaya-gold text-himalaya-red p-2.5 rounded-full shadow-2xl border border-himalaya-red/20 animate-in zoom-in slide-in-from-bottom-2 duration-200 hover:scale-110 active:scale-95 flex items-center gap-2 group"
          title="ཤེས་རིག་གནད་བསྡུས། | Philologist's Lens"
        >
          <Sparkles size={16} />
          <span className="text-[9px] font-black uppercase tracking-widest overflow-hidden max-w-0 group-hover:max-w-[100px] transition-all duration-300">Quick Lens</span>
        </button>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
          className="z-[500] bg-himalaya-dark/95 backdrop-blur-md border border-himalaya-gold/50 rounded-2xl shadow-2xl p-1.5 min-w-[200px] animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => runQuickExplain()}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-himalaya-gold/20 text-himalaya-gold rounded-xl transition-all group"
          >
            <Sparkles size={16} className="group-hover:scale-125 transition-transform" />
            <div className="flex flex-col items-start">
              <span className="font-tibetan text-sm leading-none mb-0.5 text-left">ཤེས་རིག་གནད་བསྡུས།</span>
              <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Philologist's Lens</span>
            </div>
          </button>
          
          <div className="h-px bg-himalaya-gold/10 my-1 mx-2" />

          <button 
            onClick={() => handleTranslateSelection('English')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white rounded-xl transition-all"
          >
            <Languages size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">Translate to English</span>
          </button>
          <button 
            onClick={() => handleTranslateSelection('Chinese')}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white rounded-xl transition-all"
          >
            <Languages size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">Translate to Chinese</span>
          </button>
          
          <div className="h-px bg-himalaya-gold/10 my-1 mx-2" />
          
          <button 
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.text);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-white/70 hover:text-white rounded-xl transition-all"
          >
            <Copy size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">Copy Selection</span>
          </button>
        </div>
      )}

      {/* Explanation Modal */}
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
              <button onClick={() => { setExplanation(null); setIsExplaining(false); }} className="text-himalaya-gold/60 hover:text-himalaya-gold">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 size={40} className="animate-spin text-himalaya-gold" />
                  <span className="text-[10px] font-black text-himalaya-gold uppercase tracking-[0.2em] animate-pulse">Analyzing Scripts...</span>
                </div>
              ) : (
                <div className="space-y-6">
                   <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 italic font-tibetan text-lg leading-relaxed text-himalaya-dark">
                      "{selectionRange?.text || contextMenu?.text}"
                   </div>
                   <div className="text-himalaya-dark font-tibetan text-[1.1rem] leading-relaxed whitespace-pre-wrap">
                     {explanation}
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

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[600] bg-black/95 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-300" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-8 right-8 text-white/50 hover:text-white p-2">
            <X size={32} />
          </button>
          <img 
            src={previewImage.data.startsWith('data:') ? previewImage.data : `data:${previewImage.mimeType};base64,${previewImage.data}`} 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});

export default ChatMessage;
