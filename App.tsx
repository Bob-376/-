
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, X, Loader2, Bot, Feather, BookOpen, BrainCircuit, Lightbulb, 
  RotateCcw, GripVertical, ChevronDown, PenTool, Bold, Italic, 
  Plus, Minus, Keyboard, Copy, Key, AlertCircle, Droplets, Book, Trash2, GripHorizontal, BookmarkPlus, ChevronUp, Sparkles, Wand2
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

const LOADING_PHRASES = [
  "宗师正在研墨...",
  "正在推敲平仄...",
  "正在铺展云卷...",
  "灵感横跨雪山...",
  "笔尖自有雷鸣...",
  "正在调遣辞海..."
];

const POETIC_SPARKS = [
  "གངས་རིའི་ཁྲོད་ན་འོད་ཟེར་འཚེར། (雪山之中光芒闪耀)",
  "སྙན་ངག་ནི་རྣམ་ཤེས་ཀྱི་མེ་ལོང་ཡིན། (诗歌是灵魂的镜子)",
  "འཇིག་རྟེན་ཁམས་ན་བདེན་པ་བཙལ། (于尘世间寻找真理)",
  "རླུང་པོ་རྒྱག་དུས་ལོ་མ་འཐོར། (风起时，落叶纷飞)"
];

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
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);
  
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [activeWindow, setActiveWindow] = useState<'workshop' | 'input' | null>('input');
  
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);

  const [workshopPos, setWorkshopPos] = useState(() => {
    const saved = safeJsonParse(STORAGE_KEY_POS_WORKSHOP, null);
    return saved || { x: window.innerWidth - 420, y: 100 };
  });
  const [inputPos, setInputPos] = useState(() => {
    const saved = safeJsonParse(STORAGE_KEY_POS_INPUT, null);
    return saved || { x: (window.innerWidth - 860) / 2, y: window.innerHeight - 440 };
  });
  
  const [inputSize, setInputSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_INPUT, { width: 860, height: 360 }));
  const [workshopSize, setWorkshopSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_WORKSHOP, { width: 380, height: 520 }));

  const editorRef = useRef<HTMLDivElement>(null);
  const workshopContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingPhraseIdx(prev => (prev + 1) % LOADING_PHRASES.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

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
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། 宗师已入驻此间。五十万言史诗长卷，请由此笔开篇。',
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
      // 如果焦点不在 lookup 窗口内，点击其他地方则关闭
      if (!document.activeElement?.closest('[data-lookup-window="true"]')) setLookup(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 1) return;

    // 检查选中内容是否属于可分析区域
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const isNodeAnalyzable = (node: Node | null) => {
      if (!node) return false;
      const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
      return !!el?.closest('[data-analyzable]');
    };

    if (!isNodeAnalyzable(anchorNode) && !isNodeAnalyzable(focusNode)) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) return;

    const position: 'top' | 'bottom' = rect.top > 300 ? 'top' : 'bottom';
    const tooltipWidth = 350; 
    const x = Math.max(20, Math.min(rect.left + (rect.width / 2) - (tooltipWidth / 2), window.innerWidth - tooltipWidth - 20));
    const y = position === 'top' ? rect.top - 10 : rect.bottom + 10;

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
      const target = e.target as HTMLElement;
      // 如果点击的是 lookup 窗口内部，不要清除
      if (target.closest('[data-lookup-window="true"]')) return;
      
      if (selectionTimeoutRef.current) window.clearTimeout(selectionTimeoutRef.current);
      selectionTimeoutRef.current = window.setTimeout(processSelection, 50);
    };
    
    // 全局监听 mouseup 捕获选择
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
      
      let newW = resizing.initialWidth;
      let newH = resizing.initialHeight;
      let newX = resizing.initialX;
      let newY = resizing.initialY;

      if (resizing.direction.includes('e')) newW = Math.max(minW, resizing.initialWidth + dx);
      if (resizing.direction.includes('s')) newH = Math.max(minH, resizing.initialHeight + dy);
      if (resizing.direction.includes('w')) {
        const potentialW = resizing.initialWidth - dx;
        if (potentialW >= minW) {
          newW = potentialW;
          newX = resizing.initialX + dx;
        }
      }
      if (resizing.direction.includes('n')) {
        const potentialH = resizing.initialHeight - dy;
        if (potentialH >= minH) {
          newH = potentialH;
          newY = resizing.initialY + dy;
        }
      }

      setSize({ width: newW, height: newH });
      setPos({ x: newX, y: newY });
    }
  }, [dragging, resizing]);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      const handleGlobalMouseUp = () => { 
        if (dragging?.id === 'workshop' || resizing?.id === 'workshop') {
          localStorage.setItem(STORAGE_KEY_POS_WORKSHOP, JSON.stringify(workshopPos));
          localStorage.setItem(STORAGE_KEY_SIZE_WORKSHOP, JSON.stringify(workshopSize));
        }
        if (dragging?.id === 'input' || resizing?.id === 'input') {
          localStorage.setItem(STORAGE_KEY_POS_INPUT, JSON.stringify(inputPos));
          localStorage.setItem(STORAGE_KEY_SIZE_INPUT, JSON.stringify(inputSize));
        }
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

  const insertPoeticSpark = () => {
    const spark = POETIC_SPARKS[Math.floor(Math.random() * POETIC_SPARKS.length)];
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(spark);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
      } else {
        editorRef.current.innerText += spark;
      }
      handleInput();
    }
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

  const startResizing = (id: 'workshop' | 'input', direction: ResizeDirection, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = id === 'workshop' ? workshopPos : inputPos;
    const size = id === 'workshop' ? workshopSize : inputSize;
    setResizing({
      id,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: size.width,
      initialHeight: size.height,
      initialX: pos.x,
      initialY: pos.y
    });
  };

  const ResizeHandles = ({ id }: { id: 'workshop' | 'input' }) => (
    <>
      <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize z-[100]" onMouseDown={(e) => startResizing(id, 'n', e)} />
      <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize z-[100]" onMouseDown={(e) => startResizing(id, 's', e)} />
      <div className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize z-[100]" onMouseDown={(e) => startResizing(id, 'w', e)} />
      <div className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize z-[100]" onMouseDown={(e) => startResizing(id, 'e', e)} />
      <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-[101]" onMouseDown={(e) => startResizing(id, 'nw', e)} />
      <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-[101]" onMouseDown={(e) => startResizing(id, 'ne', e)} />
      <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-[101]" onMouseDown={(e) => startResizing(id, 'sw', e)} />
      <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-[101]" onMouseDown={(e) => startResizing(id, 'se', e)} />
    </>
  );

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

      {/* 实时解析浮窗 - 优化布局并遵从 20px (text-xl) 藏文字号 */}
      {lookup && (
        <div 
          data-lookup-window="true" 
          className={`fixed z-[9999] w-[350px] max-w-[90vw] bg-white/95 backdrop-blur-3xl rounded-[2rem] border-2 ${lookup.isQuotaError ? 'border-himalaya-red' : 'border-himalaya-gold'} shadow-2xl p-6 transition-all animate-in fade-in zoom-in duration-300 flex flex-col`} 
          style={{ left: `${lookup.x}px`, top: `${lookup.y}px`, transform: lookup.position === 'top' ? 'translateY(-100%)' : 'translateY(0%)' }}
        >
          <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-3 shrink-0">
            <div className="flex items-center gap-2 font-black text-[8px] uppercase tracking-[0.2em] text-himalaya-red">
              <Book size={12} className="text-himalaya-gold" /> {lookup.isQuotaError ? '墨池告急' : '宗师解析'}
            </div>
            <button onClick={() => setLookup(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 max-h-[300px] select-text">
            {lookup.loading ? ( 
              <div className="flex flex-col items-center py-10 gap-4">
                <RotateCcw className="animate-spin text-himalaya-gold" size={24} />
                <span className="text-[7px] text-gray-400 font-bold uppercase tracking-widest">{LOADING_PHRASES[loadingPhraseIdx]}</span>
              </div> 
            ) : ( 
              <div className="space-y-4">
                <div className="text-xl font-tibetan text-gray-800 italic border-l-4 border-himalaya-gold/30 pl-4 py-1 leading-relaxed">{lookup.text}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-500 font-sans bg-gray-50 p-4 rounded-xl">{lookup.result}</div>
              </div> 
            )}
          </div>
          {!lookup.loading && lookup.result && !lookup.isQuotaError && ( 
            <div className="flex gap-2 mt-4 shrink-0">
              <button onClick={() => handleAddToLore(lookup.result!)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-himalaya-gold text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-himalaya-gold/90 transition-all shadow-sm"><BookmarkPlus size={12} /> 收纳至档案</button>
              <button onClick={() => handleCopyToDraft(lookup.result!)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-himalaya-gold/10 text-himalaya-red rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-himalaya-gold/20 transition-all shadow-sm"><Copy size={12} /> 采纳解析</button>
            </div>
          )}
        </div>
      )}

      {/* 资料栏 (Workshop / Memory Panel) - 添加 data-analyzable 确保子元素可被选中解析 */}
      {(showWorkshop || showMemoryPanel) && (
        <div 
          className={`fixed bg-white/98 backdrop-blur-[60px] border border-himalaya-gold/30 shadow-2xl overflow-hidden flex flex-col rounded-3xl ${dragging?.id === 'workshop' || resizing?.id === 'workshop' ? 'transition-none select-none' : 'transition-all duration-300'} ${activeWindow === 'workshop' ? 'z-[104]' : 'z-[101]'}`} 
          style={{ width: `${workshopSize.width}px`, height: `${workshopSize.height}px`, left: `${workshopPos.x}px`, top: `${workshopPos.y}px` }} 
          onMouseDown={() => setActiveWindow('workshop')}
        >
          <ResizeHandles id="workshop" />
          <div onMouseDown={(e) => setDragging({ id: 'workshop', startX: e.clientX, startY: e.clientY, initialX: workshopPos.x, initialY: workshopPos.y })} className="px-4 py-3 bg-himalaya-red text-white flex items-center justify-between cursor-grab active:cursor-grabbing shrink-0 pointer-events-auto">
            <div className="flex items-center gap-3"><GripVertical size={12} className="opacity-30" /><span className="font-black tracking-[0.2em] uppercase text-[9px] opacity-60">史诗记忆档案库 | བརྗེད་ཐོ་མཛོད་ཁང་།</span></div>
            <button onClick={() => { setShowWorkshop(false); setShowMemoryPanel(false); }} className="p-0.5 hover:bg-white/10 rounded-full transition-colors"><X size={16} /></button>
          </div>
          <div ref={workshopContentRef} data-analyzable="workshop" className="flex-1 overflow-y-auto px-5 py-5 space-y-6 custom-scrollbar select-text pointer-events-auto">
             <div className="space-y-6">
               {/* 项目名称 */}
               <div className="p-3 bg-himalaya-gold/5 border border-himalaya-gold/10 rounded-2xl flex items-center gap-4 shadow-inner group relative">
                  <BookOpen className="text-himalaya-gold opacity-60 group-hover:opacity-100 transition-opacity shrink-0" size={20} />
                  <div className="flex flex-col flex-1 gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] font-black text-himalaya-gold/40 uppercase tracking-[0.2em]">史诗剧目 (Project)</span>
                      <button onClick={() => setMemory(m => m ? {...m, projectName: ''} : null)} className="p-1 hover:bg-himalaya-red/10 rounded-md text-himalaya-red/20 hover:text-himalaya-red transition-all"><Trash2 size={10} /></button>
                    </div>
                    <input className="bg-transparent border-none focus:ring-0 font-bold text-xl font-tibetan text-himalaya-dark w-full placeholder:text-gray-200" placeholder="点击命笔..." value={memory?.projectName || ''} onChange={(e) => setMemory(m => m ? {...m, projectName: e.target.value} : null)} />
                  </div>
               </div>
               
               {/* 创作 DNA */}
               <div className="p-5 bg-gray-50/50 border border-gray-100 rounded-3xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-himalaya-gold/30" />
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[7px] font-black text-gray-300 uppercase tracking-[0.3em] block">创作 DNA (Style Profile)</span>
                  </div>
                  <div className="text-lg font-tibetan text-gray-700 leading-relaxed select-text">{memory?.styleProfile || "宗师待命中..."}</div>
               </div>

               {/* 核心线索列表 */}
               <div className="space-y-3">
                 <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                   <h3 className="text-[8px] font-black text-himalaya-red/40 uppercase tracking-[0.4em] flex items-center gap-2"><Feather size={10} /> 核心线索 (Key Lore)</h3>
                 </div>
                 <div className="flex flex-col gap-3">
                   {memory?.keyCitations.map((c, i) => (
                     <div key={i} className="group relative bg-white border border-gray-50 p-4 rounded-xl flex items-start gap-3 hover:border-himalaya-gold/40 transition-all shadow-sm">
                       <span className="text-himalaya-gold opacity-40 text-lg font-bold">#</span>
                       <div className="flex-1 text-xl font-tibetan text-gray-800 leading-relaxed select-text">{c}</div>
                       <button onClick={() => setMemory(m => m ? {...m, keyCitations: m.keyCitations.filter((_, idx) => idx !== i)} : null)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-200 hover:text-himalaya-red transition-all"><Trash2 size={12} /></button>
                     </div>
                   ))}
                   {(!memory?.keyCitations || memory.keyCitations.length === 0) && (
                     <div className="text-center py-6 opacity-20 italic text-[10px]">尚未收纳任何线索...</div>
                   )}
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* 巅峰创作舱 */}
      {isInputVisible && (
        <div 
          className={`fixed flex flex-col bg-white/98 backdrop-blur-3xl rounded-3xl border border-gray-200/50 shadow-2xl overflow-hidden group/cabin ${dragging?.id === 'input' || resizing?.id === 'input' ? 'transition-none select-none' : 'transition-all duration-300'} ${activeWindow === 'input' ? 'z-[105] ring-4 ring-himalaya-gold/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.2)]' : 'z-[102]'}`} 
          style={{ width: `${inputSize.width}px`, height: `${inputSize.height}px`, left: `${inputPos.x}px`, top: `${inputPos.y}px` }} 
          onMouseDown={() => setActiveWindow('input')}
        >
          <ResizeHandles id="input" />
          <div onMouseDown={(e) => { e.preventDefault(); setDragging({ id: 'input', startX: e.clientX, startY: e.clientY, initialX: inputPos.x, initialY: inputPos.y }); }} className={`h-10 bg-gray-50/50 border-b border-gray-100 flex items-center justify-center cursor-grab hover:bg-himalaya-gold/5 transition-colors shrink-0 relative pointer-events-auto`}>
            <div className="absolute left-4 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-himalaya-red/20" /><div className="w-1.5 h-1.5 rounded-full bg-himalaya-gold/20" /></div>
            <GripHorizontal size={16} className="text-gray-200" />
            <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setIsInputVisible(false)} className="absolute right-4 p-1 hover:bg-himalaya-red hover:text-white rounded-lg transition-all text-gray-300"><ChevronDown size={14} /></button>
          </div>

          <div className="flex-1 flex flex-col gap-2 p-3 h-full relative overflow-hidden pointer-events-auto">
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex items-center gap-1 bg-gray-100/30 p-0.5 rounded-xl border border-gray-200/20">
                <button onClick={() => document.execCommand('bold')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all"><Bold size={14} /></button>
                <button onClick={() => document.execCommand('italic')} className="p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all"><Italic size={14} /></button>
                <div className="w-px h-3 bg-gray-300 mx-0.5" />
                <button onClick={insertPoeticSpark} className="p-1.5 hover:bg-himalaya-gold hover:text-white hover:shadow-lg rounded-lg transition-all flex items-center gap-1.5 group/spark" title="宗师墨宝 - 获取诗意灵感">
                  <Wand2 size={14} className="group-hover/spark:rotate-12 transition-transform" />
                  <span className="text-[6px] font-black uppercase hidden md:inline tracking-tighter">墨宝 (Spark)</span>
                </button>
                <div className="w-px h-3 bg-gray-300 mx-0.5" />
                <div className="flex items-center bg-white/70 rounded-lg px-1.5 shadow-sm border border-gray-200/20">
                  <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="p-1"><Minus size={10} /></button>
                  <span className="text-[8px] font-bold px-2 tabular-nums">{fontSize}</span>
                  <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-1"><Plus size={10} /></button>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-himalaya-red uppercase tracking-tighter tabular-nums opacity-60">{tshegCount.toLocaleString()} / {MAX_TSHEGS.toLocaleString()} ཚེག།</span>
                </div>
                <div className="w-24 h-1 bg-gray-100 rounded-full overflow-hidden border border-gray-200/10 shadow-inner">
                  <div className="h-full bg-himalaya-gold transition-all duration-700 relative overflow-hidden" style={{ width: `${tshegPercent}%` }}>
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex-1 relative bg-white border border-gray-100 rounded-[1.2rem] p-4 shadow-inner group overflow-hidden">
              <div ref={editorRef} contentEditable spellCheck="false" data-analyzable="input" style={{ fontSize: `${fontSize}px` }} className={`w-full h-full outline-none font-tibetan overflow-y-auto custom-scrollbar leading-relaxed select-text`} onInput={handleInput} />
              {!hasContent && !inputHtml && <div className="absolute top-4 left-4 text-gray-200 pointer-events-none italic font-tibetan opacity-40" style={{ fontSize: `${fontSize}px` }}>འདི་རུ་ཡི་གེ་འབྲི་བར་ཞུ།</div>}
              <button onClick={handleSend} disabled={!hasContent || isLoading} className={`absolute right-4 bottom-4 p-4 rounded-xl transition-all shadow-xl ${isLoading ? 'bg-gray-50 text-gray-200 cursor-not-allowed' : 'bg-himalaya-red text-himalaya-gold hover:scale-105 active:scale-95 shadow-himalaya-red/20'}`}>
                {isLoading ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Loader2 className="animate-spin w-6 h-6" />
                    <span className="text-[5px] font-black uppercase tracking-[0.2em] opacity-40 absolute -bottom-4 whitespace-nowrap">{LOADING_PHRASES[loadingPhraseIdx]}</span>
                  </div>
                ) : <Send size={24} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 墨池法印 - 底部中央收纳按钮 */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] transition-all duration-500 animate-in slide-in-from-bottom-6">
        <button 
          onClick={() => setIsInputVisible(!isInputVisible)} 
          className={`flex items-center gap-3 px-5 py-2.5 rounded-full border-2 border-himalaya-gold shadow-2xl transition-all hover:scale-105 active:scale-95 group ${isInputVisible ? 'bg-white text-himalaya-red' : 'bg-himalaya-red text-himalaya-gold'}`}
        >
          {isInputVisible ? (
            <>
              <ChevronDown size={16} className="group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-[8px] font-black uppercase tracking-[0.3em]">收纳笔墨 (Retract)</span>
            </>
          ) : (
            <>
              <ChevronUp size={16} className="group-hover:-translate-y-0.5 animate-bounce transition-transform" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-[6px] font-black uppercase tracking-[0.3em] mb-0.5 opacity-60">展开创作舱</span>
                <span className="text-xs font-tibetan">གསར་རྩོམ་ཁང་།</span>
              </div>
            </>
          )}
        </button>
      </div>

      {/* 宗师灵感火种 */}
      {!isInputVisible && (
        <div className="fixed bottom-6 left-6 z-[110] animate-in zoom-in duration-700">
          <div className="relative">
            <div className="absolute inset-0 bg-himalaya-gold/30 rounded-full animate-ping scale-150 opacity-10" />
            <button 
              onClick={() => setIsInputVisible(true)} 
              className="w-12 h-12 bg-himalaya-red text-himalaya-gold rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-90 transition-all border-2 border-himalaya-gold group relative backdrop-blur-md"
            >
               <Wand2 size={18} className="group-hover:rotate-12 transition-transform" />
               <Sparkles className="absolute -top-1 -right-1 text-himalaya-gold animate-pulse" size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
