import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Loader2, Plus, Minus, X, Search, Compass, Maximize2, Minimize2, Edit3, 
  Sparkles, Info, Languages, History, BrainCircuit, Trash2, Check, Copy,
  Mic, Video, Upload, FileVideo, Radio, Globe, Type, Filter, Image as ImageIcon,
  Camera, Zap, AlertCircle, RefreshCw, FileText, BookOpen, Quote, ZoomIn, ZoomOut, Layers,
  Type as TypeIcon, Palette, Move, Save, ChevronRight, LayoutPanelTop, SendHorizonal, ArrowUpRight,
  FileSearch, SearchCode, Type as FontSizeIcon, Wand2, Film, Brain, Volume2, MicOff, FileAudio
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

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
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
  const [isLoading, setIsLoading] = useState(false);
  const [isInputVisible, setIsInputVisible] = useState(false); 
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDocked, setIsDocked] = useState(true); 
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [useSearch, setUseSearch] = useState(true);
  const [thinkingMode, setThinkingMode] = useState(false);
  const [ocrMode, setOcrMode] = useState(false); // New state for OCR toggle
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("1K");
  const [isRecording, setIsRecording] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [wsPos, setWsPos] = useState({ x: (window.innerWidth - 900) / 2, y: 120 });
  const [wsSize, setWsSize] = useState({ width: Math.min(900, window.innerWidth - 60), height: 500 });
  const [dragging, setDragging] = useState<{ startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  // New State for Image/Audio Uploads
  const [pendingImages, setPendingImages] = useState<MediaItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleWorkshop = useCallback(() => setIsInputVisible(prev => !prev), []);

  useEffect(() => {
    if (autoScrollEnabled && !searchQuery) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, autoScrollEnabled, searchQuery]);

  // Reset OCR mode when images are cleared
  useEffect(() => {
    if (pendingImages.length === 0) setOcrMode(false);
  }, [pendingImages]);

  const toggleLiveSession = async () => {
    if (isLiveActive) { liveSessionRef.current?.close(); setIsLiveActive(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const sessionPromise = connectLiveSession({
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const int16 = new Int16Array(e.inputBuffer.getChannelData(0).length);
            for (let i = 0; i < int16.length; i++) int16[i] = e.inputBuffer.getChannelData(0)[i] * 32768;
            sessionPromise.then(session => session.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
          };
          source.connect(processor); processor.connect(inputCtx.destination);
        },
        onmessage: async (msg) => {
          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const buffer = await decodeAudioData(decode(base64), outputCtx, 24000, 1);
            const source = outputCtx.createBufferSource();
            source.buffer = buffer; source.connect(outputCtx.destination);
            source.start(nextStartTimeRef.current); nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }
        },
        onerror: () => setIsLiveActive(false),
        onclose: () => setIsLiveActive(false),
      });
      liveSessionRef.current = await sessionPromise; setIsLiveActive(true);
    } catch (err) { console.error(err); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newImages: MediaItem[] = [];
      for (const file of files) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        newImages.push({
          type: file.type.startsWith('video') ? 'video' : 'image',
          data: base64, 
          mimeType: file.type
        });
      }
      setPendingImages(prev => [...prev, ...newImages]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      
      const audioItem: MediaItem = {
          type: 'audio',
          data: base64,
          // IMPORTANT: Fallback to audio/mp3 if mimeType is missing (common with some file types in certain browsers)
          mimeType: file.type || 'audio/mp3' 
      };
      
      setPendingImages(prev => [...prev, audioItem]);
      if (audioInputRef.current) audioInputRef.current.value = "";
      
      // Suggest transcription prompt if empty
      if (!inputText) {
        setInputText("Full 2-Hour Amdo Tibetan Transcription");
      }
    }
  };

  const removePendingImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (overrideText?: string, targetId?: string, accumulatedText = "") => {
    let text = overrideText || (isInputVisible ? editorRef.current?.innerText.trim() : inputText.trim());
    if ((!text && pendingImages.length === 0) && !overrideText) return;
    
    // Explicitly append OCR trigger if mode is active
    if (ocrMode && pendingImages.length > 0 && !text.includes("OCR")) {
      text = text ? `[OCR MODE] ${text}` : "[OCR MODE] Extract text from this image.";
    }

    setIsLoading(true); 
    setInputText(""); 
    if (editorRef.current) editorRef.current.innerHTML = '';
    
    const imagesToSend = [...pendingImages];
    setPendingImages([]);

    const botMsgId = targetId || Date.now().toString();
    if (!targetId) {
      setMessages(prev => [
        ...prev, 
        { 
          id: Date.now().toString(), 
          role: 'user', 
          text, 
          timestamp: Date.now(),
          mediaItems: imagesToSend.length > 0 ? imagesToSend : undefined
        }, 
        { 
          id: botMsgId, 
          role: 'model', 
          text: '...', 
          isStreaming: true, 
          timestamp: Date.now() 
        }
      ]);
    }

    try {
      const history = messages.map(m => {
        const parts: any[] = [];
        if (m.mediaItems) {
          m.mediaItems.forEach(img => {
            const b64 = img.data.includes('base64,') ? img.data.split('base64,')[1] : img.data;
            parts.push({ inlineData: { data: b64, mimeType: img.mimeType } });
          });
        }
        parts.push({ text: m.text || " " });
        return { role: m.role, parts };
      });

      const result = await sendMessageToSession(
        text, 
        history, 
        chunk => setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: accumulatedText + chunk } : m)), 
        { useSearch, thinkingMode, images: imagesToSend }
      );
      
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: result.text, isStreaming: false, groundingChunks: result.grounding } : m));
    } catch (e) { 
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, isStreaming: false, text: "Interrupted." } : m)); 
    }
    setIsLoading(false);
  };

  const handleImageOCR = async (media: MediaItem) => {
    setIsLoading(true);
    const botMsgId = Date.now().toString();
    setMessages(prev => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: 'user', text: "OCR: Extract Tibetan text.", timestamp: Date.now(), mediaItems: [media] },
      { id: botMsgId, role: 'model', text: 'Transcribing...', isStreaming: true, timestamp: Date.now() }
    ]);
    try {
      const text = await analyzeImages([{ data: media.data, mimeType: media.mimeType }], "Strictly extract all text from this image.");
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text, isStreaming: false } : m));
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: "OCR Analysis failed.", isStreaming: false } : m));
    }
    setIsLoading(false);
  };

  // ... (handleImageUpdate, handleAnimateImage, handleEditImage remain same)
  const handleImageUpdate = (oldMedia: MediaItem, newBase64: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'model',
      text: "Artifact modified with manual text overlay.",
      timestamp: Date.now(),
      mediaItems: [{ ...oldMedia, data: newBase64, mimeType: 'image/png' }]
    }]);
  };

  const handleAnimateImage = async (media: MediaItem) => {
    setIsLoading(true);
    try {
      const videoUri = await generateVideoVeo("Animate this artifact with cultural essence.", media.data);
      setMessages(prev => [...prev, 
        { id: Date.now().toString(), role: 'user', text: `Animate artifact.`, timestamp: Date.now() },
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

  const totalWordsCountSum = useMemo(() => messages.reduce((sum, m) => sum + countHumanWords(m.text), 0), [messages]);

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream font-tibetan overflow-hidden relative">
      <Header onReset={() => setMessages([])} onResetLayout={() => setIsDocked(true)} onToggleMemory={() => {}} onToggleAutoScroll={() => setAutoScrollEnabled(!autoScrollEnabled)} onToggleInput={toggleWorkshop} onExport={() => {}} autoScrollEnabled={autoScrollEnabled} isInputVisible={isInputVisible} totalCharacters={totalWordsCountSum} totalTshegs={0} epicGoal={EPIC_GOAL_WORDS} />
      
      {/* Hidden File Inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" multiple className="hidden" />
      <input type="file" ref={audioInputRef} onChange={handleAudioSelect} accept="audio/*" className="hidden" />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-10 pb-[250px]">
          {messages.length === 0 && <div className="py-32 opacity-10 text-himalaya-red text-center"><Sparkles size={160} className="mx-auto" /><p className="text-[3rem] font-bold mt-6">ཤེས་རིག་གཏེར་མཛོད།</p></div>}
          {messages.map(msg => <ChatMessage key={msg.id} message={msg} onDelete={id => setMessages(prev => prev.filter(m => m.id !== id))} onOCR={handleImageOCR} onAnimate={handleAnimateImage} onEdit={handleEditImage} onImageUpdate={handleImageUpdate} />)}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {!isInputVisible && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-[150]">
          
          {/* Image Preview with OCR Toggle */}
          {pendingImages.length > 0 && (
            <div className="mb-4">
              <div className="flex gap-2 overflow-x-auto pb-2 px-2 custom-scrollbar items-end">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 shrink-0 group">
                    {img.type === 'image' && <img src={img.data} alt="Preview" className="w-full h-full object-cover rounded-xl border-2 border-himalaya-gold shadow-lg" />}
                    {img.type === 'video' && <video src={img.data} className="w-full h-full object-cover rounded-xl border-2 border-himalaya-gold shadow-lg" />}
                    {img.type === 'audio' && (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-xl border-2 border-himalaya-gold shadow-lg">
                            <Volume2 className="text-himalaya-red" />
                        </div>
                    )}
                    <button onClick={() => removePendingImage(idx)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:scale-110 transition-transform">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {pendingImages.some(img => img.type === 'image') && (
                    <div className="mb-2 ml-2">
                    <button 
                        onClick={() => setOcrMode(!ocrMode)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-md transition-all ${ocrMode ? 'bg-himalaya-gold text-himalaya-red border-himalaya-red font-bold' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        <SearchCode size={16} />
                        <span className="text-xs uppercase tracking-wider">{ocrMode ? 'OCR Active' : 'Text OCR'}</span>
                    </button>
                    </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white/80 backdrop-blur-xl border-2 border-himalaya-gold shadow-2xl rounded-[2rem] p-2 flex items-center gap-2">
             <button onClick={toggleLiveSession} className={`w-10 h-10 rounded-full flex items-center justify-center ${isLiveActive ? 'bg-green-600 text-white' : 'text-gray-400'}`}><Radio size={20} /></button>
             <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-himalaya-red transition-colors" title="Upload Image"><ImageIcon size={20} /></button>
             <button onClick={() => audioInputRef.current?.click()} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-himalaya-red transition-colors" title="Upload Audio"><FileAudio size={20} /></button>
             <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder={ocrMode ? "Instructions (optional)..." : "Write manuscript..."} className="flex-1 bg-transparent border-none outline-none font-tibetan py-2.5 px-3 resize-none max-h-32 text-lg" rows={1} />
             <button onClick={() => setThinkingMode(!thinkingMode)} className={`p-2 rounded-lg ${thinkingMode ? 'text-purple-600' : 'text-gray-300'}`}><Brain size={18} /></button>
             <button onClick={() => handleSend()} disabled={isLoading} className="w-12 h-12 bg-himalaya-red text-himalaya-gold rounded-[1.25rem] flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50">{isLoading ? <Loader2 size={20} className="animate-spin" /> : <SendHorizonal size={22} />}</button>
          </div>
        </div>
      )}
      {isInputVisible && (
        <div className={`fixed flex flex-col bg-white overflow-hidden transition-all ${isMaximized ? 'inset-0 z-[200]' : 'bottom-0 left-0 right-0 h-[65vh] border-t-4 border-himalaya-gold rounded-t-[3rem] z-[200]'}`}>
          <div className="h-14 bg-gray-50 flex items-center justify-between px-8 border-b">
            <span className="text-[11px] font-bold text-himalaya-red uppercase tracking-widest">Master Scribe Workshop</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setThinkingMode(!thinkingMode)} className={`text-[8px] font-black px-2 py-1 rounded-full border ${thinkingMode ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-500'}`}>Deep Think {thinkingMode ? 'ON' : 'OFF'}</button>
              <button onClick={() => setUseSearch(!useSearch)} className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${useSearch ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Search {useSearch ? 'ON' : 'OFF'}</button>
              <button onClick={() => setIsMaximized(!isMaximized)} className="text-gray-400 hover:text-himalaya-red">{isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
              <button onClick={toggleWorkshop} className="p-1 text-gray-400 hover:text-red-600"><X size={16} /></button>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <div ref={editorRef} contentEditable spellCheck="false" data-placeholder="Enter manuscript..." className="workshop-editor flex-1 outline-none font-tibetan leading-[1.8] overflow-y-auto p-10 custom-scrollbar" />
            
            {pendingImages.length > 0 && (
               <div className="px-8 py-2 flex gap-3 overflow-x-auto border-t border-gray-100 bg-gray-50 items-center">
                {pendingImages.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16 shrink-0 group">
                    {img.type === 'image' && <img src={img.data} alt="Preview" className="w-full h-full object-cover rounded-lg border shadow-sm" />}
                    {img.type === 'video' && <video src={img.data} className="w-full h-full object-cover rounded-lg border shadow-sm" />}
                    {img.type === 'audio' && (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg border shadow-sm">
                            <Volume2 className="text-himalaya-red" size={24} />
                        </div>
                    )}
                    <button onClick={() => removePendingImage(idx)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 shadow hover:scale-110">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                 <button 
                     onClick={() => setOcrMode(!ocrMode)}
                     className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all ${ocrMode ? 'bg-himalaya-gold text-himalaya-red border-himalaya-red' : 'bg-white text-gray-500 border-gray-200'}`}
                   >
                     <SearchCode size={14} />
                     {ocrMode ? 'OCR ON' : 'OCR'}
                   </button>
              </div>
            )}

            <div className="h-20 border-t flex items-center justify-between px-8 bg-white">
              <div className="flex items-center gap-4">
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-gray-400 hover:text-himalaya-red font-bold text-xs uppercase tracking-widest">
                    <ImageIcon size={16} /> Add Visual
                  </button>
                  <button onClick={() => audioInputRef.current?.click()} className="flex items-center gap-2 text-gray-400 hover:text-himalaya-red font-bold text-xs uppercase tracking-widest">
                    <FileAudio size={16} /> Add Audio
                  </button>
              </div>
              <button onClick={() => handleSend()} disabled={isLoading} className="flex items-center gap-2.5 px-8 py-2.5 rounded-xl font-black bg-himalaya-red text-himalaya-gold shadow-lg disabled:opacity-50">{isLoading ? <Loader2 className="animate-spin" size={18} /> : <Compass size={18} />}<span className="text-[10px] uppercase tracking-widest">Synthesize Knowledge</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;