
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types';
import { Bot, User, Hash, Copy, Check, Clock, Pencil, X, Save, CornerDownLeft, ExternalLink, Library } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onEditSubmit?: (text: string, id: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  disabled?: boolean;
  highlightQuery?: string;
}

const EMOJI_OPTIONS = ['👍', '❤️', '🤔', '🙏', '🔥'];

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onEditSubmit, onReaction, disabled, highlightQuery }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  
  const isUser = message.role === 'user';
  const charCount = message.text.length;

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      const textarea = editInputRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [editText, isEditing]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editInputRef.current.value.length, editInputRef.current.value.length);
    }
  }, [isEditing]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const isThinking = !isUser && message.isStreaming && message.text === '';
  const hasReactions = message.reactions && Object.values(message.reactions).some(count => (count as number) > 0);

  // Highlighting logic
  const renderHighlightedText = (text: string, query: string = '') => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return text;

    // Escape regex special characters and create tokens
    const tokens = trimmedQuery.split(/\s+/).filter(t => t.length > 0);
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');

    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <span 
              key={i} 
              className="bg-himalaya-gold/40 border-b border-himalaya-gold rounded-sm transition-colors duration-200"
            >
              {part}
            </span>
          ) : part
        )}
      </>
    );
  };

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex max-w-[85%] md:max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md border-2
          ${isUser 
            ? 'bg-himalaya-slate text-white border-gray-600' 
            : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold'}
        `}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>

        <div className="flex flex-col relative w-full">
          <div className={`
            relative flex flex-col px-5 py-3 rounded-2xl shadow-sm text-base md:text-lg leading-relaxed min-w-[120px]
            ${isUser 
              ? 'bg-white text-himalaya-dark rounded-tr-none border border-gray-200' 
              : 'bg-himalaya-red/10 text-himalaya-dark rounded-tl-none border border-himalaya-red/20'}
          `}>
            {!isEditing && (
              <div className={`
                absolute top-2 flex gap-1 transition-all duration-200 opacity-0 group-hover:opacity-100
                ${isUser ? 'left-2 flex-row' : 'right-2 flex-row-reverse'}
              `}>
                {!isThinking && (
                  <button
                    onClick={handleCopy}
                    className={`p-1.5 rounded-md hover:bg-gray-100/50 ${isUser ? 'text-gray-400 hover:text-himalaya-red' : 'text-himalaya-red/40 hover:text-himalaya-red'}`}
                  >
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                )}
                {isUser && onEditSubmit && !disabled && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 rounded-md hover:bg-gray-100/50 text-gray-400 hover:text-himalaya-red"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}

            {isThinking ? (
              <div className="flex items-center gap-1.5 h-6 py-1">
                <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot"></div>
                <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot delay-200"></div>
                <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot delay-400"></div>
              </div>
            ) : isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={editInputRef}
                  className="w-full bg-himalaya-cream/30 border border-himalaya-gold/30 rounded-lg p-2 text-base md:text-lg resize-none focus:outline-none"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onEditSubmit?.(editText, message.id);
                      setIsEditing(false);
                    }
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsEditing(false)} className="text-xs text-gray-400">Cancel</button>
                  <button onClick={() => { onEditSubmit?.(editText, message.id); setIsEditing(false); }} className="text-xs text-himalaya-red font-bold">Save</button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap break-words pr-4">
                  {renderHighlightedText(message.text, highlightQuery)}
                </p>
                {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-himalaya-red animate-pulse"></span>}
              </>
            )}

            {!isEditing && !isThinking && (
              <div className={`mt-3 flex items-center gap-1 text-[10px] opacity-75 font-sans ${isUser ? 'justify-end' : 'justify-start'}`}>
                 <Hash size={10} />
                 <span>{charCount} ཡིག་འབྲུ།</span>
              </div>
            )}
          </div>

          {/* Sources Section */}
          {!isEditing && message.groundingChunks && message.groundingChunks.length > 0 && (
            <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-2 text-himalaya-gold font-bold text-xs px-1">
                <Library size={14} />
                <span>ཁུངས་སྣེ། (Sources & Related Information)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {message.groundingChunks.map((chunk, idx) => chunk.web && (
                  <a
                    key={idx}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 p-2 bg-white/60 border border-himalaya-gold/20 rounded-xl hover:border-himalaya-red/50 hover:bg-white transition-all group"
                  >
                    <div className="p-1.5 bg-himalaya-cream rounded-lg text-himalaya-red group-hover:bg-himalaya-red group-hover:text-himalaya-cream transition-colors">
                      <ExternalLink size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-himalaya-dark truncate mb-0.5">
                        {chunk.web.title}
                      </p>
                      <p className="text-[9px] text-gray-400 truncate font-sans">
                        {new URL(chunk.web.uri).hostname}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {hasReactions && !isThinking && !isEditing && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(message.reactions || {}).map(([emoji, count]) => (
                (count as number) > 0 && (
                  <button key={emoji} className="flex items-center gap-1 bg-white/80 border border-himalaya-gold/30 rounded-full px-1.5 py-0.5 text-xs shadow-sm" onClick={() => onReaction?.(message.id, emoji)}>
                    <span>{emoji}</span>
                    <span className="font-sans font-bold text-[10px] text-himalaya-slate">{count}</span>
                  </button>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
