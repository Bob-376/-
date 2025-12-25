
import React, { useState } from 'react';
import { Message } from '../types';
import { Bot, User, Copy, Check, Clock, Pin, PinOff, Trash2, ExternalLink, Sparkles } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onEditSubmit?: (text: string, id: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onTogglePin?: (id: string) => void;
  onDelete?: (id: string) => void;
  disabled?: boolean;
  highlightQuery?: string;
  isPinned?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  onTogglePin, 
  onDelete,
  highlightQuery, 
  isPinned 
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };

  const formatTextSegments = (text: string) => {
    // 匹配藏文字符及其常用标点
    const tibetanRegex = /([\u0F00-\u0FFF\s་]+)/g;
    return text.split(tibetanRegex).map((segment, i) => {
      if (tibetanRegex.test(segment)) {
        // 遵从用户“20号字”建议：调整为 text-xl (20px) 桌面端 text-2xl (24px)
        // 藏文由于堆叠结构，24px 在视觉上与 16px 的汉字重量相当
        return <span key={i} className="text-xl md:text-2xl font-tibetan leading-[1.6] inline-block align-middle py-1 px-0.5 text-himalaya-dark font-medium">{segment}</span>;
      } else {
        // 汉字/非藏文：微调至 text-sm (14px) 以匹配 20-24px 的藏文视觉重心
        return <span key={i} className="text-xs md:text-sm font-sans leading-relaxed text-gray-500 align-middle inline-block px-1 font-normal">{segment}</span>;
      }
    });
  };

  const renderContent = (content: string) => {
    const applyHighlighting = (text: string) => {
      if (!highlightQuery || highlightQuery.length < 2) return formatTextSegments(text);
      try {
        const regex = new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.split(regex).map((segment, i) => regex.test(segment) ? (
          <span key={i} className="bg-himalaya-gold/30 border-b-2 border-himalaya-gold/60 rounded-sm px-0.5">{formatTextSegments(segment)}</span>
        ) : formatTextSegments(segment));
      } catch (e) { return formatTextSegments(text); }
    };

    let mainText = content;
    let metaText = "";
    if (content.includes('---')) {
      const partsArr = content.split('---');
      mainText = partsArr[0].trim();
      metaText = partsArr.slice(1).join('---').trim();
    }

    const markRegex = /<mark\s+type="([^"]+)">([\s\S]*?)<\/mark>/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = markRegex.exec(mainText)) !== null) {
      if (match.index > lastIndex) parts.push(applyHighlighting(mainText.substring(lastIndex, match.index)));
      const type = match[1].toLowerCase();
      const text = match[2];
      
      let bgColor = "bg-gray-200/40";
      let borderColor = "border-gray-300/50";
      let label = "系统";
      
      if (type === 'polish') { bgColor = "bg-yellow-100/40"; borderColor = "border-yellow-400/30"; label = "润色"; }
      else if (type === 'expand') { bgColor = "bg-green-100/40"; borderColor = "border-green-400/30"; label = "扩写"; }
      else if (type === 'modify') { bgColor = "bg-blue-100/40"; borderColor = "border-blue-400/30"; label = "修改"; }
      else if (type === 'citation') { bgColor = "bg-purple-100/40"; borderColor = "border-purple-400/30"; label = "引用"; }

      parts.push(
        <span key={match.index} className={`inline-block px-4 py-3 mx-1 my-1 rounded-2xl border ${bgColor} ${borderColor} transition-all hover:shadow-sm`}>
          <span className="opacity-40 mr-2 text-[7px] font-black uppercase tracking-[0.2em] align-middle block mb-1">{label}</span>
          <span className="align-middle block">{applyHighlighting(text)}</span>
        </span>
      );
      lastIndex = markRegex.lastIndex;
    }
    if (lastIndex < mainText.length) parts.push(applyHighlighting(mainText.substring(lastIndex)));

    return (
      <div className="space-y-8">
        <div className="max-w-none whitespace-pre-wrap">
          {parts.length > 0 ? parts : applyHighlighting(mainText)}
        </div>
        
        {message.groundingChunks && message.groundingChunks.length > 0 && (
          <div className="mt-12 pt-8 border-t border-dashed border-gray-200 w-full">
            <div className="flex items-center gap-3 mb-6 text-[8px] font-black text-himalaya-gold uppercase tracking-[0.4em] opacity-80">
              <ExternalLink size={12} /> 史诗文献索引 (Sources)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {message.groundingChunks.map((chunk, idx) => chunk.web && (
                <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-gray-50/50 hover:bg-white hover:shadow-lg border border-gray-100 rounded-2xl transition-all group/link">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm text-himalaya-gold group-hover/link:bg-himalaya-gold group-hover/link:text-white transition-all font-bold text-xs shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-gray-700 truncate mb-0.5">{chunk.web.title}</div>
                    <div className="text-[8px] text-gray-300 truncate font-sans tracking-tight opacity-50">{chunk.web.uri}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {metaText && (
          <div className="mt-8 pt-6 border-t-2 border-himalaya-gold/30 bg-himalaya-gold/5 p-6 rounded-3xl relative overflow-hidden group/meta">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/meta:opacity-100 transition-opacity"><Sparkles className="text-himalaya-gold" size={24} /></div>
            <div className="text-himalaya-red">
              {applyHighlighting(metaText)}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <article className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-16 group animate-in fade-in slide-in-from-bottom-2`} data-analyzable="chat">
      <div className={`flex items-start gap-6 w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-xl border transition-transform group-hover:scale-105 ${isUser ? 'bg-himalaya-gold border-himalaya-red/10' : 'bg-himalaya-red border-himalaya-gold'}`}>
          {isUser ? <User className="text-himalaya-red w-7 h-7" /> : <Bot className="text-himalaya-gold w-7 h-7" />}
        </div>
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div className={`relative p-8 md:p-10 rounded-3xl shadow-[0_15px_45px_-10px_rgba(0,0,0,0.08)] border transition-all ${isUser ? 'bg-himalaya-gold text-himalaya-dark rounded-tr-none border-himalaya-red/10' : 'bg-white text-himalaya-dark rounded-tl-none border-gray-100'}`}>
            <div className="flex justify-between items-center gap-4 mb-8">
              <span className={`text-[8px] font-black uppercase tracking-[0.3em] opacity-30 ${isUser ? 'text-himalaya-dark' : 'text-himalaya-red'}`}>{isUser ? '作者手稿' : '文坛宗师'}</span>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="p-2 hover:bg-black/5 rounded-xl transition-colors"><Copy size={14} className="opacity-20" /></button>
                <button onClick={() => onDelete?.(message.id)} className="p-2 hover:bg-himalaya-red/10 text-himalaya-red rounded-xl transition-colors"><Trash2 size={14} className="opacity-20" /></button>
              </div>
            </div>
            <div className="select-text cursor-text">{renderContent(message.text)}</div>
          </div>
          <div className={`flex items-center gap-4 px-6 text-[8px] font-bold text-gray-300 uppercase tracking-widest opacity-60 ${isUser ? 'justify-end' : 'justify-start'}`}>
             <Clock size={10} /> <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
             {message.isStreaming && <div className="text-himalaya-red animate-pulse flex items-center gap-2"><Sparkles size={10} /> 宗师泼墨中...</div>}
          </div>
        </div>
      </div>
    </article>
  );
};

export default ChatMessage;
