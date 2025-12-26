
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Feather, RotateCcw, Plus, Minus, AlertCircle, PenTool, X, MoveRight, 
  Key, Flame, Minimize2, Stars, Maximize, Languages, Info, Search,
  Trophy, BarChart3, Milestone, BrainCircuit, Compass, Pen, Maximize2, RefreshCw, Sparkles,
  BookOpen, Quote, Bold, Italic, Underline as UnderlineIcon, Copy, Check
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageToSession, quickExplain } from './services/geminiService';

const STORAGE_KEY_MESSAGES = 'himalaya_v2_messages';
const STORAGE_KEY_POS = 'himalaya_ws_pos';
const STORAGE_KEY_SIZE = 'himalaya_ws_size';
const STORAGE_KEY_DRAFT = 'himalaya_workshop_draft';
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
  const [isCopied, setIsCopied] = useState(false);

  // Formatting state
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false
  });

  // Selection/Explanation state
  const [selection, setSelection] = useState<{ text: string, x: number, y: number, isInsideWorkshop: boolean } | null>(null);
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

  // Restore draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY_DRAFT);
    if (savedDraft && editorRef.current) {
      editorRef.current.innerHTML = savedDraft;
      setInputText(editorRef.current.innerText);
    }
  }, []);

  // Save draft on change
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

  const updateFormatState = useCallback(() => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline')
    });
  }, []);

  const handleTextSelection = useCallback((e: MouseEvent) => {
    const sel = window.getSelection();
    const target = e.target as HTMLElement;

    // Check formatting state whenever selection changes
    updateFormatState();

    // If text is selected, show the selection toolbar
    if (sel && sel.toString().trim().length > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const isInsideWorkshop = !!target.closest('#scribe-editor');

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
      if (!explanation) {
        if (!target.closest('.explanation-bubble') && !target.closest('#workshop-toolbar-research')) {
          setSelection(null);
        }
      }
    }
  }, [explanation, updateFormatState]);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleFormat = (command: string) => {
    document.execCommand(command, false);
    updateFormatState();
    if (editorRef.current) {
      setInputText(editorRef.current.innerText);
    }
  };

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

  const formatExplanationText = (text: string) => {
    if (!text) return null;

    // Detect structured sections
    const tibetanMatch = text.match(/---TIBETAN_COMMENTARY---([\s\S]*?)(?=---CHINESE_TRANSLATION---|$)/);
    const chineseMatch = text.match(/---CHINESE_TRANSLATION---([\s\S]*?)(?=---ENGLISH_TRANSLATION---|$)/);
    const englishMatch = text.match(/---ENGLISH_TRANSLATION---([\s\S]*?)$/);

    const tibContent = tibetanMatch ? tibetanMatch[1].trim() : null;
    const chiContent = chineseMatch ? chineseMatch[1].trim() : null;
    const engContent = englishMatch ? englishMatch[1].trim() : null;

    if (!tibContent && !chiContent && !engContent) {
      const segments = text.split(/([\u0F00-\u0FFF\s་]+)/g);
      return segments.map((s, i) => {
        if (!s) return null;
        const isTibetan = /[\u0F00-\u0FFF\s་]/.test(s);
        return (
          <span key={i} className={isTibetan ? 'text-2xl font-tibetan leading-relaxed block mb-4 text-himalaya-dark' : 'text-sm opacity-70 leading-relaxed block'}>
            {s}
          </span>
        );
      });
    }

    return (
      <div className="space-y-12">
        {tibContent && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-himalaya-gold/40 to-transparent" />
              <span className="text-[12px] font-black text-himalaya-red uppercase tracking-[0.4em] flex items-center gap-3">
                <Sparkles size={14} className="text-himalaya-gold animate-pulse" /> བོད་ཡིག་འགྲེལ་བཤད། 宗师研注
              </span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-himalaya-gold/40 to-transparent" />
            </div>
            <div className="relative group">
              <Quote className="absolute -top-4 -left-6 text-himalaya-gold/10 w-16 h-16 pointer-events-none" />
              <p className="text-4xl font-tibetan leading-[2.2] text-himalaya-dark drop-shadow-sm text-justify">
                {tibContent}
              </p>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-10 border-t border-himalaya-gold/15">
          {chiContent && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-1000">
              <div className="flex items-center gap-3 mb-5 opacity-40">
                <div className="h-px w-8 bg-himalaya-dark" />
                <span className="text-[11px] font-bold text-himalaya-dark uppercase tracking-[0.2em]">汉译 Rendering</span>
              </div>
              <p className="text-xl font-serif italic text-himalaya-dark/90 leading-relaxed indent-10 text-justify">
                {chiContent}
              </p>
            </div>
          )}
          
          {engContent && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-1000">
              <div className="flex items-center gap-3 mb-5 opacity-40">
                <div className="h-px w-8 bg-himalaya-dark" />
                <span className="text-[11px] font-bold text-himalaya-dark uppercase tracking-[0.2em]">Philological Note</span>
              </div>
              <p className="text-base font-sans italic text-himalaya-dark/70 leading-relaxed text-justify">
                {engContent}
              </p>
            </div>
          )}
        </div>
      </div>
    );
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
      localStorage.removeItem(STORAGE_KEY_DRAFT);
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
      localStorage.removeItem(STORAGE_KEY_DRAFT);
    }
    
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();

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
        handleOpenKeyDialog();
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
                      <div className="text-[8px] font-bold text-gray-300 uppercase tracking-widest">Progress</div>
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
              <button onClick={() => handleExplain('explain')} className="flex items-center gap-2 px-3 py-1 hover:bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border-r border-white/10">
                <Sparkles size={13} className="text-himalaya-gold" />
                <span>研注 Analysis</span>
              </button>
              <button onClick={() => handleExplain('translate')} className="flex items-center gap-2 px-3 py-1 hover:bg-white/10 rounded-lg text-[10px] font-black uppercase tracking-[0.2em]">
                <Languages size={13} className="text-himalaya-gold" />
                <span>翻译</span>
              </button>
            </div>
          )}
          {explanation && (
            <div className="mt-2 w-[50rem] max-w-[95vw] bg-white border-4 border-himalaya-gold/40 rounded-[3.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] p-12 animate-in zoom-in slide-in-from-top-4 duration-500 relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-himalaya-red text-himalaya-gold px-8 py-2 rounded-full border-4 border-himalaya-gold/40 shadow-xl flex items-center gap-3">
                  <BookOpen size={18} />
                  <span className="text-[12px] font-black uppercase tracking-[0.4em]">宗师秘传研注 · Trilingual Lexicon</span>
               </div>
               
               <div className="flex justify-end mb-4">
                  <button onClick={() => { setExplanation(null); setSelection(null); }} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors group">
                    <X size={24} className="text-gray-300 group-hover:text-himalaya-red" />
                  </button>
               </div>

               <div className="overflow-y-auto max-h-[70vh] custom-scrollbar px-4">
                  {explanation.loading ? (
                    <div className="flex flex-col items-center py-24 gap-8">
                      <div className="relative">
                        <Loader2 className="animate-spin text-himalaya-red" size={48} />
                        <Sparkles className="absolute -top-2 -right-2 text-himalaya-gold animate-bounce" size={16} />
                      </div>
                      <div className="text-center">
                        <span className="text-[14px] font-black uppercase text-himalaya-gold tracking-[0.5em] block mb-2">正在翻阅三语秘典...</span>
                        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Consulting the Grand Trilingual Archives</span>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-xl max-w-none">
                      {formatExplanationText(explanation.text)}
                    </div>
                  )}
               </div>
               <div className="mt-10 pt-6 border-t border-gray-100 flex justify-between items-center opacity-30">
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-[0.5em]">Authored by the Grand Historian</span>
                  <Sparkles size={16} className="text-himalaya-gold" />
               </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Continue Button */}
      {showContinueButton && (
        <div className="fixed bottom-12 left-12 pointer-events-auto">
          <button onClick={handleManualContinue} className="flex items-center gap-3 px-5 py-3 bg-himalaya-red text-himalaya-gold rounded-2xl font-black shadow-2xl border-2 border-himalaya-gold/30 text-sm hover:scale-105 active:scale-95 transition-transform group">
            <Flame size={18} className="group-hover:animate-pulse" />
            <span>接笔续写 མུ་མཐུད་དུ་བྲིས།</span>
            <MoveRight size={18} />
          </button>
        </div>
      )}

      {/* Editor Workshop (资料栏) */}
      {isInputVisible && (
        <div 
          ref={workshopRef}
          className={`fixed flex flex-col bg-white overflow-hidden ${isMaximized ? 'inset-0 !w-full !h-full border-0 z-[400]' : 'border-2 border-himalaya-gold/30 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.2)] rounded-[3rem] z-[400]'}`} 
          style={isMaximized ? {} : { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` }}
        >
          <div 
            onMouseDown={(e) => { if (!isMaximized) setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }} 
            className="h-16 bg-gray-50/50 flex items-center justify-between px-8 cursor-grab active:cursor-grabbing shrink-0 border-b border-gray-100 relative"
          >
            <div className="flex items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-himalaya-red/10 flex items-center justify-center">
                  <PenTool size={18} className="text-himalaya-red" />
                </div>
                <span className="text-sm font-black hidden sm:inline tracking-widest uppercase">史诗工坊 Scribe Workshop</span>
              </div>
              
              <div className="flex items-center gap-1 ml-6 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-sm">
                <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors" title="减小字号">
                  <Minus size={14} />
                </button>
                <div className="min-w-[40px] text-center text-xs font-black text-himalaya-dark">{fontSize}px</div>
                <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-1 text-gray-400 hover:text-himalaya-red transition-colors" title="增大字号">
                  <Plus size={14} />
                </button>
              </div>

              {/* Formatting Toolbar */}
              <div className="flex items-center gap-1 ml-3 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-sm">
                <button 
                  onClick={() => handleFormat('bold')} 
                  className={`p-1.5 rounded-lg transition-colors ${activeFormats.bold ? 'bg-himalaya-red text-himalaya-gold' : 'text-gray-400 hover:bg-gray-100'}`}
                  title="加粗 Bold"
                >
                  <Bold size={14} />
                </button>
                <button 
                  onClick={() => handleFormat('italic')} 
                  className={`p-1.5 rounded-lg transition-colors ${activeFormats.italic ? 'bg-himalaya-red text-himalaya-gold' : 'text-gray-400 hover:bg-gray-100'}`}
                  title="斜体 Italic"
                >
                  <Italic size={14} />
                </button>
                <button 
                  onClick={() => handleFormat('underline')} 
                  className={`p-1.5 rounded-lg transition-colors ${activeFormats.underline ? 'bg-himalaya-red text-himalaya-gold' : 'text-gray-400 hover:bg-gray-100'}`}
                  title="下划线 Underline"
                >
                  <UnderlineIcon size={14} />
                </button>
              </div>

              {/* Copy All Button */}
              <div className="flex items-center gap-1 ml-3 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-sm">
                <button 
                  onClick={handleCopyAll} 
                  className={`p-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isCopied ? 'text-green-600' : 'text-gray-400 hover:bg-gray-100 hover:text-himalaya-red'}`}
                  title="复制全文 Copy All"
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span className="text-[10px] font-black uppercase tracking-tighter hidden lg:inline">
                    {isCopied ? '已复制' : '复制全文'}
                  </span>
                </button>
              </div>

              {/* Research Button (Accessible when text selected in workshop) */}
              {selection?.isInsideWorkshop && !explanation && (
                <button 
                  id="workshop-toolbar-research"
                  onClick={() => handleExplain('explain')}
                  className="ml-8 flex items-center gap-3 px-6 py-2.5 bg-himalaya-red text-himalaya-gold rounded-2xl border-2 border-himalaya-gold/50 hover:scale-105 active:scale-95 transition-all shadow-2xl animate-in fade-in slide-in-from-left-6"
                >
                  <Sparkles size={16} className="text-himalaya-gold animate-pulse" />
                  <span className="text-[11px] font-black uppercase tracking-[0.3em]">研注 Analysis</span>
                </button>
              )}
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
               <button 
                  onClick={() => handleSend()} 
                  disabled={!inputText.trim() || isLoading}
                  className={`h-9 px-4 rounded-xl flex items-center gap-2 shadow-lg border transition-all active:scale-95 ${isLoading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait' : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold/30 hover:brightness-110'}`}
                >
                  {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Compass size={14} />}
                  <span className="font-black text-xs uppercase tracking-widest whitespace-nowrap">落笔 Scribe</span>
                </button>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button onClick={toggleNativeFullscreen} className="p-2 text-gray-400 hover:text-himalaya-dark rounded-lg hover:bg-white transition-colors" title="全屏模式">
                <Maximize size={18} />
              </button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 text-gray-400 hover:text-himalaya-dark rounded-lg hover:bg-white transition-colors" title={isMaximized ? "退出最大化" : "最大化窗口"}>
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button onClick={() => setIsInputVisible(false)} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="隐藏工坊"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative p-6 bg-gradient-to-b from-white to-gray-50/30">
              <div 
                id="scribe-editor"
                ref={editorRef} 
                contentEditable 
                spellCheck="false" 
                style={{ fontSize: `${fontSize}px` }} 
                className="w-full h-full outline-none font-tibetan leading-[2.4] overflow-y-auto custom-scrollbar text-himalaya-dark px-8 pb-32 selection:bg-himalaya-gold/40 scroll-smooth text-justify" 
                onInput={() => setInputText(editorRef.current?.innerText || "")}
                onKeyUp={updateFormatState}
                onMouseUp={updateFormatState}
              />
              {!inputText && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-5 gap-6">
                  <Pen size={120} />
                  <div className="font-tibetan text-5xl">འབྲི་བཤེར་གནང་རོགས། 开始书写...</div>
                </div>
              )}
              
              {error && (
                <div className="absolute bottom-10 right-10 z-[10] p-4 px-6 rounded-[1.5rem] border border-red-100 bg-white shadow-2xl text-red-600 text-xs max-w-sm animate-in slide-in-from-bottom-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div className="flex-1 font-bold leading-relaxed">{error}</div>
                  </div>
                </div>
              )}
          </div>
          
          {/* Resize handles */}
          {!isMaximized && (
            <>
              <div onMouseDown={(e) => setResizing({ direction: 'se', startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height, initialX: wsPos.x, initialY: wsPos.y })} className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-10 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-himalaya-gold/20 rounded-full" />
              </div>
              <div onMouseDown={(e) => setResizing({ direction: 'e', startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height, initialX: wsPos.x, initialY: wsPos.y })} className="absolute top-0 right-0 w-2 h-full cursor-e-resize z-10" />
              <div onMouseDown={(e) => setResizing({ direction: 's', startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height, initialX: wsPos.x, initialY: wsPos.y })} className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize z-10" />
            </>
          )}
        </div>
      )}
      {!isInputVisible && (
        <button onClick={() => setIsInputVisible(true)} className="fixed bottom-12 right-12 w-16 h-16 bg-himalaya-red text-himalaya-gold rounded-[1.5rem] shadow-2xl flex items-center justify-center z-[400] transition-all hover:scale-110 active:scale-90 border-4 border-himalaya-gold/20 group">
          <PenTool size={28} className="group-hover:rotate-12 transition-transform" />
        </button>
      )}
    </div>
  );
};

export default App;
