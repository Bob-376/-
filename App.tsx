
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Sparkles, AlertCircle, X, Search, Filter, ExternalLink, HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message } from './types';
import { sendMessageStream, resetChat } from './services/geminiService';

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
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  const scrollToBottom = () => {
    if (!searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, searchQuery]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset navigation index when search criteria change
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, isFuzzySearch]);

  const handleSendMessage = async (textOverride?: string) => {
    const userText = (textOverride || inputText).trim();
    if (!userText || isLoading) return;

    if (!textOverride) setInputText('');
    setSearchQuery(''); 
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
      const errorMessage = "དགོངས་དག ནོར་འཁྲུལ་ཞིག་བྱུང་སོང་། (Sorry, an error occurred while connecting to the assistant.)";
      setError(errorMessage + (err.message ? `\nDetails: ${err.message}` : ''));
      setMessages((prev) => prev.filter(msg => msg.id !== botMsgId || msg.text !== ''));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleEditSubmit = (text: string, id: string) => {
    if (isLoading) return;
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return;
    const truncated = messages.slice(0, msgIndex);
    const updatedUserMsg: Message = { ...messages[msgIndex], text, timestamp: Date.now() };
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
    setMessages([
      {
        id: Date.now().toString(),
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག་ཡིན། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།',
        isStreaming: false,
        timestamp: Date.now(),
        reactions: {}
      },
    ]);
  };

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return messages;

    const matchingIndices = new Set<number>();
    messages.forEach((msg, idx) => {
      const text = msg.text.toLowerCase();
      let isMatch = false;
      if (isFuzzySearch) {
        const tokens = query.split(/\s+/).filter(t => t.length > 0);
        isMatch = tokens.every(token => text.includes(token));
      } else {
        isMatch = text.includes(query);
      }

      if (isMatch) {
        matchingIndices.add(idx);
        if (msg.role === 'model' && idx > 0) {
          matchingIndices.add(idx - 1);
        }
        if (msg.role === 'user' && idx < messages.length - 1) {
          matchingIndices.add(idx + 1);
        }
      }
    });

    return Array.from(matchingIndices)
      .sort((a, b) => a - b)
      .map(idx => messages[idx]);
  }, [messages, searchQuery, isFuzzySearch]);

  const navigateSearch = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next' 
      ? Math.min(currentMatchIndex + 1, filteredMessages.length - 1)
      : Math.max(currentMatchIndex - 1, 0);
    
    setCurrentMatchIndex(newIndex);
    
    // Scroll to the targeted message
    const targetId = filteredMessages[newIndex]?.id;
    if (targetId) {
      const element = document.getElementById(`msg-${targetId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream text-himalaya-dark font-tibetan overflow-hidden">
      <Header onReset={handleReset} />

      <div className="bg-white/60 backdrop-blur-sm border-b border-himalaya-gold/20 p-2 sticky top-[72px] z-[9] shadow-sm">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <div className="relative flex-1 group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-himalaya-slate/50 group-focus-within:text-himalaya-red transition-colors duration-200">
              <Search size={18} />
            </div>
            <input
              type="text"
              className="w-full bg-himalaya-cream/30 border border-gray-200 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red rounded-full py-2 pl-10 pr-10 text-sm md:text-base transition-all duration-200 outline-none"
              placeholder="འཚོལ་བཤེར། | 搜索 | Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-himalaya-red transition-colors duration-200"
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search Navigation Controls */}
            {searchQuery && filteredMessages.length > 0 && (
              <div className="flex items-center bg-white border border-gray-200 rounded-full px-1 py-1 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <span className="text-[10px] md:text-xs font-sans font-bold text-himalaya-slate px-3 min-w-[50px] text-center border-r border-gray-100">
                  {currentMatchIndex + 1} / {filteredMessages.length}
                </span>
                <button
                  onClick={() => navigateSearch('prev')}
                  disabled={currentMatchIndex === 0}
                  className="p-1.5 rounded-full hover:bg-himalaya-cream text-himalaya-slate disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Previous match"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => navigateSearch('next')}
                  disabled={currentMatchIndex === filteredMessages.length - 1}
                  className="p-1.5 rounded-full hover:bg-himalaya-cream text-himalaya-slate disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  title="Next match"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            )}

            <button
              onClick={() => setIsFuzzySearch(!isFuzzySearch)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-full border transition-all duration-300 text-xs font-bold uppercase tracking-wider
                ${isFuzzySearch 
                  ? 'bg-himalaya-red text-white border-himalaya-red shadow-md' 
                  : 'bg-white text-himalaya-slate border-gray-200 hover:border-himalaya-gold'}
              `}
            >
              <Filter size={14} />
              <span className="hidden md:inline">{isFuzzySearch ? 'Fuzzy' : 'Exact'}</span>
            </button>
          </div>
        </div>
      </div>

      <main 
        ref={mainContentRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 w-full max-w-3xl mx-auto scroll-smooth"
      >
        {error && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-red-50 border-l-4 border-himalaya-red p-4 rounded-r-xl shadow-md flex items-start gap-4 relative">
              <AlertCircle className="text-himalaya-red flex-shrink-0 mt-1" size={24} />
              <div className="flex-1 pr-8">
                <p className="text-sm md:text-base text-himalaya-red font-medium leading-relaxed mb-3">
                  {error}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <button 
                    onClick={() => handleSendMessage()} 
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-himalaya-red bg-himalaya-red/10 hover:bg-himalaya-red hover:text-white px-3 py-1.5 rounded-lg transition-all"
                  >
                    ཕྱིར་མངགས། (Retry)
                  </button>
                  <a 
                    href="https://ai.google.dev/gemini-api/docs/troubleshooting" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-himalaya-slate hover:text-himalaya-red px-3 py-1.5 rounded-lg transition-all border border-gray-200 bg-white"
                  >
                    <HelpCircle size={14} />
                    རོགས་རམ། (Help & FAQ)
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <button onClick={() => setError(null)} className="absolute top-2 right-2 p-1 text-himalaya-red/50 hover:text-himalaya-red transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
           {filteredMessages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-64 text-himalaya-slate/40">
               <Sparkles className="w-12 h-12 mb-2 opacity-20" />
               <p className="font-tibetan text-lg">
                 {searchQuery ? 'འཚོལ་ཐབས་མ་རྙེད། (No results found)' : 'འགོ་འཛུགས་རོགས། (Start a conversation...)'}
               </p>
             </div>
           ) : (
             filteredMessages.map((msg, idx) => {
               const isNewPair = searchQuery && msg.role === 'user' && idx !== 0;
               const isActiveMatch = searchQuery && idx === currentMatchIndex;
               
               return (
                 <div 
                   key={msg.id} 
                   id={`msg-${msg.id}`}
                   className={`
                    transition-all duration-500 rounded-2xl
                    ${isNewPair ? 'pt-6 border-t border-himalaya-gold/10' : ''}
                    ${isActiveMatch ? 'ring-2 ring-himalaya-red/30 ring-offset-4 ring-offset-himalaya-cream bg-himalaya-red/5 shadow-lg scale-[1.01]' : ''}
                   `}
                 >
                   <ChatMessage 
                    message={msg} 
                    onEditSubmit={handleEditSubmit}
                    onReaction={handleReaction}
                    disabled={isLoading}
                    highlightQuery={searchQuery}
                   />
                 </div>
               );
             })
           )}
           <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-himalaya-gold/30 p-4 shadow-lg z-20">
        <div className="max-w-3xl mx-auto relative flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="w-full bg-himalaya-cream/50 border-2 border-gray-300 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red rounded-xl p-3 pr-12 text-base md:text-lg resize-none shadow-inner transition-all duration-200 min-h-[56px] max-h-32"
            placeholder="འདིར་འབྲི་རོགས། (Type here...)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isLoading}
            rows={1}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${!inputText.trim() || isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-himalaya-red text-white hover:bg-red-900 shadow-md transform hover:scale-105 active:scale-95'}`}
          >
            {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
