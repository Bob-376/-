
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Sparkles, AlertCircle, X, Copy, Check, Search } from 'lucide-react';
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
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCopied, setErrorCopied] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    if (!searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, searchQuery]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    setInputText('');
    setSearchQuery(''); // Clear search when sending a new message
    setError(null); 
    setErrorCopied(false);
    
    const userMsgId = Date.now().toString();
    const newUserMsg: Message = { id: userMsgId, role: 'user', text: userText, timestamp: Date.now() };
    
    setMessages((prev) => [...prev, newUserMsg]);
    setIsLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: botMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now() },
    ]);

    try {
      let fullResponse = '';
      await sendMessageStream(userText, (chunk) => {
        fullResponse += chunk;
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === botMsgId 
              ? { ...msg, text: fullResponse } 
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

  const handleCopyError = async () => {
    if (!error) return;
    try {
      await navigator.clipboard.writeText(error);
      setErrorCopied(true);
      setTimeout(() => setErrorCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error details: ', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReset = () => {
    resetChat();
    setError(null);
    setErrorCopied(false);
    setSearchQuery('');
    setMessages([
      {
        id: Date.now().toString(),
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག་ཡིན། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།',
        isStreaming: false,
        timestamp: Date.now(),
      },
    ]);
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const lowerQuery = searchQuery.toLowerCase();
    return messages.filter(msg => msg.text.toLowerCase().includes(lowerQuery));
  }, [messages, searchQuery]);

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream text-himalaya-dark font-tibetan overflow-hidden">
      <Header onReset={handleReset} />

      {/* Search Bar Area */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-himalaya-gold/20 p-2 sticky top-[72px] z-[9] shadow-sm">
        <div className="max-w-3xl mx-auto relative group">
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
              title="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Chat Container */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 w-full max-w-3xl mx-auto scroll-smooth">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-red-50 border-l-4 border-himalaya-red p-4 rounded-r-xl shadow-md flex items-start gap-3 relative">
              <AlertCircle className="text-himalaya-red flex-shrink-0 mt-1" size={20} />
              <div className="flex-1 pr-8">
                <p className="text-sm md:text-base text-himalaya-red font-medium leading-relaxed">
                  {error}
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <button onClick={() => handleSendMessage()} className="text-xs font-bold uppercase tracking-wider text-himalaya-red hover:underline">
                    ཕྱིར་མངགས། (Retry)
                  </button>
                  <button onClick={handleCopyError} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-himalaya-red/70 hover:text-himalaya-red transition-colors">
                    {errorCopied ? <><Check size={14} className="text-green-600" /> བཤུས་ཟིན།</> : <><Copy size={14} /> འདྲ་བཤུས།</>}
                  </button>
                </div>
              </div>
              <button onClick={() => { setError(null); setErrorCopied(false); }} className="absolute top-2 right-2 p-1 text-himalaya-red/50 hover:text-himalaya-red transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
           {filteredMessages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-64 text-himalaya-slate/40">
               <Sparkles className="w-12 h-12 mb-2 opacity-20" />
               <p className="font-tibetan text-lg">
                 {searchQuery ? 'འཚོལ་ཐབས་མ་རྙེད། (No results found)' : 'འགོ་འཛུགས་རོགས། (Start a conversation...)'}
               </p>
             </div>
           ) : (
             filteredMessages.map((msg) => (
               <ChatMessage key={msg.id} message={msg} />
             ))
           )}
           <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-md border-t border-himalaya-gold/30 p-4 shadow-lg z-20">
        <div className="max-w-3xl mx-auto relative flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="w-full bg-himalaya-cream/50 border-2 border-gray-300 focus:border-himalaya-red focus:ring-1 focus:ring-himalaya-red rounded-xl p-3 pr-12 text-base md:text-lg resize-none shadow-inner transition-all duration-200 min-h-[56px] max-h-32"
            placeholder="འདིར་འབྲི་རོགས། (Type here...)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isLoading}
            className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${!inputText.trim() || isLoading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-himalaya-red text-white hover:bg-red-900 shadow-md transform hover:scale-105 active:scale-95'}`}
            aria-label="Send"
          >
            {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={20} />}
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-2 text-center">
            <p className="text-[10px] text-gray-400">Powered by Gemini AI • བོད་ཀྱི་སྐད་ཡིག</p>
        </div>
      </div>
    </div>
  );
};

export default App;
