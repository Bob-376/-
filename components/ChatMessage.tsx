
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types';
import { Bot, User, Hash, Copy, Check, Clock, Pencil, X, Save, CornerDownLeft, ExternalLink, Library, History, Pin, PinOff, Languages, ChevronRight, Info } from 'lucide-react';

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

const TRANSLATION_OPTIONS = [
  { id: 'Tibetan', label: 'བོད་ཡིག', sub: '藏语' },
  { id: 'Chinese', label: '中文', sub: '中文' },
  { id: 'English', label: 'English', sub: '英语' }
];

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onEditSubmit, onReaction, onTogglePin, onTranslate, disabled, highlightQuery, isPinned }) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [historyNavIndex, setHistoryNavIndex] = useState<number | null>(null);
  const [initialEditText, setInitialEditText] = useState(message.text);
  const [sourceCopiedIdx, setSourceCopiedIdx] = useState<number | null>(null);
  
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const translateMenuRef = useRef<HTMLDivElement>(null);
  
  const isUser = message.role === 'user';
  const charCount = message.text.length;
  const hasHistory = message.history && message.history.length > 0;

  // Auto-resize logic for the edit textarea
  const adjustTextareaHeight = () => {
    if (editInputRef.current) {
      const textarea = editInputRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 250)}px`;
    }
  };

  useEffect(() => {
    if (isEditing) {
      adjustTextareaHeight();
    }
  }, [editText, isEditing]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      // Position cursor at end of text
      editInputRef.current.setSelectionRange(editInputRef.current.value.length, editInputRef.current.value.length);
      adjustTextareaHeight();
    }
  }, [isEditing]);

  // Handle clicking outside menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
      if (translateMenuRef.current && !translateMenuRef.current.contains(event.target as Node)) {
        setShowTranslateMenu(false);
      }
    };
    if (showHistory || showTranslateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory, showTranslateMenu]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleCopySource = async (e: React.MouseEvent, uri: string, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(uri);
      setSourceCopiedIdx(idx);
      setTimeout(() => setSourceCopiedIdx(null), 2000);
    } catch (err) {
      console.error('Failed to copy source URI: ', err);
    }
  };

  const handleEditStart = () => {
    setEditText(message.text);
    setInitialEditText(message.text);
    setHistoryNavIndex(null);
    setIsEditing(true);
  };

  const navigateHistory = (direction: 'up' | 'down') => {
    if (!message.history || message.history.length === 0) return;

    // History is [oldest, ..., most_recent]
    const historyPool = [...message.history];
    let nextIndex: number | null = historyNavIndex;

    if (direction === 'up') {
      // Go back in time (towards index 0)
      if (nextIndex === null) {
        nextIndex = historyPool.length - 1;
      } else if (nextIndex > 0) {
        nextIndex -= 1;
      }
    } else {
      // Go forward in time (towards current text)
      if (nextIndex === null) return;
      if (nextIndex < historyPool.length - 1) {
        nextIndex += 1;
      } else {
        nextIndex = null; // Back to initial
      }
    }

    setHistoryNavIndex(nextIndex);
    setEditText(nextIndex === null ? initialEditText : historyPool[nextIndex]);
  };

  const isThinking = !isUser && message.isStreaming && message.text === '';
  const hasReactions = message.reactions && Object.values(message.reactions).some(count => (count as number) > 0);

  // Highlighting logic
  const renderHighlightedText = (text: string, query: string = '') => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return text;

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
              className="bg-himalaya-gold/40 border-b-2 border-himalaya-gold rounded-sm animate-highlight-pulse px-0.5"
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
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md border-2 relative
          ${isUser 
            ? 'bg-himalaya-slate text-white border-gray-600' 
            : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold'}
        `}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
          {isPinned && (
            <div className="absolute -top-1 -right-1 bg-himalaya-gold text-himalaya-red rounded-full p-0.5 shadow-sm border border-white">
              <Pin size={8} fill="currentColor" />
            </div>
          )}
        </div>

        <div className="flex flex-col relative w-full">
          <div className={`
            relative flex flex-col px-5 py-3 rounded-2xl shadow-sm text-base md:text-lg leading-relaxed min-w-[120px] transition-colors duration-300
            ${isUser 
              ? 'bg-white text-himalaya-dark rounded-tr-none border border-gray-200' 
              : 'bg-himalaya-red/10 text-himalaya-dark rounded-tl-none border border-himalaya-red/20'}
            ${isPinned ? 'border-himalaya-gold ring-1 ring-himalaya-gold/20 shadow-himalaya-gold/10' : ''}
            ${isEditing ? 'p-1' : ''}
          `}>
            {!isEditing && (
              <div className={`
                absolute top-2 flex gap-1 transition-all duration-200 opacity-0 group-hover:opacity-100 z-10
                ${isUser ? 'left-2 flex-row' : 'right-2 flex-row-reverse'}
              `}>
                {!isThinking && (
                  <button
                    onClick={handleCopy}
                    className={`p-1.5 rounded-md hover:bg-gray-100/50 ${isUser ? 'text-gray-400 hover:text-himalaya-red' : 'text-himalaya-red/40 hover:text-himalaya-red'}`}
                    title="Copy Text (复制文字)"
                  >
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                )}
                
                {!isThinking && onTogglePin && (
                  <button
                    onClick={() => onTogglePin(message.id)}
                    className={`p-1.5 rounded-md hover:bg-gray-100/50 ${isPinned ? 'text-himalaya-gold' : isUser ? 'text-gray-400 hover:text-himalaya-gold' : 'text-himalaya-red/40 hover:text-himalaya-gold'}`}
                    title={isPinned ? "Unpin (取消固定)" : "Pin (固定消息)"}
                  >
                    {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                )}

                {!isThinking && onTranslate && (
                  <div className="relative" ref={translateMenuRef}>
                    <button
                      onClick={() => setShowTranslateMenu(!showTranslateMenu)}
                      className={`p-1.5 rounded-md hover:bg-gray-100/50 ${isUser ? 'text-gray-400 hover:text-himalaya-red' : 'text-himalaya-red/40 hover:text-himalaya-red'}`}
                      title="Translate (翻译)"
                    >
                      <Languages size={14} />
                    </button>
                    {showTranslateMenu && (
                      <div className={`absolute top-full mt-1 w-32 bg-white border border-gray-200 rounded-xl shadow-xl z-20 p-1 animate-in fade-in zoom-in-95 duration-200 ${isUser ? 'left-0' : 'right-0'}`}>
                        {TRANSLATION_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => {
                              onTranslate(message.text, opt.id);
                              setShowTranslateMenu(false);
                            }}
                            className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-himalaya-slate hover:bg-himalaya-cream rounded-lg transition-colors text-left"
                          >
                            <div className="flex flex-col">
                              <span className={opt.id === 'Tibetan' ? 'font-tibetan' : ''}>{opt.label}</span>
                              <span className="text-[8px] opacity-40 uppercase tracking-tighter">{opt.sub}</span>
                            </div>
                            <ChevronRight size={10} className="opacity-20" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isUser && hasHistory && (
                  <div className="relative" ref={historyRef}>
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="p-1.5 rounded-md hover:bg-gray-100/50 text-gray-400 hover:text-himalaya-red"
                      title="Edit History (编辑历史)"
                    >
                      <History size={14} />
                    </button>
                    {showHistory && (
                      <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-30 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-100 mb-1">
                          <History size={12} className="text-himalaya-red" />
                          <span className="text-[10px] font-bold uppercase text-himalaya-slate tracking-tighter">སྔོན་གྱི་ཡིག་རིགས། (历史版本 / History)</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2 p-1">
                          {message.history?.slice().reverse().map((version, i) => (
                            <div key={i} className="p-2 bg-himalaya-cream/30 rounded-lg border border-himalaya-gold/10 text-xs text-himalaya-slate/80 italic">
                              {version}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isUser && onEditSubmit && !disabled && (
                  <button
                    onClick={handleEditStart}
                    className="p-1.5 rounded-md hover:bg-gray-100/50 text-gray-400 hover:text-himalaya-red"
                    title="Edit (编辑)"
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
              <div className="flex flex-col gap-2 p-1">
                <div className="relative">
                  <textarea
                    ref={editInputRef}
                    className="w-full bg-himalaya-cream/50 border-2 border-gray-300 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red rounded-xl p-3 text-base md:text-lg resize-none shadow-inner transition-all duration-200 min-h-[50px]"
                    placeholder="བཅོས་སྒྲིག་བྱེད་བཞིན་པ། (正在编辑... / Editing...)"
                    value={editText}
                    onChange={(e) => {
                      setEditText(e.target.value);
                      setHistoryNavIndex(null); // Reset navigation if user starts manual typing
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onEditSubmit?.(editText, message.id);
                        setIsEditing(false);
                      } else if (e.key === 'Escape') {
                        setIsEditing(false);
                      } else if (e.ctrlKey && e.key === 'ArrowUp') {
                        e.preventDefault();
                        navigateHistory('up');
                      } else if (e.ctrlKey && e.key === 'ArrowDown') {
                        e.preventDefault();
                        navigateHistory('down');
                      }
                    }}
                    rows={1}
                  />
                  {historyNavIndex !== null && (
                    <div className="absolute top-1 right-3 flex items-center gap-1 bg-himalaya-gold/20 text-[9px] font-bold text-himalaya-gold px-2 py-0.5 rounded-full border border-himalaya-gold/30 pointer-events-none animate-in fade-in duration-200">
                      <History size={10} />
                      版本 {historyNavIndex + 1}/{message.history?.length}
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center px-1">
                  <div className="text-[9px] text-himalaya-slate/40 font-bold uppercase tracking-widest flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <kbd className="bg-gray-100 px-1 rounded border">Enter</kbd> 保存 (Save)
                      <span className="mx-1 text-gray-200">|</span>
                      <kbd className="bg-gray-100 px-1 rounded border">Shift+Enter</kbd> 换行 (New Line)
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button 
                      onClick={() => setIsEditing(false)} 
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-himalaya-slate hover:text-himalaya-red transition-colors"
                    >
                      <X size={14} /> ཕྱིར་འཐེན། (取消 / Cancel)
                    </button>
                    <button 
                      onClick={() => { onEditSubmit?.(editText, message.id); setIsEditing(false); }} 
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-himalaya-red text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-red-900 transition-all shadow-sm"
                    >
                      <Save size={14} /> ཉར་ཚགས། (保存 / Save)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="whitespace-pre-wrap break-words pr-4">
                  {renderHighlightedText(message.text, highlightQuery)}
                </div>
                {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-himalaya-red animate-pulse"></span>}
              </>
            )}

            {!isEditing && !isThinking && (
              <div className={`mt-3 flex items-center gap-2 text-[10px] opacity-75 font-sans ${isUser ? 'justify-end' : 'justify-start'}`}>
                 {hasHistory && <span className="flex items-center gap-0.5 text-himalaya-red font-bold"><History size={10} /> བཅོས་ཟིན། (已编辑 / Edited)</span>}
                 {isPinned && <span className="flex items-center gap-0.5 text-himalaya-gold font-bold"><Pin size={10} fill="currentColor" /> བརྟན་པོ། (已固定 / Pinned)</span>}
                 <div className="flex items-center gap-1">
                   <Hash size={10} />
                   <span>{charCount} 字符 (Chars)</span>
                 </div>
              </div>
            )}
          </div>

          {/* Sources Section */}
          {!isEditing && message.groundingChunks && message.groundingChunks.length > 0 && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-himalaya-gold font-bold text-xs">
                  <Library size={14} />
                  <span>ཁུངས་སྣེ། (资料来源 / Sources)</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] text-gray-400 font-bold uppercase tracking-tighter">
                  <Info size={10} />
                  <span>对应正文标注</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {message.groundingChunks.map((chunk, idx) => chunk.web && (
                  <a
                    key={idx}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 bg-white/60 border border-himalaya-gold/20 rounded-xl hover:border-himalaya-red/50 hover:bg-white transition-all group relative overflow-hidden"
                  >
                    <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-lg bg-himalaya-gold/10 text-himalaya-gold text-[10px] font-bold border border-himalaya-gold/20 group-hover:bg-himalaya-red group-hover:text-white transition-colors">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <p className="text-[11px] font-bold text-himalaya-dark truncate">
                          {chunk.web.title}
                        </p>
                        <button
                          onClick={(e) => handleCopySource(e, chunk.web?.uri || '', idx)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-himalaya-red transition-colors rounded-md hover:bg-gray-100/50"
                          title="Copy Source URI"
                        >
                          {sourceCopiedIdx === idx ? <Check size={10} className="text-green-600" /> : <Copy size={10} />}
                        </button>
                      </div>
                      <div className="relative group/source">
                        <p className="text-[9px] text-gray-400 truncate font-sans cursor-help flex items-center gap-1">
                          <ExternalLink size={8} />
                          {new URL(chunk.web.uri).hostname}
                        </p>
                        {/* Tooltip */}
                        <div className="absolute left-0 bottom-full mb-1 opacity-0 group-hover/source:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                          <div className="bg-himalaya-dark text-himalaya-cream text-[8px] font-sans py-1 px-2 rounded shadow-lg border border-himalaya-gold/30 whitespace-nowrap overflow-hidden max-w-xs truncate">
                            {chunk.web.uri}
                          </div>
                        </div>
                      </div>
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
