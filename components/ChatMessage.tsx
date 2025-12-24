
import React, { useState } from 'react';
import { Message } from '../types';
import { Bot, User, Copy, Check, Clock, Pin, PinOff, Trash2, ExternalLink } from 'lucide-react';

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

  const renderContent = (content: string) => {
    const applyHighlighting = (text: string) => {
      if (!highlightQuery || highlightQuery.length < 2) return text;
      try {
        const regex = new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.split(regex).map((segment, i) => regex.test(segment) ? (
          <span key={i} className="bg-himalaya-gold/30 border-b-2 border-himalaya-gold/50 rounded-sm px-0.5 font-bold">{segment}</span>
        ) : segment);
      } catch (e) { return text; }
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
      
      let bgColor = "bg-gray-200/50";
      let borderColor = "border-gray-300";
      let label = "系统";
      
      if (type === 'polish') { 
        bgColor = "bg-yellow-200/40"; 
        borderColor = "border-yellow-400/50";
        label = "润色"; 
      }
      else if (type === 'expand') { 
        bgColor = "bg-green-200/40"; 
        borderColor = "border-green-400/50";
        label = "扩写"; 
      }
      else if (type === 'modify') { 
        bgColor = "bg-blue-200/40"; 
        borderColor = "border-blue-400/50";
        label = "修改"; 
      }
      else if (type === 'citation') { 
        bgColor = "bg-purple-200/40"; 
        borderColor = "border-purple-400/50";
        label = "引用"; 
      }

      parts.push(
        <span key={match.index} className={`inline-block px-2 py-0.5 mx-0.5 rounded-lg border-b-2 ${bgColor} ${borderColor} transition-colors hover:brightness-95`}>
          <span className="opacity-60 mr-1.5 text-[9px] font-bold uppercase tracking-tighter">{label}</span>
          {applyHighlighting(text)}
        </span>
      );
      lastIndex = markRegex.lastIndex;
    }
    if (lastIndex < mainText.length) parts.push(applyHighlighting(mainText.substring(lastIndex)));

    return (
      <div className="space-y-6">
        <div className={`prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed font-tibetan ${mainText.length > 500 ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}>
          {parts.length > 0 ? parts : applyHighlighting(mainText)}
        </div>
        
        {message.groundingChunks && message.groundingChunks.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-100 w-full">
            <div className="flex items-center gap-4 mb-6 text-sm font-bold text-himalaya-gold uppercase tracking-[0.3em]">
              <ExternalLink size={18} /> 文献参考与搜索来源 (Master Sources)
            </div>
            <div className="flex flex-col gap-3 w-full">
              {message.groundingChunks.map((chunk, idx) => chunk.web && (
                <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-6 p-6 bg-gray-50 hover:bg-white hover:shadow-xl hover:border-himalaya-gold/40 border border-gray-100 rounded-3xl transition-all group/link w-full">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-md text-himalaya-gold group-hover/link:bg-himalaya-gold group-hover/link:text-white transition-all font-bold text-xl shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-bold text-gray-800 truncate mb-1">{chunk.web.title}</div>
                    <div className="text-sm text-gray-400 truncate font-sans tracking-tight">{chunk.web.uri}</div>
                  </div>
                  <ExternalLink size={20} className="text-gray-200 group-hover/link:text-himalaya-gold transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {metaText && <div className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-400 font-sans italic opacity-60 tracking-wide">{metaText}</div>}
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-16 group animate-in fade-in slide-in-from-bottom-2`}>
      <div className={`flex items-start gap-8 w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-2xl border-2 ${isUser ? 'bg-himalaya-gold border-himalaya-red/20' : 'bg-himalaya-red border-himalaya-gold'}`}>
          {isUser ? <User className="text-himalaya-red w-10 h-10" /> : <Bot className="text-himalaya-gold w-10 h-10" />}
        </div>
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div className={`relative p-10 md:p-14 rounded-[4rem] shadow-2xl border transition-all ${isUser ? 'bg-himalaya-gold text-himalaya-dark rounded-tr-none' : 'bg-white text-himalaya-dark rounded-tl-none border-gray-100'}`}>
            <div className="flex justify-between items-center gap-6 mb-10">
              <span className={`text-xs font-bold uppercase tracking-[0.4em] opacity-40 ${isUser ? 'text-himalaya-dark' : 'text-himalaya-red'}`}>
                {isUser ? '作者手稿' : '文坛宗师'}
              </span>
              <div className="flex items-center gap-3">
                <button onClick={handleCopy} className="p-3 hover:bg-black/5 rounded-2xl transition-colors">{copied ? <Check size={20} className="text-emerald-600" /> : <Copy size={20} className="opacity-30" />}</button>
                <button onClick={() => onTogglePin?.(message.id)} className={`p-3 hover:bg-black/5 rounded-2xl transition-colors ${isPinned ? 'text-himalaya-gold' : ''}`}>{isPinned ? <PinOff size={20} /> : <Pin size={20} className="opacity-30" />}</button>
                {onDelete && message.id !== 'welcome' && <button onClick={() => onDelete(message.id)} className="p-3 hover:bg-himalaya-red/10 text-himalaya-red rounded-2xl transition-colors"><Trash2 size={20} className="opacity-30" /></button>}
              </div>
            </div>
            {renderContent(message.text)}
          </div>
          <div className={`flex items-center gap-5 px-8 text-[11px] font-bold text-gray-400 uppercase tracking-widest ${isUser ? 'justify-end' : 'justify-start'}`}>
             <Clock size={14} /> {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             {message.isStreaming && <div className="text-himalaya-red animate-pulse">宗师泼墨中...</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
