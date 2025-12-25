
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Feather, RotateCcw, Plus, Minus, AlertCircle, PenTool, X, MoveRight, 
  Key, Flame, Minimize2, Stars, Maximize, Languages, Info, Search,
  Trophy, BarChart3, Milestone, BrainCircuit, Compass, Pen, Maximize2, RefreshCw
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageToSession, quickExplain } from './services/geminiService';

const STORAGE_KEY_MESSAGES = 'himalaya_v2_messages';
const STORAGE_KEY_POS = 'himalaya_ws_pos';
const STORAGE_KEY_SIZE = 'himalaya_ws_size';
const EPIC_GOAL_CHARACTERS = 50000;

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

  // Selection/Explanation state
  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);
  const [explanation, setExplanation] = useState<{ text: string, loading: boolean } | null>(null);

  const [wsPos, setWsPos] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_POS);
    const defaultW = 900;
    return saved ? JSON.parse(saved) : { x: (window.innerWidth - defaultW) / 2, y: 100 };
  });
  const [wsSize, setWsSize] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SIZE);
    return saved ? JSON.parse(saved) : { width: 900, height: 600 };
  });

  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ direction: ResizeDirection, startX: number, startY: number, initialW: number, initialH: number, initialX: number, initialY: number } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const workshopRef = useRef<HTMLDivElement>(null);

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
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    if (!isMaximized) {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(wsPos));
      localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(wsSize));
    }
  }, [messages, wsPos, wsSize, isMaximized]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ 
        id: 'welcome', 
        role: 'model', 
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། བོད་ཀྱི་ཡིག་རིགས་创作助手欢迎您。我已经准备好为您书写五万字的史诗巨著。', 
        timestamp: Date.now() 
      }]);
    }
  }, [messages.length]);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
    }
  };

  const handleTextSelection = useCallback((e: MouseEvent) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setSelection({
            text: sel.toString().trim(),
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          });
        }
      } catch (err) {}
    } else {
      const target = e.target as HTMLElement;
      if (!target.closest('.explanation-bubble')) {
        setSelection(null);
        setExplanation(null);
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleExplain = async (type: 'explain' | 'translate') => {
    if (!selection) return;
    setExplanation({ text: "", loading: true });
    try {
      const result = await quickExplain(selection.text, type);
      setExplanation({ text: result, loading: false });
    } catch (err: any) {
      setExplanation({ text: "རེ་ཞིག་འགྲེལ་བཤད་གནང་མ་ཐུབ།", loading: false });
      if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        setError(
          <div className="flex flex-col gap-2">
            <span>创作能量（API配额）已耗尽。</span>
            <button onClick={handleOpenKeyDialog} className="underline font-bold text-left">点击切换 API Key</button>
          </div>
        );
      }
    }
  };

  const handleResetConversation = () => {
    if (window.confirm("确定要重置当前史诗的进度吗？此操作不可恢复。")) {
      setMessages([{ 
        id: 'welcome', 
        role: 'model', 
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། 创作助手已准备好重新落笔。', 
        timestamp: Date.now() 
      }]);
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
      setInputText("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setError(null);
    }
  };

  const handleResetLayout = () => {
    const defaultW = 900;
    setWsPos({ x: (window.innerWidth - defaultW) / 2, y: 100 });
    setWsSize({ width: defaultW, height: 600 });
    setIsMaximized(false);
    setIsInputVisible(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging && !isMaximized) {
      setWsPos({
        x: dragging.initialX + (e.clientX - dragging.startX),
        y: dragging.initialY + (e.clientY - dragging.startY)
      });
    } else if (resizing && !isMaximized) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      let newW = resizing.initialW;
      let newH = resizing.initialH;
      let newX = resizing.initialX;
      let newY = resizing.initialY;

      if (resizing.direction.includes('e')) newW = Math.max(500, resizing.initialW + dx);
      if (resizing.direction.includes('w')) {
        const delta = Math.min(resizing.initialW - 500, dx);
        newW = resizing.initialW - delta;
        newX = resizing.initialX + delta;
      }
      if (resizing.direction.includes('s')) newH = Math.max(300, resizing.initialH + dy);
      if (resizing.direction.includes('n')) {
        const BuilderDeltaN = Math.min(resizing.initialH - 300, dy);
        newH = resizing.initialH - BuilderDeltaN;
        newY = resizing.initialY + BuilderDeltaN;
      }
      setWsSize({ width: newW, height: newH });
      setWsPos({ x: newX, y: newY });
    }
  }, [dragging, resizing, isMaximized]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const toggleNativeFullscreen = () => {
    if (!document.fullscreenElement) {
      workshopRef.current?.requestFullscreen().catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
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

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || editorRef.current?.innerText.trim();
    if (!text || (isLoading && !overrideText)) return;

    if (!overrideText && editorRef.current) {
      editorRef.current.innerHTML = '';
      setInputText("");
      setError(null);
    }
    
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();

    // Prepare history for stateless sendMessage
    const history = messages.map(m => ({ 
      role: m.role, 
      parts: [{ text: m.text }] 
    }));

    if (!targetId) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'user', text: text!, timestamp: Date.now() },
        { id: botMsgId, role: 'model', text: '正在构思下一个篇章...', isStreaming: true, timestamp: Date.now() }
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
      console.error(e);
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m));
      
      const errorMsg = e.message || "";
      if (errorMsg.includes("Requested entity was not found") || errorMsg.includes("API_KEY_INVALID")) {
        setError(
          <div className="flex flex-col gap-2">
            <span>API 密钥无效或未找到。请重新选择。</span>
            <button onClick={handleOpenKeyDialog} className="underline font-bold text-left">重选 API Key</button>
          </div>
        );
        setHasApiKey(false);
        handleOpenKeyDialog(); // Auto trigger as per instruction
      } else if (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
        setError(
          <div className="flex flex-col gap-2">
            <span>创作能量已耗尽（Quota Exceeded）。</span>
            <button onClick={handleOpenKeyDialog} className="underline font-bold text-left flex items-center gap-2">
              <RefreshCw size={14}/> 切换更高级的 API Key 
            </button>
          </div>
        );
      } else {
        setError("书写中断。请稍后再试。");
      }
    }
  };

  const handleManualContinue = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'model') {
      handleSend("请继续书写。མུ་མཐུད་དུ་རྩོམ་སྒྲིག་གནང་རོགས།", lastMsg.id, lastMsg.text);
    }
  };

  const showContinueButton = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    return lastMsg && lastMsg.role === 'model' && !isLoading;
  }, [messages, isLoading]);

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
        <div className="max-w-4xl mx-auto space-y-16 pb-[200px]">
          {messages.map((msg) => (
            <div key={msg.id} className="relative">
              <ChatMessage message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Memory Overlay */}
      {isMemoryOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-himalaya-dark/60 backdrop-blur-md" onClick={() => setIsMemoryOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl border-4 border-himalaya-gold overflow-hidden animate-in fade-in zoom-in duration-300">
             <div className="bg-himalaya-red p-6 flex justify-between items-center text-himalaya-gold">
                <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-xl bg-himalaya-gold/20 flex items-center justify-center">
                      <BrainCircuit size={24} />
                   </div>
                   <div>
                      <h2 className="text-xl font-black font-tibetan">史诗记忆库</h2>
                      <p className="text-[8px] uppercase font-bold tracking-widest opacity-60">Memory System</p>
                   </div>
                </div>
                <button onClick={() => setIsMemoryOpen(false)} className="w-8 h-8 rounded-lg bg-black/10 flex items-center justify-center">
                   <X size={16} />
                </button>
             </div>
             
             <div className="p-8 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                   <div className="bg-himalaya-cream p-4 rounded-2xl border border-himalaya-gold/10 text-center">
                      <div className="text-xl font-black text-himalaya-dark">{totalCharacters.toLocaleString()}</div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">总字数</div>
                   </div>
                   <div className="bg-himalaya-cream p-4 rounded-2xl border border-himalaya-gold/10 text-center">
                      <div className="text-xl font-black text-himalaya-dark">{messages.filter(m => m.role === 'model').length}</div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">篇章</div>
                   </div>
                   <div className="bg-himalaya-cream p-4 rounded-2xl border border-himalaya-gold/10 text-center">
                      <div className="text-xl font-black text-himalaya-dark">{Math.floor((totalCharacters/EPIC_GOAL_CHARACTERS)*100)}%</div>
                      <div className="text-[8px] font-bold text-gray-400 uppercase">进度</div>
                   </div>
                </div>
                <div className="flex justify-end">
                   <button onClick={() => setIsMemoryOpen(false)} className="px-6 py-2 bg-himalaya-red text-himalaya-gold rounded-xl font-black uppercase text-[9px]">继续</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Floating Selection Menu */}
      {selection && (
        <div 
          className="fixed z-[1000] -translate-x-1/2 flex flex-col items-center pointer-events-auto explanation-bubble"
          style={{ left: selection.x, top: selection.y - 10 }}
        >
          {!explanation && (
            <div className="flex items-center gap-1 bg-himalaya-dark text-white p-1 rounded-xl shadow-2xl border border-white/20">
              <button onClick={() => handleExplain('explain')} className="flex items-center gap-2 px-3 py-1 hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest border-r border-white/10">
                <Info size={12} className="text-himalaya-gold" />
                <span>研注</span>
              </button>
              <button onClick={() => handleExplain('translate')} className="flex items-center gap-2 px-3 py-1 hover:bg-white/10 rounded-lg text-[9px] font-bold uppercase tracking-widest">
                <Languages size={12} className="text-himalaya-gold" />
                <span>翻译</span>
              </button>
            </div>
          )}
          {explanation && (
            <div className="mt-2 w-80 bg-white border-2 border-himalaya-gold rounded-2xl shadow-2xl p-4 animate-in">
               <div className="flex justify-between mb-2">
                  <span className="text-[9px] font-black text-himalaya-red uppercase">宗师研注</span>
                  <button onClick={() => { setExplanation(null); setSelection(null); }}><X size={12} /></button>
               </div>
               <div className="text-sm leading-relaxed overflow-y-auto max-h-60 custom-scrollbar whitespace-pre-wrap">
                  {explanation.loading ? <Loader2 className="animate-spin mx-auto" /> : explanation.text}
               </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Continue Button */}
      {showContinueButton && (
        <div className="fixed bottom-12 left-12 pointer-events-auto">
          <button onClick={handleManualContinue} className="flex items-center gap-3 px-4 py-2 bg-himalaya-red text-himalaya-gold rounded-xl font-bold shadow-xl border-2 border-himalaya-gold/20 text-xs">
            <Flame size={14} />
            <span>接笔续写 མུ་མཐུད་དུ་བྲིས།</span>
            <MoveRight size={14} />
          </button>
        </div>
      )}

      {/* Editor Workshop */}
      {isInputVisible && (
        <div 
          ref={workshopRef}
          className={`fixed flex flex-col bg-white overflow-hidden ${isMaximized ? 'inset-0 !w-full !h-full border-0 z-[400]' : 'border-2 border-himalaya-gold/30 shadow-2xl rounded-[2.5rem] z-[400]'}`} 
          style={isMaximized ? {} : { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` }}
        >
          <div 
            onMouseDown={(e) => { if (!isMaximized) setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }} 
            className="h-14 bg-gray-50/50 flex items-center justify-between px-6 cursor-grab active:cursor-grabbing shrink-0 border-b border-gray-100 relative"
          >
            <div className="flex items-center shrink-0">
              <div className="flex items-center gap-2">
                <PenTool size={16} className="text-himalaya-red" />
                <span className="text-sm font-black hidden sm:inline">史诗工坊</span>
              </div>
              
              <div className="flex items-center gap-1 ml-4 bg-white/80 px-2 py-0.5 rounded-lg border border-gray-200 shadow-sm">
                <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors" title="减小字号">
                  <Minus size={12} />
                </button>
                <div className="min-w-[32px] text-center text-[10px] font-black text-himalaya-dark">{fontSize}px</div>
                <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors" title="增大字号">
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {/* "Scribe" (落笔) Button centered in the toolbar */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
               <button 
                  onClick={() => handleSend()} 
                  disabled={!inputText.trim() || isLoading}
                  className={`h-9 px-6 rounded-xl flex items-center gap-2 shadow-md border-2 transition-all active:scale-95 ${isLoading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold hover:brightness-110'}`}
                >
                  {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Compass size={14} />}
                  <span className="font-black text-xs">落笔</span>
                </button>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button onClick={toggleNativeFullscreen} className="p-1.5 text-gray-400 hover:text-himalaya-dark" title="全屏模式">
                <Maximize size={16} />
              </button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="p-1.5 text-gray-400 hover:text-himalaya-dark" title={isMaximized ? "退出最大化" : "最大化窗口"}>
                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setIsInputVisible(false)} className="p-1.5 text-gray-400 hover:text-red-500" title="隐藏工坊"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative p-4">
              <div 
                ref={editorRef} 
                contentEditable 
                spellCheck="false" 
                style={{ fontSize: `${fontSize}px` }} 
                className="w-full h-full outline-none font-tibetan leading-[2] overflow-y-auto custom-scrollbar text-himalaya-dark px-4 pb-20" 
                onInput={() => setInputText(editorRef.current?.innerText || "")}
              />
              {!inputText && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10 font-tibetan text-3xl">开始书写...</div>}
              
              {/* Error messages now floating bottom-right of workspace */}
              {error && (
                <div className="absolute bottom-6 right-6 z-[10] p-3 px-5 rounded-xl border border-red-100 bg-white shadow-xl text-red-600 text-xs max-w-xs animate-in slide-in-from-bottom-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <div className="flex-1">{error}</div>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
      {!isInputVisible && (
        <button onClick={() => setIsInputVisible(true)} className="fixed bottom-12 right-12 w-14 h-14 bg-himalaya-red text-himalaya-gold rounded-2xl shadow-2xl flex items-center justify-center z-[400] transition-transform hover:scale-110 active:scale-90"><PenTool size={24} /></button>
      )}
    </div>
  );
};

export default App;
