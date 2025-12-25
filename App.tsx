
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Send, Loader2, Feather, RotateCcw, Plus, Minus, Zap, AlertCircle, BookOpen,
  GripHorizontal, Maximize2, Layout, PenTool, X, ChevronUp, ChevronDown, MoveRight, 
  History, ScrollText, Key, ExternalLink, Flame, Minimize2, Settings, RefreshCw, Type,
  Sparkles, Pen, Compass, Wand2, Stars, Gem, Maximize, Languages, Info, Search
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { startNewChat, sendMessageToSession, resetChat, quickExplain } from './services/geminiService';

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
  const [fontSize, setFontSize] = useState(28); 
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
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
  }, []);

  // Handle Text Selection
  const handleTextSelection = useCallback((e: MouseEvent) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Safety check to ensure the selection isn't just whitespace or UI buttons
        if (rect.width > 0 && rect.height > 0) {
          setSelection({
            text: sel.toString().trim(),
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          });
        }
      } catch (err) {
        // Selection range might be invalid or detached
      }
    } else {
      // Don't clear if clicking inside the explanation bubble
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
    } catch (err) {
      setExplanation({ text: "རེ་ཞིག་འགྲེལ་བཤད་གནང་མ་ཐུབ། (Unable to explain at the moment)", loading: false });
    }
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      setError(null);
    }
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

    if (!targetId) {
      startNewChat(messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })));
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'user', text: text!, timestamp: Date.now() },
        { id: botMsgId, role: 'model', text: '宗师正在凝神构思史诗的下一个篇章...', isStreaming: true, timestamp: Date.now() }
      ]);
    } else {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: true } : m));
    }

    try {
      const resultText = await sendMessageToSession(text!, (chunkText) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunkText } : m));
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      });

      const fullContent = accumulatedText + resultText;

      if (resultText.includes("[CONTINUE_SIGNAL]") && totalCharacters < EPIC_GOAL_CHARACTERS) {
        const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
        setTimeout(() => {
          handleSend("请继续书写。མུ་མཐུད་དུ་རྩོམ་སྒྲིག་གནང་རོགས།", botMsgId, cleanedContent);
        }, 500);
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

      if (e.message === "API_KEY_INVALID_OR_NOT_FOUND") {
        setError("API密钥无效或未找到。请重新选择。");
        setHasApiKey(false);
        handleOpenKeyDialog();
      } else if (e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED")) {
        setError("创作能量（API配额）已耗尽。请稍后再试或切换API密钥。");
      } else {
        setError("书写中断。错误: " + (e.message || "未知错误"));
      }
    }
  };

  const handleManualContinue = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'model') {
      handleSend("请继续书写。མུ་མཐུད་དུ་རྩོམ་སྒྲིག་གནང་རོགས།", lastMsg.id, lastMsg.text);
    }
  };

  const startResize = (direction: ResizeDirection, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMaximized) return;
    setResizing({
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initialW: wsSize.width,
      initialH: wsSize.height,
      initialX: wsPos.x,
      initialY: wsPos.y
    });
  };

  const toggleNativeFullscreen = () => {
    if (!document.fullscreenElement) {
      workshopRef.current?.requestFullscreen().catch(err => {
        console.error(`Error: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const showContinueButton = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    return lastMsg && lastMsg.role === 'model' && !isLoading;
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream font-tibetan overflow-hidden relative">
      <Header 
        onReset={() => { resetChat(); setMessages([]); }} 
        onResetLayout={() => { setWsPos({ x: (window.innerWidth - 900) / 2, y: 100 }); setWsSize({ width: 900, height: 600 }); setIsMaximized(false); }} 
        onToggleMemory={() => {}} 
        onToggleWorkshop={() => setIsInputVisible(!isInputVisible)} 
        pinCount={0} 
        onTogglePins={() => {}} 
        onToggleDrafts={() => {}} 
      />

      <main className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar relative">
        <div className="max-w-4xl mx-auto space-y-16 pb-[200px]">
          {messages.map((msg, idx) => (
            <div key={msg.id} className="relative">
              <ChatMessage message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="fixed top-24 right-6 z-[200] flex flex-col gap-4">
          <div className="bg-white p-5 rounded-[1.5rem] border-2 border-himalaya-gold/30 shadow-2xl flex flex-col items-end min-w-[200px]">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-himalaya-dark leading-none" aria-live="off">{totalCharacters.toLocaleString()}</span>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">/ 50k</span>
              </div>
              <div className="flex items-baseline gap-1 opacity-60">
                <span className="text-base font-bold text-himalaya-red leading-none">{totalTshegs.toLocaleString()}</span>
                <span className="text-[7px] font-bold text-gray-400 uppercase">Tshegs</span>
              </div>
            </div>
            
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div 
                className="h-full bg-himalaya-red" 
                style={{ width: `${Math.min(100, (totalCharacters/EPIC_GOAL_CHARACTERS)*100)}%` }} 
              />
            </div>
            
            <button 
              onClick={handleOpenKeyDialog}
              className={`mt-3 w-full py-1.5 rounded-lg border flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-wider ${hasApiKey ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
            >
              <Key size={10} /> {hasApiKey ? '能量就绪' : '补充能量'}
            </button>
          </div>
        </div>
      </main>

      {/* Floating Selection Menu */}
      {selection && (
        <div 
          className="fixed z-[1000] -translate-x-1/2 flex flex-col items-center pointer-events-auto explanation-bubble"
          style={{ left: selection.x, top: selection.y - 10 }}
          onMouseUp={(e) => e.stopPropagation()}
        >
          {!explanation && (
            <div className="flex items-center gap-1 bg-himalaya-dark text-white p-1 rounded-xl shadow-2xl border border-white/20">
              <button 
                onClick={() => handleExplain('explain')}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest border-r border-white/10"
              >
                <Info size={12} className="text-himalaya-gold" />
                <span>研注 བརྡ་འགྲེལ།</span>
              </button>
              <button 
                onClick={() => handleExplain('translate')}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest"
              >
                <Languages size={12} className="text-himalaya-gold" />
                <span>翻译 ལོ་ཙཱ།</span>
              </button>
            </div>
          )}

          {explanation && (
            <div className="mt-2 w-80 bg-white border-2 border-himalaya-gold rounded-2xl shadow-2xl p-4 overflow-hidden animate-in fade-in zoom-in duration-200">
               <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                  <span className="text-[10px] font-black text-himalaya-red uppercase tracking-widest flex items-center gap-2">
                    <Search size={10} /> {explanation.loading ? '正在研读...' : '宗师研注'}
                  </span>
                  <button onClick={() => { setExplanation(null); setSelection(null); }} className="text-gray-300 hover:text-red-500">
                    <X size={14} />
                  </button>
               </div>
               
               {explanation.loading ? (
                 <div className="flex flex-col items-center py-6 gap-3">
                    <Loader2 size={24} className="animate-spin text-himalaya-gold" />
                    <span className="text-[10px] font-bold text-gray-400 italic">正在翻阅经卷...</span>
                 </div>
               ) : (
                 <div className="text-sm text-himalaya-dark leading-relaxed font-tibetan max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap pr-2">
                    {explanation.text}
                 </div>
               )}
            </div>
          )}
          <div className="w-3 h-3 bg-himalaya-dark rotate-45 -mt-1.5 border-r border-b border-white/20" />
        </div>
      )}

      {/* Floating Buttons Bar */}
      <div className="fixed bottom-12 left-12 right-12 z-[500] pointer-events-none flex justify-between items-end">
        <div className="flex flex-col gap-4 pointer-events-auto">
          {showContinueButton && (
            <button 
              onClick={handleManualContinue}
              className="flex items-center gap-3 px-4 py-2 bg-himalaya-red text-himalaya-gold rounded-xl font-bold shadow-xl border-2 border-himalaya-gold/20 text-xs"
            >
              <Flame size={14} />
              <span>接笔续写 མུ་མཐུད་དུ་བྲིས།</span>
              <MoveRight size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 items-end pointer-events-auto">
          {!isInputVisible && (
            <button 
              onClick={() => setIsInputVisible(true)} 
              className="w-16 h-16 bg-himalaya-red text-himalaya-gold rounded-[1.2rem] shadow-2xl border-2 border-himalaya-gold flex items-center justify-center"
            >
              <PenTool size={32} />
            </button>
          )}
        </div>
      </div>

      {isInputVisible && (
        <div 
          ref={workshopRef}
          className={`fixed flex flex-col bg-white overflow-hidden ${isMaximized ? 'inset-0 !w-full !h-full !left-0 !top-0 border-0 rounded-0 z-[400]' : 'border-2 border-himalaya-gold/30 shadow-2xl rounded-[3rem] z-[400]'}`} 
          style={isMaximized ? {} : { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` }}
        >
          {!isMaximized && (
            <>
              <div className="absolute top-0 left-0 w-8 h-8 cursor-nw-resize z-[501]" onMouseDown={(e) => startResize('nw', e)} />
              <div className="absolute top-0 right-0 w-8 h-8 cursor-ne-resize z-[501]" onMouseDown={(e) => startResize('ne', e)} />
              <div className="absolute bottom-0 left-0 w-8 h-8 cursor-sw-resize z-[501]" onMouseDown={(e) => startResize('sw', e)} />
              <div className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize z-[501]" onMouseDown={(e) => startResize('se', e)} />
            </>
          )}

          <div className="flex flex-col w-full h-full relative">
            <div 
              onMouseDown={(e) => { if (!isMaximized) setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }} 
              onDoubleClick={() => setIsMaximized(!isMaximized)}
              className={`flex items-center justify-between px-8 cursor-grab active:cursor-grabbing shrink-0 border-b border-gray-100 ${isMaximized ? 'h-20 bg-white' : 'h-16 bg-gray-50/50'}`}
            >
              <div className="flex items-center gap-4">
                 <div className={`rounded-xl bg-himalaya-red flex items-center justify-center ${isMaximized ? 'w-10 h-10' : 'w-8 h-8'}`}>
                    <PenTool size={isMaximized ? 20 : 16} className="text-himalaya-gold" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-[0.4em] text-himalaya-red">རྩོམ་སྒྲིག་ཁང་།</span>
                    <span className={`${isMaximized ? 'text-xl' : 'text-base'} font-black text-himalaya-dark tracking-tight`}>
                      史诗工坊
                    </span>
                 </div>
              </div>

              <div className="flex items-center gap-8 flex-1 justify-center px-4">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                    <button onClick={() => setFontSize(s => Math.max(12, s-4))} className="p-1 rounded-md text-gray-400 hover:text-himalaya-red"><Minus size={18}/></button>
                    <div className="flex items-center gap-1.5 min-w-[40px] justify-center">
                       <span className="text-xs font-black tabular-nums text-himalaya-dark">{fontSize}px</span>
                    </div>
                    <button onClick={() => setFontSize(s => Math.min(100, s+4))} className="p-1 rounded-md text-gray-400 hover:text-himalaya-red"><Plus size={18}/></button>
                  </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={toggleNativeFullscreen} className="p-2 rounded-lg text-gray-400 hover:text-himalaya-dark" title="全屏">
                  <Maximize size={20} />
                </button>
                <button onClick={() => setIsMaximized(!isMaximized)} className="p-2 rounded-lg text-gray-400 hover:text-himalaya-dark" title={isMaximized ? "退出全屏" : "窗口最大化"}>
                  {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
                <button onClick={() => setIsInputVisible(false)} className="p-2 bg-white rounded-lg text-gray-400 hover:text-red-500 border border-gray-100">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-hidden relative ${isMaximized ? 'p-0 bg-white' : 'p-4 md:p-6 bg-white'}`}>
                <div 
                  ref={editorRef} 
                  contentEditable 
                  spellCheck="false" 
                  style={{ fontSize: `${fontSize}px` }} 
                  className={`w-full h-full outline-none font-tibetan leading-[2] overflow-y-auto custom-scrollbar text-himalaya-dark ${isMaximized ? 'px-16 md:px-48 py-20 pb-96' : 'px-8 md:px-12 py-6 pb-60'}`} 
                  onInput={() => setInputText(editorRef.current?.innerText || "")}
                />
                {!inputText && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-gray-50 p-10">
                    <Stars size={isMaximized ? 400 : 200} className="opacity-5" />
                    <span className={`${isMaximized ? 'text-5xl' : 'text-3xl'} font-tibetan italic opacity-10`}>书写宏篇...</span>
                  </div>
                )}

                <div className={`absolute bottom-8 right-8 z-[500] pointer-events-none ${isMaximized ? 'mb-8 mr-8' : ''}`}>
                    <div className="flex flex-col items-end gap-6">
                        {error && (
                          <div className="p-4 px-6 rounded-2xl border shadow-lg pointer-events-auto bg-white border-red-100">
                             <div className="flex items-center gap-3 text-red-600 font-bold text-xs">
                                <AlertCircle size={18} /> {error}
                             </div>
                          </div>
                        )}

                        <div className="relative pointer-events-auto group/launch">
                          <button 
                            onClick={() => handleSend()} 
                            disabled={!inputText.trim() || isLoading}
                            className={`
                              relative h-20 px-10 rounded-[2rem] flex items-center gap-6 z-20 overflow-hidden border-2
                              ${isLoading 
                                ? 'bg-gray-100 text-gray-400 cursor-wait border-gray-200' 
                                : inputText.trim() 
                                  ? 'bg-himalaya-red text-himalaya-gold border-himalaya-gold shadow-xl active:bg-black' 
                                  : 'bg-gray-50 text-gray-200 cursor-not-allowed border-gray-100'
                              }
                            `}
                          >
                            <div>
                               {isLoading ? <Pen size={28} /> : <Compass size={28} />}
                            </div>

                            <div className="flex flex-col items-start">
                               <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${!inputText.trim() ? 'opacity-20' : 'opacity-60'}`}>
                                  {isLoading ? '宗师创作中' : '开启章节'}
                               </span>
                               <span className={`text-2xl font-black uppercase tracking-[0.2em] ${!inputText.trim() ? 'opacity-30' : 'opacity-100'}`}>
                                  {isLoading ? '正在构思' : '落笔'}
                                </span>
                            </div>
                          </button>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 0, 0, 0.1); border-radius: 20px; }
        .font-tibetan { font-feature-settings: "tibt" 1; text-rendering: optimizeLegibility; }
        
        * {
          animation: none !important;
          transition: none !important;
          transition-duration: 0ms !important;
          animation-duration: 0ms !important;
        }
        
        html, body {
          scroll-behavior: auto !important;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-in {
          animation: fadeIn 0.2s ease-out !important;
        }
      `}</style>
    </div>
  );
};

export default App;
