
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Message, MediaItem } from '../types';
import { 
  Bot, User, Copy, Trash2, Clock, ShieldCheck, Check, Volume2, 
  Loader2, ExternalLink, Languages, Sparkles, X, Info, FileSearch, SearchCode
} from 'lucide-react';
import { generateSpeech, quickExplain } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
  onOCR?: (media: MediaItem) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete, onOCR }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Selection States
  const [selectionRange, setSelectionRange] = useState<{ x: number, y: number, text: string } | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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

  const runQuickExplain = async () => {
    if (!selectionRange) return;
    setIsExplaining(true);
    try {
      const result = await quickExplain(selectionRange.text);
      setExplanation(result);
    } catch (err) {
      setExplanation("Analysis failed. Please try again.");
    } finally {
      setIsExplaining(false);
    }
  };

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
              {!isUser && (
                <button onClick={handlePlayAudio} className={`transition-colors ${isPlaying ? 'text-himalaya-red animate-pulse' : 'text-gray-400 hover:text-himalaya-red'}`}>
                  {isPlaying ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                </button>
              )}
              <button onClick={handleCopy} className={`transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button onClick={() => onDelete?.(message.id)} className="text-gray-400 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {message.mediaItems && message.mediaItems.length > 0 && (
            <div className={`mb-4 grid gap-2 ${message.mediaItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {message.mediaItems.map((item, idx) => (
                <div key={idx} className="overflow-hidden rounded-xl border border-himalaya-gold/20 shadow-lg relative group/media">
                   {item.type === 'image' ? (
                     <div className="relative">
                       <img 
                         src={`data:${item.mimeType};base64,${item.data}`} 
                         alt="Attached retrieval artifact" 
                         className="w-full h-auto max-h-[400px] object-contain bg-gray-50"
                       />
                       {/* OCR Quick Action Button */}
                       {onOCR && (
                         <button 
                           onClick={() => onOCR(item)}
                           className="absolute top-3 right-3 p-2 bg-white/70 hover:bg-himalaya-red hover:text-white backdrop-blur-md rounded-full text-himalaya-red shadow-lg transition-all opacity-0 group-hover/media:opacity-100 scale-90 group-hover/media:scale-100 flex items-center gap-2"
                           title="Extract Tibetan Original"
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
            className="message-content text-himalaya-dark whitespace-pre-wrap leading-[1.8] font-tibetan text-[1.2rem] selection:bg-himalaya-gold/30"
          >
            {message.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "")}
          </div>

          {message.groundingChunks && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Sources & Citations</span>
              <div className="flex flex-wrap gap-2">
                {message.groundingChunks.map((chunk, idx) => chunk.web && (
                  <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[9px] text-blue-600 hover:bg-blue-50 transition-colors">
                    <ExternalLink size={10} />
                    {chunk.web.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {!isUser && !message.isStreaming && (
            <div className="flex flex-col items-center pt-6 mt-6 border-t border-gray-100 gap-2">
               <div className="flex items-center gap-2 px-4 py-1.5 bg-himalaya-red text-himalaya-gold rounded-full border border-himalaya-gold/40 shadow-md">
                  <ShieldCheck size={12} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Master Scribe Authorized</span>
                  <div className="w-px h-3 bg-himalaya-gold/30 mx-0.5" />
                  <span className="text-[10px] font-bold tabular-nums">+{currentWordCount} ཚིག།</span>
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Trigger */}
      {selectionRange && !explanation && (
        <button
          onClick={runQuickExplain}
          style={{ position: 'fixed', left: selectionRange.x, top: selectionRange.y, transform: 'translate(-50%, -100%)' }}
          className="z-[300] bg-himalaya-gold text-himalaya-red p-2.5 rounded-full shadow-2xl border border-himalaya-red/20 animate-in zoom-in slide-in-from-bottom-2 duration-200 hover:scale-110 active:scale-95 flex items-center gap-2 group"
        >
          {isExplaining ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
          <span className="text-[9px] font-black uppercase tracking-widest overflow-hidden max-w-0 group-hover:max-w-[100px] transition-all duration-300">Quick Lens</span>
        </button>
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
              <button onClick={() => { setExplanation(null); setSelectionRange(null); }} className="text-himalaya-gold/60 hover:text-himalaya-gold">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="mb-6 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                 <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Selected Passage</span>
                 <p className="font-tibetan text-lg text-himalaya-dark leading-relaxed">"{selectionRange?.text}"</p>
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
