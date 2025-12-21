
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, AlertCircle, X } from 'lucide-react';
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
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    setInputText('');
    setError(null); // Clear previous errors
    
    // 1. Add User Message
    const userMsgId = Date.now().toString();
    const newUserMsg: Message = { id: userMsgId, role: 'user', text: userText };
    
    setMessages((prev) => [...prev, newUserMsg]);
    setIsLoading(true);

    // 2. Add Placeholder Bot Message
    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: botMsgId, role: 'model', text: '', isStreaming: true },
    ]);

    try {
      let fullResponse = '';
      
      // 3. Stream Response
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

      // 4. Finalize
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
      setError(errorMessage);
      
      // Remove the empty bot message if it failed before producing content
      setMessages((prev) => prev.filter(msg => msg.id !== botMsgId || msg.text !== ''));
      
      // Update existing bot message if it had partial content
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === botMsgId 
            ? { ...msg, text: msg.text + '\n\n[Error during response generation]', isStreaming: false } 
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
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
    setMessages([
      {
        id: Date.now().toString(),
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་བཙལ་བཤེར་མ་ལག་ཡིན། ངས་ཁྱེད་ལ་ག་རེ་རོགས་པ་བྱེད་ཐུབ།',
        isStreaming: false,
      },
    ]);
  };

  return (
    <div className="flex flex-col h-screen bg-himalaya-cream text-himalaya-dark font-tibetan overflow-hidden">
      <Header onReset={handleReset} />

      {/* Chat Container */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 w-full max-w-3xl mx-auto">
        {/* Prominent Error Alert */}
        {error && (
          <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-red-50 border-l-4 border-himalaya-red p-4 rounded-r-xl shadow-md flex items-start gap-3 relative">
              <AlertCircle className="text-himalaya-red flex-shrink-0 mt-1" size={20} />
              <div className="flex-1 pr-8">
                <p className="text-sm md:text-base text-himalaya-red font-medium leading-relaxed">
                  {error}
                </p>
                <button 
                  onClick={() => handleSendMessage()} 
                  className="mt-2 text-xs font-bold uppercase tracking-wider text-himalaya-red hover:underline"
                >
                  ཕྱིར་མངགས། (Retry)
                </button>
              </div>
              <button 
                onClick={() => setError(null)}
                className="absolute top-2 right-2 p-1 text-himalaya-red/50 hover:text-himalaya-red transition-colors"
                aria-label="Dismiss error"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
           {messages.length === 0 && !error && (
             <div className="flex flex-col items-center justify-center h-64 text-gray-400">
               <Sparkles className="w-12 h-12 mb-2 opacity-50" />
               <p>Start a conversation...</p>
             </div>
           )}
           {messages.map((msg) => (
             <ChatMessage key={msg.id} message={msg} />
           ))}
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
            className={`
              absolute right-2 bottom-2 p-2 rounded-lg transition-all duration-200 flex items-center justify-center
              ${!inputText.trim() || isLoading 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-himalaya-red text-white hover:bg-red-900 shadow-md transform hover:scale-105 active:scale-95'}
            `}
            aria-label="Send"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={20} />
            )}
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
