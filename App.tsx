
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, Sparkles, AlertCircle, X, Search, Filter, ExternalLink, 
  HelpCircle, ChevronUp, ChevronDown, Languages, FileEdit, 
  Maximize, Wand2, Briefcase, ChevronRight, Globe, ImagePlus, Loader2, Scan, Check, Paperclip
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

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག་ཡིན། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།\n(扎西德勒！这是西藏文献检索系统。我能为您做些什么？ / Tashi Delek! This is the Tibetan Document Retrieval System. How can I help you?)',
      isStreaming: false,
      timestamp: Date.now(),
      reactions: {}
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFuzzySearch, setIsFuzzySearch] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Image/OCR State
  const [pendingImage, setPendingImage] = useState<{data: string, mime: string} | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  
  // UI State
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [activeTranslateLang, setActiveTranslateLang] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  const scrollToBottom = () => {
    if (!searchQuery && !selectedSource) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, searchQuery, selectedSource]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, isFuzzySearch, selectedSource]);

  useEffect(() => {
    if (isSearchActive) {
      searchInputRef.current?.focus();
    } else {
      setSelectedSource(null);
    }
  }, [isSearchActive]);

  // Detect if current input text is a translation request and update activeTranslateLang
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
    setError(null); 
    
    if (!textOverride) {
      const userMsgId = Date.now().toString();
      const newUserMsg: Message = { id: userMsgId, role: 'user', text: userText, timestamp: Date.now(), reactions: {} };
      setMessages((prev) => [...prev, newUserMsg]);
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
              ? { 
                  ...msg, 
                  text: updatedText, 
                  groundingChunks: groundingChunks || msg.groundingChunks 
                } 
              : msg
          )
        );
      });

      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === botMsgId 
            ? { ...msg, isStreaming: false } 
            : msg
        )
      );
    } catch (err: any) {
      console.error(err);
      const errorMessage = "དགོངས་དག ནོར་འཁྲུལ་ཞིག་བྱུང་སོང་། (抱歉，发生了一些错误。)";
      setError(errorMessage + (err.message ? `\nDetails: ${err.message}` : ''));
      setMessages((prev) => prev.filter(msg => msg.id !== botMsgId || msg.text !== ''));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const applyProjectTool = (type: 'polish' | 'expand' | 'correct' | 'translate', option?: string) => {
    let currentContent = inputText;
    let prefix = "";
    
    // If it's a translation change and we already have a translation prefix, replace it
    const translationRegex = /^Please translate the following text into (Tibetan|Chinese|English)\. Focus on capturing the precise semantic meaning: \n\n/;
    const isAlreadyTranslation = translationRegex.test(currentContent);

    if (type === 'translate' && isAlreadyTranslation) {
      prefix = `Please translate the following text into ${option || 'Tibetan'}. Focus on capturing the precise semantic meaning: \n\n`;
      setInputText(currentContent.replace(translationRegex, prefix));
      setActiveTranslateLang(option || 'Tibetan');
      setShowTranslateMenu(false);
      return;
    }

    // Standard prefixing logic
    switch (type) {
      case 'polish':
        prefix = "Please polish and refine the following text to make it more scholarly, elegant, and professional. Ensure the cultural nuances remain intact: ";
        break;
      case 'expand':
        prefix = "Please expand the following content by adding more relevant details, explanations, and depth while maintaining the original tone: ";
        break;
      case 'correct':
        prefix = "Please correct any grammar, spelling, or punctuation errors in the following text. Do not change the meaning: ";
        break;
      case 'translate':
        prefix = `Please translate the following text into ${option || 'Tibetan'}. Focus on capturing the precise semantic meaning: `;
        setActiveTranslateLang(option || 'Tibetan');
        break;
    }

    const cleanedContent = currentContent.replace(/^(Please polish|Please expand|Please correct|Please translate).*\n\n/, '');
    const fullPrompt = `${prefix}\n\n${cleanedContent || '[Paste text here]'}`;
    
    setInputText(fullPrompt);
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
    
    // Create new message with updated text and history
    const updatedUserMsg: Message = { 
      ...existingMsg, 
      text, 
      history: [...(existingMsg.history || []), existingMsg.text],
      timestamp: Date.now() 
    };
    
    setMessages([...truncated, updatedUserMsg]);
    handleSendMessage(text);
  };

  const handleReaction = (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...(msg.reactions || {}) };
        reactions[emoji] = (reactions[emoji] || 0) + 1;
        return { ...msg, reactions };
      }
      return msg;
    }));
  };

  const handleReset = () => {
    resetChat();
    setError(null);
    setSearchQuery('');
    setSelectedSource(null);
    setIsSearchActive(false);
    setPendingImage(null);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setPendingImage({ data: base64Data, mime: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleScanImage = async () => {
    if (!pendingImage) return;
    
    setIsImageProcessing(true);
    setError(null);
    
    try {
      const extractedText = await extractTextFromImage(pendingImage.data, pendingImage.mime);
      if (extractedText.trim()) {
        setInputText(extractedText);
        setPendingImage(null);
      } else {
        setError("པར་རིས་ལས་ཡིག་རིགས་རྙེད་མ་སོང་། (图片中未发现文字 / No text found in image)");
      }
    } catch (err: any) {
      console.error(err);
      setError("པར་རིས་ངོས་འཛིན་བྱེད་སྐབས་ནོར་འཁྲུལ་བྱུང་སོང་། (处理图片时出错 / Error processing image)");
    } finally {
      setIsImageProcessing(false);
      inputRef.current?.focus();
    }
  };

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    return messages.filter((msg, idx) => {
      let isMatch = true;
      if (query) {
        const text = msg.text.toLowerCase();
        if (isFuzzySearch) {
          const tokens = query.split(/\s+/).filter(t => t.length > 0);
          isMatch = tokens.every(token => text.includes(token));
        } else {
          isMatch = text.includes(query);
        }
      }

      if (isMatch && selectedSource) {
        isMatch = msg.groundingChunks?.some(chunk => {
          if (!chunk.web) return false;
          try {
            return new URL(chunk.web.uri).hostname === selectedSource;
          } catch {
            return false;
          }
        }) || false;
      }

      return isMatch;
    });
  }, [messages, searchQuery, isFuzzySearch, selectedSource]);

  const availableSources = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sourceSet = new Set<string>();
    
    messages.forEach(msg => {
      let matchesText = true;
      if (query) {
        const text = msg.text.toLowerCase();
        if (isFuzzySearch) {
          const tokens = query.split(/\s+/).filter(t => t.length > 0);
          matchesText = tokens.every(token => text.includes(token));
        } else {
          matchesText = text.includes(query);
        }
      }

      if (matchesText && msg.groundingChunks) {
        msg.groundingChunks.forEach(chunk => {
          if (chunk.web) {
            try {
              sourceSet.add(new URL(chunk.web.uri).hostname);
            } catch {}
          }
        });
      }
    });

    return Array.from(sourceSet).sort();
  }, [messages, searchQuery, isFuzzySearch]);

  const navigateSearch = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next' 
      ? Math.min(currentMatchIndex + 1, filteredMessages.length - 1)
      : Math.max(currentMatchIndex - 1, 0);
    
    setCurrentMatchIndex(newIndex);
    const targetId = filteredMessages[newIndex]?.id;
    if (targetId) {
      document.getElementById(`msg-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream text-himalaya-dark font-tibetan overflow-hidden">
      <Header onReset={handleReset} />

      <main ref={mainContentRef} className="flex-1 overflow-y-auto p-4 md:p-6 pb-72 w-full max-w-3xl mx-auto scroll-smooth">
        {error && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-red-50 border-l-4 border-himalaya-red p-4 rounded-r-xl shadow-md flex items-start gap-4 relative">
              <AlertCircle className="text-himalaya-red flex-shrink-0 mt-1" size={24} />
              <div className="flex-1 pr-8">
                <p className="text-sm md:text-base text-himalaya-red font-medium leading-relaxed mb-3">{error}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <button onClick={() => handleSendMessage()} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-himalaya-red bg-himalaya-red/10 hover:bg-himalaya-red hover:text-white px-3 py-1.5 rounded-lg transition-all">ཕྱིར་མངགས། (重试 / Retry)</button>
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
               <p className="font-tibetan text-lg">{searchQuery || selectedSource ? 'འཚོལ་ཐབས་མ་རྙེད། (未找到结果 / No results)' : 'འགོ་འཛུགས་རོགས། (开始对话 / Start conversation)'}</p>
             </div>
           ) : (
             filteredMessages.map((msg, idx) => (
               <div key={msg.id} id={`msg-${msg.id}`} className={`transition-all duration-500 rounded-2xl ${searchQuery && idx === currentMatchIndex ? 'ring-2 ring-himalaya-red/30 ring-offset-4 ring-offset-himalaya-cream bg-himalaya-red/5 shadow-lg scale-[1.01]' : ''}`}>
                 <ChatMessage message={msg} onEditSubmit={handleEditSubmit} onReaction={handleReaction} disabled={isLoading} highlightQuery={searchQuery} />
               </div>
             ))
           )}
           <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Tools and Input Panel */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-himalaya-gold/30 p-4 shadow-2xl z-20">
        <div className="max-w-3xl mx-auto space-y-3">
          
          {/* Project Tools Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pb-1">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-himalaya-red/5 rounded-lg border border-himalaya-red/10 mr-1">
              <Briefcase size={14} className="text-himalaya-red" />
              <span className="text-[10px] font-bold uppercase tracking-tighter text-himalaya-red whitespace-nowrap">ལས་གཞིའི་ལག་ཆ། | 项目工具</span>
            </div>
            
            {/* Editing Tools */}
            <div className="relative">
              <button 
                onClick={() => { setShowEditMenu(!showEditMenu); setShowTranslateMenu(false); setIsSearchActive(false); }} 
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${showEditMenu ? 'bg-himalaya-red text-white border-himalaya-red shadow-md' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red'}`}
              >
                < Wand2 size={14} /> རྩོམ་སྒྲིག་ལག་ཆ། (文本处理 / Edit)
                <ChevronDown size={12} className={`transition-transform duration-200 ${showEditMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showEditMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-white border border-himalaya-gold/30 rounded-xl shadow-xl p-2 w-56 flex flex-col gap-1 animate-in slide-in-from-bottom-2 duration-200">
                  <button onClick={() => applyProjectTool('polish')} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-himalaya-cream rounded-lg group text-himalaya-slate">
                    <div className="flex items-center gap-2"><Sparkles size={14} className="text-himalaya-gold" /><span>ལེགས་བཅོས། (润色 / Polish)</span></div>
                    <ChevronRight size={10} className="opacity-0 group-hover:opacity-100" />
                  </button>
                  <button onClick={() => applyProjectTool('correct')} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-himalaya-cream rounded-lg group text-himalaya-slate">
                    <div className="flex items-center gap-2"><FileEdit size={14} className="text-himalaya-red/60" /><span>བཅོས་སྒྲིག། (修改 / Correct)</span></div>
                    <ChevronRight size={10} className="opacity-0 group-hover:opacity-100" />
                  </button>
                  <button onClick={() => applyProjectTool('expand')} className="flex items-center justify-between px-3 py-2 text-xs hover:bg-himalaya-cream rounded-lg group text-himalaya-slate">
                    <div className="flex items-center gap-2"><Maximize size={14} className="text-blue-500" /><span>རྒྱ་སྐྱེད། (扩写 / Expand)</span></div>
                    <ChevronRight size={10} className="opacity-0 group-hover:opacity-100" />
                  </button>
                </div>
              )}
            </div>
            
            {/* Translation Dropdown */}
            <div className="relative">
              <button 
                onClick={() => { setShowTranslateMenu(!showTranslateMenu); setShowEditMenu(false); setIsSearchActive(false); }} 
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${showTranslateMenu || activeTranslateLang ? 'bg-himalaya-red text-white border-himalaya-red shadow-md' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red'}`}
              >
                <Languages size={14} /> ཡིག་སྒྱུར། (翻译 / Translate)
                <ChevronDown size={12} className={`transition-transform duration-200 ${showTranslateMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showTranslateMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-white border border-himalaya-gold/30 rounded-xl shadow-xl p-2 w-48 flex flex-col gap-1 animate-in slide-in-from-bottom-2 duration-200">
                  {TRANSLATION_LANGS.map(lang => (
                    <button 
                      key={lang.id}
                      onClick={() => applyProjectTool('translate', lang.id)} 
                      className={`flex items-center justify-between px-3 py-2 text-xs hover:bg-himalaya-cream rounded-lg transition-colors ${activeTranslateLang === lang.id ? 'text-himalaya-red font-bold' : 'text-himalaya-slate'}`}
                    >
                      <div className="flex flex-col text-left">
                        <span className={lang.id === 'Tibetan' ? 'font-tibetan' : 'font-sans'}>{lang.label}</span>
                        <span className="text-[9px] opacity-60 uppercase tracking-tighter">{lang.sub}</span>
                      </div>
                      {activeTranslateLang === lang.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search Toggle */}
            <button 
              onClick={() => { setIsSearchActive(!isSearchActive); setShowEditMenu(false); setShowTranslateMenu(false); }} 
              className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-all text-[11px] md:text-xs font-bold ${isSearchActive ? 'bg-himalaya-gold text-white border-himalaya-gold shadow-md' : 'bg-white border-himalaya-gold/30 text-himalaya-slate hover:border-himalaya-red'}`}
            >
              <Search size={14} /> འཚོལ་བཤེར། (搜索 / Search)
            </button>

            {/* OCR Button in Toolbar */}
            <button 
              onClick={() => { fileInputRef.current?.click(); setIsSearchActive(false); setShowEditMenu(false); setShowTranslateMenu(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-himalaya-gold/30 rounded-lg transition-all text-[11px] md:text-xs font-bold bg-white text-himalaya-slate hover:border-himalaya-gold hover:bg-himalaya-cream"
            >
              <ImagePlus size={14} className="text-himalaya-gold" /> པར་རིས་ངོས་འཛིན། (识图 / OCR)
            </button>
          </div>

          {/* Quick Translation Language Selection Bar */}
          {activeTranslateLang && !showTranslateMenu && (
            <div className="flex items-center gap-2 p-2 bg-himalaya-red/5 border border-himalaya-red/20 rounded-xl animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold text-himalaya-red uppercase tracking-wider border-r border-himalaya-red/20 mr-1">
                <Languages size={10} /> འགྱུར་ཡིག་བདམས། (目标语言)
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {TRANSLATION_LANGS.map(lang => (
                  <button
                    key={lang.id}
                    onClick={() => applyProjectTool('translate', lang.id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all border whitespace-nowrap ${activeTranslateLang === lang.id ? 'bg-himalaya-red text-white border-himalaya-red shadow-sm' : 'bg-white text-himalaya-slate border-gray-200 hover:border-himalaya-red/30'}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => { 
                  setInputText(inputText.replace(/^Please translate the following text into (Tibetan|Chinese|English)\. Focus on capturing the precise semantic meaning: \n\n/, '')); 
                  setActiveTranslateLang(null); 
                }}
                className="ml-auto p-1 text-himalaya-slate/40 hover:text-himalaya-red transition-colors"
                title="Clear Translation Tool"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Integrated Search Bar */}
          {isSearchActive && (
            <div className="flex flex-col gap-2 p-2 bg-himalaya-cream border border-himalaya-gold/30 rounded-xl animate-in slide-in-from-bottom-2 duration-300 shadow-inner">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 group">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-himalaya-slate/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="w-full bg-white border border-gray-200 focus:border-himalaya-gold rounded-lg py-1.5 pl-9 pr-8 text-xs outline-none"
                    placeholder="འཚོལ་བཤེར། (搜索对话... / Search conversation...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-himalaya-red">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {filteredMessages.length > 0 && (
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg px-1 py-0.5">
                      <span className="text-[10px] font-bold text-himalaya-slate px-2 border-r border-gray-100">
                        {currentMatchIndex + 1}/{filteredMessages.length}
                      </span>
                      <button onClick={() => navigateSearch('prev')} disabled={currentMatchIndex === 0} className="p-1 hover:text-himalaya-red disabled:opacity-20"><ChevronUp size={14} /></button>
                      <button onClick={() => navigateSearch('next')} disabled={currentMatchIndex === filteredMessages.length - 1} className="p-1 hover:text-himalaya-red disabled:opacity-20"><ChevronDown size={14} /></button>
                    </div>
                  )}
                  <button onClick={() => setIsFuzzySearch(!isFuzzySearch)} className={`p-1.5 rounded-lg border text-[10px] font-bold ${isFuzzySearch ? 'bg-himalaya-red text-white' : 'bg-white text-gray-400 border-gray-200'}`}><Filter size={14} /></button>
                </div>
              </div>
              {availableSources.length > 0 && (
                <div className="flex items-center gap-2 pt-1 overflow-x-auto no-scrollbar border-t border-himalaya-gold/10">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-himalaya-gold/60 uppercase whitespace-nowrap"><Globe size={10} /> ཁུངས་སྣེ།:</div>
                  <div className="flex items-center gap-1.5 pb-1">
                    <button onClick={() => setSelectedSource(null)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border ${!selectedSource ? 'bg-himalaya-red text-white border-himalaya-red' : 'bg-white text-himalaya-slate border-gray-200 hover:border-himalaya-gold'}`}>全部</button>
                    {availableSources.map(source => (
                      <button key={source} onClick={() => setSelectedSource(selectedSource === source ? null : source)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all border whitespace-nowrap ${selectedSource === source ? 'bg-himalaya-red text-white border-himalaya-red' : 'bg-white text-himalaya-slate border-gray-200 hover:border-himalaya-gold'}`}>{source}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pending Image Preview & Scanning UI */}
          {pendingImage && (
            <div className="flex items-center justify-between gap-3 p-3 bg-himalaya-cream border-2 border-himalaya-gold/40 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-himalaya-gold shadow-sm">
                  <img src={`data:${pendingImage.mime};base64,${pendingImage.data}`} alt="Upload preview" className="w-full h-full object-cover" />
                  {isImageProcessing && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>}
                </div>
                <div>
                  <p className="text-xs font-bold text-himalaya-dark">པར་རིས་ངོས་འཛིན། (识图就绪 / Ready)</p>
                  <p className="text-[10px] text-himalaya-slate uppercase tracking-wider">Image OCR Processing</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleScanImage} 
                  disabled={isImageProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-himalaya-red text-white rounded-lg text-xs font-bold hover:bg-red-900 transition-all shadow-md disabled:opacity-50"
                >
                  {isImageProcessing ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
                  <span>ཡིག་གཟུགས་ངོས་འཛིན། (开始识别 / Scan Text)</span>
                </button>
                <button onClick={() => setPendingImage(null)} disabled={isImageProcessing} className="p-2 text-himalaya-slate/40 hover:text-himalaya-red"><X size={20} /></button>
              </div>
            </div>
          )}

          {/* Message Input Box with integrated Image Upload Button */}
          <div className="relative flex items-end gap-2">
            <div className="flex-1 relative flex items-center">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-2 bottom-2 p-2 text-himalaya-gold hover:text-himalaya-red hover:bg-himalaya-cream rounded-lg transition-all z-10"
                title="Upload Image for OCR (识图识别文字)"
              >
                <Paperclip size={20} />
              </button>
              <textarea
                ref={inputRef}
                className="w-full bg-himalaya-cream/50 border-2 border-gray-300 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red rounded-xl py-3 pl-11 pr-12 text-base md:text-lg resize-none shadow-inner transition-all duration-200 min-h-[56px] max-h-32"
                placeholder={activeTranslateLang ? `Translate into ${activeTranslateLang}...` : "འདིར་འབྲི་རོགས། (在此输入... / Type here...)"}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if(showEditMenu) setShowEditMenu(false);
                  if(showTranslateMenu) setShowTranslateMenu(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading || isImageProcessing}
                rows={1}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading || isImageProcessing}
                className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${!inputText.trim() || isLoading || isImageProcessing ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-himalaya-red text-white hover:bg-red-900 shadow-md transform hover:scale-105 active:scale-95'}`}
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
    </div>
  );
};

export default App;
