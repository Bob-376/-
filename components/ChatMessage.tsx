
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

  /**
   * 视觉平衡算法 (Visual Balancing Algorithm):
   * 汉字维持在精致的 14-16px (sm-base)，对标解析助手。
   * 藏字下调至 24-36px (2xl-4xl)，这是经过对比后，藏文叠加符与汉字重心最和谐的比例。
   */
  const formatTextSegments = (text: string) => {
    // 藏文字符范围正则表达式
    const tibetanRegex = /([\u0F00-\u0FFF\s་]+)/g;
    
    return text.split(tibetanRegex).map((segment, i) => {
      if (tibetanRegex.test(segment)) {
        // 藏文：适度缩小，保持清晰且不突兀
        return (
          <span key={i} className="text-2xl md:text-4xl font-tibetan leading-[1.5] inline-block align-middle py-1 px-1 text-himalaya-dark font-medium">
            {segment}
          </span>
        );
      } else {
        // 汉文/拉丁文：保持精致，确保与“代码助手”解析窗视觉一致
        return (
          <span key={i} className="text-sm md:text-base font-sans leading-relaxed text-gray-600 align-middle inline-block">
            {segment}
          </span>
        );
      }
    });
  };

  const renderContent = (content: string) => {
    const applyHighlighting = (text: string) => {
      if (!highlightQuery || highlightQuery.length < 2) return formatTextSegments(text);
      try {
        const regex = new RegExp(`(${highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.split(regex).map((segment, i) => regex.test(segment) ? (
          <span key={i} className="bg-himalaya-gold/20 border-b-2 border-himalaya-gold/40 rounded-sm px-0.5">
            {formatTextSegments(segment)}
          </span>
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
        <span key={match.index} className={`inline-block px-4 py-2 mx-1 rounded-3xl border ${bgColor} ${borderColor} transition-all hover:shadow-sm`}>
          <span className="opacity-40 mr-2 text-[8px] font-bold uppercase tracking-tighter align-middle block mb-1">{label}</span>
          <span className="align-middle block">{applyHighlighting(text)}</span>
        </span>
      );
      lastIndex = markRegex.lastIndex;
    }
    if (lastIndex < mainText.length) parts.push(applyHighlighting(mainText.substring(lastIndex)));

    return (
      <div className="space-y-8">
        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
          {parts.length > 0 ? parts : applyHighlighting(mainText)}
        </div>
        
        {message.groundingChunks && message.groundingChunks.length > 0 && (
          <div className="mt-16 pt-10 border-t border-gray-100 w-full">
            <div className="flex items-center gap-4 mb-8 text-[10px] font-bold text-himalaya-gold uppercase tracking-[0.4em] opacity-60">
              <ExternalLink size={14} /> 史诗文献索引 (Master Sources)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {message.groundingChunks.map((chunk, idx) => chunk.web && (
                <a key={idx} href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-5 bg-gray-50/50 hover:bg-white hover:shadow-lg border border-gray-100 rounded-2xl transition-all group/link">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-himalaya-gold group-hover/link:bg-himalaya-gold group-hover/link:text-white transition-all font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800 truncate mb-0.5">{chunk.web.title}</div>
                    <div className="text-[9px] text-gray-400 truncate font-sans tracking-tight opacity-50">{chunk.web.uri}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {metaText && <div className="mt-10 pt-6 border-t border-gray-100 text-[10px] text-gray-400 font-sans italic opacity-40 tracking-widest">{metaText}</div>}
      </div>
    );
  };

  return (
    <article 
      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-20 group animate-in fade-in slide-in-from-bottom-2`} 
      data-analyzable="chat"
    >
      <div className={`flex items-start gap-10 w-full ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border-2 transition-transform group-hover:scale-105 ${isUser ? 'bg-himalaya-gold border-himalaya-red/10' : 'bg-himalaya-red border-himalaya-gold'}`}>
          {isUser ? <User className="text-himalaya-red w-8 h-8" /> : <Bot className="text-himalaya-gold w-8 h-8" />}
        </div>
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div className={`relative p-10 md:p-14 rounded-[3.5rem] shadow-[0_15px_40px_-15px_rgba(0,0,0,0.1)] border transition-all ${isUser ? 'bg-himalaya-gold text-himalaya-dark rounded-tr-none border-himalaya-red/5' : 'bg-white text-himalaya-dark rounded-tl-none border-gray-100'}`}>
            <div className="flex justify-between items-center gap-6 mb-10">
              <span className={`text-[9px] font-bold uppercase tracking-[0.5em] opacity-30 ${isUser ? 'text-himalaya-dark' : 'text-himalaya-red'}`}>
                {isUser ? '作者手稿' : '文坛宗师'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="p-2 hover:bg-black/5 rounded-xl transition-colors" title="复制文字">{copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="opacity-20" />}</button>
                <button onClick={() => onTogglePin?.(message.id)} className={`p-2 hover:bg-black/5 rounded-xl transition-colors ${isPinned ? 'text-himalaya-gold' : ''}`} title={isPinned ? "取消置顶" : "置顶消息"}>{isPinned ? <PinOff size={16} /> : <Pin size={16} className="opacity-20" />}</button>
                {onDelete && message.id !== 'welcome' && <button onClick={() => onDelete(message.id)} className="p-2 hover:bg-himalaya-red/10 text-himalaya-red rounded-xl transition-colors" title="删除消息"><Trash2 size={16} className="opacity-20" /></button>}
              </div>
            </div>
            <div className="select-text cursor-text">
              {renderContent(message.text)}
            </div>
          </div>
          <div className={`flex items-center gap-4 px-8 text-[9px] font-bold text-gray-400 uppercase tracking-widest opacity-60 ${isUser ? 'justify-end' : 'justify-start'}`}>
             <Clock size={10} /> <time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
             {message.isStreaming && <div className="text-himalaya-red animate-pulse">宗师泼墨中...</div>}
          </div>
        </div>
      </div>
    </article>
  );
};

export default ChatMessage;
