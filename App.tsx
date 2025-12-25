
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Sparkles, X, Loader2, Bot, 
  Feather, BookOpen, Type, Clock, BrainCircuit, Lightbulb, 
  SkipForward, ChevronRight, Maximize2, Minimize2, FileUp, Trash2, Save, Eraser, RotateCcw, GripVertical, Info,
  ChevronDown, PenTool, Bold, Italic, Underline, Check, Plus, Minus
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message, ProjectMemory } from './types';
import { sendMessageStream, resetChat, parseMemoryUpdate, extractCreativeAdvice } from './services/geminiService';

const STORAGE_KEY_MESSAGES = 'himalaya_session_messages_v1';
const STORAGE_KEY_MEMORY = 'himalaya_project_memory_v1';
const STORAGE_KEY_INSIGHTS = 'himalaya_latest_insights_v1';
const STORAGE_KEY_POS_WORKSHOP = 'himalaya_pos_workshop_v1';
const STORAGE_KEY_POS_INPUT = 'himalaya_pos_input_v1';
const STORAGE_KEY_SIZE_INPUT = 'himalaya_size_input_v1';
const STORAGE_KEY_SIZE_WORKSHOP = 'himalaya_size_workshop_v1';
const STORAGE_KEY_INPUT_VISIBLE = 'himalaya_input_visible_v1';
const STORAGE_KEY_DRAFT_HTML = 'himalaya_draft_html_v1';
const STORAGE_KEY_FONT_SIZE = 'himalaya_font_size_v1';

