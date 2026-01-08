
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Plus, Minus, X, Search, Compass, Maximize2, Minimize2, Edit3, 
  Sparkles, Info, Languages, History, BrainCircuit, Trash2, Check, Copy,
  Mic, Video, Upload, FileVideo, Radio, Globe, Type, Filter, Image as ImageIcon,
  Camera, Zap, AlertCircle, RefreshCw, FileText, BookOpen, Quote, ZoomIn, ZoomOut, Layers,
  Type as TypeIcon, Palette, Move, Save, ChevronRight, LayoutPanelTop, SendHorizonal, ArrowUpRight,
  FileSearch, SearchCode, Type as FontSizeIcon, Wand2, Film, Brain, Volume2, MicOff
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message, MediaItem } from './types';
import { 
  sendMessageToSession, quickExplain, transcribeAudio, analyzeVideo, analyzeImages, 
  generateImagesNano, generateVideoVeo, editImageNano, connectLiveSession 
} from './services/geminiService';

const EPIC_GOAL_WORDS = 50000; 

const countHumanWords = (text: string): number => {
  if (!text) return 0;
  const tshegs = (text.match(/་/g) || []).length;
  const hanzi = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[a-zA-Z0-9'-]+/g) || []).length;
  return tshegs + hanzi + words;
};

// Live Audio Helper Functions
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}
async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

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
  const [thinkingMode, setThinkingMode] = useState(false);
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");

  // Multimedia states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [videoFile, setVideoFile] = useState<{data: string, type: string} | null>(null);
  const [imageFiles, setImageFiles] = useState<Array<{id: string, data: string, type: string}>>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Live Session States
  const [isLiveActive, setIsLiveActive] = useState(false);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  // Layout states
  const [wsPos, setWsPos] = useState({ x: (window.innerWidth - 900) / 2, y: 120 });
  const [wsSize, setWsSize] = useState({ width: Math.min(900, window.innerWidth - 60), height: 500 });
  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const [resizing, setResizing] = useState<{ startX: number, startY: number, initialW: number, initialY: number } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Add the missing toggleWorkshop function
  const toggleWorkshop = useCallback(() => {
    setIsInputVisible(prev => !prev);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMaximized && !isDocked) {
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
    }
  }, [dragging, resizing, isMaximized, isDocked]);

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
    if (autoScrollEnabled && !searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScrollEnabled, searchQuery]);

  // LIVE API Session Logic
  const toggleLiveSession = async () => {
    if (isLiveActive) {
      liveSessionRef.current?.close();
      setIsLiveActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const sessionPromise = connectLiveSession({
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
            });
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);
        },
        onmessage: async (msg) => {
          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const buffer = await decodeAudioData(decode(base64), outputCtx, 24000, 1);
            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(outputCtx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }
          if (msg.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => s.stop());
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onerror: (e) => console.error(e),
        onclose: () => setIsLiveActive(false),
      });

      liveSessionRef.current = await sessionPromise;
      setIsLiveActive(true);
    } catch (err) {
      console.error("Live session failed:", err);
    }
  };

  const checkAndOpenSelectKey = async () => {
    if (!(await (window as any).aistudio.hasSelectedApiKey())) {
      await (window as any).aistudio.openSelectKey();
    }
  };

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    const text = overrideText || (isInputVisible ? editorRef.current?.innerText.trim() : inputText.trim());
    if ((!text && imageFiles.length === 0 && !videoFile) || (isLoading && !overrideText)) return;
    
    let sentMedia: MediaItem[] = [];
    if (!overrideText) {
      if (imageFiles.length > 0) sentMedia = imageFiles.map(img => ({ type: 'image', data: img.data, mimeType: img.type }));
      if (videoFile) sentMedia.push({ type: 'video', data: videoFile.data, mimeType: videoFile.type });

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
        { id: (Date.now() + 1).toString(), role: 'user', text: text || "Analyze artifacts.", timestamp: Date.now(), mediaItems: sentMedia.length > 0 ? sentMedia : undefined },
        { id: botMsgId, role: 'model', text: 'འཕྲུལ་ཆས་ཀྱིས་ཤེས་རིག་གཏེར་མཛོད་ནས་བཙལ་འཚོལ་བྱེད་བཞིན་པ...', isStreaming: true, timestamp: Date.now() }
      ]);
    }

    try {
      let result;
      const imagesOnly = sentMedia.filter(m => m.type === 'image');
      const videoOnly = sentMedia.filter(m => m.type === 'video');

      if (imagesOnly.length > 0 && !targetId) {
        result = { text: await analyzeImages(imagesOnly.map(img => ({ data: img.data, mimeType: img.mimeType })), text || "Analyze artifacts."), grounding: null };
      } else if (videoOnly.length > 0 && !targetId) {
        result = { text: await analyzeVideo(videoOnly[0].data, videoOnly[0].mimeType, text || "Analyze video."), grounding: null };
      } else {
        result = await sendMessageToSession(text || "Explain context.", history, (chunk) => {
          setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunk } : m));
        }, { useSearch, thinkingMode });
      }
      
      const fullContent = (accumulatedText + result.text).replace("[COMPLETE]", "");
      const hasContinueSignal = fullContent.includes("[CONTINUE_SIGNAL]");
      const cleanedContent = fullContent.replace("[CONTINUE_SIGNAL]", "");
      
      if (hasContinueSignal && totalWordsCountSum + countHumanWords(cleanedContent) < EPIC_GOAL_WORDS) {
        setTimeout(() => handleSend("མུ་མཐུད་དུ་ཞིབ་འགྲེལ་གནང་རོགས། (Continue...)", botMsgId, cleanedContent), 600);
      } else {
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: cleanedContent, isStreaming: false, groundingChunks: result.grounding } : m));
        setIsLoading(false);
      }
    } catch (e) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false, text: "Interrupted." } : m));
    }
  };

  const handleImageOCR = async (media: MediaItem) => {
    setIsLoading(true);
    const botMsgId = Date.now().toString();
    setMessages(prev => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: 'user', text: "བོད་ཡིག་原文提取 (Extracting Tibetan text...)", timestamp: Date.now(), mediaItems: [media] },
      { id: botMsgId, role: 'model', text: 'འཕྲུལ་ཆས་ཀྱིས་པར་རིས་ནང་གི་བོད་ཡིག་ངོ་འཛིན་བྱེད་བཞིན་པ...', isStreaming: true, timestamp: Date.now() }
    ]);
    try {
      const text = await analyzeImages([{ data: media.data, mimeType: media.mimeType }], "Extract all Tibetan (བོད་ཡིག) text from this image accurately.");
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text, isStreaming: false } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: "OCR Analysis failed.", isStreaming: false } : m));
    }
    setIsLoading(false);
  };

  const handleGenerateImage = async () => {
    const text = isInputVisible ? editorRef.current?.innerText.trim() : inputText.trim();
    if (!text) return;
    await checkAndOpenSelectKey();
    setIsLoading(true);
    try {
      const b64 = await generateImagesNano(text, imageSize);
      setMessages(prev => [...prev, 
        { id: Date.now().toString(), role: 'user', text: `Generate ${imageSize} image: ${text}`, timestamp: Date.now() },
        { id: (Date.now()+1).toString(), role: 'model', text: 'Artifact generated.', timestamp: Date.now(), mediaItems: [{ type: 'image', data: b64, mimeType: 'image/png' }] }
      ]);
      setInputText("");
      if (editorRef.current) editorRef.current.innerHTML = '';
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const handleAnimateImage = async (media: MediaItem) => {
    await checkAndOpenSelectKey();
    setIsLoading(true);
    try {
      const videoUri = await generateVideoVeo("Animate this artifact with cultural essence.", media.data);
      setMessages(prev => [...prev, 
        { id: Date.now().toString(), role: 'user', text: `Animate artifact with Veo.`, timestamp: Date.now() },
        { id: (Date.now()+1).toString(), role: 'model', text: 'Motion synthesis complete.', timestamp: Date.now(), mediaItems: [{ type: 'video', data: videoUri, mimeType: 'video/mp4' }] }
      ]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const handleEditImage = async (media: MediaItem, editPrompt: string) => {
    setIsLoading(true);
    try {
      const b64 = await editImageNano(media.data, media.mimeType, editPrompt);
      setMessages(prev => [...prev, 
        { id: Date.now().toString(), role: 'user', text: `Edit artifact: ${editPrompt}`, timestamp: Date.now() },
        { id: (Date.now()+1).toString(), role: 'model', text: 'Artifact modified.', timestamp: Date.now(), mediaItems: [{ type: 'image', data: b64, mimeType: 'image/png' }] }
      ]);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };
  
  const handleAddHotspot = (msgId: string, mediaIdx: number, hotspot: {x: number, y: number, label: string}) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg;
      if (!msg.mediaItems || !msg.mediaItems[mediaIdx]) return msg;
      
      const newMedia = [...msg.mediaItems];
      const item = { ...newMedia[mediaIdx] };
      item.hotspots = [...(item.hotspots || []), hotspot];
      newMedia[mediaIdx] = item;
      
      return { ...msg, mediaItems: newMedia };
    }));
  };

  const handleExport = () => {
    if (messages.length === 0) return;
    const textContent = messages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.role === 'user' ? 'USER' : 'SYSTEM'}:\n${m.text.trim()}\n\n`).join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `retrieval_${Date.now()}.txt`; a.click();
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
              onAnimate={handleAnimateImage}
              onEdit={handleEditImage}
              onAddHotspot={handleAddHotspot}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {!isInputVisible && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-[150] animate-in slide-in-from-bottom-10">
          <div className="bg-white/80 backdrop-blur-xl border-2 border-himalaya-gold shadow-2xl rounded-[2rem] p-2 flex items-center gap-2 group">
             <div className="flex items-center gap-1.5 pl-2">
                <button 
                  onClick={toggleLiveSession}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isLiveActive ? 'bg-green-600 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-100'}`}
                  title="Live Scholar Conversation"
                >
                   {isLiveActive ? <Volume2 size={20} /> : <Radio size={20} />}
                </button>
                <button 
                  onClick={isRecording ? () => mediaRecorderRef.current?.stop() : async () => {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const recorder = new MediaRecorder(stream);
                    const chunks: any[] = [];
                    recorder.ondataavailable = e => chunks.push(e.data);
                    recorder.onstop = async () => {
                      setMediaLoading(true);
                      const blob = new Blob(chunks, { type: 'audio/webm' });
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        const transcript = await transcribeAudio((reader.result as string).split(',')[1]);
                        setInputText(p => p + transcript);
                        setMediaLoading(false);
                      };
                      reader.readAsDataURL(blob);
                    };
                    recorder.start(); mediaRecorderRef.current = recorder; setIsRecording(true);
                  }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-100'}`}
                  title="Voice Input"
                >
                   <Mic size={20} />
                </button>
             </div>

             <textarea 
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
               placeholder="Write manuscript or prompt..."
               className="flex-1 bg-transparent border-none outline-none font-tibetan py-2.5 px-3 resize-none max-h-32 text-lg"
               rows={1}
               onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
             />

             <div className="flex items-center gap-1 pr-1">
                <div className="flex flex-col items-center mr-1">
                   <button onClick={() => setThinkingMode(!thinkingMode)} className={`p-2 rounded-lg ${thinkingMode ? 'text-purple-600' : 'text-gray-300'}`} title="Deep Thinking Mode">
                      <Brain size={18} />
                   </button>
                </div>
                <div className="flex items-center bg-gray-50 rounded-xl p-1 gap-1 border border-gray-100">
                  <button onClick={handleGenerateImage} className="w-10 h-10 flex items-center justify-center text-himalaya-gold hover:text-himalaya-red" title="Imagen Generation">
                    <Wand2 size={20} />
                  </button>
                  <select value={imageSize} onChange={e => setImageSize(e.target.value as any)} className="text-[8px] font-black uppercase bg-white border-none outline-none">
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
                <button onClick={() => handleSend()} disabled={isLoading} className="w-12 h-12 bg-himalaya-red text-himalaya-gold rounded-[1.25rem] flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50">
                   {isLoading ? <Loader2 size={20} className="animate-spin" /> : <SendHorizonal size={22} />}
                </button>
             </div>
          </div>
        </div>
      )}

      {isInputVisible && (
        <div 
          className={`fixed flex flex-col bg-white overflow-hidden transition-all duration-500 ease-in-out ${isMaximized ? 'inset-0 z-[200]' : isDocked ? 'bottom-0 left-0 right-0 h-[65vh] border-t-4 border-himalaya-gold rounded-t-[3rem] z-[200]' : 'border-4 border-himalaya-gold shadow-2xl rounded-[2.5rem] z-[200]'}`} 
          style={(!isMaximized && !isDocked) ? { width: `${wsSize.width}px`, height: `${wsSize.height}px`, left: `${wsPos.x}px`, top: `${wsPos.y}px` } : {}}
        >
          <div onMouseDown={(e) => { if (isMaximized || isDocked || (e.target as HTMLElement).closest('button')) return; setDragging({ startX: e.clientX, startY: e.clientY, initialX: wsPos.x, initialY: wsPos.y }); }}
            className="h-14 bg-gray-50 flex items-center justify-between px-8 border-b cursor-grab active:cursor-grabbing shrink-0"
          >
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-bold text-himalaya-red uppercase tracking-widest">Master Scribe Workshop</span>
              <button onClick={() => setThinkingMode(!thinkingMode)} className={`flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-full border ${thinkingMode ? 'bg-purple-600 text-white border-purple-700' : 'bg-gray-200 text-gray-500 border-gray-300'}`}>
                <Brain size={10} /> Thinking {thinkingMode ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsDocked(!isDocked)} className="px-2.5 py-1 bg-gray-200 rounded-full text-[8px] font-black uppercase">{isDocked ? 'Docked' : 'Float'}</button>
              <button onClick={() => setUseSearch(!useSearch)} className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${useSearch ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Search {useSearch ? 'ON' : 'OFF'}</button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="text-gray-400 hover:text-himalaya-red">{isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              <button onClick={toggleWorkshop} className="p-1 text-gray-400 hover:text-red-600"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-white">
            <div ref={editorRef} contentEditable spellCheck="false" style={{ fontSize: `${fontSize}px` }} data-placeholder="Enter manuscript..." className="workshop-editor flex-1 outline-none font-tibetan leading-[1.8] overflow-y-auto p-10 custom-scrollbar" />
            <div className="h-20 border-t flex items-center justify-between px-8 bg-white shadow-inner">
              <div className="flex items-center gap-3">
                <button onClick={handleGenerateImage} className="flex items-center gap-2 bg-himalaya-gold text-himalaya-red px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-md hover:scale-105 transition-all"><Wand2 size={16} /> Generate Artifact</button>
                <select value={imageSize} onChange={e => setImageSize(e.target.value as any)} className="text-[9px] font-black uppercase border p-1 rounded">
                   <option value="1K">1K RES</option>
                   <option value="2K">2K RES</option>
                   <option value="4K">4K RES</option>
                </select>
              </div>
              <button onClick={() => handleSend()} disabled={isLoading} className="flex items-center gap-2.5 px-8 py-2.5 rounded-xl font-black bg-himalaya-red text-himalaya-gold shadow-lg disabled:opacity-50">
                {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Compass size={18} />}
                <span className="text-[10px] uppercase tracking-widest">Synthesize Knowledge</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
