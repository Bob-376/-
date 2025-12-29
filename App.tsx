
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Feather, RotateCcw, Plus, Minus, AlertCircle, PenTool, X, MoveRight, 
  Key, Flame, Minimize2, Stars, Maximize, Languages, Info, Search,
  Trophy, BarChart3, Milestone, BrainCircuit, Compass, Pen, Maximize2, RefreshCw, Sparkles,
  BookOpen, Quote, Copy, Check, ChevronRight, Type, Wand2, Save, FolderOpen, Trash2, History
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageToSession, quickExplain } from './services/geminiService';

const STORAGE_KEY_MESSAGES = 'himalaya_v2_messages';
const STORAGE_KEY_POS = 'himalaya_ws_pos';
const STORAGE_KEY_SIZE = 'himalaya_ws_size';
const STORAGE_KEY_DRAFT_HISTORY = 'himalaya_workshop_history';
const STORAGE_KEY_AUTOSCROLL = 'himalaya_autoscroll';
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

interface DraftEntry {
  id: string;
  content: string; // HTML content
  timestamp: number;
  charCount: number;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [inputText, setInputText] = useState("");
  const [fontSize, setFontSize] = useState(20); 
  const [isLoading, setIsLoading] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AUTOSCROLL);
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [draftHistory, setDraftHistory] = useState<DraftEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DRAFT_HISTORY);
    return saved ? JSON.parse(saved) : [];
  });

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
        setIsArchiveOpen(false);
        setIsMemoryOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    if (!isMaximized) {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(wsPos));
      localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(wsSize));
    }
    localStorage.setItem(STORAGE_KEY_AUTOSCROLL, JSON.stringify(autoScrollEnabled));
    localStorage.setItem(STORAGE_KEY_DRAFT_HISTORY, JSON.stringify(draftHistory));
  }, [messages, wsPos, wsSize, isMaximized, autoScrollEnabled, draftHistory]);

  useEffect(() => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScrollEnabled]);

  const handleTextSelection = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.selection-menu') || target.closest('.research-drawer') || target.closest('.archive-popover')) {
      return;
    }

    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const isInsideWorkshop = editorRef.current?.contains(sel.anchorNode) || false;
        if (rect.width > 0 && rect.height > 0) {
          setSelection({ text: sel.toString().trim(), x: rect.left + rect.width / 2, y: rect.top, isInsideWorkshop });
        }
      } catch (err) {}
    } else {
      setTimeout(() => {
        const currentSel = window.getSelection();
        if (!currentSel || currentSel.toString().trim().length === 0) setSelection(null);
      }, 50);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleExplain = async (type: 'explain' | 'translate', textToExplain?: string) => {
    const targetText = textToExplain || selection?.text;
    if (!targetText) return;
    setExplanation({ text: "", loading: true });
    try {
      const result = await quickExplain(targetText, type);
      setExplanation({ text: result, loading: false });
    } catch (err: any) {
      setExplanation({ text: "རེ་ཞིག་འགྲེལ་བཤད་གནང་མ་ཐུབ།", loading: false });
    }
  };

  useEffect(() => {
    if (selection?.isInsideWorkshop && selection.text.length >= 1) {
      const timer = setTimeout(() => handleExplain('explain'), 200);
      return () => clearTimeout(timer);
    }
  }, [selection?.text, selection?.isInsideWorkshop]);

  const handleCopyAll = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText;
      navigator.clipboard.writeText(text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    }
  };

  const handleSaveDraft = () => {
    if (editorRef.current && editorRef.current.innerText.trim()) {
      const newDraft: DraftEntry = {
        id: Date.now().toString(),
        content: editorRef.current.innerHTML,
        timestamp: Date.now(),
        charCount: editorRef.current.innerText.length
      };
      setDraftHistory(prev => [newDraft, ...prev].slice(0, 20)); // Keep last 20 saves
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const loadDraft = (draft: DraftEntry) => {
    if (editorRef.current) {
      if (editorRef.current.innerText.trim() && !window.confirm("这将覆盖当前编辑器中的内容，确认加载吗？")) {
        return;
      }
      editorRef.current.innerHTML = draft.content;
      setInputText(editorRef.current.innerText);
      setIsArchiveOpen(false);
    }
  };

  const deleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftHistory(prev => prev.filter(d => d.id !== id));
  };

  const formatExplanationText = (text: string) => {
    if (!text) return null;
    const segments = text.split(/---TIBETAN_COMMENTARY---|---CHINESE_TRANSLATION---|---ENGLISH_TRANSLATION---/);
    const tib = segments[1]?.trim();
    const chi = segments[2]?.trim();
    const eng = segments[3]?.trim();

    return (
      <div className="space-y-16">
        {tib && (
          <div className="relative group animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="absolute -left-6 top-0 bottom-0 w-1 bg-himalaya-gold group-hover:w-2 transition-all" />
            <div className="flex items-center gap-3 mb-8">
               <span className="text-[10px] font-black text-himalaya-red uppercase tracking-[0.4em] bg-himalaya-gold/10 px-4 py-1.5 rounded-full border border-himalaya-gold/20">
                 བོད་ཡིག་འགྲེལ་བཤད་ Scholarly Insight
               </span>
               <div className="h-px flex-1 bg-gradient-to-r from-himalaya-gold/30 to-transparent" />
            </div>
            <div className="relative p-10 bg-himalaya-gold/5 rounded-[2rem] border border-himalaya-gold/10 shadow-inner">
               <Quote className="absolute -top-4 -left-4 text-himalaya-gold opacity-20" size={64} />
               {/* Increased font size for Tibetan characters here */}
               <p className="text-[3.5rem] font-tibetan leading-[2.1] text-himalaya-dark text-justify selection:bg-himalaya-gold/30">
                 {tib}
               </p>
            </div>
          </div>
        )}
        {chi && (
          <div className="animate-in fade-in slide-in-from-left-6 duration-1000 delay-200">
            <div className="flex items-center gap-4 mb-4 opacity-40">
               <div className="h-px flex-1 bg-gray-200" />
               <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">汉语译文 Chinese rendering</span>
               <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="px-10 py-8 bg-gray-50/50 rounded-3xl border border-gray-100 italic">
               <p className="text-2xl font-serif text-gray-700 leading-relaxed text-justify">{chi}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleResetConversation = () => {
    if (window.confirm("确定要重置当前检索进度的记忆吗？此操作不可恢复。")) {
      setMessages([{ id: 'welcome', role: 'model', text: 'བཀྲ་ཤིས་བདེ་ལེགས། 智能检索系统已准备好为您检索知识。', timestamp: Date.now() }]);
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
      if (editorRef.current) editorRef.current.innerHTML = "";
      setInputText("");
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

  const totalCharacters = useMemo(() => messages.reduce((sum, m) => sum + m.text.length, 0), [messages]);
  const totalTshegs = useMemo(() => messages.reduce((sum, m) => sum + (m.text.match(/་/g) || []).length, 0), [messages]);
  const currentInputTshegCount = useMemo(() => (inputText.match(/་/g) || []).length, [inputText]);

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || editorRef.current?.innerText.trim();
    if (!text || (isLoading && !overrideText)) return;
    if (!overrideText && editorRef.current) {
      editorRef.current.innerHTML = '';
      setInputText("");
    }
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();
    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    if (!targetId) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'user', text: text!, timestamp: Date.now() },
        { id: botMsgId, role: 'model', text: '正在深入检索相关知识...', isStreaming: true, timestamp: Date.now() }
      ]);
    } else {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: true } : m));
    }
    try {
      const resultText = await sendMessageToSession(text!, history, (chunkText) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunkText } : m));
      });
      const fullContent = accumulatedText + resultText;
      if (resultText.includes("[CONTINUE_SIGNAL]") && totalCharacters < EPIC_GOAL_CHARACTERS) {
        const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
        setTimeout(() => handleSend("请继续分析。མུ་མཐུད་དུ་དཔྱད་ཞིབ་གནང་རོགས།", botMsgId, cleanedContent), 500);
      } else {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { 
          ...m, text: fullContent.replace("[CONTINUE_SIGNAL]", "").replace("[COMPLETE]", "").trim(), isStreaming: false 
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
        onToggleAutoScroll={() => setAutoScrollEnabled(!autoScrollEnabled)}
        autoScrollEnabled={autoScrollEnabled}
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

      {/* Workshop Drawer Overlay */}
      {explanation && (
        <div className="fixed inset-0 z-[2500] flex justify-end">
           <div className="absolute inset-0 bg-black/20 backdrop-blur-[4px]" onClick={() => { setExplanation(null); setSelection(null); }} />
           <div className="relative w-full max-w-[700px] h-full bg-white shadow-2xl border-l-[16px] border-himalaya-gold flex flex-col animate-in slide-in-from-right duration-500 research-drawer">
              <div className="h-32 bg-himalaya-red flex items-center justify-between px-12 text-himalaya-gold shrink-0 border-b-8 border-himalaya-gold/20 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-5"><BookOpen size={120} /></div>
                 <div className="flex items-center gap-8 relative z-10">
                    <div className="w-20 h-20 rounded-3xl bg-himalaya-gold flex items-center justify-center shadow-2xl rotate-3"><Sparkles size={40} className="text-himalaya-red" /></div>
                    <div><h3 className="text-4xl font-black font-tibetan leading-none mb-2">གཏེར་མཛོད་Archive</h3><p className="text-[12px] uppercase tracking-[0.5em] font-bold opacity-70">Imperial Retrieval Hub</p></div>
                 </div>
                 <button onClick={() => { setExplanation(null); setSelection(null); }} className="w-16 h-16 rounded-full hover:bg-white/10 flex items-center justify-center transition-all hover:scale-110 active:scale-90 relative z-10"><X size={32} /></button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-16 bg-gradient-to-br from-white via-white to-himalaya-cream/30">
                 {explanation.loading ? (
                   <div className="flex flex-col items-center justify-center h-full gap-12 opacity-40">
                      <div className="relative"><div className="absolute inset-0 animate-ping rounded-full bg-himalaya-red/20" /><div className="relative w-32 h-32 rounded-full border-4 border-dashed border-himalaya-red flex items-center justify-center animate-spin-slow"><RefreshCw size={48} className="text-himalaya-red" /></div></div>
                      <div className="flex flex-col items-center gap-4"><span className="text-[14px] font-black uppercase tracking-[0.8em] text-himalaya-red">Deep Discovery</span><span className="text-[12px] font-bold text-gray-400 font-tibetan">གཏེར་མཛོད་ནས་འཚོལ་བཞིན་ཡོད།</span></div>
                   </div>
                 ) : (<div className="prose prose-2xl max-w-none">{formatExplanationText(explanation.text)}</div>)}
              </div>
           </div>
        </div>
      )}

      {/* Selection Menu */}
      {selection && !explanation && (
        <div className="selection-menu fixed z-[3000] -translate-x-1/2 -translate-y-[120%] animate-in fade-in zoom-in duration-200" style={{ left: selection.x, top: selection.y }}>
          <div className="bg-himalaya-red text-himalaya-gold rounded-full shadow-2xl p-1 flex items-center border border-himalaya-gold/30">
            <button onClick={() => handleExplain('explain')} className="flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-full transition-colors group"><Sparkles size={16} className="group-hover:animate-pulse" /><span className="text-[10px] font-black uppercase tracking-widest">研注 Analysis</span></button>
            <div className="w-px h-4 bg-himalaya-gold/30 mx-1" />
            <button onClick={() => { navigator.clipboard.writeText(selection.text); setSelection(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Copy size={16} /></button>
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
            onMouseDown={(e) => { if (!isMaximized && !(e.target as HTMLElement).closest('button')) setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }} 
            className="h-16 bg-gray-50 grid grid-cols-3 items-center px-8 cursor-grab active:cursor-grabbing shrink-0 border-b border-gray-100"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Search size={20} className="text-himalaya-red" />
                <span className="text-xs font-black uppercase tracking-widest hidden lg:inline">检索工坊 Intelligence Hub</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <div className="flex flex-col items-center"><span className="text-[6px] font-bold text-gray-300 uppercase leading-none">Chars</span><span className="text-[10px] font-black tabular-nums leading-none">{inputText.length.toLocaleString()}</span></div>
                <div className="w-px h-4 bg-gray-100" />
                <div className="flex flex-col items-center"><span className="text-[6px] font-bold text-gray-300 uppercase leading-none">Tshegs</span><span className="text-[10px] font-black tabular-nums leading-none">{currentInputTshegCount.toLocaleString()}</span></div>
              </div>

              <div className="flex items-center gap-1.5 relative">
                <div className="flex items-center gap-1">
                   <button onClick={handleSaveDraft} className={`p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm transition-colors ${isSaved ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`} title="保存当前版本"><Save size={16} /></button>
                   <button onClick={() => setIsArchiveOpen(!isArchiveOpen)} className={`p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm transition-colors ${isArchiveOpen ? 'text-himalaya-red bg-himalaya-gold/10' : 'text-gray-400 hover:text-himalaya-red'}`} title="打开稿件库"><FolderOpen size={16} /></button>
                   <button onClick={handleCopyAll} className={`p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm transition-colors ${isCopied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`} title="复制全文">{isCopied ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
                
                {/* Archive Popover */}
                {isArchiveOpen && (
                  <div className="archive-popover absolute top-full mt-2 left-0 w-80 bg-white border border-gray-200 shadow-2xl rounded-2xl z-[500] p-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2 text-himalaya-red">
                        <History size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">稿件归档 Archive</span>
                      </div>
                      <button onClick={() => setIsArchiveOpen(false)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                      {draftHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-[10px] font-bold uppercase tracking-widest">No Drafts Saved Yet</div>
                      ) : (
                        draftHistory.map(draft => (
                          <div 
                            key={draft.id} 
                            onClick={() => loadDraft(draft)}
                            className="group flex items-center justify-between p-3 rounded-xl hover:bg-himalaya-gold/5 border border-transparent hover:border-himalaya-gold/20 transition-all cursor-pointer"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-gray-600 tabular-nums">{new Date(draft.timestamp).toLocaleString('zh-CN')}</span>
                              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{draft.charCount} Chars</span>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => deleteDraft(draft.id, e)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                              <div className="p-1.5 text-himalaya-red"><ChevronRight size={14} /></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center">
               <button onClick={() => handleSend()} disabled={!inputText.trim() || isLoading} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-xl border-2 transition-all active:scale-95 ${isLoading ? 'bg-gray-100 text-gray-300 border-gray-200' : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold/30 hover:scale-110'}`}>{isLoading ? <Loader2 className="animate-spin" size={20} /> : <Compass size={24} />}</button>
            </div>

            <div className="flex items-center justify-end gap-1">
              <button onClick={() => setFontSize(s => Math.max(10, s - 2))} className="p-2 text-gray-400 hover:text-himalaya-red transition-colors"><Minus size={14} /></button>
              <span className="text-[10px] font-black w-8 text-center">{fontSize}</span>
              <button onClick={() => setFontSize(s => Math.min(80, s + 2))} className="p-2 text-gray-400 hover:text-himalaya-red transition-colors"><Plus size={14} /></button>
              <div className="w-px h-6 bg-gray-200 mx-2" />
              <button onClick={toggleNativeFullscreen} className="p-2 text-gray-400 hover:text-himalaya-dark transition-colors"><Maximize size={18} /></button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 text-gray-400 hover:text-himalaya-dark transition-colors">{isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
              <button onClick={() => setIsInputVisible(false)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative p-8 bg-white">
              <div id="scribe-editor" ref={editorRef} contentEditable spellCheck="false" style={{ fontSize: `${fontSize}px` }} className="w-full h-full outline-none font-tibetan leading-[2.6] overflow-y-auto custom-scrollbar text-himalaya-dark px-10 pb-40 selection:bg-himalaya-gold/40 text-justify" onInput={() => setInputText(editorRef.current?.innerText || "")} />
              {!inputText && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-5 gap-8">
                  <Search size={160} /><div className="font-tibetan text-6xl text-center px-20">འབྲི་བཤེར་གནང་རོགས། 开启深度的知识检索...</div>
                </div>
              )}
          </div>
          {!isMaximized && (<div onMouseDown={(e) => setResizing({ direction: 'se', startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height, initialX: wsPos.x, initialY: wsPos.y })} className="absolute bottom-0 right-0 w-10 h-10 cursor-se-resize z-10" />)}
        </div>
      )}

      {!isInputVisible && (
        <button onClick={() => setIsInputVisible(true)} className="fixed bottom-12 right-12 w-20 h-20 bg-himalaya-red text-himalaya-gold rounded-full shadow-2xl flex items-center justify-center z-[400] transition-all hover:scale-110 active:scale-90 border-4 border-himalaya-gold/30"><Search size={36} /></button>
      )}
    </div>
  );
};

export default App;
