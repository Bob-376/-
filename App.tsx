
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, X, Loader2, Bot, Feather, BookOpen, BrainCircuit, Lightbulb, 
  RotateCcw, GripVertical, ChevronDown, PenTool, Bold, Italic, 
  Plus, Minus, Keyboard, Copy, Key, AlertCircle, Droplets, Book, Trash2, GripHorizontal, BookmarkPlus, ChevronUp
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message, ProjectMemory, GroundingChunk } from './types';
import { sendMessageStream, resetChat, parseMemoryUpdate, getLookupAnalysis } from './services/geminiService';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

const STORAGE_KEY_MESSAGES = 'himalaya_session_messages_v1';
const STORAGE_KEY_MEMORY = 'himalaya_project_memory_v1';
const STORAGE_KEY_POS_WORKSHOP = 'himalaya_pos_workshop_v1';
const STORAGE_KEY_POS_INPUT = 'himalaya_pos_input_v1';
const STORAGE_KEY_SIZE_INPUT = 'himalaya_size_input_v1';
const STORAGE_KEY_SIZE_WORKSHOP = 'himalaya_size_workshop_v1';
const STORAGE_KEY_FONT_SIZE = 'himalaya_font_size_v1';

const MAX_TSHEGS = 50000;
const MIN_INPUT_WIDTH = 400;
const MIN_INPUT_HEIGHT = 160;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface LookupState {
  text: string;
  x: number;
  y: number;
  result: string | null;
  groundingChunks?: GroundingChunk[];
  loading: boolean;
  position: 'top' | 'bottom';
  isQuotaError?: boolean;
}

