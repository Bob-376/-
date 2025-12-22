
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, Sparkles, AlertCircle, X, Search, Filter, ExternalLink, 
  HelpCircle, ChevronUp, ChevronDown, ArrowDown, Languages, FileEdit, 
  Maximize, Wand2, Briefcase, ChevronRight, Globe, ImagePlus, Loader2, Scan, Check, Paperclip,
  Calendar, User as UserIcon, Bot, Bookmark, Trash2, Pin, RotateCcw, Command, Terminal, Moon, Sun, PlusCircle, AlignLeft, ArrowRight, History as HistoryIcon
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageStream, resetChat, extractTextFromImage } from './services/geminiService';

const TRANSLATION_LANGS = [
  { id: 'Tibetan', label: 'བོད་ཡིག', sub: '藏语 / Tibetan' },
  { id: 'Chinese', label: '中文', sub: '中文 / Chinese' },
  { id: 'English', label: 'English', sub: '英语 / English' }
];

const STORAGE_KEY_PINNED = 'himalaya_pinned_messages_v1';
const STORAGE_KEY_THEME = 'himalaya_theme_v1';
const STORAGE_KEY_SEARCHES = 'himalaya_recent_searches_v1';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།\n(扎西德勒！这是西藏文献检索系统。我能为您做些什么？ / Tashi Delek! This is the Tibetan Document Retrieval System. How can I help you?)',
      isStreaming: false,
      timestamp: Date.now(),
      reactions: {}
    },
  ]);
  
  // Storage states
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PINNED);
    return saved ? JSON.parse(saved) : [];
  });

  const [theme, setTheme] = useState<'himalayan' | 'dark'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_THEME);
    return (saved as 'himalayan' | 'dark') || 'himalayan';
  });

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SEARCHES);
    return saved ? JSON.parse(saved) : [];
  });

  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFuzzySearch, setIsFuzzySearch] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [senderFilter, setSenderFilter] = useState<'all' | 'user' | 'model'>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Image/OCR State
  const [pendingImage, setPendingImage] = useState<{data: string, mime: string} | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [ocrCompleted, setOcrCompleted] = useState(false);
  
  // UI State
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [activeTranslateLang, setActiveTranslateLang] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Sync states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify(pinnedMessages));
  }, [pinnedMessages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SEARCHES, JSON.stringify(recentSearches));
  }, [recentSearches]);

  // Handle Search History logic
  useEffect(() => {
    if (!searchQuery.trim()) return;
    
    const handler = setTimeout(() => {
      const q = searchQuery.trim();
      setRecentSearches(prev => {
        const filtered = prev.filter(s => s !== q);
        return [q, ...filtered].slice(0, 5);
      });
    }, 1000);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (showCommandPalette) {
      setCommandQuery('');
      setCommandIndex(0);
      setTimeout(() => commandInputRef.current?.focus(), 50);
    }
  }, [showCommandPalette]);

  const scrollToBottom = (force = false) => {
    const container = mainContentRef.current;
    if (!container) return;

    const isFiltering = !!(searchQuery || selectedSource || senderFilter !== 'all' || dateRange.start || dateRange.end || showPinnedPanel);
    
    const threshold = 150;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;

    if (force || (!isFiltering && nearBottom)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    const container = mainContentRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 500);
  };

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserTurnStart = lastMessage?.role === 'user';
    scrollToBottom(isUserTurnStart);
  }, [messages, searchQuery, selectedSource, senderFilter, dateRange]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, isFuzzySearch, selectedSource, senderFilter, dateRange]);

  useEffect(() => {
    if (isSearchActive) {
      searchInputRef.current?.focus();
    } else {
      resetFilters();
    }
  }, [isSearchActive]);

  const resetFilters = () => {
    setSelectedSource(null);
    setSenderFilter('all');
    setDateRange({ start: '', end: '' });
    setSearchQuery('');
    setShowAdvancedFilters(false);
  };

  const handleReset = () => {
    resetChat();
    setError(null);
    resetFilters();
    setIsSearchActive(false);
    setPendingImage(null);
    setOcrCompleted(false);
    setActiveTranslateLang(null);
    setMessages([
      {
        id: Date.now().toString(),
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག་ཡིན། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།\n(扎西德勒！这是西藏文献检索系统。我能为您做些什么？)',
        isStreaming: false,
        timestamp: Date.now(),
        reactions: {}
      },
    ]);
  };

  const setQuickDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDateRange({
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    });
  };

  const commands = useMemo(() => [
    { id: 'new-chat', label: 'New Chat', sub: 'གསར་དུ་འགོ་འཛུགས། (开始新对话)', icon: PlusCircle, action: handleReset },
    { id: 'clear-history', label: 'Clear History', sub: 'ཡིག་རིགས་སུབ་པ། (清空历史)', icon: Trash2, action: handleReset },
    { id: 'toggle-filters', label: 'Toggle Filters', sub: 'འཚོལ་བཤེར་ལག་ཆ། (切换筛选器)', icon: Filter, action: () => setIsSearchActive(!isSearchActive) },
    { id: 'switch-theme', label: `Switch to ${theme === 'himalayan' ? 'Dark' : 'Himalayan'} Theme`, sub: 'བརྗོད་གཞི་བརྗེ་བ། (切换主题)', icon: theme === 'himalayan' ? Moon : Sun, action: () => setTheme(theme === 'himalayan' ? 'dark' : 'himalayan') },
    { id: 'pinned', label: 'Open Pinned Library', sub: 'བརྟན་པོའི་ཡིག་རིགས། (查看收藏)', icon: Bookmark, action: () => setShowPinnedPanel(true) },
    { id: 'ocr', label: 'Identify Text from Image', sub: 'པར་རིས་ངོས་འཛིན། (识图识别)', icon: Scan, action: () => fileInputRef.current?.click() },
  ], [theme, isSearchActive]);

  const filteredCommands = useMemo(() => {
    const q = commandQuery.toLowerCase();
    return commands.filter(c => 
      c.label.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)
    );
  }, [commandQuery, commands]);

  const executeCommand = (cmd: typeof commands[0]) => {
    cmd.action();
    setShowCommandPalette(false);
  };

  useEffect(() => {
    const translateMatch = inputText.match(/Please translate the following text into (Tibetan|Chinese|English)\./);
    if (translateMatch) {
      setActiveTranslateLang(translateMatch[1]);
    } else if (inputText.trim() === '') {
      setActiveTranslateLang(null);
    }
  }, [inputText]);

  const handleSendMessage = async (textOverride?: string) => {
    const userText = (textOverride || inputText).trim();
    if (!userText || isLoading) return;

    if (!textOverride) setInputText('');
    setSearchQuery(''); 
    setSelectedSource(null);
    setIsSearchActive(false);
    setActiveTranslateLang(null);
    setPendingImage(null);
    setOcrCompleted(false);
    setError(null); 
    
    if (!textOverride) {
      const userMsgId = Date.now().toString();
      const newUserMsg: Message = { id: userMsgId, role: 'user', text: userText, timestamp: Date.now(), reactions: {} };
      setMessages((prev) => [...prev, newUserMsg]);
      setTimeout(() => scrollToBottom(true), 10);
    }
    
    setIsLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: botMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now(), reactions: {} },
    ]);

    try {
      await sendMessageStream(userText, (updatedText, groundingChunks) => {
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === botMsgId 
              ? { ...msg, text: updatedText, groundingChunks: groundingChunks || msg.groundingChunks } 
              : msg
          )
        );
      });
      setMessages((prev) => prev.map((msg) => msg.id === botMsgId ? { ...msg, isStreaming: false } : msg));
    } catch (err: any) {
      console.error(err);
      setError("དགོངས་དག ནོར་འཁྲུལ་ཞིག་བྱུང་སོང་། (抱歉，发生了一些错误。)");
      setMessages((prev) => prev.filter(msg => msg.id !== botMsgId || msg.text !== ''));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleTranslateMessage = (text: string, targetLang: string) => {
    const prompt = `Please translate the following message into ${targetLang}. Focus on capturing the precise semantic meaning and maintaining the original tone: \n\n${text}`;
    handleSendMessage(prompt);
  };

  const applyProjectTool = (type: 'polish' | 'expand' | 'correct' | 'translate', option?: string) => {
    let currentContent = inputText;
    let prefix = "";
    const translationRegex = /^Please translate the following text into (Tibetan|Chinese|English)\. Focus on capturing the precise semantic meaning: \n\n/;
    const isAlreadyTranslation = translationRegex.test(currentContent);

    if (type === 'translate' && isAlreadyTranslation) {
      prefix = `Please translate the following text into ${option || 'Tibetan'}. Focus on capturing the precise semantic meaning: \n\n`;
      setInputText(currentContent.replace(translationRegex, prefix));
      setActiveTranslateLang(option || 'Tibetan');
      setShowTranslateMenu(false);
      return;
    }

    switch (type) {
      case 'polish': prefix = "Please polish and refine the following text to make it more scholarly, elegant, and professional. Ensure the cultural nuances remain intact: "; break;
      case 'expand': prefix = "Please expand the following content by adding more relevant details, explanations, and depth while maintaining the original tone: "; break;
      case 'correct': prefix = "Please correct any grammar, spelling, or punctuation errors in the following text. Do not change the meaning: "; break;
      case 'translate': prefix = `Please translate the following text into ${option || 'Tibetan'}. Focus on capturing the precise semantic meaning: `; setActiveTranslateLang(option || 'Tibetan'); break;
    }
    const cleanedContent = currentContent.replace(/^(Please polish|Please expand|Please correct|Please translate).*\n\n/, '');
    setInputText(`${prefix}\n\n${cleanedContent || '[Paste text here]'}`);
    setShowEditMenu(false);
    setShowTranslateMenu(false);
    inputRef.current?.focus();
  };

  const handleEditSubmit = (text: string, id: string) => {
    if (isLoading) return;
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;
    const truncated = messages.slice(0, msgIndex);
    const existingMsg = messages[msgIndex];
    setMessages([...truncated, { ...existingMsg, text, history: [...(existingMsg.history || []), existingMsg.text], timestamp: Date.now() }]);
    handleSendMessage(text);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, reactions: { ...(msg.reactions || {}), [emoji]: ((msg.reactions?.[emoji] || 0) + 1) } } : msg));
  };

  const togglePinMessage = (messageId: string) => {
    const isAlreadyPinned = pinnedMessages.some(m => m.id === messageId);
    if (isAlreadyPinned) {
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
    } else {
      const msgToPin = messages.find(m => m.id === messageId);
      if (msgToPin) setPinnedMessages(prev => [...prev, { ...msgToPin, isPinned: true }]);
    }
  };

  const removePinnedMessage = (messageId: string) => {
    setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const mime = file.type;
      setPendingImage({ data: base64Data, mime });
      setOcrCompleted(false);
      e.target.value = '';
      setIsImageProcessing(true);
      setError(null);
      try {
        const extractedText = await extractTextFromImage(base64Data, mime);
        if (extractedText.trim()) {
          setInputText(prev => prev.trim() ? `${prev}\n\n${extractedText}` : extractedText);
          setOcrCompleted(true);
        } else {
          setError("པར་རིས་ལས་ཡིག་རིགས་རྙེད་མ་སོང་། (图片中未发现文字 / No text found in image)");
          setPendingImage(null);
        }
      } catch (err: any) {
        console.error(err);
        setError("པར་རིས་ངོས་འཛིན་བྱེད་སྐབས་ནོར་འཁྲུལ་བྱུང་སོང་། (处理图片时出错 / Error processing image)");
        setPendingImage(null);
      } finally {
        setIsImageProcessing(false);
        inputRef.current?.focus();
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const startMs = dateRange.start ? new Date(dateRange.start).getTime() : 0;
    const endMs = dateRange.end ? new Date(dateRange.end).getTime() + 86400000 : Infinity; 
    return messages.filter((msg) => {
      let isMatch = true;
      if (query) {
        const text = msg.text.toLowerCase();
        isMatch = isFuzzySearch ? query.split(/\s+/).every(token => text.includes(token)) : text.includes(query);
      }
      if (isMatch && senderFilter !== 'all') isMatch = msg.role === senderFilter;
      if (isMatch) isMatch = msg.timestamp >= startMs && msg.timestamp <= endMs;
      if (isMatch && selectedSource) isMatch = msg.groundingChunks?.some(chunk => chunk.web && new URL(chunk.web.uri).hostname === selectedSource) || false;
      return isMatch;
    });
  }, [messages, searchQuery, isFuzzySearch, selectedSource, senderFilter, dateRange]);

  const availableSources = useMemo(() => {
    const sourceSet = new Set<string>();
    messages.forEach(msg => msg.groundingChunks?.forEach(chunk => { if (chunk.web) sourceSet.add(new URL(chunk.web.uri).hostname); }));
    return Array.from(sourceSet).sort();
  }, [messages]);

  const navigateSearch = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next' ? Math.min(currentMatchIndex + 1, filteredMessages.length - 1) : Math.max(currentMatchIndex - 1, 0);
    setCurrentMatchIndex(newIndex);
    const targetId = filteredMessages[newIndex]?.id;
    if (targetId) document.getElementById(`msg-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearRecentSearches = () => setRecentSearches([]);
  const removeRecentSearch = (query: string) => setRecentSearches(prev => prev.filter(q => q !== query));

  const isAnyFilterActive = searchQuery || selectedSource || senderFilter !== 'all' || dateRange.start || dateRange.end;
  const themeClasses = theme === 'dark' ? "bg-slate-900 text-slate-100" : "bg-himalaya-cream text-himalaya-dark";

  return (
    <div className={`flex flex-col h-screen font-tibetan overflow-hidden transition-colors duration-300 ${themeClasses}`}>
      <Header onReset={handleReset} onTogglePins={() => setShowPinnedPanel(!showPinnedPanel)} pinCount={pinnedMessages.length} />

      {/* Command Palette */}
      {showCommandPalette && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCommandPalette(false)} />
          <div className={`w-full max-w-xl ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-himalaya-gold/30'} border shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col`}>
            <div className={`flex items-center gap-3 p-4 border-b ${theme === 'dark' ? 'border-slate-700' : 'border-gray-100'}`}>
              <Command size={18} className="text-himalaya-red" />
              <input
                ref={commandInputRef}
                type="text"
                className={`flex-1 bg-transparent outline-none text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-himalaya-dark'}`}
                placeholder="བརྡ་ཆད་འཚོལ་བཤེར། (搜索命令...)"
                value={commandQuery}
                onChange={(e) => { setCommandQuery(e.target.value); setCommandIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex(prev => (prev + 1) % filteredCommands.length); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length); }
                  else if (e.key === 'Enter' && filteredCommands[commandIndex]) { e.preventDefault(); executeCommand(filteredCommands[commandIndex]); }
                }}
              />
              <kbd className="hidden sm:inline-flex items-center gap-1 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-gray-400 font-sans border border-gray-200 dark:border-slate-600">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 scrollbar-hide">
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group ${idx === commandIndex ? (theme === 'dark' ? 'bg-slate-700' : 'bg-himalaya-cream') : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}`}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setCommandIndex(idx)}
                >
                  <div className={`p-2 rounded-lg ${idx === commandIndex ? 'bg-himalaya-red text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500'}`}><cmd.icon size={16} /></div>
                  <div className="flex-1 flex flex-col">
                    <span className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-himalaya-dark'}`}>{cmd.label}</span>
                    <span className="text-[10px] opacity-60 font-tibetan">{cmd.sub}</span>
                  </div>
                  <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 ${idx === commandIndex ? 'opacity-100 translate-x-1' : ''} transition-all`} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <main ref={mainContentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 md:p-6 pb-72 scroll-smooth">
          <div className="w-full max-w-3xl mx-auto">
            {error && (
              <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className={`${theme === 'dark' ? 'bg-red-900/20' : 'bg-red-50'} border-l-4 border-himalaya-red p-4 rounded-r-xl shadow-md flex items-start gap-4 relative`}>
                  <AlertCircle className="text-himalaya-red flex-shrink-0 mt-1" size={24} />
                  <div className="flex-1 pr-8">
                    <p className={`text-sm md:text-base font-medium leading-relaxed mb-3 ${theme === 'dark' ? 'text-red-200' : 'text-himalaya-red'}`}>{error}</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <button onClick={() => setInputText('')} className="text-xs font-bold uppercase underline">Clear Input</button>
                      <button onClick={() => setError(null)} className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all ${theme === 'dark' ? 'bg-red-900/40 text-red-100 hover:bg-himalaya-red' : 'text-himalaya-red bg-himalaya-red/10 hover:bg-himalaya-red hover:text-white'}`}>OK</button>
                    </div>
                  </div>
                  <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1 text-himalaya-red/50 hover:text-himalaya-red"><X size={18} /></button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-himalaya-slate/40">
                  <Sparkles className="w-12 h-12 mb-2 opacity-20" />
                  <p className="font-tibetan text-lg">{isAnyFilterActive ? 'འཚོལ་ཐབས་མ་རྙེད། (未找到结果)' : 'འགོ་འཛུགས་རོགས། (开始对话)'}</p>
                  {isAnyFilterActive && <button onClick={resetFilters} className="mt-4 text-xs font-bold text-himalaya-red hover:underline flex items-center gap-1"><RotateCcw size={12} /> འཚོལ་བཤེར་སྟོངས་པ། (重置筛选)</button>}
                </div>
              ) : (
                filteredMessages.map((msg, idx) => (
                  <div key={msg.id} id={`msg-${msg.id}`} className={`transition-all duration-500 rounded-2xl ${searchQuery && idx === currentMatchIndex ? (theme === 'dark' ? 'ring-2 ring-himalaya-gold/50 bg-slate-800 shadow-xl scale-[1.01]' : 'ring-2 ring-himalaya-red/30 ring-offset-4 ring-offset-himalaya-cream bg-himalaya-red/5 shadow-lg scale-[1.01]') : ''}`}>
                    <ChatMessage message={msg} onEditSubmit={handleEditSubmit} onReaction={handleReaction} onTogglePin={togglePinMessage} onTranslate={handleTranslateMessage} isPinned={pinnedMessages.some(pm => pm.id === msg.id)} disabled={isLoading} highlightQuery={searchQuery} />
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </main>

        {/* Pinned Side Panel */}
        {showPinnedPanel && (
          <aside className={`fixed inset-y-0 right-0 w-full md:w-80 border-l border-himalaya-gold/30 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-300 ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <div className="p-4 border-b border-himalaya-gold/20 flex items-center justify-between bg-himalaya-red text-himalaya-cream">
              <div className="flex items-center gap-2"><Bookmark className="w-5 h-5 text-himalaya-gold" /><h2 className="text-sm font-bold uppercase tracking-widest">收藏夹</h2></div>
              <button onClick={() => setShowPinnedPanel(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors"><X size={20} /></button>
            </div>
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${theme === 'dark' ? 'bg-slate-900/50' : 'bg-himalaya-cream/30'}`}>
              {pinnedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-himalaya-slate/30 text-center px-4">
                  <Pin className="w-10 h-10 mb-3 opacity-20" /><p className="text-xs font-bold font-tibetan">བརྟན་པོའི་ཡིག་རིགས་མི་འདུག།</p><p className="text-[10px] uppercase tracking-tighter mt-1">还没有收藏的消息</p>
                </div>
              ) : pinnedMessages.map(msg => (
                <div key={msg.id} className={`border rounded-xl p-3 shadow-sm hover:shadow-md transition-all group ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-himalaya-gold/20'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${msg.role === 'user' ? 'bg-himalaya-slate text-white' : 'bg-himalaya-red text-himalaya-gold'}`}>{msg.role === 'user' ? <UserIcon size={10} /> : <Bot size={10} />}</div>
                      <span className="text-[9px] font-bold opacity-50 font-sans">{new Date(msg.timestamp).toLocaleDateString()}</span>
                    </div>
                    <button onClick={() => removePinnedMessage(msg.id)} className="text-gray-300 hover:text-himalaya-red transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>
                  <p className={`text-xs leading-relaxed line-clamp-4 font-tibetan ${theme === 'dark' ? 'text-slate-200' : 'text-himalaya-dark'}`}>{msg.text}</p>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Tools & Input */}
      <div className={`fixed bottom-0 left-0 w-full backdrop-blur-md border-t border-himalaya-gold/30 p-4 shadow-2xl z-20 ${theme === 'dark' ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95'}`}>
        <div className="max-w-3xl mx-auto space-y-3 relative">
          
          {showScrollBottom && (
            <button onClick={() => scrollToBottom(true)} className={`absolute -top-16 right-0 p-3 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 animate-in fade-in zoom-in slide-in-from-bottom-4 z-30 ${theme === 'dark' ? 'bg-slate-700 text-himalaya-gold border border-slate-600' : 'bg-himalaya-red text-himalaya-cream'}`}><ArrowDown size={20} /></button>
          )}

          <div className="flex flex-wrap items-center gap-2 pb-1">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border mr-1 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-himalaya-red/5 border-himalaya-red/10'}`}>
              <Briefcase size={14} className="text-himalaya-red" /><span className={`text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap ${theme === 'dark' ? 'text-slate-300' : 'text-himalaya-red'}`}>项目工具</span>
            </div>
            
            <div className="relative">
              <button onClick={() => { setShowEditMenu(!showEditMenu); setShowTranslateMenu(false); setIsSearchActive(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${showEditMenu ? 'bg-himalaya-red text-white border-himalaya-red shadow-md' : (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-himalaya-gold' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red')}`}><Wand2 size={14} /> 文本处理<ChevronDown size={12} className={`transition-transform duration-200 ${showEditMenu ? 'rotate-180' : ''}`} /></button>
              {showEditMenu && (
                <div className={`absolute bottom-full mb-2 left-0 border rounded-xl shadow-xl p-2 w-56 flex flex-col gap-1 animate-in slide-in-from-bottom-2 duration-200 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-himalaya-gold/30'}`}>
                  <button onClick={() => applyProjectTool('polish')} className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg group ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-himalaya-cream text-himalaya-slate'}`}><div className="flex items-center gap-2"><Sparkles size={14} className="text-himalaya-gold" /><span>润色 (Polish)</span></div><ChevronRight size={10} className="opacity-0 group-hover:opacity-100" /></button>
                  <button onClick={() => applyProjectTool('correct')} className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg group ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-himalaya-cream text-himalaya-slate'}`}><div className="flex items-center gap-2"><FileEdit size={14} className="text-himalaya-red/60" /><span>修改 (Correct)</span></div><ChevronRight size={10} className="opacity-0 group-hover:opacity-100" /></button>
                  <button onClick={() => applyProjectTool('expand')} className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg group ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-himalaya-cream text-himalaya-slate'}`}><div className="flex items-center gap-2"><Maximize size={14} className="text-blue-500" /><span>扩写 (Expand)</span></div><ChevronRight size={10} className="opacity-0 group-hover:opacity-100" /></button>
                </div>
              )}
            </div>
            
            <div className="relative">
              <button onClick={() => { setShowTranslateMenu(!showTranslateMenu); setShowEditMenu(false); setIsSearchActive(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${showTranslateMenu || activeTranslateLang ? 'bg-himalaya-red text-white border-himalaya-red shadow-md' : (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-himalaya-gold' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red')}`}><Languages size={14} /> 翻译<ChevronDown size={12} className={`transition-transform duration-200 ${showTranslateMenu ? 'rotate-180' : ''}`} /></button>
              {showTranslateMenu && (
                <div className={`absolute bottom-full mb-2 left-0 border rounded-xl shadow-xl p-2 w-48 flex flex-col gap-1 animate-in slide-in-from-bottom-2 duration-200 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-himalaya-gold/30'}`}>
                  {TRANSLATION_LANGS.map(lang => (
                    <button key={lang.id} onClick={() => applyProjectTool('translate', lang.id)} className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${activeTranslateLang === lang.id ? 'text-himalaya-red font-bold' : (theme === 'dark' ? 'text-slate-300 hover:bg-slate-700' : 'text-himalaya-slate hover:bg-himalaya-cream')}`}><div className="flex flex-col text-left"><span className={lang.id === 'Tibetan' ? 'font-tibetan' : 'font-sans'}>{lang.label}</span><span className="text-[9px] opacity-60 uppercase tracking-tighter">{lang.sub}</span></div>{activeTranslateLang === lang.id && <Check size={12} />}</button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setIsSearchActive(!isSearchActive); setShowEditMenu(false); setShowTranslateMenu(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${isSearchActive ? 'bg-himalaya-gold text-white border-himalaya-gold shadow-md' : (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-himalaya-gold' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red')}`}><Search size={14} /> 搜索</button>
            <button onClick={() => { fileInputRef.current?.click(); setIsSearchActive(false); setShowEditMenu(false); setShowTranslateMenu(false); }} className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-himalaya-gold' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-gold hover:bg-himalaya-cream'}`}><ImagePlus size={14} className="text-himalaya-gold" /> 识图</button>
            <button onClick={() => setShowCommandPalette(true)} className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600' : 'bg-white border-himalaya-gold/30 text-gray-400 hover:bg-gray-50'}`}><Command size={14} /><span className="hidden sm:inline">Ctrl+K</span></button>
          </div>

          {isSearchActive && (
            <div className={`flex flex-col gap-2 p-3 border rounded-xl animate-in slide-in-from-bottom-2 duration-300 shadow-inner ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-himalaya-cream border-himalaya-gold/30'}`}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 group">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-himalaya-slate/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className={`w-full border focus:border-himalaya-gold rounded-lg py-1.5 pl-9 pr-8 text-xs outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-200 text-himalaya-dark'}`}
                    placeholder="搜索对话内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-himalaya-red"><X size={14} /></button>}
                </div>
                <div className="flex items-center gap-1">
                  {filteredMessages.length > 0 && (
                    <div className={`flex items-center border rounded-lg px-1 py-0.5 shadow-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}>
                      <span className={`text-[10px] font-bold px-2 border-r ${theme === 'dark' ? 'text-slate-300 border-slate-600' : 'text-himalaya-slate border-gray-100'}`}>{currentMatchIndex + 1}/{filteredMessages.length}</span>
                      <button onClick={() => navigateSearch('prev')} disabled={currentMatchIndex === 0} className="p-1 hover:text-himalaya-red disabled:opacity-20"><ChevronUp size={14} /></button>
                      <button onClick={() => navigateSearch('next')} disabled={currentMatchIndex === filteredMessages.length - 1} className="p-1 hover:text-himalaya-red disabled:opacity-20"><ChevronDown size={14} /></button>
                    </div>
                  )}
                  <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className={`p-1.5 rounded-lg border transition-colors ${showAdvancedFilters ? 'bg-himalaya-red text-white border-himalaya-red' : (theme === 'dark' ? 'bg-slate-700 text-slate-400 border-slate-600 hover:border-himalaya-gold' : 'bg-white text-gray-400 border-gray-200 hover:border-himalaya-gold')}`}><Filter size={14} /></button>
                </div>
              </div>

              {/* Recent Searches Section */}
              {recentSearches.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-1 px-1">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-himalaya-gold uppercase tracking-tighter">
                    <HistoryIcon size={10} /> འཚོལ་བཤེར་སྔོན་མ། (最近搜索)
                  </div>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {recentSearches.map((s, idx) => (
                      <div key={idx} className="group flex items-center">
                        <button 
                          onClick={() => setSearchQuery(s)}
                          className={`px-2 py-0.5 rounded-l-full text-[10px] font-medium border-y border-l transition-all whitespace-nowrap ${searchQuery === s ? 'bg-himalaya-gold text-white border-himalaya-gold' : (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:border-himalaya-gold/40' : 'bg-white text-himalaya-slate border-gray-100 hover:bg-himalaya-gold/10')}`}
                        >
                          {s}
                        </button>
                        <button 
                          onClick={() => removeRecentSearch(s)}
                          className={`px-1.5 py-0.5 rounded-r-full border-y border-r transition-all ${searchQuery === s ? 'bg-himalaya-gold text-white border-himalaya-gold' : (theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-400 hover:text-himalaya-red' : 'bg-white text-gray-300 hover:text-himalaya-red border-gray-100')}`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <button onClick={clearRecentSearches} className="px-2 py-0.5 text-[9px] font-bold text-gray-400 hover:text-himalaya-red transition-colors uppercase tracking-tighter">清空</button>
                  </div>
                </div>
              )}

              {showAdvancedFilters && (
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg animate-in fade-in duration-200 ${theme === 'dark' ? 'bg-slate-700/50 border-slate-600' : 'bg-white/50 border-himalaya-gold/10'}`}>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-himalaya-slate/60 uppercase flex items-center gap-1"><UserIcon size={10} /> གཏོང་མཁན། (发送者)</label>
                    <div className={`flex items-center gap-1 p-1 rounded-lg border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                      <button onClick={() => setSenderFilter('all')} className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${senderFilter === 'all' ? 'bg-himalaya-red text-white' : 'text-gray-400 hover:bg-himalaya-cream'}`}>全部</button>
                      <button onClick={() => setSenderFilter('user')} className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${senderFilter === 'user' ? 'bg-himalaya-red text-white' : 'text-gray-400 hover:bg-himalaya-cream'}`}>用户</button>
                      <button onClick={() => setSenderFilter('model')} className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${senderFilter === 'model' ? 'bg-himalaya-red text-white' : 'text-gray-400 hover:bg-himalaya-cream'}`}>AI</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-himalaya-slate/60 uppercase flex items-center gap-1"><Calendar size={10} /> དུས་ཚོད། (日期范围)</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                        <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className={`flex-1 border rounded-lg p-1 text-[10px] outline-none shadow-sm focus:border-himalaya-red ${theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-white border-gray-100'}`} />
                        <span className="text-gray-300">-</span>
                        <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className={`flex-1 border rounded-lg p-1 text-[10px] outline-none shadow-sm focus:border-himalaya-red ${theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-300' : 'bg-white border-gray-100'}`} />
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setQuickDateRange(0)} className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-600' : 'bg-gray-100 hover:bg-himalaya-gold/20 text-himalaya-slate'}`}>今天</button>
                        <button onClick={() => setQuickDateRange(7)} className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-600' : 'bg-gray-100 hover:bg-himalaya-gold/20 text-himalaya-slate'}`}>7天</button>
                        <button onClick={() => setQuickDateRange(30)} className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-600' : 'bg-gray-100 hover:bg-himalaya-gold/20 text-himalaya-slate'}`}>30天</button>
                        {(dateRange.start || dateRange.end) && <button onClick={() => setDateRange({ start: '', end: '' })} className="ml-auto p-1 text-gray-300 hover:text-himalaya-red transition-colors"><RotateCcw size={10}/></button>}
                      </div>
                    </div>
                  </div>
                  <div className={`md:col-span-2 flex items-center justify-between pt-2 border-t ${theme === 'dark' ? 'border-slate-600' : 'border-himalaya-gold/10'}`}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setIsFuzzySearch(!isFuzzySearch)} className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${isFuzzySearch ? 'bg-himalaya-gold text-white border-himalaya-gold' : (theme === 'dark' ? 'bg-slate-800 text-slate-400 border-slate-600' : 'bg-white text-gray-400 border-gray-100')}`}><Sparkles size={10} /> 模糊搜索</button>
                      <button onClick={resetFilters} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${theme === 'dark' ? 'border-red-900/50 text-red-400 bg-red-900/10 hover:bg-himalaya-red hover:text-white' : 'border-himalaya-red/20 text-himalaya-red bg-himalaya-red/5 hover:bg-himalaya-red hover:text-white'}`}><RotateCcw size={10} /> 全部重置</button>
                    </div>
                    {availableSources.length > 0 && (
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[50%]">
                        <Globe size={10} className="text-himalaya-gold/40 flex-shrink-0" />
                        <button onClick={() => setSelectedSource(null)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border whitespace-nowrap ${!selectedSource ? 'bg-himalaya-red text-white border-himalaya-red' : (theme === 'dark' ? 'bg-slate-800 text-slate-400 border-slate-600' : 'bg-white text-himalaya-slate border-gray-100')}`}>全部来源</button>
                        {availableSources.map(source => <button key={source} onClick={() => setSelectedSource(selectedSource === source ? null : source)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border whitespace-nowrap ${selectedSource === source ? 'bg-himalaya-red text-white border-himalaya-red' : (theme === 'dark' ? 'bg-slate-800 text-slate-400 border-slate-600 hover:border-himalaya-gold' : 'bg-white text-himalaya-slate border-gray-100 hover:border-himalaya-gold')}`}>{source}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input Box */}
          <div className="relative flex items-end gap-2">
            <div className="flex-1 relative flex items-center">
              <button onClick={() => fileInputRef.current?.click()} disabled={isImageProcessing} className={`absolute left-2 bottom-2 p-2 rounded-lg transition-all z-10 disabled:opacity-20 ${theme === 'dark' ? 'text-himalaya-gold hover:bg-slate-700' : 'text-himalaya-gold hover:text-himalaya-red hover:bg-himalaya-cream'}`}><Paperclip size={20} /></button>
              <textarea ref={inputRef} className={`w-full border-2 rounded-xl py-3 pl-11 pr-12 text-base md:text-lg resize-none shadow-inner transition-all duration-200 min-h-[56px] max-h-32 ${isImageProcessing ? 'animate-pulse bg-himalaya-gold/10' : ''} ${theme === 'dark' ? 'bg-slate-700/50 border-slate-600 text-white focus:border-himalaya-gold' : 'bg-himalaya-cream/50 border-gray-300 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red'}`} placeholder={isImageProcessing ? "Transcribing image text..." : (activeTranslateLang ? `Translate into ${activeTranslateLang}...` : "འདིར་འབྲི་རོགས། (在此输入...)")} value={inputText} onChange={(e) => { setInputText(e.target.value); if(showEditMenu) setShowEditMenu(false); if(showTranslateMenu) setShowTranslateMenu(false); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} disabled={isLoading || isImageProcessing} rows={1} />
              <button onClick={() => handleSendMessage()} disabled={!inputText.trim() || isLoading || isImageProcessing} className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${!inputText.trim() || isLoading || isImageProcessing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-himalaya-red text-white hover:bg-red-900 shadow-md transform hover:scale-105 active:scale-95'}`}>{isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}</button>
            </div>
          </div>
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
    </div>
  );
};

export default App;
