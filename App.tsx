
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Plus, Minus, X, Search, Compass, Maximize2, Minimize2, Edit3, 
  Sparkles, Info, Languages, History, BrainCircuit, Trash2, Check, Copy,
  Mic, Video, Upload, FileVideo, Radio, Globe, Type
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageToSession, quickExplain, transcribeAudio, analyzeVideo } from './services/geminiService';

const EPIC_GOAL_WORDS = 50000; 

const countHumanWords = (text: string): number => {
  if (!text) return 0;
  const tshegs = (text.match(/་/g) || []).length;
  const hanzi = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[a-zA-Z0-9'-]+/g) || []).length;
  return tshegs + hanzi + words;
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [fontSize, setFontSize] = useState(22); 
  const [isLoading, setIsLoading] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [useSearch, setUseSearch] = useState(true);

  // Multimedia states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [videoFile, setVideoFile] = useState<{data: string, type: string} | null>(null);

  // Layout states for Drag & Resize
  const [wsPos, setWsPos] = useState({ x: (window.innerWidth - 900) / 2, y: 120 });
  const [wsSize, setWsSize] = useState({ width: Math.min(900, window.innerWidth - 60), height: 500 });
  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ startX: number, startY: number, initialW: number, initialH: number } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Global Mouse Handlers for Drag/Resize
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMaximized) return;

    if (dragging) {
      setWsPos({ 
        x: dragging.initialX + (e.clientX - dragging.startX), 
        y: dragging.initialY + (e.clientY - dragging.startY) 
      });
    } else if (resizing) {
      setWsSize({ 
        width: Math.max(400, resizing.initialW + (e.clientX - resizing.startX)), 
        height: Math.max(250, resizing.initialH + (e.clientY - resizing.startY)) 
      });
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

  useEffect(() => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScrollEnabled]);

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || editorRef.current?.innerText.trim();
    if (!text || (isLoading && !overrideText)) return;
    
    if (!overrideText && editorRef.current) {
      editorRef.current.innerHTML = '';
      setInputText("");
      setVideoFile(null);
    }
    
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();
    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (!targetId) {
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'user', text: text!, timestamp: Date.now() },
        { id: botMsgId, role: 'model', text: 'འཕྲུལ་ཆས་ཀྱིས་ཤེས་རིག་གཏེར་མཛོད་ནས་བཙལ་འཚོལ་བྱེད་བཞིན་པ...', isStreaming: true, timestamp: Date.now() }
      ]);
    }

    try {
      let result;
      if (videoFile && !targetId) {
        const analysis = await analyzeVideo(videoFile.data, videoFile.type, text!);
        result = { text: analysis, grounding: null };
      } else {
        result = await sendMessageToSession(text!, history, (chunk) => {
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunk } : m));
        }, useSearch);
      }
      
      const fullContent = (accumulatedText + result.text).replace("[COMPLETE]", "");
      const hasContinueSignal = fullContent.includes("[CONTINUE_SIGNAL]");
      const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
      
      const totalWords = messages.reduce((s, m) => s + countHumanWords(m.text), 0) + countHumanWords(cleanedContent);

      if (hasContinueSignal && totalWords < EPIC_GOAL_WORDS) {
        setTimeout(() => handleSend("མུ་མཐུད་དུ་ཞིབ་འགྲེལ་གནང་རོགས། (Continue...)", botMsgId, cleanedContent), 600);
      } else {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: cleanedContent, isStreaming: false, groundingChunks: result.grounding } : m));
        setIsLoading(false);
      }
    } catch (e) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false, text: "Error: Generation Interrupted." } : m));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        setMediaLoading(true);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const transcript = await transcribeAudio(base64);
          if (editorRef.current) {
            editorRef.current.innerText += " " + transcript;
            setInputText(editorRef.current.innerText);
          }
          setMediaLoading(false);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) { console.error(err); }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaLoading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoFile({ data: (reader.result as string).split(',')[1], type: file.type });
        setMediaLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const inputStats = useMemo(() => {
    if (!inputText) return { tshegs: 0, hanzi: 0, words: 0 };
    return {
      tshegs: (inputText.match(/་/g) || []).length,
      hanzi: (inputText.match(/[\u4e00-\u9fa5]/g) || []).length,
      words: (inputText.match(/[a-zA-Z0-9'-]+/g) || []).length,
    };
  }, [inputText]);

  const totalWords = useMemo(() => messages.reduce((sum, m) => sum + countHumanWords(m.text), 0), [messages]);
  const progressPercentage = Math.min(100, (totalWords / EPIC_GOAL_WORDS) * 100);

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream font-tibetan overflow-hidden relative">
      <Header 
        onReset={() => setMessages([])} 
        onResetLayout={() => setWsPos({ x: (window.innerWidth - 900) / 2, y: 120 })} 
        onToggleMemory={() => {}} 
        onToggleAutoScroll={() => setAutoScrollEnabled(!autoScrollEnabled)}
        onToggleInput={() => setIsInputVisible(!isInputVisible)}
        autoScrollEnabled={autoScrollEnabled}
        isInputVisible={isInputVisible}
        totalCharacters={totalWords}
        totalTshegs={messages.reduce((s, m) => s + (m.text.match(/་/g) || []).length, 0)}
        epicGoal={EPIC_GOAL_WORDS}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-16 pb-[400px]">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 opacity-10 text-himalaya-red">
              <Sparkles size={160} strokeWidth={0.5} />
              <p className="text-[3rem] font-bold mt-6">ཤེས་རིག་གཏེར་མཛོད།</p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {isInputVisible && (
        <div 
          className={`fixed flex flex-col bg-white overflow-hidden ${isMaximized ? 'inset-0 !w-full !h-full border-0 rounded-0 z-[200]' : 'border-4 border-himalaya-gold shadow-2xl rounded-[2.5rem] z-[200]'}`} 
          style={isMaximized ? {} : { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` }}
        >
          {/* Draggable Header */}
          <div 
            onMouseDown={(e) => {
              if (isMaximized || (e.target as HTMLElement).closest('button')) return;
              setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y });
            }}
            className="h-16 bg-gray-50 flex items-center justify-between px-8 border-b border-gray-100 cursor-grab active:cursor-grabbing shrink-0"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-himalaya-red rounded-xl text-himalaya-gold"><Edit3 size={20} /></div>
              <span className="text-[12px] font-bold text-himalaya-red">བརྡ་འཕྲིན་འཇུག་སྣོད།</span>
              {isLoading && <span className="text-[10px] animate-pulse text-himalaya-gold font-black uppercase tracking-widest ml-2">Marathon Active...</span>}
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={() => setUseSearch(!useSearch)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${useSearch ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-500'}`}>
                <Globe size={12} /> {useSearch ? 'Search ON' : 'Search OFF'}
              </button>
              <div className="w-px h-6 bg-gray-200 mx-2" />
              <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="text-gray-400 hover:text-himalaya-red"><Minus size={16} /></button>
              <button onClick={() => setFontSize(s => Math.min(64, s + 2))} className="text-gray-400 hover:text-himalaya-red"><Plus size={16} /></button>
              <div className="w-px h-6 bg-gray-200 mx-2" />
              <button onClick={() => setIsMaximized(!isMaximized)} className="text-gray-400 hover:text-himalaya-red">
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button onClick={() => setIsInputVisible(false)} className="p-2 text-gray-400 hover:text-red-600"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
            <div ref={editorRef} contentEditable spellCheck="false" style={{ fontSize: `${fontSize}px` }} 
                 className="flex-1 outline-none font-tibetan leading-[1.8] overflow-y-auto p-10 text-justify custom-scrollbar" 
                 onInput={() => setInputText(editorRef.current?.innerText || "")} />
            
            {videoFile && (
              <div className="absolute bottom-4 left-4 p-3 bg-himalaya-gold/10 border border-himalaya-gold rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in">
                <FileVideo size={20} className="text-himalaya-gold" />
                <span className="text-[10px] font-bold text-himalaya-gold uppercase">Video Attached</span>
                <button onClick={() => setVideoFile(null)} className="text-himalaya-red"><Trash2 size={14} /></button>
              </div>
            )}

            {!inputText && !videoFile && (
              <div className="absolute top-24 left-14 pointer-events-none opacity-20 text-3xl font-tibetan">
                འདིར་བརྡ་འཕྲིན་འབྲི་རོགས། (Write marathon prompt here...)
              </div>
            )}

            {/* Action Bar */}
            <div className="h-20 border-t border-gray-100 px-10 flex items-center justify-between bg-gray-50/50 shrink-0">
              <div className="flex items-center gap-6 overflow-hidden">
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={isRecording ? stopRecording : startRecording} 
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-gray-200 text-gray-400 hover:border-himalaya-red hover:text-himalaya-red'}`}>
                    {isRecording ? <Radio size={18} /> : <Mic size={18} />}
                  </button>
                  <label className="w-10 h-10 rounded-full flex items-center justify-center bg-white border border-gray-200 text-gray-400 hover:border-himalaya-red hover:text-himalaya-red cursor-pointer">
                    <Video size={18} />
                    <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  </label>
                  {mediaLoading && <Loader2 className="animate-spin text-himalaya-gold" size={20} />}
                </div>

                {/* Detailed Character Counter */}
                <div className="flex items-center gap-4 border-l border-gray-200 pl-6 ml-2 shrink-0">
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">Tshegs (ཚེག)</span>
                      <span className="text-[12px] font-bold tabular-nums text-himalaya-red">{inputStats.tshegs.toLocaleString()}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">Hanzi (汉字)</span>
                      <span className="text-[12px] font-bold tabular-nums text-himalaya-red">{inputStats.hanzi.toLocaleString()}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">Words (EN)</span>
                      <span className="text-[12px] font-bold tabular-nums text-himalaya-red">{inputStats.words.toLocaleString()}</span>
                   </div>
                </div>

                <div className="flex flex-col ml-4 shrink-0">
                   <span className="text-[8px] font-black text-himalaya-gold uppercase tracking-widest">Goal Progress</span>
                   <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-himalaya-gold transition-all duration-700" style={{ width: `${progressPercentage}%` }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-himalaya-gold">{Math.round(progressPercentage)}%</span>
                   </div>
                </div>
              </div>

              <button onClick={() => handleSend()} disabled={!inputText.trim() || isLoading} 
                      className={`flex items-center gap-3 px-8 py-3 rounded-2xl font-black shadow-xl border-b-4 transition-all active:scale-95 shrink-0 ${isLoading ? 'bg-gray-200 text-gray-400 border-gray-300' : 'bg-himalaya-red text-himalaya-gold border-red-950 hover:bg-red-800'}`}>
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Compass size={20} />}
                <span className="text-[11px] uppercase tracking-widest">Retreive བརྡ་འཕྲིན་གཏོང་།</span>
              </button>
            </div>
          </div>

          {/* Resize Handle */}
          {!isMaximized && (
            <div 
              onMouseDown={(e) => {
                setResizing({ startX: e.clientX, startY: e.clientY, initialW: wsSize.width, initialH: wsSize.height });
              }}
              className="absolute bottom-0 right-0 w-8 h-8 cursor-se-resize group flex items-end justify-end p-1 z-[10]"
            >
              <div className="w-3 h-3 border-r-2 border-b-2 border-gray-300 group-hover:border-himalaya-gold rounded-sm transition-colors" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
