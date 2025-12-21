
import React, { useState } from 'react';
import { Message } from '../types';
import { Bot, User, Hash, Copy, Check } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const charCount = message.text.length;

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

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex max-w-[85%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md border-2
          ${isUser 
            ? 'bg-himalaya-slate text-white border-gray-600' 
            : 'bg-himalaya-red text-himalaya-gold border-himalaya-gold'}
        `}>
          {isUser ? <User size={20} /> : <Bot size={20} />}
        </div>

        {/* Bubble */}
        <div className={`
          relative flex flex-col px-5 py-3 rounded-2xl shadow-sm text-base md:text-lg leading-relaxed min-w-[60px]
          ${isUser 
            ? 'bg-white text-himalaya-dark rounded-tr-none border border-gray-200' 
            : 'bg-himalaya-red/10 text-himalaya-dark rounded-tl-none border border-himalaya-red/20'}
        `}>
          {/* Copy Button */}
          {!isThinking && (
            <button
              onClick={handleCopy}
              className={`
                absolute top-2 right-2 p-1.5 rounded-md transition-all duration-200 
                opacity-0 group-hover:opacity-100 hover:bg-gray-100/50
                ${isUser ? 'text-gray-400 hover:text-himalaya-red' : 'text-himalaya-red/40 hover:text-himalaya-red'}
              `}
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            </button>
          )}

          {isThinking ? (
            <div className="flex items-center gap-1.5 h-6 py-1">
              <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot"></div>
              <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot delay-200"></div>
              <div className="w-2 h-2 bg-himalaya-red rounded-full animate-typing-dot delay-400"></div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words pr-4">{message.text}</p>
              
              {message.isStreaming && (
                 <span className="inline-block w-2 h-4 ml-1 align-middle bg-himalaya-red animate-pulse"></span>
              )}
              
              {/* Character Count Meta Info */}
              <div className={`
                mt-3 flex items-center gap-1 text-[10px] md:text-xs opacity-75 font-sans tracking-tight
                ${isUser ? 'justify-end text-gray-500' : 'justify-start text-himalaya-red'}
              `}>
                 <Hash size={10} className="opacity-70" />
                 <span className="font-tibetan">ཡིག་འབྲུའི་གྲངས་ཀ:</span>
                 <span className="font-mono font-bold">{charCount}</span>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};

export default ChatMessage;