const MAX_SYLLABLES = 50000;
const MIN_INPUT_WIDTH = 400;
const MIN_INPUT_HEIGHT = 160;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

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
  
  const [inputHtml, setInputHtml] = useState(() => localStorage.getItem(STORAGE_KEY_DRAFT_HTML) || '');
  const [syllableCount, setSyllableCount] = useState(0);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(STORAGE_KEY_FONT_SIZE)) || 36);
  const [latestInsights, setLatestInsights] = useState<string>(() => localStorage.getItem(STORAGE_KEY_INSIGHTS) || '');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(() => safeJsonParse(STORAGE_KEY_INPUT_VISIBLE, true));
  const [activeWindow, setActiveWindow] = useState<'workshop' | 'input' | null>(null);

  const [workshopPos, setWorkshopPos] = useState(() => safeJsonParse(STORAGE_KEY_POS_WORKSHOP, { x: 0, y: 0 }));
  const [inputPos, setInputPos] = useState(() => {
    const saved = safeJsonParse(STORAGE_KEY_POS_INPUT, null);
    return saved || { x: window.innerWidth / 2 - 450, y: window.innerHeight - 420 };
  });
  
  const [inputSize, setInputSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_INPUT, { width: 900, height: 380 }));
  const [workshopSize, setWorkshopSize] = useState(() => safeJsonParse(STORAGE_KEY_SIZE_WORKSHOP, { width: window.innerWidth, height: window.innerHeight * 0.95 }));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const countSyllables = (text: string) => {
    // Tibetan syllable count is measured by the number of tshegs (་)
    return (text.match(/་/g) || []).length;
  };

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། 创作助手已就绪。为了支持长篇小说创作，我已将输入与生成的字符上限提升至 50,000 ཚེག་ (Syllables)，并为您配置了富文本编辑器。您可以按藏文习惯通过“ཚེག་”的个数来查看进度。',
        isStreaming: false,
        timestamp: Date.now()
      }]);
    }

    // Load draft into editor on mount
    if (editorRef.current && inputHtml) {
      editorRef.current.innerHTML = inputHtml;
      setSyllableCount(countSyllables(editorRef.current.innerText));
    }
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_MEMORY, JSON.stringify(memory)); }, [memory]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_INSIGHTS, latestInsights); }, [latestInsights]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_POS_WORKSHOP, JSON.stringify(workshopPos)); }, [workshopPos]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_POS_INPUT, JSON.stringify(inputPos)); }, [inputPos]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_SIZE_INPUT, JSON.stringify(inputSize)); }, [inputSize]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_SIZE_WORKSHOP, JSON.stringify(workshopSize)); }, [workshopSize]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_INPUT_VISIBLE, JSON.stringify(isInputVisible)); }, [isInputVisible]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_FONT_SIZE, fontSize.toString()); }, [fontSize]);

  const [dragging, setDragging] = useState<{ id: 'workshop' | 'input', startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ 
    id: 'workshop' | 'input', 
    direction: ResizeDirection, 
    startX: number, 
    startY: number, 
    initialWidth: number, 
    initialHeight: number,
    initialX: number,
    initialY: number 
  } | null>(null);

  const startDragging = (e: React.MouseEvent, id: 'workshop' | 'input') => {
    e.stopPropagation();
    setDragging({
      id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: id === 'workshop' ? workshopPos.x : inputPos.x,
      initialY: id === 'workshop' ? workshopPos.y : inputPos.y
    });
    setActiveWindow(id);
  };

  const startResizing = (e: React.MouseEvent, id: 'workshop' | 'input', direction: ResizeDirection) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({
      id,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: id === 'workshop' ? workshopSize.width : inputSize.width,
      initialHeight: id === 'workshop' ? workshopSize.height : inputSize.height,
      initialX: id === 'workshop' ? workshopPos.x : inputPos.x,
      initialY: id === 'workshop' ? workshopPos.y : inputPos.y
    });
    setActiveWindow(id);
  };

  const handleResetWorkshopPos = () => {
    setWorkshopPos({ x: 0, y: 0 });
    setWorkshopSize({ width: window.innerWidth, height: window.innerHeight * 0.95 });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      if (dragging.id === 'workshop') {
        setWorkshopPos({ x: dragging.initialX + dx, y: Math.max(0, dragging.initialY + dy) });
      } else {
        setInputPos({ x: dragging.initialX + dx, y: Math.max(0, dragging.initialY + dy) });
      }
    } else if (resizing) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      
      const updateSizeAndPos = (
        setPos: React.Dispatch<React.SetStateAction<{ x: number, y: number }>>,
        setSize: React.Dispatch<React.SetStateAction<{ width: number, height: number }>>,
        minW: number,
        minH: number
      ) => {
        let newWidth = resizing.initialWidth;
        let newHeight = resizing.initialHeight;
        let newX = resizing.initialX;
        let newY = resizing.initialY;

        if (resizing.direction.includes('e')) newWidth = Math.max(minW, resizing.initialWidth + dx);
        if (resizing.direction.includes('w')) {
          const possibleWidth = resizing.initialWidth - dx;
          if (possibleWidth > minW) {
            newWidth = possibleWidth;
            newX = resizing.initialX + dx;
          }
        }
        if (resizing.direction.includes('s')) newHeight = Math.max(minH, resizing.initialHeight + dy);
        if (resizing.direction.includes('n')) {
          const possibleHeight = resizing.initialHeight - dy;
          if (possibleHeight > minH) {
            newHeight = possibleHeight;
            newY = resizing.initialY + dy;
          }
        }

        setSize({ width: newWidth, height: newHeight });
        setPos({ x: newX, y: newY });
      };

      if (resizing.id === 'workshop') {
        updateSizeAndPos(setWorkshopPos, setWorkshopSize, 600, 300);
      } else {
        updateSizeAndPos(setInputPos, setInputSize, MIN_INPUT_WIDTH, MIN_INPUT_HEIGHT);
      }
    }
  }, [dragging, resizing]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = dragging ? 'grabbing' : 
        resizing?.direction === 'n' || resizing?.direction === 's' ? 'ns-resize' :
        resizing?.direction === 'e' || resizing?.direction === 'w' ? 'ew-resize' :
        resizing?.direction === 'nw' || resizing?.direction === 'se' ? 'nwse-resize' : 'nesw-resize';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'auto';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  const execCommand = (command: string) => {
    document.execCommand(command, false);
    editorRef.current?.focus();
  };

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText;
      setInputHtml(html);
      setSyllableCount(countSyllables(text));
    }
  };

  const handleSaveDraft = () => {
    if (!editorRef.current) return;
    setSaveStatus('saving');
    const html = editorRef.current.innerHTML;
    localStorage.setItem(STORAGE_KEY_DRAFT_HTML, html);
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  const handleClearDraft = () => {
    if (window.confirm('确定要清空当前的草稿吗？此操作不可撤销。')) {
      if (editorRef.current) editorRef.current.innerHTML = '';
      setInputHtml('');
      setSyllableCount(0);
      localStorage.removeItem(STORAGE_KEY_DRAFT_HTML);
    }
  };

  const convertHtmlToMarkdown = (html: string) => {
    let text = html;
    text = text.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    text = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    text = text.replace(/em>(.*?)<\/em>/gi, '*$1*');
    text = text.replace(/<u>(.*?)<\/u>/gi, '__$1__');
    text = text.replace(/<div>/gi, '\n');
    text = text.replace(/<\/div>/gi, '');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove other tags
    text = text.replace(/<[^>]+>/g, '');
    return text.trim();
  };

  const handleSendMessage = async () => {
    const rawText = editorRef.current?.innerText.trim() || "";
    if (!rawText || isLoading) return;

    const markdownText = convertHtmlToMarkdown(editorRef.current?.innerHTML || "");
    
    setInputHtml('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    setSyllableCount(0);
    localStorage.removeItem(STORAGE_KEY_DRAFT_HTML); // Clear draft after sending
    setIsLoading(true);

    const botMsgId = Date.now().toString();
    setMessages(prev => [...prev, 
      { id: Date.now().toString(), role: 'user', text: markdownText, timestamp: Date.now() },
      { id: botMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now() }
    ]);

    try {
      await sendMessageStream(markdownText, messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })), memory, (text, chunks) => {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text, groundingChunks: chunks } : m));
      });
      setMessages(prev => {
        const last = prev.find(m => m.id === botMsgId);
        if (last) {
          const update = parseMemoryUpdate(last.text);
          if (update) setMemory(old => ({ ...old!, ...update, keyCitations: update.keyCitations ? [...(old?.keyCitations || []), ...update.keyCitations].slice(-100) : (old?.keyCitations || []), lastUpdated: Date.now() }));
        }
        return prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false } : m);
      });
    } catch { setIsLoading(false); } finally { setIsLoading(false); }
  };

  const isWorkshopOpen = showWorkshop || showMemoryPanel;
  const syllablePercent = Math.min((syllableCount / MAX_SYLLABLES) * 100, 100);

  return (
    <div className="flex flex-col h-screen font-tibetan overflow-hidden bg-himalaya-cream text-himalaya-dark relative">
      <Header 
        onReset={() => { resetChat(); setMessages([]); }} 
        onToggleMemory={() => { setShowMemoryPanel(!showMemoryPanel); setShowWorkshop(false); setActiveWindow('workshop'); }}
        onToggleWorkshop={() => { setShowWorkshop(!showWorkshop); setShowMemoryPanel(false); setActiveWindow('workshop'); }}
        projectName={memory?.projectName}
        pinCount={0} onTogglePins={() => {}} onToggleDrafts={() => {}}
      />

      <main ref={mainContentRef} className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar relative">
        <div className="w-full max-w-[98%] mx-auto pb-[450px] space-y-16">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} />
          ))}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* --- 全屏资料窗口 --- */}
      {isWorkshopOpen && (
        <div 
          className="fixed bg-white/98 backdrop-blur-[60px] border-b-8 border-himalaya-gold shadow-[0_0_150px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col transition-all duration-300 z-[101]"
          style={{ width: `${workshopSize.width}px`, height: `${workshopSize.height}px`, left: workshopPos.x, top: workshopPos.y }}
          onMouseDown={() => setActiveWindow('workshop')}
        >
          <div onMouseDown={(e) => startDragging(e, 'workshop')} onDoubleClick={handleResetWorkshopPos}
            className="px-6 py-5 bg-himalaya-red text-white flex items-center justify-between cursor-grab shrink-0"
          >
            <div className="flex items-center gap-6">
              <GripVertical size={24} className="opacity-30" />
              <span className="font-bold tracking-[0.5em] uppercase text-sm">史诗记忆档案库</span>
            </div>
            <button onClick={() => { setShowWorkshop(false); setShowMemoryPanel(false); }} className="p-3 hover:bg-white/10 rounded-full transition-colors"><X size={28} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-8 space-y-10 custom-scrollbar">
             <div className="w-full px-4 mb-10 space-y-6">
               <div className="p-10 bg-himalaya-gold/5 border-2 border-himalaya-gold/10 rounded-[2rem] flex items-center gap-8 w-full shadow-inner">
                  <BookOpen className="text-himalaya-gold shrink-0" size={48} />
                  <input className="bg-transparent border-none focus:ring-0 font-bold text-5xl text-himalaya-dark w-full placeholder:text-gray-200" placeholder="定义史诗之名..." value={memory?.projectName || ''} onChange={(e) => setMemory(m => m ? {...m, projectName: e.target.value} : null)} />
               </div>
               <div className="p-10 bg-gray-50 border border-gray-100 rounded-[2rem] w-full shadow-sm">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-4">当前创作 DNA (Style DNA)</span>
                  <div className="text-3xl font-tibetan text-gray-700 italic leading-relaxed">{memory?.styleProfile || "宗师正在同步您的创作轨迹..."}</div>
               </div>
             </div>

             <section className="w-full">
                <div className="flex justify-between items-center mb-8 px-6 border-b border-gray-100 pb-6">
                  <h3 className="text-lg font-bold text-himalaya-red uppercase tracking-[0.4em] flex items-center gap-4">
                    <Feather size={24} /> 核心线索与搜索成果
                  </h3>
                  <div className="text-xs font-bold text-gray-300 uppercase">Items: {memory?.keyCitations.length}</div>
                </div>
                
                <div className="flex flex-col gap-4 w-full px-4">
                  {memory?.keyCitations.map((c, i) => (
                    <div key={i} className="group relative bg-white border border-gray-200 p-12 rounded-[2rem] hover:border-himalaya-gold hover:shadow-2xl transition-all duration-300 w-full">
                      <div className="flex items-start gap-8">
                        <span className="text-himalaya-gold font-bold text-4xl opacity-30 mt-2">#</span>
                        <div className="flex-1 text-3xl font-tibetan leading-[1.6] whitespace-pre-wrap text-gray-800">{c}</div>
                        <button onClick={() => setMemory(old => old ? {...old, keyCitations: old.keyCitations.filter((_, idx) => idx !== i)} : null)} className="p-4 text-himalaya-red/0 group-hover:text-himalaya-red transition-all hover:bg-himalaya-red/5 rounded-full"><Trash2 size={24} /></button>
                      </div>
                    </div>
                  ))}
                </div>
             </section>
          </div>
          <div onMouseDown={(e) => startResizing(e, 'workshop', 'se')} className="absolute bottom-0 right-0 w-20 h-20 cursor-nwse-resize flex items-end justify-end p-6 group z-[110]">
            <div className="w-10 h-10 border-r-8 border-b-8 border-himalaya-gold/10 rounded-br-xl group-hover:border-himalaya-gold/40 transition-colors" />
          </div>
        </div>
      )}

      {/* --- 富文本悬浮创作窗 --- */}
      {isInputVisible && (
        <div className={`fixed transition-all duration-75 z-[102] ${activeWindow === 'input' ? 'ring-4 ring-himalaya-gold/20 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)]' : 'opacity-95 shadow-2xl'}`}
          style={{ 
            width: `${inputSize.width}px`, 
            height: `${inputSize.height}px`, 
            left: inputPos.x, 
            top: inputPos.y,
          }}
          onMouseDown={() => setActiveWindow('input')}
        >
          {/* 八方向缩放手柄 */}
          <div onMouseDown={(e) => startResizing(e, 'input', 'n')} className="absolute top-0 left-4 right-4 h-2 cursor-ns-resize z-[103] hover:bg-himalaya-gold/20 transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 's')} className="absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize z-[103] hover:bg-himalaya-gold/20 transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'e')} className="absolute top-4 bottom-4 right-0 w-2 cursor-ew-resize z-[103] hover:bg-himalaya-gold/20 transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'w')} className="absolute top-4 bottom-4 left-0 w-2 cursor-ew-resize z-[103] hover:bg-himalaya-gold/20 transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'nw')} className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-[104] hover:bg-himalaya-gold/40 rounded-tl-[3rem] transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'ne')} className="absolute top-0 right-0 w-6 h-6 cursor-nesw-resize z-[104] hover:bg-himalaya-gold/40 rounded-tr-[3rem] transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'sw')} className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-[104] hover:bg-himalaya-gold/40 rounded-bl-[3rem] transition-colors" />
          <div onMouseDown={(e) => startResizing(e, 'input', 'se')} className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-[104] hover:bg-himalaya-gold/40 rounded-br-[3rem] transition-colors" />

          <div className="bg-white/98 backdrop-blur-3xl rounded-[3rem] border-2 border-gray-200 p-8 flex items-stretch gap-6 h-full relative overflow-hidden shadow-2xl">
            {/* 侧边操作栏 */}
            <div 
              onMouseDown={(e) => startDragging(e, 'input')} 
              className="w-16 flex flex-col items-center justify-between py-4 cursor-grab active:cursor-grabbing rounded-[2rem] bg-gray-50 hover:bg-himalaya-gold/10 text-gray-400 hover:text-himalaya-gold transition-all shrink-0 border border-transparent hover:border-himalaya-gold/20"
            >
              <GripVertical size={32} />
              <button 
                onClick={(e) => { e.stopPropagation(); setIsInputVisible(false); }}
                className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-full hover:bg-himalaya-red hover:text-white transition-all shadow-sm"
              >
                <ChevronDown size={24} />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-4 min-w-0">
               {/* 顶部工具栏 */}
               <div className="flex items-center justify-between px-2 shrink-0">
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl flex-wrap">
                    <button onClick={() => execCommand('bold')} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all" title="加粗 (Ctrl+B)"><Bold size={20} /></button>
                    <button onClick={() => execCommand('italic')} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all" title="斜体 (Ctrl+I)"><Italic size={20} /></button>
                    <button onClick={() => execCommand('underline')} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all" title="下划线 (Ctrl+U)"><Underline size={20} /></button>
                    
                    <div className="w-px h-6 bg-gray-300 mx-2"></div>
                    
                    {/* Font Size Controls */}
                    <div className="flex items-center bg-white/50 rounded-xl px-1">
                      <button onClick={() => setFontSize(s => Math.max(s - 2, 12))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500" title="减小字号 (Decrease Font Size)"><Minus size={16} /></button>
                      <span className="px-2 text-[10px] font-bold text-himalaya-dark min-w-[32px] text-center">{fontSize}</span>
                      <button onClick={() => setFontSize(s => Math.min(s + 2, 80))} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-gray-500" title="增大字号 (Increase Font Size)"><Plus size={16} /></button>
                    </div>

                    <div className="w-px h-6 bg-gray-300 mx-2"></div>
                    
                    <button 
                      onClick={handleSaveDraft} 
                      className={`p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all flex items-center gap-2 ${saveStatus === 'saved' ? 'text-emerald-500' : 'text-himalaya-gold'}`} 
                      title="保存草稿 (Save Draft)"
                    >
                      {saveStatus === 'saved' ? <Check size={20} /> : saveStatus === 'saving' ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                      <span className="text-[10px] font-bold uppercase hidden sm:inline">{saveStatus === 'saved' ? '已存' : '保存'}</span>
                    </button>
                    <button onClick={handleClearDraft} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-gray-400" title="清空内容"><Eraser size={20} /></button>
                    <div className="w-px h-6 bg-gray-300 mx-2"></div>
                    <button onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-white hover:shadow-md rounded-xl transition-all text-himalaya-red" title="导入文稿"><FileUp size={20} /></button>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1.5 min-w-[140px]">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      <span className={syllablePercent > 90 ? 'text-himalaya-red font-black animate-pulse' : 'text-himalaya-dark font-bold'}>
                        {syllableCount.toLocaleString()} ཚེག། (Syllables)
                      </span> / {MAX_SYLLABLES.toLocaleString()}
                    </span>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50">
                      <div 
                        className={`h-full transition-all duration-300 ${syllablePercent > 90 ? 'bg-himalaya-red' : 'bg-himalaya-gold'}`} 
                        style={{ width: `${syllablePercent}%` }} 
                      />
                    </div>
                  </div>
               </div>
               
               {/* 富文本编辑器区域 */}
               <div className="flex-1 relative bg-white rounded-[2rem] border-2 border-gray-100 p-8 shadow-inner group/input focus-within:border-himalaya-gold/30 transition-all">
                  <div 
                    ref={editorRef}
                    contentEditable
                    style={{ fontSize: `${fontSize}px` }}
                    className="w-full h-full outline-none font-tibetan overflow-y-auto custom-scrollbar leading-[1.8]" 
                    onInput={handleInput}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                        // Standard enter behavior in contentEditable
                      } else if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    data-placeholder="于此泼墨挥毫，续写不朽篇章... (Ctrl+Enter 发送)"
                  />
                  {syllableCount === 0 && (
                    <div className="absolute top-8 left-8 text-gray-300 pointer-events-none italic font-tibetan opacity-50" style={{ fontSize: `${fontSize}px` }}>
                      于此泼墨挥毫，续写不朽篇章...
                    </div>
                  )}
                  
                  <button 
                    onClick={() => handleSendMessage()} 
                    disabled={syllableCount === 0 || isLoading} 
                    className="absolute right-6 bottom-6 p-8 bg-himalaya-red text-white rounded-[2.5rem] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-himalaya-red/40 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed z-10"
                  >
                    {isLoading ? <Loader2 className="animate-spin w-12 h-12" /> : <Send size={48} />}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* --- 底部控制条 --- */}
      <div className="fixed bottom-0 left-0 right-0 h-16 pointer-events-none flex justify-center items-end z-[105] pb-4">
        <button 
          onClick={() => setIsInputVisible(!isInputVisible)}
          className={`
            pointer-events-auto px-10 py-4 rounded-full flex items-center gap-4 transition-all duration-500 shadow-2xl border-2
            ${isInputVisible 
              ? 'bg-white/20 backdrop-blur-md border-white/30 text-gray-500 opacity-20 hover:opacity-100 hover:bg-white/40' 
              : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold hover:scale-110 animate-bounce'
            }
          `}
        >
          {isInputVisible ? <ChevronDown size={28} /> : <PenTool size={28} />}
          <span className="font-bold uppercase tracking-[0.4em] text-sm">
            {isInputVisible ? "收起创作窗口" : "开始创作 (ཡིག་འཇུག།)"}
          </span>
        </button>
      </div>
      
      <input type="file" ref={fileInputRef} className="hidden" onChange={e => {
        const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => {
          if (editorRef.current) {
            editorRef.current.innerText = ev.target?.result as string;
            handleInput();
          }
        }; r.readAsText(f); }
      }} />
    </div>
  );
};

export default App;
