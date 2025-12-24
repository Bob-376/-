import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types';
import { Bot, User, Hash, Copy, Check, Clock, Pencil, X, Save, CornerDownLeft, ExternalLink, Library, History, Pin, PinOff, Languages, ChevronRight, Info, Lightbulb, TrendingUp, Sparkles, Feather, Book, Quote, FileText, BookmarkCheck, ScrollText, Layers, PenTool } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onEditSubmit?: (text: string, id: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onTogglePin?: (id: string) => void;
  onTranslate?: (text: string, targetLang: string) => void;
  disabled?: boolean;
  highlightQuery?: string;
  isPinned?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onEditSubmit, onReaction, onTogglePin, onTranslate, disabled, highlightQuery, isPinned }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };

  const handleEditStart = () => {
    setEditText(message.text);
    setIsEditing(true);
  };

  const renderContent = (content: string) => {
    const metricsMatch = content.match(/Word\/Character Count Delta:?\s*([+-]?\d+)/i);
    const finalCountMatch = content.match(/Final Article Character Count:?\s*(\d+)/i);
    const adviceMatch = content.match(/CREATIVE ADVICE:([\s\S]*?)(?=\n\n|\n[A-Z]|$)/i) || content.match(/Creative Advice\s*\(创作建议\):?([\s\S]*)$/i);
    
    let mainText = content;
    let metaText = "";
    if (content.includes('---')) {
      const partsArr = content.split('---');
      mainText = partsArr[0];
      metaText = partsArr.slice(1).join('---');
    }

    const markRegex = /<mark\s+type="([^"]+)">([\s\S]*?)<\/mark>/gi;
    const parts = [];
    const citations: string[] = [];
    let lastIndex = 0;
    let match;

    markRegex.lastIndex = 0;

    while ((match = markRegex.exec(mainText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(mainText.substring(lastIndex, match.index));
      }
      
      const type = match[1].toLowerCase();
      const text = match[2];
      
      let bgColor = "bg-gray-100";
      let textColor = "text-gray-900";
      let borderColor = "border-gray-300";
      let label = "";

      if (type === 'polish') {
        bgColor = "bg-yellow-50/80";
        textColor = "text-yellow-900";
        borderColor = "border-yellow-200";
        label = "润色";
      } else if (type === 'expand') {
        bgColor = "bg-green-50/80";
        textColor = "text-green-900";
        borderColor = "border-green-200";
        label = "扩写";
      } else if (type === 'modify') {
        bgColor = "bg-blue-50/80";
        textColor = "text-blue-900";
        borderColor = "border-blue-200";
        label = "修改";
      } else if (type === 'citation') {
        bgColor = "bg-himalaya-red/5";
        textColor = "text-himalaya-red";
        borderColor = "border-himalaya-red/20";
        label = "引用";
        citations.push(text);
      }

      parts.push(
        <span key={match.index} className={`relative inline items-center px-1 rounded-md border-b-2 font-medium transition-all ${bgColor} ${textColor} ${borderColor}`}>
          {text}
          <span className="inline-block text-[7px] font-bold uppercase tracking-tighter opacity-40 ml-1 italic">{label}</span>
        </span>
      );
      
      lastIndex = markRegex.lastIndex;
    }
    
    if (lastIndex < mainText.length) {
      parts.push(mainText.substring(lastIndex));
    }

    return (
      <div className="space-y-6">
        <div className="whitespace-pre-wrap break-words leading-relaxed font-tibetan text-xl text-himalaya-dark/90">
          {parts.length > 0 ? parts : mainText}
        </div>

        {/* Improved Sources Section */}
        {!isUser && citations.length > 0 && (
          <div className="mt-8 border-t border-himalaya-red/10 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-himalaya-red p-1.5 rounded-lg shadow-sm">
                <ScrollText size={16} className="text-himalaya-gold" />
              </div>
              <h4 className="text-sm font-bold text-himalaya-red uppercase tracking-[0.2em]">
                Sources (文献引用)
              </h4>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {citations.map((cite, idx) => {
                const parts = cite.split(':');
                const source = parts[0].trim();
                const quote = parts.slice(1).join(':').trim();
                
                return (
                  <div key={idx} className="group relative bg-white border border-himalaya-red/10 p-4 rounded-2xl shadow-sm hover:shadow-md hover:border-himalaya-red/30 transition-all">
                    <div className="flex items-start gap-3">
                      <Quote size={18} className="text-himalaya-gold flex-shrink-0 mt-1 opacity-50" />
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-himalaya-red/60">
                          {source}
                        </span>
                        {quote ? (
                          <p className="text-sm md:text-base italic font-tibetan text-himalaya-dark/80 leading-relaxed">
                            "{quote}"
                          </p>
                        ) : (
                          <p className="text-sm font-tibetan text-himalaya-dark/80 italic">引用内容已整合进正文</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Reference Links from Google Search */}
        {message.groundingChunks && message.groundingChunks.length > 0 && (
          <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-2xl">
            <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              <ExternalLink size={12} />
              Web Grounding
            </div>
            <div className="flex flex-wrap gap-2">
              {message.groundingChunks.map((chunk, idx) => chunk.web && (
                <a 
                  key={idx} 
                  href={chunk.web.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-100 rounded-full text-xs text-blue-600 hover:bg-blue-50 transition-all shadow-xs"
                >
                  <span className="max-w-[180px] truncate font-medium">{chunk.web.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Stats & Meta Footer */}
        {(!isUser && (finalCountMatch || metricsMatch || content.includes('说明') || adviceMatch)) && (
          <div className="border-t border-himalaya-gold/20 pt-6 mt-8 space-y-6">
            <div className="flex flex-wrap gap-3">
              {finalCountMatch && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-himalaya-dark text-white text-[10px] font-bold uppercase shadow-md">
                  <FileText size={12} className="text-himalaya-gold" />
                  正文字数: {finalCountMatch[1]} 字符
                </div>
              )}
              {metaText && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-himalaya-cream border border-himalaya-gold/30 text-himalaya-gold text-[10px] font-bold uppercase shadow-sm">
                  <Layers size={12} />
                  说明/元数据: {metaText.length} 字符
                </div>
              )}
              {metricsMatch && (
                <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-bold border ${parseInt(metricsMatch[1]) >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                  <TrendingUp size={12} />
                  {parseInt(metricsMatch[1]) >= 0 ? '内容增长' : '内容精简'}: {metricsMatch[1]}
                </div>
              )}
            </div>

            {/* Creative Advice Section */}
            {adviceMatch && (
              <div className="p-6 rounded-[2.5rem] bg-gradient-to-br from-himalaya-gold/5 to-transparent border border-himalaya-gold/20 shadow-inner relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 transform group-hover:scale-110 transition-transform">
                  <PenTool size={64} className="text-himalaya-gold" />
                </div>
                <div className="flex items-center gap-2 mb-4 text-himalaya-red font-bold text-xs uppercase tracking-[0.2em] relative z-10">
                  <Lightbulb size={18} className="text-himalaya-gold animate-pulse" />
                  <span>Creative Advice (创作研讨)</span>
                </div>
                <div className="text-sm md:text-base text-himalaya-dark/80 font-tibetan leading-relaxed italic relative z-10 whitespace-pre-wrap">
                  {adviceMatch[1].trim()}
                </div>
              </div>
            )}

            {content.includes('说明') && (
               <div className="p-5 rounded-3xl bg-himalaya-cream/50 border border-himalaya-gold/10 text-sm text-himalaya-dark/60 font-tibetan italic leading-relaxed">
                  <div className="flex items-center gap-2 mb-2 font-bold text-[10px] uppercase tracking-[0.2em] text-himalaya-gold/80">
                    <Info size={14} /> Context & Continuity
                  </div>
                  {content.split('---')[1]?.split(/Final Article Character Count|Word\/Character Count Delta|CREATIVE ADVICE/i)[0]?.trim()}
               </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isThinking = !isUser && message.isStreaming && message.text === '';

  return (
    <div className={`flex w-full mb-10 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex max-w-[95%] md:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-5`}>
        <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl border-2 transform transition-transform group-hover:scale-105 ${isUser ? 'bg-slate-700 text-white border-slate-500' : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold'}`}>
          {isUser ? <User size={24} /> : <Feather size={24} />}
        </div>

        <div className="flex flex-col relative w-full">
          <div className={`relative flex flex-col px-7 py-6 rounded-[2rem] shadow-sm text-base md:text-lg leading-relaxed transition-all duration-300 ${isUser ? 'bg-white text-himalaya-dark border border-gray-200 rounded-tr-none' : 'bg-white/95 backdrop-blur-md text-himalaya-dark border border-himalaya-red/5 rounded-tl-none'}`}>
            {!isEditing && (
              <div className={`absolute top-3 flex gap-1 opacity-0 group-hover:opacity-100 z-10 transition-opacity ${isUser ? 'left-3' : 'right-3'}`}>
                <button onClick={handleCopy} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-himalaya-red">{copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}</button>
                <button onClick={() => onTogglePin?.(message.id)} className={`p-2 rounded-xl hover:bg-gray-100 ${isPinned ? 'text-himalaya-gold' : 'text-gray-400'}`}><Pin size={16} /></button>
                {isUser && onEditSubmit && !disabled && <button onClick={handleEditStart} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-himalaya-red"><Pencil size={16} /></button>}
              </div>
            )}

            {isThinking ? (
              <div className="flex items-center gap-2 py-6">
                <div className="w-3 h-3 bg-himalaya-red rounded-full animate-typing-dot"></div>
                <div className="w-3 h-3 bg-himalaya-red rounded-full animate-typing-dot delay-200"></div>
                <div className="w-3 h-3 bg-himalaya-red rounded-full animate-typing-dot delay-400"></div>
              </div>
            ) : isEditing ? (
              <div className="flex flex-col gap-4">
                <textarea className="w-full bg-himalaya-cream/30 border-2 border-gray-200 focus:border-himalaya-red rounded-3xl p-5 text-base md:text-lg resize-none min-h-[200px]" value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsEditing(false)} className="px-5 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest">Cancel</button>
                  <button onClick={() => { onEditSubmit?.(editText, message.id); setIsEditing(false); }} className="px-8 py-2 bg-himalaya-red text-white rounded-xl text-xs font-bold uppercase shadow-xl hover:bg-red-900 transition-colors">Save Changes</button>
                </div>
              </div>
            ) : (
              renderContent(message.text)
            )}

            <div className={`mt-5 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.15em] opacity-30 ${isUser ? 'justify-end' : 'justify-start'}`}>
               <div className="flex items-center gap-1.5"><Clock size={12} /><span>{new Date(message.timestamp).toLocaleTimeString()}</span></div>
               <div className="flex items-center gap-1.5" title={`Main: ${message.text.split('---')[0].length} | Meta: ${message.text.includes('---') ? message.text.split('---').slice(1).join('---').length : 0}`}><Hash size={12} /><span>{message.text.length} Chars</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;