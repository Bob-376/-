
import React, { useMemo, useState } from 'react';
import { Message } from '../types';
import { Bot, User, Copy, Trash2, Clock, ShieldCheck, Check, Volume2, Loader2, ExternalLink } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const countHumanWords = (text: string): number => {
    if (!text) return 0;
    const tshegs = (text.match(/་/g) || []).length;
    const hanzi = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (text.match(/[a-zA-Z0-9'-]+/g) || []).length;
    return tshegs + hanzi + words;
  };

  const currentWordCount = useMemo(() => countHumanWords(message.text), [message.text]);

  const handleCopy = () => {
    const clean = message.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "").trim();
    navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const audioData = await generateSpeech(message.text.substring(0, 1000)); // Limit TTS for safety
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const dataInt16 = new Int16Array(audioData.buffer);
      const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
    }
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className={`flex items-start gap-3 max-w-[92%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${isUser ? 'bg-himalaya-gold border-himalaya-red/10 text-himalaya-red' : 'bg-himalaya-red border-himalaya-gold text-himalaya-gold shadow-md'}`}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>
        
        <div className={`p-6 md:p-8 rounded-[1.5rem] shadow-xl ${isUser ? 'bg-himalaya-gold/15 backdrop-blur-sm border border-himalaya-gold/25 text-himalaya-dark rounded-tr-none' : 'bg-white text-himalaya-dark rounded-tl-none border border-gray-100'}`}>
          <div className="flex justify-between items-center mb-4 opacity-30">
            <span className="text-[7px] font-black uppercase tracking-widest">{isUser ? 'User Manuscript' : 'System Record'}</span>
            <div className="flex items-center gap-3">
              {!isUser && (
                <button onClick={handlePlayAudio} className={`transition-colors ${isPlaying ? 'text-himalaya-red animate-pulse' : 'text-gray-400 hover:text-himalaya-red'}`}>
                  {isPlaying ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                </button>
              )}
              <button onClick={handleCopy} className={`transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button onClick={() => onDelete?.(message.id)} className="text-gray-400 hover:text-red-600">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          
          <div className="message-content text-himalaya-dark whitespace-pre-wrap leading-[1.8] font-tibetan text-[1.2rem]">
            {message.text.replace(/\[CONTINUE_SIGNAL\]|\[COMPLETE\]/g, "")}
          </div>

          {message.groundingChunks && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Sources & Citations</span>
              <div className="flex flex-wrap gap-2">
                {message.groundingChunks.map((chunk, idx) => chunk.web && (
                  <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md text-[9px] text-blue-600 hover:bg-blue-50 transition-colors">
                    <ExternalLink size={10} />
                    {chunk.web.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {!isUser && !message.isStreaming && (
            <div className="flex flex-col items-center pt-6 mt-6 border-t border-gray-100 gap-2">
               <div className="flex items-center gap-2 px-4 py-1.5 bg-himalaya-red text-himalaya-gold rounded-full border border-himalaya-gold/40 shadow-md">
                  <ShieldCheck size={12} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Master Scribe Authorized</span>
                  <div className="w-px h-3 bg-himalaya-gold/30 mx-0.5" />
                  <span className="text-[10px] font-bold tabular-nums">+{currentWordCount} ཚིག།</span>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChatMessage;
