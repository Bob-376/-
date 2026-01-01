
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Plus, Minus, X, Search, Compass, Maximize2, Minimize2, Edit3, 
  Sparkles, Info, Languages, History, BrainCircuit, Trash2, Check, Copy,
  Mic, Video, Upload, FileVideo, Radio, Globe, Type, Filter, Image as ImageIcon,
  Camera, Zap, AlertCircle, RefreshCw, FileText, BookOpen, Quote, ZoomIn, ZoomOut, Layers,
  Type as TypeIcon, Palette, Move, Save, ChevronRight, LayoutPanelTop, SendHorizonal, ArrowUpRight,
  FileSearch, SearchCode
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message, MediaItem } from './types';
import { sendMessageToSession, quickExplain, transcribeAudio, analyzeVideo, analyzeImages } from './services/geminiService';

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
  const [searchQuery, setSearchQuery] = useState("");
  const [fontSize, setFontSize] = useState(22); 
  const [isLoading, setIsLoading] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(false); 
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDocked, setIsDocked] = useState(true); 
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [useSearch, setUseSearch] = useState(true);

  // Multimedia states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [videoFile, setVideoFile] = useState<{data: string, type: string} | null>(null);
  const [imageFiles, setImageFiles] = useState<Array<{id: string, data: string, type: string}>>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Text Overlay Editor States
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState("བོད་ཡིག་ཤེས་རིག");
  const [overlayFontSize, setOverlayFontSize] = useState(40);
  const [overlayColor, setOverlayColor] = useState("#FFFFFF");
  const [overlayFont, setOverlayFont] = useState("Noto Sans Tibetan");
  const [overlayPos, setOverlayPos] = useState({ x: 50, y: 50 });
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);

  // Layout states
  const [wsPos, setWsPos] = useState({ x: (window.innerWidth - 900) / 2, y: 120 });
  const [wsSize, setWsSize] = useState({ width: Math.min(900, window.innerWidth - 60), height: 500 });
  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ startX: number, startY: number, initialW: number, initialH: number } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayEditorRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isMaximized || isDocked) return;

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

    if (isDraggingOverlay && overlayEditorRef.current) {
      const rect = overlayEditorRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setOverlayPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
    }
  }, [dragging, resizing, isMaximized, isDocked, isDraggingOverlay]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setResizing(null);
    setIsDraggingOverlay(false);
  }, []);

  useEffect(() => {
    if (dragging || resizing || isDraggingOverlay) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, resizing, isDraggingOverlay, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (autoScrollEnabled && !searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScrollEnabled, searchQuery]);

  useEffect(() => {
    if (isInputVisible && editorRef.current) {
      const timer = setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isInputVisible]);

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || (isInputVisible ? editorRef.current?.innerText.trim() : inputText.trim());
    if ((!text && imageFiles.length === 0 && !videoFile) || (isLoading && !overrideText)) return;
    
    let sentMedia: MediaItem[] = [];
    if (!overrideText) {
      if (imageFiles.length > 0) {
        sentMedia = imageFiles.map(img => ({ type: 'image', data: img.data, mimeType: img.type }));
      }
      if (videoFile) {
        sentMedia.push({ type: 'video', data: videoFile.data, mimeType: videoFile.type });
      }

      if (editorRef.current) editorRef.current.innerHTML = '';
      setInputText("");
      setVideoFile(null);
      setImageFiles([]);
    }
    
    setIsLoading(true);
    let botMsgId = targetId || Date.now().toString();
    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (!targetId) {
      setMessages(prev => [
        ...prev,
        { 
          id: (Date.now() + 1).toString(), 
          role: 'user', 
          text: text || (sentMedia.length > 0 ? `Analyze ${sentMedia.length} artifacts.` : ""), 
          timestamp: Date.now(), 
          mediaItems: sentMedia.length > 0 ? sentMedia : undefined 
        },
        { id: botMsgId, role: 'model', text: 'འཕྲུལ་ཆས་ཀྱིས་ཤེས་རིག་གཏེར་མཛོད་ནས་བཙལ་འཚོལ་བྱེད་བཞིན་པ...', isStreaming: true, timestamp: Date.now() }
      ]);
    }

    try {
      let result;
      const imagesOnly = sentMedia.filter(m => m.type === 'image');
      const videoOnly = sentMedia.filter(m => m.type === 'video');

      if (imagesOnly.length > 0 && !targetId) {
        const analysis = await analyzeImages(imagesOnly.map(img => ({ data: img.data, mimeType: img.mimeType })), text || "Analyze artifacts.");
        result = { text: analysis, grounding: null };
      } else if (videoOnly.length > 0 && !targetId) {
        const analysis = await analyzeVideo(videoOnly[0].data, videoOnly[0].mimeType, text || "Analyze video.");
        result = { text: analysis, grounding: null };
      } else {
        result = await sendMessageToSession(text || "Analyze context.", history, (chunk) => {
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunk } : m));
        }, useSearch);
      }
      
      const fullContent = (accumulatedText + result.text).replace("[COMPLETE]", "");
      const hasContinueSignal = fullContent.includes("[CONTINUE_SIGNAL]");
      const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
      
      if (hasContinueSignal && messages.reduce((s, m) => s + countHumanWords(m.text), 0) + countHumanWords(cleanedContent) < EPIC_GOAL_WORDS) {
        setTimeout(() => handleSend("མུ་མཐུད་དུ་ཞིབ་འགྲེལ་གནང་རོགས། (Continue...)", botMsgId, cleanedContent), 600);
      } else {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: cleanedContent, isStreaming: false, groundingChunks: result.grounding } : m));
        setIsLoading(false);
      }
    } catch (e) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false, text: "Error: Interrupted." } : m));
    }
  };

  const handleActionClick = (actionText: string) => {
    handleSend(actionText);
  };

  // OCR Logic for a single image item from chat
  const handleImageOCR = async (mediaItem: MediaItem) => {
    if (isLoading) return;
    
    const botMsgId = Date.now().toString();
    setIsLoading(true);
    
    setMessages(prev => [
      ...prev,
      { 
        id: (Date.now() + 1).toString(), 
        role: 'user', 
        text: "བོད་ཡིག་原文提取 (Extracting Tibetan text...)", 
        timestamp: Date.now(), 
        mediaItems: [mediaItem] 
      },
      { id: botMsgId, role: 'model', text: 'འཕྲུལ་ཆས་ཀྱིས་པར་རིས་ནང་གི་བོད་ཡིག་ངོ་འཛིན་བྱེད་བཞིན་པ...', isStreaming: true, timestamp: Date.now() }
    ]);

    try {
      const result = await analyzeImages([{ data: mediaItem.data, mimeType: mediaItem.mimeType }], "Extract all Tibetan (བོད་ཡིག) text from this image as original script. No summary.");
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: result, isStreaming: false } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: "OCR Error: Extraction failed.", isStreaming: false } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const applyTextOverlay = () => {
    if (!editingImageId) return;
    const imgObj = imageFiles.find(img => img.id === editingImageId);
    if (!imgObj) return;

    const canvas = document.createElement('canvas');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      ctx.font = `${(overlayFontSize / 100) * img.width}px "${overlayFont}"`;
      ctx.fillStyle = overlayColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const px = (overlayPos.x / 100) * canvas.width;
      const py = (overlayPos.y / 100) * canvas.height;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      ctx.fillText(overlayText, px, py);
      const newDataUrl = canvas.toDataURL(imgObj.type);
      setImageFiles(prev => prev.map(item => item.id === editingImageId ? { ...item, data: newDataUrl.split(',')[1] } : item));
      setEditingImageId(null);
    };
    img.src = `data:${imgObj.type};base64,${imgObj.data}`;
  };

  const toggleWorkshop = () => {
    if (!isInputVisible && quickInputRef.current) {
      const currentText = quickInputRef.current.value;
      if (editorRef.current) editorRef.current.innerText = currentText;
    } else if (isInputVisible && editorRef.current) {
      const currentText = editorRef.current.innerText;
      setInputText(currentText);
    }
    setIsInputVisible(!isInputVisible);
  };

  const handleExport = () => {
    if (messages.length === 0) return;
    const textContent = messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role === 'user' ? 'USER' : 'SYSTEM'}:\n${m.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "").trim()}\n\n------------------\n`).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retrieval_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e: any) => chunks.push(e.data);
      recorder.onstop = async () => {
        setMediaLoading(true);
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const transcript = await transcribeAudio(base64);
          if (isInputVisible && editorRef.current) {
            editorRef.current.innerText += " " + transcript;
          } else {
            setInputText(prev => prev + " " + transcript);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      setMediaLoading(true);
      const promises = files.map((file: File) => new Promise<{id: string, data: string, type: string}>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ id: Math.random().toString(36).substr(2, 9), data: (reader.result as string).split(',')[1], type: file.type });
        reader.readAsDataURL(file);
      }));
      Promise.all(promises).then(newImages => {
        setImageFiles(prev => [...prev, ...newImages]);
        setMediaLoading(false);
      });
    }
    e.target.value = '';
  };

  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err: any) { setCameraError("Camera access error."); }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
      canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
      setImageFiles(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), data: canvas.toDataURL('image/jpeg').split(',')[1], type: 'image/jpeg' }]);
      setShowCamera(false);
    }
  };

  const totalWordsCountSum = useMemo(() => messages.reduce((sum, m) => sum + countHumanWords(m.text), 0), [messages]);

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream font-tibetan overflow-hidden relative">
      <Header 
        onReset={() => setMessages([])} 
        onResetLayout={() => { setWsPos({ x: (window.innerWidth - 900) / 2, y: 120 }); setIsDocked(true); }} 
        onToggleMemory={() => {}} 
        onToggleAutoScroll={() => setAutoScrollEnabled(!autoScrollEnabled)}
        onToggleInput={toggleWorkshop}
        onExport={handleExport}
        autoScrollEnabled={autoScrollEnabled}
        isInputVisible={isInputVisible}
        totalCharacters={totalWordsCountSum}
        totalTshegs={messages.reduce((s, m) => s + (m.text.match(/་/g) || []).length, 0)}
        epicGoal={EPIC_GOAL_WORDS}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-10 pb-[250px]">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-32 opacity-10 text-himalaya-red">
              <Sparkles size={160} strokeWidth={0.5} />
              <p className="text-[3rem] font-bold mt-6 text-center">ཤེས་རིག་གཏེར་མཛོད།</p>
            </div>
          )}
          {messages.filter(m => !searchQuery || m.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg) => (
            <ChatMessage 
              key={msg.id} 
              message={msg} 
              onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))} 
              onOCR={handleImageOCR}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {!isInputVisible && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-[150] animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-white/80 backdrop-blur-xl border-2 border-himalaya-gold shadow-2xl rounded-[2rem] p-2 flex items-center gap-2 group">
             <div className="flex items-center gap-1.5 pl-2">
                <button onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-100'}`}>
                   <Mic size={20} />
                </button>
                <label className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 cursor-pointer">
                   <ImageIcon size={20} />
                   <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
             </div>
             
             {/* Pending Image Info in Quick Bar */}
             {imageFiles.length > 0 && (
               <div className="flex items-center gap-2 bg-himalaya-gold/10 px-3 py-1.5 rounded-2xl border border-himalaya-gold/20 shrink-0">
                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-himalaya-gold">
                    <img src={`data:image/jpeg;base64,${imageFiles[imageFiles.length-1].data}`} className="w-full h-full object-cover" alt="Last Upload" />
                  </div>
                  <span className="text-[10px] font-black text-himalaya-red uppercase tracking-tighter">x{imageFiles.length}</span>
                  <button 
                    onClick={() => handleActionClick("Extract original Tibetan text from the last uploaded image accurately.")}
                    className="w-8 h-8 bg-green-600 text-white rounded-lg flex items-center justify-center hover:bg-green-700 transition-colors shadow-sm"
                    title="Quick OCR Extraction"
                  >
                    <SearchCode size={16} />
                  </button>
                  <button onClick={() => setImageFiles([])} className="text-gray-400 hover:text-red-600"><X size={14} /></button>
               </div>
             )}

             <textarea 
               ref={quickInputRef}
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
               placeholder="བརྡ་འཕྲིན་འདིར་འཇུག་རོགས། (Enter your query...)"
               className="flex-1 bg-transparent border-none outline-none font-tibetan py-2.5 px-3 resize-none max-h-32 text-lg custom-scrollbar"
               rows={1}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
             />
             <div className="flex items-center gap-1.5 pr-1">
                <button onClick={toggleWorkshop} className="w-10 h-10 rounded-full flex items-center justify-center text-himalaya-gold hover:bg-himalaya-gold/10" title="Expand Workshop">
                   <LayoutPanelTop size={20} />
                </button>
                <button onClick={() => handleSend()} disabled={(!inputText.trim() && imageFiles.length === 0) || isLoading} className="w-12 h-12 bg-himalaya-red text-himalaya-gold rounded-[1.25rem] flex items-center justify-center shadow-lg active:scale-95 transition-all disabled:opacity-50">
                   {isLoading ? <Loader2 size={20} className="animate-spin" /> : <SendHorizonal size={22} />}
                </button>
             </div>
          </div>
        </div>
      )}

      {editingImageId && (
        <div className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border-4 border-himalaya-gold">
            <div className="h-16 bg-himalaya-red flex items-center justify-between px-8">
              <span className="text-[11px] font-black text-himalaya-gold uppercase tracking-widest">Image Philology Workshop</span>
              <button onClick={() => setEditingImageId(null)} className="text-himalaya-gold hover:text-white"><X size={24} /></button>
            </div>
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              <div className="flex-1 bg-gray-100 flex items-center justify-center relative p-8">
                <div ref={overlayEditorRef} className="relative shadow-2xl border-4 border-white max-w-full max-h-full overflow-hidden flex items-center justify-center">
                  <img src={`data:image/jpeg;base64,${imageFiles.find(img => img.id === editingImageId)?.data}`} className="max-w-full max-h-full pointer-events-none" alt="Artifact" />
                  <div onMouseDown={() => setIsDraggingOverlay(true)} style={{ position: 'absolute', left: `${overlayPos.x}%`, top: `${overlayPos.y}%`, transform: 'translate(-50%, -50%)', fontSize: `${overlayFontSize}px`, color: overlayColor, fontFamily: `"${overlayFont}"`, textShadow: '2px 2px 4px rgba(0,0,0,0.5)', cursor: 'grab' }} className="whitespace-pre font-bold leading-tight select-none">
                    {overlayText}
                  </div>
                </div>
              </div>
              <div className="w-full md:w-80 bg-gray-50 border-l p-8 flex flex-col gap-6 overflow-y-auto">
                <textarea value={overlayText} onChange={(e) => setOverlayText(e.target.value)} className="w-full border rounded-xl p-3 text-sm h-24 font-tibetan" />
                <input type="range" min="10" max="200" value={overlayFontSize} onChange={(e) => setOverlayFontSize(parseInt(e.target.value))} className="w-full accent-himalaya-red" />
                <div className="flex flex-wrap gap-2">
                  {["#FFFFFF", "#000000", "#8B0000", "#D4AF37"].map(c => <button key={c} onClick={() => setOverlayColor(c)} className={`w-8 h-8 rounded-full border-2 ${overlayColor === c ? 'border-himalaya-red scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}
                </div>
                <button onClick={applyTextOverlay} className="mt-auto w-full bg-himalaya-red text-himalaya-gold py-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInputVisible && (
        <div 
          className={`fixed flex flex-col bg-white overflow-hidden transition-all duration-500 ease-in-out ${isMaximized ? 'inset-0 !w-full !h-full border-0 rounded-0 z-[200]' : isDocked ? 'bottom-0 left-0 right-0 h-[550px] !w-full border-t-4 border-himalaya-gold rounded-t-[3rem] z-[200]' : 'border-4 border-himalaya-gold shadow-2xl rounded-[2.5rem] z-[200]'}`} 
          style={(!isMaximized && !isDocked) ? { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` } : {}}
        >
          <div onMouseDown={(e) => { if (isMaximized || isDocked || (e.target as HTMLElement).closest('button')) return; setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }}
            className="h-16 bg-gray-50 flex items-center justify-between px-8 border-b cursor-grab active:cursor-grabbing shrink-0"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-himalaya-red rounded-xl text-himalaya-gold"><Edit3 size={20} /></div>
              <span className="text-[12px] font-bold text-himalaya-red uppercase tracking-widest">Master Scribe Workshop</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsDocked(!isDocked)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${isDocked ? 'bg-himalaya-red text-white' : 'bg-gray-200 text-gray-500'}`}>
                {isDocked ? 'Floating Mode' : 'Docked Mode'}
              </button>
              <button onClick={() => setUseSearch(!useSearch)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase transition-all ${useSearch ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-500'}`}>
                <Globe size={12} /> Search {useSearch ? 'ON' : 'OFF'}
              </button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="text-gray-400 hover:text-himalaya-red ml-4">{isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
              <button onClick={toggleWorkshop} className="p-2 text-gray-400 hover:text-red-600"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div ref={editorRef} contentEditable spellCheck="false" style={{ fontSize: `${fontSize}px` }} 
                 className="flex-1 outline-none font-tibetan leading-[1.8] overflow-y-auto p-10 pb-20 text-justify custom-scrollbar" />
            
            {imageFiles.length > 0 && (
              <div className="shrink-0 bg-gray-50 border-t border-gray-100 p-4 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between mb-3 px-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black text-himalaya-gold uppercase bg-himalaya-red px-2 py-1 rounded">Batch Queue</span>
                    <button onClick={() => handleActionClick("Identify and extract all TIBETAN (བོད་ཡིག) text from these images as ORIGINAL SCRIPT. NO translation.")} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-himalaya-gold/30 rounded-full text-[10px] font-bold text-himalaya-red hover:bg-himalaya-gold/10 transition-colors shadow-sm">
                      <FileSearch size={12} /> བོད་ཡིག་原文提取
                    </button>
                  </div>
                  <button onClick={() => setImageFiles([])} className="text-[9px] font-black uppercase text-red-600 hover:text-red-800 transition-colors">Clear All</button>
                </div>
                <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
                  {imageFiles.map((file) => (
                    <div key={file.id} className="w-16 h-16 bg-himalaya-gold/10 border-2 border-himalaya-gold rounded-xl overflow-hidden shadow-md group relative shrink-0 transition-transform hover:scale-105">
                      <img src={`data:image/jpeg;base64,${file.data}`} className="w-full h-full object-cover" alt="Thumb" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <button onClick={() => setEditingImageId(file.id)} className="text-himalaya-gold hover:scale-110 transition-transform"><TypeIcon size={14} /></button>
                        <button onClick={() => setImageFiles(p => p.filter(i => i.id !== file.id))} className="text-white hover:scale-110 transition-transform"><X size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="h-24 shrink-0 border-t border-gray-100 px-10 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-4">
                <button onClick={isRecording ? () => mediaRecorderRef.current?.stop() : startRecording} className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse scale-110' : 'bg-white text-gray-400 hover:text-himalaya-red'}`}><Mic size={22} /></button>
                <div className="flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                  <label className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-himalaya-gold cursor-pointer transition-colors"><ImageIcon size={22} /><input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} /></label>
                  <div className="w-px h-6 bg-gray-100 mx-1" />
                  <button onClick={startCamera} className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-himalaya-red transition-colors"><Camera size={22} /></button>
                </div>
                {mediaLoading && <Loader2 className="animate-spin text-himalaya-gold" size={24} />}
              </div>
              <button onClick={() => handleSend()} disabled={isLoading} className="flex items-center gap-3 px-10 py-3 rounded-2xl font-black bg-himalaya-red text-himalaya-gold shadow-xl border-b-4 border-red-950 active:scale-95 transition-all disabled:opacity-50">
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Compass size={20} />}
                <span className="text-[11px] uppercase tracking-widest">{imageFiles.length > 0 ? `Process ${imageFiles.length} Artifacts` : 'Retrieve Knowledge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 z-[500] bg-black flex flex-col items-center justify-center">
          {cameraError ? <div className="text-white p-10 text-center"><AlertCircle size={40} className="mx-auto mb-4" /><p>{cameraError}</p><button onClick={() => setShowCamera(false)} className="mt-6 px-8 py-2 bg-white text-black rounded-full">Close</button></div> : 
          <><video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-10 flex gap-6"><button onClick={capturePhoto} className="w-20 h-20 rounded-full bg-white border-8 border-himalaya-gold shadow-2xl active:scale-90 transition-transform" /><button onClick={() => setShowCamera(false)} className="w-20 h-20 rounded-full bg-red-600 text-white flex items-center justify-center"><X size={40} /></button></div></>}
        </div>
      )}
    </div>
  );
};

export default App;
