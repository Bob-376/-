
import React, { useMemo, useState } from 'react';
import { Message } from '../types';
import { Bot, User, Copy, Trash2, Clock, ShieldCheck, Check } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onDelete?: (id: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = React.memo(({ message, onDelete }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  
  const countTshegs = (text: string) => (text.match(/་/g) || []).length;
  const currentTshegCount = useMemo(() => countTshegs(message.text), [message.text]);

  const cleanTextForCopy = (text: string) => {
    return text
      .replace(/<polish>|<\/polish>|<expand>|<\/expand>|<modify>|<\/modify>/g, "")
      .replace(/\[AUTO_CONTINUE_SIGNAL\]/g, "")
      .replace(/\[EPIC_CHAPTER_COMPLETE\]/g, "")
      .replace(/\[CONTINUE_SIGNAL\]/g, "")
      .replace(/\[COMPLETE\]/g, "")
      .trim();
  };

  const handleCopy = () => {
    const textToCopy = cleanTextForCopy(message.text);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatMixedScript = (text: string, highlightType?: 'polish' | 'expand' | 'modify') => {
    // Optimization: If text is very long, don't split excessively.
    const segments = text.split(/([\u0F00-\u0FFF\s་]+)/g);
    
    const highlightClasses = {
      polish: 'bg-yellow-200/50 border-y border-amber-400/20 px-1 rounded-sm mx-0.5',
      expand: 'bg-green-200/50 border-y border-emerald-400/20 px-1 rounded-sm mx-0.5',
      modify: 'bg-blue-200/50 border-y border-blue-400/20 px-1 rounded-sm mx-0.5',
    };

    return segments.map((s, i) => {
      if (!s) return null;
      const isTibetan = /[\u0F00-\u0FFF\s་]/.test(s);
      
      return (
        <span 
          key={i} 
          className={`
            leading-[2.2] transition-all duration-200
            ${isTibetan 
              ? 'font-tibetan text-[1.7em]' 
              : 'font-sans text-[1em] opacity-80'}
            ${highlightType ? highlightClasses[highlightType] : ''}
          `}
        >
          {s}
        </span>
      );
    });
  };

  const parseAndRenderTags = (text: string) => {
    const cleanedText = text
      .replace(/\[CONTINUE_SIGNAL\]/g, "")
      .replace(/\[COMPLETE\]/g, "")
      .trim();

    // Regex to capture the tag type and the content within it
    const tagRegex = /<(polish|expand|modify)>(.*?)<\/\1>/gs;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(cleanedText)) !== null) {
      // Add text before the tag
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: cleanedText.substring(lastIndex, match.index)
        });
      }
      
      // Add the highlighted part
      parts.push({
        type: match[1] as 'polish' | 'expand' | 'modify',
        content: match[2]
      });
      
      lastIndex = tagRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < cleanedText.length) {
      parts.push({
        type: 'text',
        content: cleanedText.substring(lastIndex)
      });
    }

    // If no tags were found, just return formatted plain text
    if (parts.length === 0) {
      return formatMixedScript(cleanedText);
    }

    return parts.map((part, index) => {
      if (part.type === 'text') {
        return <React.Fragment key={index}>{formatMixedScript(part.content)}</React.Fragment>;
      } else {
        return <React.Fragment key={index}>{formatMixedScript(part.content, part.type)}</React.Fragment>;
      }
    });
  };

  const renderContent = (content: string) => {
    return (
      <div className="space-y-6 message-content text-himalaya-dark">
        <div className="whitespace-pre-wrap flex flex-wrap items-baseline text-justify">
          {parseAndRenderTags(content)}
        </div>
        
        {!isUser && !message.isStreaming && (
          <div className="flex flex-col items-center pt-10 border-t border-gray-100 gap-4">
             <div className="flex items-center gap-3 px-6 py-2 bg-himalaya-red text-himalaya-gold rounded-full border-2 border-himalaya-gold/40 shadow-xl">
                <ShieldCheck size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">宗师法印 · 章节收笔</span>
                <div className="w-px h-4 bg-himalaya-gold/30 mx-1" />
                <span className="text-xs font-bold tabular-nums">+{currentTshegCount} ཚེག།</span>
             </div>
             <div className="flex items-center gap-1 text-[8px] font-bold text-gray-300 uppercase tracking-[0.4em]">
                Master Scribe Authorized Content
             </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className={`flex items-start gap-4 max-w-[95%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border-2 ${isUser ? 'bg-himalaya-gold border-himalaya-red/10 text-himalaya-red' : 'bg-himalaya-red border-himalaya-gold text-himalaya-gold shadow-lg'}`}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>
        
        <div className={`p-8 md:p-14 rounded-[3rem] shadow-2xl ${isUser ? 'bg-himalaya-gold/20 backdrop-blur-sm border border-himalaya-gold/30 text-himalaya-dark rounded-tr-none' : 'bg-white text-himalaya-dark rounded-tl-none border border-gray-100'}`}>
          <div className="flex justify-between items-center mb-6 opacity-30">
            <span className="text-[8px] font-black uppercase tracking-widest">{isUser ? 'Author Manuscript' : 'Master Scribe Record'}</span>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleCopy} 
                className={`flex items-center gap-1 transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-himalaya-red'}`}
                title="复制内容"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied && <span className="text-[10px] font-bold">已复制</span>}
              </button>
              <button onClick={() => onDelete?.(message.id)} className="text-gray-400 hover:text-red-600 transition-colors" title="删除消息">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="select-text">{renderContent(message.text)}</div>
        </div>
      </div>
      <div className={`mt-2 px-14 text-[8px] text-gray-300 font-bold uppercase tracking-widest flex items-center gap-2 ${isUser ? 'text-right' : 'text-left'}`}>
        <Clock size={10} /> {new Date(message.timestamp).toLocaleTimeString()}
        {message.isStreaming && <span className="text-himalaya-red animate-pulse ml-2">Scribing Chapter...</span>}
      </div>
    </div>
  );
});

export default ChatMessage;
