
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Message, MediaItem } from '../types';
import { 
  Bot, User, Copy, Trash2, Clock, ShieldCheck, Check, Volume2, 
  Loader2, ExternalLink, Languages, Sparkles, X, Info, FileSearch, SearchCode,
  ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw, ChevronDown, MousePointer2,
  Film, Wand2, Edit, Search
} from 'lucide-react';
import { generateSpeech, quickExplain, translateText } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
  onOCR?: (media: MediaItem) => void;
  onAnimate?: (media: MediaItem) => void;
  onEdit?: (media: MediaItem, prompt: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete, onOCR, onAnimate, onEdit }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [showEditInput, setShowEditInput] = useState<string | null>(null);
  
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
  const [zoomLevel, setZoomLevel] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);

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
                     <div className="relative">
                       <img src={item.data.startsWith('data:') ? item.data : `data:${item.mimeType};base64,${item.data}`} alt="Artifact" className="w-full h-auto max-h-[400px] object-contain bg-gray-50 cursor-zoom-in" onClick={() => setPreviewImage(item)} />
                       <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover/media:opacity-100 transition-opacity">
                         <button onClick={() => onAnimate?.(item)} className="p-2 bg-black/60 text-white rounded-full hover:bg-himalaya-red shadow-lg" title="Veo Animation"><Film size={14} /></button>
                         <button onClick={() => onOCR?.(item)} className="p-2 bg-black/60 text-white rounded-full hover:bg-green-600 shadow-lg" title="བོད་ཡིག་原文提取 | Tibetan OCR Analysis"><SearchCode size={14} /></button>
                         <button onClick={() => setShowEditInput(idx.toString())} className="p-2 bg-black/60 text-white rounded-full hover:bg-blue-600 shadow-lg" title="Edit with Flash Image"><Edit size={14} /></button>
                       </div>
                       {showEditInput === idx.toString() && (
                         <div className="absolute inset-x-0 bottom-0 p-2 bg-black/80 flex gap-2">
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
            className="text-himalaya-dark font-tibetan text-[1.2rem] leading-relaxed whitespace-pre-wrap selection:bg-himalaya