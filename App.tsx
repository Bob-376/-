
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Feather, RotateCcw, Plus, Minus, AlertCircle, PenTool, X, MoveRight, 
  Key, Flame, Minimize2, Stars, Maximize, Languages, Info, Search,
  Trophy, BarChart3, Milestone, BrainCircuit, Compass, Pen, Maximize2, RefreshCw, Sparkles,
  BookOpen, Quote, Copy, Check, ChevronRight, Type
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageToSession, quickExplain } from './services/geminiService';

const STORAGE_KEY_MESSAGES = 'himalaya_v2_messages';
const STORAGE_KEY_POS = 'himalaya_ws_pos';
const STORAGE_KEY_SIZE = 'himalaya_ws_size';
const STORAGE_KEY_DRAFT = 'himalaya_workshop_draft';
const EPIC_GOAL_CHARACTERS = 50000; // Master Scribe Goal: 50,000 characters

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [inputText, setInputText] = useState("");
  const [fontSize, setFontSize] = useState(20); 
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState(false);

  const [selection, setSelection] = useState<{ text: string, x: number, y: number, isInsideWorkshop: boolean } | null>(null);
  const [explanation, setExplanation] = useState<{ text: string, loading: boolean } | null>(null);

  const [wsPos, setWsPos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_POS);
    const defaultW = 900;
    return saved ? JSON.parse(saved) : { x: (window.innerWidth - defaultW) / 2, y: 100 };
  });
  const [wsSize, setWsSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SIZE);
    return saved ? JSON.parse(saved) : { width: 900, height: 700 };
  });

  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ direction: ResizeDirection, startX: number, startY: number, initialW: number, initialH: number, initialX: number, initialY: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const workshopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExplanation(null);
        setSelection(null);
        setIsMemoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft && editorRef.current) {
      editorRef.current.innerHTML = savedDraft;
      setInputText(editorRef.current.innerText);
    }
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      localStorage.setItem(STORAGE_KEY_DRAFT, editorRef.current.innerHTML);
    }
  }, [inputText]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    if (!isMaximized) {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(wsPos));
      localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(wsSize));
    }
  }, [messages, wsPos, wsSize, isMaximized]);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
    }
  };

  const handleTextSelection = useCallback((e: MouseEvent) => {
    const sel = window.getSelection();
    const target = e.target as HTMLElement;

    if (sel && sel.toString().trim().length > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Refined boundary detection: check if any part of selection is in workshop
        const workshopNode = editorRef.current;
        let node = sel.anchorNode;
        let isInsideWorkshop = false;
        while (node) {
          if (node === workshopNode) {
            isInsideWorkshop = true;
            break;
          }
          node = node.parentNode;
        }

        if (rect.width > 0 && rect.height > 0) {
          setSelection({
            text: sel.toString().trim(),
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
            isInsideWorkshop
          });
        }
      } catch (err) {}
    } else {
      if (!target.closest('.selection-menu') && !target.closest('.research-drawer') && !target.closest('#workshop-toolbar-research')) {
        setSelection(null);
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleCopyAll = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText;
      navigator.clipboard.writeText(text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    }
  };

  const handleExplain = async (type: 'explain' | 'translate') => {
    if (!selection) return;
    setExplanation({ text: "", loading: true });
    try {
      const result = await quickExplain(selection.text, type);
      setExplanation({ text: result, loading: false });
    } catch (err: any) {
      setExplanation({ text: "རེ་ཞིག་འགྲེལ་བཤད་གནང་མ་ཐུབ།", loading: false });
    }
  };

  const formatExplanationText = (text: string) => {
    if (!text) return null;
    const segments = text.split(/---TIBETAN_COMMENTARY---|---CHINESE_TRANSLATION---|---ENGLISH_TRANSLATION---/);
    const tib = segments[1]?.trim();
    const chi = segments[2]?.trim();
    const eng = segments[3]?.trim();

    return (
      <div className="space-y-10 pb-20">
        {tib && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            <span className="text-[10px] font-black text-himalaya-red uppercase tracking-widest block mb-4">བོད་ཡིག་འགྲེལ་བཤད།</span>
            <p className="text-3xl font-tibetan leading-[2] text-himalaya-dark text-justify">{tib}</p>
          </div>
        )}
        {chi && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-700 pt-6 border-t border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">汉译 Rendering</span>
            <p className="text-lg font-serif italic text-himalaya-dark/90 leading-relaxed text-justify">{chi}</p>
          </div>
        )}
        {eng && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-700 pt-6 border-t border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">English Scholarly Note</span>
            <p className="text-sm font-sans italic text-himalaya-dark/70 leading-relaxed text-justify">{eng}</p>
          </div>
        )}
      </div>
    );
  };

  const handleResetConversation = () => {
    if (window.confirm("确定要重置当前史诗的进度吗？此操作不可恢复。")) {
      setMessages([{ id: 'welcome', role: 'model', text: 'བཀྲ་ཤིས་བདེ་ལེགས། 创作助手已准备好重新落笔。', timestamp: Date.now() }]);
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
      localStorage.removeItem(STORAGE_KEY_DRAFT);
      setInputText("");
      if (editorRef.current) editorRef.current.innerHTML = "";
    }
  };

  const handleResetLayout = () => {
    const defaultW = 900;
    setWsPos({ x: (window.innerWidth - defaultW) / 2, y: 100 });
    setWsSize({ width: defaultW, height: 700 });
    setIsMaximized(false);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging && !isMaximized) {
      setWsPos({ x: dragging.initialX + (e.clientX - dragging.startX), y: dragging.initialY + (e.clientY - dragging.startY) });
    } else if (resizing && !isMaximized) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let newW = resizing.initialW;
      let newH = resizing.initialH;
      if (resizing.direction.includes('e')) newW = Math.max(500, resizing.initialW + dx);
      if (resizing.direction.includes('s')) newH = Math.max(300, resizing.initialH + dy);
      setWsSize({ width: newW, height: newH });
    }
  }, [dragging, resizing, isMaximized]);

  const handleMouseUp = useCallback(() => { setDragging(null); setResizing(null); }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const toggleNativeFullscreen = () => {
    if (!document.fullscreenElement) { workshopRef.current?.requestFullscreen(); } else { document.exitFullscreen(); }
  };

  const totalCharacters = useMemo(() => 
    messages.reduce((sum, m) => {
      const text = m.text.replace(/\[CONTINUE_SIGNAL\]/g, "").replace(/\[COMPLETE\]/g, "");
      return sum + text.length;
    }, 0), 
  [messages]);

  const totalTshegs = useMemo(() => 
    messages.reduce((sum, m) => {
      const text = m.text.replace(/\[CONTINUE_SIGNAL\]/g, "").replace(/\[COMPLETE\]/g, "");
      return sum + (text.match(/་/g) || []).length;
    }, 0), 
  [messages]);

  const currentInputTshegCount = useMemo(() => (inputText.match(/་/g) || []).length, [inputText]);

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || editorRef.current?.innerText.trim();
    if (!text || (isLoading && !overrideText)) return;

    if (!overrideText && editorRef.current) {
      editorRef.current.innerHTML = '';
      setInputText("");
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    }
    
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();
    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));

    if (!targetId) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'user', text: text!, timestamp: Date.now() },
        { id: botMsgId, role: 'model', text: '正在构思宏大的新章节...', isStreaming: true, timestamp: Date.now() }
      ]);
    } else {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: true } : m));
    }

    try {
      const resultText = await sendMessageToSession(text!, history, (chunkText) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunkText } : m));
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });

      const fullContent = accumulatedText + resultText;
      if (resultText.includes("[CONTINUE_SIGNAL]") && totalCharacters < EPIC_GOAL_CHARACTERS) {
        const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
        setTimeout(() => handleSend("请继续书写。མུ་མཐུད་དུ་རྩོམ་སྒྲིག་གནང་རོགས།", botMsgId, cleanedContent), 500);
      } else {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { 
          ...m, 
          text: fullContent.replace("[CONTINUE_SIGNAL]", "").replace("[COMPLETE]", "").trim(), 
          isStreaming: false 
        } : m));
        setIsLoading(false);
      }
    } catch (e: any) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream font-tibetan overflow-hidden relative">
      <Header 
        onReset={handleResetConversation} 
        onResetLayout={handleResetLayout} 
        onToggleMemory={() => setIsMemoryOpen(true)} 
        totalCharacters={totalCharacters}
        totalTshegs={totalTshegs}
        epicGoal={EPIC_GOAL_CHARACTERS}
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar relative">
        <div className="max-w-5xl mx-auto space-y-16 pb-[300px]">
          {messages.map((msg) => (
            <div key={msg.id} className="relative">
              <ChatMessage message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Workshop Drawer Overlay for Research */}
      {explanation && (
        <div className="fixed inset-0 z-[2500] flex justify-end">
           <div className="absolute inset-0 bg-black/20 backdrop-blur-[4px]" onClick={() => { setExplanation(null); setSelection(null); }} />
           <div className="relative w-full max-w-[600px] h-full bg-white shadow-2xl border-l-8 border-himalaya-gold flex flex-col animate-in slide-in-from-right duration-500">
              <div className="h-24 bg-himalaya-red flex items-center justify-between px-8 text-himalaya-gold shrink-0">
                 <div className="flex items-center gap-4">
                    <BookOpen size={32} />
                    <div>
                       <h3 className="text-2xl font-black font-tibetan">宗师研注 Archive</h3>
                       <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-60">Imperial Scholarly Commentary</p>
                    </div>
                 </div>
                 <button onClick={() => { setExplanation(null); setSelection(null); }} className="w-12 h-12 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors">
                    <X size={24} />
                 </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-12 bg-gradient-to-b from-white to-gray-50/50">
                 {explanation.loading ? (
                   <div className="flex flex-col items-center justify-center h-full gap-8 opacity-40">
                      <Loader2 className="animate-spin text-himalaya-red" size={64} />
                      <span className="text-[10px] font-black uppercase tracking-[0.5em]">Consulting the Great Archives...</span>
                   </div>
                 ) : (
                   <div className="prose prose-2xl max-w-none">{formatExplanationText(explanation.text)}</div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Editor Workshop */}
      {isInputVisible && (
        <div 
          ref={workshopRef}
          className={`fixed flex flex-col bg-white overflow-hidden ${isMaximized ? 'inset-0 !w-full !h-full border-0 z-[400]' : 'border-4 border-himalaya-gold/40 shadow-2xl rounded-[3rem] z-[400]'}`} 
          style={isMaximized ? {} : { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` }}
        >
          <div 
            onMouseDown={(e) => { if (!isMaximized) setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }} 
            className="h-16 bg-gray-50 grid grid-cols-3 items-center px-8 cursor-grab active:cursor-grabbing shrink-0 border-b border-gray-100"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <PenTool size={20} className="text-himalaya-red" />
                <span className="text-xs font-black uppercase tracking-widest hidden lg:inline">史诗工坊 Scribe Workshop</span>
              </div>
              
              <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div className="flex flex-col items-center">
                  <span className="text-[6px] font-bold text-gray-300 uppercase leading-none">Chars</span>
                  <span className="text-[10px] font-black tabular-nums leading-none">{inputText.length.toLocaleString()}</span>
                </div>
                <div className="w-px h-4 bg-gray-100" />
                <div className="flex flex-col items-center">
                  <span className="text-[6px] font-bold text-gray-300 uppercase leading-none">Tshegs</span>
                  <span className="text-[10px] font-black tabular-nums leading-none">{currentInputTshegCount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-gray-200 shadow-sm relative">
                <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors"><Minus size={14} /></button>
                <div className="min-w-[30px] text-center text-[10px] font-black">{fontSize}px</div>
                <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors"><Plus size={14} /></button>
              </div>
              <button onClick={handleCopyAll} className={`p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm ${isCopied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`} title="复制全文"><Copy size={14} /></button>
            </div>

            <div className="flex justify-center">
               <button 
                  onClick={() => handleSend()} 
                  disabled={!inputText.trim() || isLoading}
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl border-2 transition-all active:scale-95 ${isLoading ? 'bg-gray-100 text-gray-300 border-gray-200' : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold/30 hover:scale-110'}`}
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Compass size={24} />}
                </button>
            </div>

            <div className="flex items-center justify-end gap-1">
              {selection?.isInsideWorkshop && (
                <button id="workshop-toolbar-research" onClick={() => handleExplain('explain')} className="flex items-center gap-2 px-4 py-2 bg-himalaya-gold text-himalaya-red rounded-lg shadow-md hover:brightness-105 active:scale-95 transition-all mr-2 group">
                  <Sparkles size={14} className="group-hover:animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">研注 Analysis</span>
                </button>
              )}
              <button onClick={toggleNativeFullscreen} className="p-2 text-gray-400 hover:text-himalaya-dark transition-colors"><Maximize size={18} /></button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 text-gray-400 hover:text-himalaya-dark transition-colors">{isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
              <button onClick={() => setIsInputVisible(false)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative p-8 bg-white">
              <div 
                id="scribe-editor"
                ref={editorRef} 
                contentEditable 
                spellCheck="false" 
                style={{ fontSize: `${fontSize}px` }} 
                className="w-full h-full outline-none font-tibetan leading-[2.6] overflow-y-auto custom-scrollbar text-himalaya-dark px-10 pb-40 selection:bg-himalaya-gold/40 text-justify" 
                onInput={() => setInputText(editorRef.current?.innerText || "")}
              />
              {!inputText && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-5 gap-8">
                  <Pen size={160} />
                  <div className="font-tibetan text-6xl text-center px-20">འབྲི་བཤེར་གནང་རོགས། 开启五万字宏大史诗...</div>
                </div>
              )}
          </div>
          
          {!isMaximized && (
            <div onMouseDown={(e) => setResizing({ direction: 'se', startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height, initialX: wsPos.x, initialY: wsPos.y })} className="absolute bottom-0 right-0 w-10 h-10 cursor-se-resize z-10" />
          )}
        </div>
      )}

      {/* Workshop Toggle Button */}
      {!isInputVisible && (
        <button onClick={() => setIsInputVisible(true)} className="fixed bottom-12 right-12 w-20 h-20 bg-himalaya-red text-himalaya-gold rounded-full shadow-2xl flex items-center justify-center z-[400] transition-all hover:scale-110 active:scale-90 border-4 border-himalaya-gold/30">
          <PenTool size={36} />
        </button>
      )}
    </div>
  );
};

export default App;