const App: React.FC = () => {
  const safeJsonParse = (key: string, fallback: any) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) { return fallback; }
  };

  const [messages, setMessages] = useState<Message[]>(() => safeJsonParse(STORAGE_KEY_MESSAGES, []));
  const [memory, setMemory] = useState<ProjectMemory | null>(() => safeJsonParse(STORAGE_KEY_MEMORY, {
    projectName: '',
    styleProfile: '',
    narrativeProgress: '',
    keyCitations: [],
    lastUpdated: Date.now()
  }));
  
  const [inputHtml, setInputHtml] = useState('');
  const [tshegCount, setTshegCount] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(STORAGE_KEY_FONT_SIZE)) || 20);
  const [isLoading, setIsLoading] = useState(false);
  const [isWylieMode, setIsWylieMode] = useState(false);
  
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [activeWindow, setActiveWindow] = useState<'workshop' | 'input' | null>('input');
  
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);

  const [workshopPos, setWorkshopPos] = useState(() => safeJsonParse(STORAGE_KEY_POS_WORKSHOP, { x: 50, y: 150 }));
  const [inputPos, setInputPos] = useState(() => {
    const saved = safeJsonParse(STORAGE_KEY_POS_INPUT, null);
    return saved || { x: window.innerWidth / 2 - 450, y: window.innerHeight / 2 - 200 };
  });
  
  const [inputSize, setInputSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_INPUT, { width: 900, height: 420 }));
  const [workshopSize, setWorkshopSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_WORKSHOP, { width: 350, height: 600 }));

  const editorRef = useRef<HTMLDivElement>(null);
  const workshopContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectionTimeoutRef = useRef<number | null>(null);

  const countTshegs = (text: string) => (text.match(/་/g) || []).length;
  const tshegPercent = Math.min((tshegCount / MAX_TSHEGS) * 100, 100);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    localStorage.setItem(STORAGE_KEY_MEMORY, JSON.stringify(memory));
    localStorage.setItem(STORAGE_KEY_FONT_SIZE, fontSize.toString());
  }, [messages, memory, fontSize]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། 字体比例已重新校准，现在对话文字与解析助手一样精致协调。展开创作按钮已移至左下角，完全释放您的视野。',
        isStreaming: false,
        timestamp: Date.now()
      }]);
    }
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setShowApiKeyPrompt(false);
      setLookup(null);
    }
  };

  const processSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (!document.activeElement?.closest('[data-lookup-window="true"]')) setLookup(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 1) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const parent = (container.nodeType === 3 ? container.parentElement : container) as HTMLElement;
    
    const analyzableZone = parent?.closest('[data-analyzable]');
    if (!analyzableZone) return;

    const rect = range.getBoundingClientRect();
    if (rect.width === 0) return;

    const position: 'top' | 'bottom' = rect.top > 350 ? 'top' : 'bottom';
    const tooltipWidth = 384; 
    const x = Math.max(20, Math.min(rect.left + (rect.width / 2) - (tooltipWidth / 2), window.innerWidth - tooltipWidth - 20));
    const y = position === 'top' ? rect.top - 15 : rect.bottom + 15;

    setLookup({ text: selectedText, x, y, result: null, loading: true, position, isQuotaError: false });

    getLookupAnalysis(selectedText).then(res => {
      setLookup(prev => {
        if (!prev || prev.text !== selectedText) return prev;
        if (res.text === "QUOTA_EXHAUSTED") { setShowApiKeyPrompt(true); return { ...prev, result: null, isQuotaError: true, loading: false }; }
        if (res.text === "INVALID_KEY") { handleSelectKey(); return null; }
        return { ...prev, result: res.text, groundingChunks: res.groundingChunks, loading: false };
      });
    });
  }, []);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-lookup-window="true"]')) return;
      if (selectionTimeoutRef.current) window.clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = window.setTimeout(processSelection, 100);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [processSelection]);

  const [dragging, setDragging] = useState<{ id: 'workshop' | 'input', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: 'workshop' | 'input', direction: ResizeDirection, startX: number, startY: number, initialWidth: number, initialHeight: number, initialX: number, initialY: number } | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (dragging.id === 'workshop') {
        setWorkshopPos({ x: dragging.initialX + dx, y: dragging.initialY + dy });
      } else {
        setInputPos({ x: dragging.initialX + dx, y: dragging.initialY + dy });
      }
    } else if (resizing) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const setSize = resizing.id === 'workshop' ? setWorkshopSize : setInputSize;
      const setPos = resizing.id === 'workshop' ? setWorkshopPos : setInputPos;
      const minW = resizing.id === 'workshop' ? 250 : MIN_INPUT_WIDTH;
      const minH = resizing.id === 'workshop' ? 200 : MIN_INPUT_HEIGHT;

      let newW = resizing.initialWidth, newH = resizing.initialHeight, newX = resizing.initialX, newY = resizing.initialY;
      if (resizing.direction.includes('e')) newW = Math.max(minW, resizing.initialWidth + dx);
      if (resizing.direction.includes('w')) { const w = resizing.initialWidth - dx; if (w > minW) { newW = w; newX = resizing.initialX + dx; } }
      if (resizing.direction.includes('s')) newH = Math.max(minH, resizing.initialHeight + dy);
      if (resizing.direction.includes('n')) { const h = resizing.initialHeight - dy; if (h > minH) { newH = h; newY = resizing.initialY + dy; } }
      
      setSize({ width: newW, height: newH });
      setPos({ x: newX, y: newY });
    }
  }, [dragging, resizing]);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      const handleGlobalMouseUp = () => { 
        if (dragging?.id === 'workshop') localStorage.setItem(STORAGE_KEY_POS_WORKSHOP, JSON.stringify(workshopPos));
        if (dragging?.id === 'input') localStorage.setItem(STORAGE_KEY_POS_INPUT, JSON.stringify(inputPos));
        if (resizing?.id === 'workshop') localStorage.setItem(STORAGE_KEY_SIZE_WORKSHOP, JSON.stringify(workshopSize));
        if (resizing?.id === 'input') localStorage.setItem(STORAGE_KEY_SIZE_INPUT, JSON.stringify(inputSize));
        setDragging(null); 
        setResizing(null); 
      };
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, workshopPos, inputPos, workshopSize, inputSize]);

  const handleInput = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText;
      setInputHtml(editorRef.current.innerHTML);
      setTshegCount(countTshegs(text));
      setHasContent(text.trim().length > 0);
    }
  };

  const handleSend = async () => {
    const text = editorRef.current?.innerText.trim();
    if (!text || isLoading) return;
    setIsLoading(true);
    if (editorRef.current) editorRef.current.innerHTML = '';
    setTshegCount(0); setHasContent(false);

    const botMsgId = Date.now().toString();
    setMessages(prev => [...prev, 
      { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() },
      { id: botMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now() }
    ]);
    
    try {
      await sendMessageStream(text, messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })), memory, (updatedText, chunks) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: updatedText, groundingChunks: chunks } : m));
      });
      setMessages(prev => {
        const last = prev.find(m => m.id === botMsgId);
        if (last) {
          const update = parseMemoryUpdate(last.text);
          if (update) setMemory(old => ({ ...old!, ...update, lastUpdated: Date.now() }));
        }
        return prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m);
      });
    } catch (error: any) {
      if (error.message === "QUOTA_EXHAUSTED") setShowApiKeyPrompt(true);
      else if (error.message === "INVALID_KEY") handleSelectKey();
    } finally { setIsLoading(false); }
  };

  const handleCopyToDraft = (text: string) => {
    if (editorRef.current) {
      const currentHtml = editorRef.current.innerHTML;
      editorRef.current.innerHTML = currentHtml + `<div><br/><b>[宗师解析]:</b> <i>${text}</i><br/></div>`;
      handleInput();
      setLookup(null);
    }
  };

  const handleAddToLore = (text: string) => {
    setMemory(old => {
      if (!old) return old;
      if (old.keyCitations.includes(text)) return old;
      return { ...old, keyCitations: [text, ...old.keyCitations], lastUpdated: Date.now() };
    });
    setLookup(null);
  };

  const clearProjectName = () => setMemory(m => m ? { ...m, projectName: '' } : null);
  const clearStyleProfile = () => setMemory(m => m ? { ...m, styleProfile: '' } : null);
  const clearAllCitations = () => setMemory(m => m ? { ...m, keyCitations: [] } : null);

  const isAnyMoving = dragging || resizing;

  return (
    <div className="flex flex-col h-screen font-tibetan overflow-hidden bg-himalaya-cream text-himalaya-dark relative">
      <Header 
        onReset={() => { resetChat(); setMessages([]); }} 
        onToggleMemory={() => { setShowMemoryPanel(!showMemoryPanel); setShowWorkshop(false); setActiveWindow('workshop'); }} 
        onToggleWorkshop={() => { setShowWorkshop(!showWorkshop); setShowMemoryPanel(false); setActiveWindow('workshop'); }} 
        projectName={memory?.projectName} pinCount={0} onTogglePins={() => {}} onToggleDrafts={() => {}} 
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar relative" data-analyzable="chat">
        <div className="w-full max-w-5xl mx-auto pb-[450px] space-y-16">
          {messages.map((msg) => ( <ChatMessage key={msg.id} message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} /> ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* 实时解析浮窗 */}
      {lookup && (
        <div 
          data-lookup-window="true" 
          className={`fixed z-[9999] w-96 max-w-[90vw] bg-white/95 backdrop-blur-3xl rounded-[2.5rem] border-2 ${lookup.isQuotaError ? 'border-himalaya-red' : 'border-himalaya-gold'} shadow-2xl p-6 transition-all animate-in fade-in zoom-in duration-300 flex flex-col`} 
          style={{ left: `${lookup.x}px`, top: `${lookup.y}px`, transform: lookup.position === 'top' ? 'translateY(-100%)' : 'translateY(0%)' }}
        >
          <div className="flex items-center justify-between mb-4 border-b pb-3 shrink-0">
            <div className="flex items-center gap-2 font-bold text-[8px] uppercase tracking-widest text-himalaya-red">
              <Book size={14} className="text-himalaya-gold" /> {lookup.isQuotaError ? '墨池告急' : '宗师解析'}
            </div>
            <button onClick={() => setLookup(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[350px] select-text">
            {lookup.loading ? ( 
              <div className="flex flex-col items-center py-10 gap-4">
                <RotateCcw className="animate-spin text-himalaya-gold" size={32} />
                <span className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">正在研墨查阅...</span>
              </div> 
            ) : ( 
              <div className="space-y-4">
                <div className="text-xl font-tibetan text-gray-800 italic border-l-4 border-himalaya-gold/30 pl-4 py-1">{lookup.text}</div>
                <div className="whitespace-pre-wrap text-lg leading-relaxed text-gray-700 font-tibetan bg-gray-50 p-4 rounded-xl">{lookup.result}</div>
              </div> 
            )}
          </div>
          {!lookup.loading && lookup.result && !lookup.isQuotaError && ( 
            <div className="flex gap-2 mt-4 shrink-0">
              <button onClick={() => handleAddToLore(lookup.result!)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-himalaya-gold text-white rounded-xl text-[8px] font-bold uppercase tracking-widest hover:bg-himalaya-gold/90 transition-all shadow-sm"><BookmarkPlus size={12} /> 收纳至档案</button>
              <button onClick={() => handleCopyToDraft(lookup.result!)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-himalaya-gold/10 text-himalaya-red rounded-xl text-[8px] font-bold uppercase tracking-widest hover:bg-himalaya-gold/20 transition-all shadow-sm"><Copy size={12} /> 采纳解析</button>
            </div>
          )}
        </div>
      )}

      {/* 资料栏 */}
      {(showWorkshop || showMemoryPanel) && (
        <div 
          className={`fixed bg-white/98 backdrop-blur-[60px] border border-himalaya-gold/30 shadow-2xl overflow-hidden flex flex-col rounded-3xl ${dragging?.id === 'workshop' ? 'transition-none select-none pointer-events-none' : 'transition-all duration-300'} ${activeWindow === 'workshop' ? 'z-[104]' : 'z-[101]'}`} 
          style={{ width: `${workshopSize.width}px`, height: `${workshopSize.height}px`, left: `${workshopPos.x}px`, top: `${workshopPos.y}px` }} 
          onMouseDown={() => setActiveWindow('workshop')}
        >
          <div onMouseDown={(e) => setDragging({ id: 'workshop', startX: e.clientX, startY: e.clientY, initialX: workshopPos.x, initialY: workshopPos.y })} className="px-4 py-3 bg-himalaya-red text-white flex items-center justify-between cursor-grab active:cursor-grabbing shrink-0 pointer-events-auto">
            <div className="flex items-center gap-3"><GripVertical size={12} className="opacity-30" /><span className="font-extralight tracking-[0.5em] uppercase text-[5px] opacity-40">史诗记忆档案库 | བརྗེད་ཐོ་མཛོད་ཁང་།</span></div>
            <button onClick={() => { setShowWorkshop(false); setShowMemoryPanel(false); }} className="p-0.5 hover:bg-white/10 rounded-full transition-colors"><X size={12} /></button>
          </div>
          <div ref={workshopContentRef} data-analyzable="workshop" className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar select-text pointer-events-auto">
             <div className="space-y-5">
               <div className="p-2.5 bg-himalaya-gold/5 border border-himalaya-gold/10 rounded-xl flex items-center gap-4 shadow-inner group relative">
                  <BookOpen className="text-himalaya-gold opacity-40 group-hover:opacity-100 transition-opacity" size={12} />
                  <div className="flex flex-col flex-1 gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[5px] font-extralight text-gray-400 uppercase tracking-[0.4em] opacity-30">史诗剧目 (Project)</span>
                      <button onClick={clearProjectName} className="p-1 hover:bg-himalaya-red/10 rounded-md text-himalaya-red/20 hover:text-himalaya-red transition-all" title="重置剧目"><Trash2 size={8} /></button>
                    </div>
                    <input className="bg-transparent border-none focus:ring-0 font-extralight text-[9px] text-himalaya-dark w-full placeholder:text-gray-200" placeholder="点击命笔..." value={memory?.projectName || ''} onChange={(e) => setMemory(m => m ? {...m, projectName: e.target.value} : null)} />
                  </div>
               </div>
               <div className="p-4 bg-gray-50/50 border border-gray-100 rounded-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-himalaya-gold/20 group-hover:bg-himalaya-gold/50 transition-colors" />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[5px] font-extralight text-gray-300 uppercase tracking-[0.5em] block opacity-30">创作 DNA (Style Profile)</span>
                    <button onClick={clearStyleProfile} className="p-1 hover:bg-himalaya-red/10 rounded-md text-himalaya-red/20 hover:text-himalaya-red transition-all" title="洗练风格"><Trash2 size={8} /></button>
                  </div>
                  <div className="text-[7px] font-tibetan text-gray-400 italic font-extralight opacity-60 leading-snug">{memory?.styleProfile || "宗师待命中..."}</div>
               </div>
               <div className="space-y-3">
                 <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                   <h3 className="text-[6px] font-extralight text-himalaya-red/40 uppercase tracking-[0.4em] flex items-center gap-2 opacity-30"><Feather size={10} /> 核心线索 (Key Lore)</h3>
                   <button onClick={clearAllCitations} className="px-2 py-0.5 bg-himalaya-red/5 hover:bg-himalaya-red/10 text-himalaya-red/30 hover:text-himalaya-red rounded-full flex items-center gap-1 transition-all group"><Trash2 size={8} /><span className="text-[5px] font-bold uppercase tracking-widest opacity-80">清空全部 (Delete All)</span></button>
                 </div>
                 <div className="flex flex-col gap-2.5">
                   {memory?.keyCitations.map((c, i) => (
                     <div key={i} className="group relative bg-white border border-gray-50 p-2.5 rounded-xl flex items-start gap-3 hover:border-himalaya-gold/20 transition-all shadow-sm">
                       <span className="text-himalaya-gold opacity-20 text-[10px] font-bold">#</span>
                       <div className="flex-1 text-[9px] font-tibetan text-gray-400 font-extralight leading-relaxed tracking-tight select-text">{c}</div>
                       <button onClick={() => setMemory(old => old ? {...old, keyCitations: old.keyCitations.filter((_, idx) => idx !== i)} : null)} className="p-1 text-himalaya-red/0 group-hover:text-himalaya-red/20 transition-all shrink-0"><Trash2 size={10} /></button>
                     </div>
                   ))}
                   {(!memory || memory.keyCitations.length === 0) && <div className="py-4 text-center"><span className="text-[5px] text-gray-200 uppercase tracking-[0.3em] italic opacity-30">尚未记录任何宏大叙事线索</span></div>}
                 </div>
               </div>
             </div>
          </div>
          <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: 'workshop', direction: 'se', startX: e.clientX, startY: e.clientY, initialWidth: workshopSize.width, initialHeight: workshopSize.height, initialX: workshopPos.x, initialY: workshopPos.y }); }} className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize flex items-end justify-end p-1.5 pointer-events-auto z-50"><div className="w-3 h-3 border-r border-b border-himalaya-gold/10" /></div>
        </div>
      )}

      {/* 巅峰创作舱 */}
      {isInputVisible && (
        <div 
          className={`fixed flex flex-col bg-white/98 backdrop-blur-3xl rounded-3xl border border-gray-200/50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] overflow-hidden group/cabin ${dragging?.id === 'input' ? 'transition-none select-none pointer-events-none' : 'transition-all duration-300'} ${activeWindow === 'input' ? 'z-[105] ring-4 ring-himalaya-gold/10' : 'z-[102]'}`} 
          style={{ width: `${inputSize.width}px`, height: `${inputSize.height}px`, left: `${inputPos.x}px`, top: `${inputPos.y}px` }} 
          onMouseDown={() => setActiveWindow('input')}
        >
          {/* 拖拽控制条 */}
          <div 
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging({ id: 'input', startX: e.clientX, startY: e.clientY, initialX: inputPos.x, initialY: inputPos.y });
            }}
            className={`h-12 bg-gradient-to-b from-gray-50/80 to-white border-b border-gray-100 flex items-center justify-center ${dragging?.id === 'input' ? 'cursor-grabbing' : 'cursor-grab'} hover:bg-himalaya-gold/5 transition-colors group/header shrink-0 relative pointer-events-auto`}
          >
            <div className="absolute left-5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-himalaya-red/20 group-hover/header:bg-himalaya-red transition-all" />
              <div className="w-2 h-2 rounded-full bg-himalaya-gold/20 group-hover/header:bg-himalaya-gold transition-all" />
            </div>
            <GripHorizontal size={18} className="text-gray-200 group-hover/header:text-himalaya-gold transition-colors" />
            <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setIsInputVisible(false)} className="absolute right-5 p-1.5 hover:bg-himalaya-red hover:text-white rounded-lg transition-all text-gray-300"><ChevronDown size={16} /></button>
          </div>

          <div className="flex-1 flex flex-col gap-2 p-3 h-full relative overflow-hidden pointer-events-auto">
            {/* 工具与统计栏 */}
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex items-center gap-1.5 bg-gray-100/30 p-1 rounded-xl border border-gray-200/20">
                <button onClick={() => document.execCommand('bold')} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all" title="加粗"><Bold size={16} /></button>
                <button onClick={() => document.execCommand('italic')} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all" title="斜体"><Italic size={16} /></button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <button onClick={() => setIsWylieMode(!isWylieMode)} className={`p-2 rounded-lg flex items-center gap-2 transition-all ${isWylieMode ? 'bg-himalaya-gold text-white shadow-sm' : 'hover:bg-white text-gray-400'}`}><Keyboard size={16} /><span className="text-[7px] font-bold uppercase hidden md:inline">Wylie</span></button>
                <div className="w-px h-4 bg-gray-300 mx-1" />
                <div className="flex items-center bg-white/70 rounded-lg px-2 shadow-sm border border-gray-200/20">
                  <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="p-1.5 hover:bg-white rounded-md transition-colors"><Minus size={12} /></button>
                  <span className="text-[10px] font-bold px-3 tabular-nums text-himalaya-dark">{fontSize}</span>
                  <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-1.5 hover:bg-white rounded-md transition-colors"><Plus size={12} /></button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest tabular-nums leading-none">{tshegCount.toLocaleString()} ཚེག།</span>
                <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden border border-gray-200/20"><div className="h-full bg-himalaya-gold transition-all duration-700" style={{ width: `${tshegPercent}%` }} /></div>
              </div>
            </div>
            
            {/* 编辑区域 */}
            <div className="flex-1 relative bg-white border border-gray-100 rounded-[1.5rem] p-5 shadow-inner group overflow-hidden">
              <div 
                ref={editorRef} 
                contentEditable 
                spellCheck="false" 
                data-analyzable="input"
                style={{ fontSize: `${fontSize}px` }} 
                className={`w-full h-full outline-none font-tibetan overflow-y-auto custom-scrollbar leading-relaxed select-text`} 
                onInput={handleInput} 
              />
              {!hasContent && !inputHtml && (
                <div className="absolute top-5 left-5 text-gray-200 pointer-events-none italic font-tibetan opacity-40" style={{ fontSize: `${fontSize}px` }}>འདི་རུ་ཡི་གེ་འབྲི་བར་ཞུ།</div>
              )}
              <button 
                onClick={handleSend} 
                disabled={!hasContent || isLoading} 
                className={`absolute right-5 bottom-5 p-5 rounded-2xl transition-all shadow-xl ${isLoading ? 'bg-gray-50 text-gray-200' : 'bg-himalaya-red text-himalaya-gold hover:scale-105 active:scale-95 shadow-himalaya-red/20'}`}
              >
                {isLoading ? <Loader2 className="animate-spin w-8 h-8" /> : <Send size={28} />}
              </button>
            </div>
          </div>

          {/* 底部忽隐忽现的收纳按钮 */}
          <div className="h-6 w-full flex justify-center items-end pb-1 overflow-visible group/trigger shrink-0 pointer-events-none">
             <button 
               onMouseDown={(e) => e.stopPropagation()} 
               onClick={() => setIsInputVisible(false)}
               className="bg-himalaya-gold/90 backdrop-blur-md hover:bg-himalaya-gold text-white px-8 py-2 rounded-t-2xl opacity-0 group-hover/cabin:opacity-100 transition-all duration-500 flex items-center gap-2 translate-y-3 group-hover/cabin:translate-y-0 shadow-[0_-5px_15px_-3px_rgba(212,175,55,0.4)] border-t border-x border-white/30 pointer-events-auto"
             >
                <ChevronUp size={14} className="rotate-180" />
                <span className="text-[8px] font-bold uppercase tracking-[0.2em]">收纳 བསྡུ་བ།</span>
             </button>
          </div>
          
          {/* 尺寸调节手柄 */}
          <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: 'input', direction: 'se', startX: e.clientX, startY: e.clientY, initialWidth: inputSize.width, initialHeight: inputSize.height, initialX: inputPos.x, initialY: inputPos.y }); }} className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize z-[106] pointer-events-auto" />
          <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: 'input', direction: 'e', startX: e.clientX, startY: e.clientY, initialWidth: inputSize.width, initialHeight: inputSize.height, initialX: inputPos.x, initialY: inputPos.y }); }} className="absolute top-12 bottom-12 right-0 w-1.5 cursor-ew-resize z-[106] pointer-events-auto" />
          <div onMouseDown={(e) => { e.stopPropagation(); setResizing({ id: 'input', direction: 's', startX: e.clientX, startY: e.clientY, initialWidth: inputSize.width, initialHeight: inputSize.height, initialX: inputPos.x, initialY: inputPos.y }); }} className="absolute bottom-0 left-12 right-12 h-1.5 cursor-ns-resize z-[106] pointer-events-auto" />
        </div>
      )}

      {/* 微型悬浮创作按钮 (左下角) */}
      {!isInputVisible && (
        <div className="fixed bottom-6 left-6 z-[110] animate-in zoom-in slide-in-from-left-6 duration-500">
          <button 
            onClick={() => setIsInputVisible(true)} 
            className="w-12 h-12 bg-himalaya-red/90 text-himalaya-gold rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all border border-himalaya-gold/40 group relative backdrop-blur-sm"
          >
             <PenTool size={18} className="group-hover:rotate-12 transition-transform relative z-10" />
             <div className="absolute left-full ml-3 px-2 py-1 bg-himalaya-dark/90 text-white text-[7px] font-bold uppercase tracking-widest rounded-md opacity-0 group-hover:opacity-100 transition-all translate-x-[-5px] group-hover:translate-x-0 whitespace-nowrap pointer-events-none shadow-xl">
                展开创作舱
             </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
