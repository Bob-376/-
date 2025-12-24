
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Send, Sparkles, AlertCircle, X, Search, Filter, ExternalLink, 
  HelpCircle, ChevronUp, ChevronDown, ArrowDown, Languages, FileEdit, 
  Maximize, Wand2, Briefcase, ChevronRight, Globe, ImagePlus, Loader2, Scan, Check, Paperclip,
  Calendar, User as UserIcon, Bot, Bookmark, Trash2, Pin, RotateCcw, Command, Terminal, Moon, Sun, PlusCircle, AlignLeft, ArrowRight, History as HistoryIcon,
  Feather, Music, BookOpen, PenTool, Type, Save, Eraser, Archive, Clock, History, Cpu, Library, Database, AlertTriangle, Link2, BrainCircuit, Quote, Lightbulb, UserCheck, Map, MessagesSquare
} from 'lucide-react';
import Header from './components/Header';
import ChatMessage from './components/ChatMessage';
import { Message, ProjectMemory } from './types';
import { sendMessageStream, resetChat, parseMemoryUpdate, extractCreativeAdvice } from './services/geminiService';

const STORAGE_KEY_PINNED = 'himalaya_pinned_messages_v1';
const STORAGE_KEY_THEME = 'himalaya_theme_v1';
const STORAGE_KEY_DRAFT = 'himalaya_input_draft_v1';
const STORAGE_KEY_DRAFT_HISTORY = 'himalaya_draft_history_v1';
const STORAGE_KEY_AUTOSAVE_HISTORY = 'himalaya_autosave_history_v1';
const STORAGE_KEY_MESSAGES = 'himalaya_session_messages_v1';
const STORAGE_KEY_MEMORY = 'himalaya_project_memory_v1';
const STORAGE_KEY_INSIGHTS = 'himalaya_latest_insights_v1';

// Increased to 20,000 to support long-form novel writing
const MAX_CHARS = 20000;

interface DraftItem {
  id: string;
  text: string;
  timestamp: number;
  type: 'manual' | 'auto';
}

const App: React.FC = () => {
  const safeJsonParse = (key: string, fallback: any) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.error(`Error parsing storage key ${key}:`, e);
      return fallback;
    }
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = safeJsonParse(STORAGE_KEY_MESSAGES, []);
    return saved.length > 0 ? saved : [
      {
        id: 'welcome',
        role: 'model',
        text: 'བཀྲ་ཤིས་བདེ་ལེགས། འདི་ནི་བོད་ཀྱི་ཡིག་རིགས་创作助手ཡིན། ངས་ཁྱེད་ཀྱི་རྩོམ་རིག་གསར་རྩོམ་ལ་རོགས་པ་བྱེད་ཐུབ།\n(扎西德勒！这是西藏文学创作助手。我能为您的创作提供专业支持。)',
        isStreaming: false,
        timestamp: Date.now(),
        reactions: {}
      }
    ];
  });
  
  const [memory, setMemory] = useState<ProjectMemory | null>(() => safeJsonParse(STORAGE_KEY_MEMORY, null));
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>(() => safeJsonParse(STORAGE_KEY_PINNED, []));
  const [theme, setTheme] = useState<'himalayan' | 'dark'>(() => (localStorage.getItem(STORAGE_KEY_THEME) as any) || 'himalayan');
  const [inputText, setInputText] = useState(() => localStorage.getItem(STORAGE_KEY_DRAFT) || '');
  const [latestInsights, setLatestInsights] = useState<string>(() => localStorage.getItem(STORAGE_KEY_INSIGHTS) || '');
  
  const [draftHistory, setDraftHistory] = useState<DraftItem[]>(() => {
    const manual = safeJsonParse(STORAGE_KEY_DRAFT_HISTORY, []);
    const auto = safeJsonParse(STORAGE_KEY_AUTOSAVE_HISTORY, []);
    return [...manual, ...auto].sort((a, b) => b.timestamp - a.timestamp);
  });
  
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [showDrafts, setShowDrafts] = useState(false);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [showWorkshop, setShowWorkshop] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages)); }, [messages]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify(pinnedMessages)); }, [pinnedMessages]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_MEMORY, JSON.stringify(memory)); }, [memory]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY_INSIGHTS, latestInsights); }, [latestInsights]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_DRAFT, inputText);
      if (inputText.trim()) setLastSavedTime(new Date().toLocaleTimeString());
    }, 500);
    return () => clearTimeout(timer);
  }, [inputText]);

  const scrollToBottom = (force = false) => {
    const container = mainContentRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
    if (force || nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReset = () => {
    if (!window.confirm("确定要清空当前对话吗？")) return;
    resetChat();
    setMessages([{ 
      id: 'welcome', 
      role: 'model', 
      text: '对话已重置。历史会话已清空，但“项目记忆”仍将被用于维持创作风格。', 
      isStreaming: false, 
      timestamp: Date.now(), 
      reactions: {} 
    }]);
    setLatestInsights('');
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
  };

  const applyCreativeTool = (type: string) => {
    let currentContent = inputText.trim();
    const directiveMap: Record<string, string> = {
      polish: "[TASK]: POLISH. Elevate vocabulary and flow.",
      poetry: "[TASK]: POETRY. Convert prose to rhythmic verse.",
      expand: "[TASK]: EXPAND. Add sensory details and depth.",
      character: "[TASK]: CHARACTER. Deepen character motivations and unique voice.",
      plot: "[TASK]: PLOT. Identify potential plot holes or suggest the next hook.",
      dialogue: "[TASK]: DIALOGUE. Make the conversation feel more natural and subtextual."
    };

    const directive = directiveMap[type] || `[TASK]: ${type.toUpperCase()}.`;
    const fullText = currentContent ? `${currentContent}\n\n${directive}` : directive;
    setInputText(fullText);
    inputRef.current?.focus();
    if (showWorkshop) setShowWorkshop(false);
  };

  const handleSendMessage = async (textOverride?: string) => {
    const userText = (textOverride || inputText).trim();
    if (!userText || isLoading || userText.length > MAX_CHARS) return;
    
    const history = messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({ role: m.role, parts: [{ text: m.text }] }));

    if (!textOverride) {
      setDraftHistory(prev => [{ id: 'sent-' + Date.now(), text: userText, timestamp: Date.now(), type: 'auto' }, ...prev].slice(0, 100));
      setInputText(''); 
    }

    setIsLoading(true);
    const userMsgId = Date.now().toString();
    if (!textOverride) setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: userText, timestamp: Date.now(), reactions: {} }]);
    
    const botMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: '', isStreaming: true, timestamp: Date.now(), reactions: {} }]);
    
    try {
      await sendMessageStream(userText, history, memory, (updatedText, groundingChunks) => {
        setMessages(prev => prev.map(msg => msg.id === botMsgId ? { ...msg, text: updatedText, groundingChunks: groundingChunks || msg.groundingChunks } : msg));
        scrollToBottom();
      });

      setMessages(prev => {
        const lastMsg = prev.find(m => m.id === botMsgId);
        if (lastMsg) {
          const update = parseMemoryUpdate(lastMsg.text);
          const advice = extractCreativeAdvice(lastMsg.text);
          if (advice) setLatestInsights(advice);
          
          if (update) {
            setMemory(old => ({
              styleProfile: update.styleProfile || old?.styleProfile || '文学创作',
              narrativeProgress: update.narrativeProgress || old?.narrativeProgress || '创作中',
              keyCitations: [...(old?.keyCitations || []), ...(update.keyCitations || [])].slice(-5),
              lastUpdated: Date.now()
            }));
          }
        }
        return prev.map(msg => msg.id === botMsgId ? { ...msg, isStreaming: false } : msg);
      });
    } catch (err: any) {
      setError("处理失败。内容已自动保存。");
    } finally {
      setIsLoading(false);
    }
  };

  const charCount = inputText.length;
  const charPercent = Math.min(100, (charCount / MAX_CHARS) * 100);
  const isOverLimit = charCount > MAX_CHARS;

  return (
    <div className={`flex flex-col h-screen font-tibetan overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-himalaya-cream text-himalaya-dark'}`}>
      <Header 
        onReset={handleReset} 
        onTogglePins={() => setShowPinnedPanel(!showPinnedPanel)} 
        onToggleDrafts={() => setShowDrafts(!showDrafts)}
        onToggleMemory={() => setShowMemoryPanel(!showMemoryPanel)}
        onToggleWorkshop={() => setShowWorkshop(!showWorkshop)}
        pinCount={pinnedMessages.length} 
      />

      <main ref={mainContentRef} className="flex-1 overflow-y-auto p-4 md:p-6 pb-96 scroll-smooth">
        <div className="w-full max-w-4xl mx-auto space-y-6">
          <div className="flex justify-center mb-2">
             <div className="px-4 py-2 rounded-full bg-himalaya-gold/10 border border-himalaya-gold/30 text-[10px] font-bold text-himalaya-red uppercase flex items-center gap-2 shadow-sm">
                <BrainCircuit size={14} className="text-himalaya-red" /> <span>长篇小说创作模式已激活 (Novel Mode Active - 20k Limit)</span>
             </div>
          </div>
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} onTogglePin={(id) => setPinnedMessages(prev => prev.some(p => p.id === id) ? prev.filter(p => p.id !== id) : [...prev, messages.find(m => m.id === id)!])} isPinned={pinnedMessages.some(p => p.id === msg.id)} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Section */}
      <div className={`fixed bottom-0 left-0 w-full backdrop-blur-xl border-t border-himalaya-gold/30 p-5 shadow-2xl z-30 ${theme === 'dark' ? 'bg-slate-800/90' : 'bg-white/90'}`}>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button onClick={() => applyCreativeTool('polish')} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-xl text-xs font-bold hover:bg-yellow-100 transition-all shadow-sm"><Sparkles size={14} /> 华彩润色</button>
            <button onClick={() => applyCreativeTool('poetry')} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all shadow-sm"><Music size={14} /> 诗词词曲</button>
            <button onClick={() => applyCreativeTool('expand')} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold hover:bg-sky-100 transition-all shadow-sm"><BookOpen size={14} /> 深度扩写</button>
            <div className="w-px h-6 bg-gray-200 mx-2"></div>
            <button onClick={() => setShowWorkshop(true)} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-himalaya-red/10 text-himalaya-red border border-himalaya-red/20 rounded-xl text-xs font-bold hover:bg-himalaya-red/20 transition-all shadow-sm"><Lightbulb size={14} /> 创作研讨...</button>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${isOverLimit ? 'text-himalaya-red animate-pulse' : 'text-gray-400'}`}>
                   <Type size={12} />
                   {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} 字符
                </span>
                {isOverLimit && (
                  <span className="text-[10px] font-bold text-himalaya-red bg-himalaya-red/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} /> 超过2万字限制
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 font-medium">自动保存: {lastSavedTime || '等待中...'}</span>
            </div>
            
            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div 
                className={`h-full transition-all duration-300 ${
                  isOverLimit ? 'bg-himalaya-red' : 
                  charPercent > 90 ? 'bg-orange-500' : 
                  charPercent > 70 ? 'bg-himalaya-gold' : 'bg-emerald-500'
                }`}
                style={{ width: `${charPercent}%` }}
              />
            </div>

            <div className="relative">
              <textarea 
                ref={inputRef} 
                className={`w-full border-2 rounded-3xl py-5 pl-6 pr-24 text-lg resize-none shadow-inner focus:ring-4 focus:ring-himalaya-gold/10 font-tibetan bg-transparent transition-colors ${isOverLimit ? 'border-himalaya-red bg-himalaya-red/5' : 'border-gray-200'}`}
                placeholder="在此输入您的长篇小说章节或草稿..." 
                value={inputText} 
                onChange={e => setInputText(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())} 
                rows={2} 
              />
              <button 
                onClick={() => handleSendMessage()} 
                disabled={!inputText.trim() || isLoading || isOverLimit} 
                className={`absolute right-3 bottom-3 p-4 text-white rounded-2xl shadow-xl transform transition-all active:scale-90 disabled:opacity-50 ${isOverLimit ? 'bg-gray-400' : 'bg-himalaya-red'}`}
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <Send />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Workshop, Memory and Other panels remain unchanged but benefit from increased context */}
      {showWorkshop && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end" onClick={() => setShowWorkshop(false)}>
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 bg-himalaya-red text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Lightbulb size={24} className="text-himalaya-gold" />
                <div>
                   <h3 className="font-bold text-lg">小说研讨会</h3>
                   <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Novel Workshop & Guide</p>
                </div>
              </div>
              <button onClick={() => setShowWorkshop(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-himalaya-red font-bold text-xs uppercase tracking-widest">
                  <Feather size={16} />
                  <span>创作洞察 (Novel Insights)</span>
                </div>
                {latestInsights ? (
                  <div className="bg-himalaya-gold/5 border border-himalaya-gold/20 p-5 rounded-[2rem] italic text-himalaya-dark/80 font-tibetan leading-relaxed shadow-inner">
                    {latestInsights}
                  </div>
                ) : (
                  <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-[2rem] text-gray-400 text-sm">
                    <History size={32} className="mx-auto mb-2 opacity-10" />
                    进行对话后，AI 将在此提供长篇叙事建议。
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-himalaya-red font-bold text-xs uppercase tracking-widest">
                  <PenTool size={16} />
                  <span>长篇小说工具箱 (Novel Toolbox)</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => applyCreativeTool('character')} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-himalaya-red/30 hover:bg-himalaya-red/[0.02] transition-all text-left group">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-100 transition-colors"><UserCheck size={20} /></div>
                    <div>
                      <h4 className="font-bold text-sm text-himalaya-dark">深度人设档案</h4>
                      <p className="text-[10px] text-gray-500">构建立体的人物成长弧光与内心冲突</p>
                    </div>
                  </button>
                  <button onClick={() => applyCreativeTool('plot')} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-himalaya-red/30 hover:bg-himalaya-red/[0.02] transition-all text-left group">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-100 transition-colors"><Map size={20} /></div>
                    <div>
                      <h4 className="font-bold text-sm text-himalaya-dark">长线伏笔与布局</h4>
                      <p className="text-[10px] text-gray-500">梳理复杂故事线、设置悬念与高潮</p>
                    </div>
                  </button>
                  <button onClick={() => applyCreativeTool('dialogue')} className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-himalaya-red/30 hover:bg-himalaya-red/[0.02] transition-all text-left group">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-emerald-100 transition-colors"><MessagesSquare size={20} /></div>
                    <div>
                      <h4 className="font-bold text-sm text-himalaya-dark">场景对白张力</h4>
                      <p className="text-[10px] text-gray-500">提升对话潜台词，通过对白推动情节</p>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {showMemoryPanel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4" onClick={() => setShowMemoryPanel(false)}>
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-6 bg-himalaya-red text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <BrainCircuit size={24} className="text-himalaya-gold" />
                <div>
                   <h3 className="font-bold text-lg">作品大纲与记忆</h3>
                   <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">Project Novel Memory</p>
                </div>
              </div>
              <button onClick={() => setShowMemoryPanel(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
            </div>
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {memory ? (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">长篇叙事风格 (Style Profile)</label>
                    <p className="text-himalaya-dark font-tibetan bg-gray-50 p-4 rounded-2xl border border-gray-100">{memory.styleProfile}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">剧情关键节点 (Progress)</label>
                    <p className="text-himalaya-dark font-tibetan bg-gray-50 p-4 rounded-2xl border border-gray-100">{memory.narrativeProgress}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">核心意象与引用 (Core Motifs)</label>
                    <div className="space-y-2">
                      {memory.keyCitations.map((cite, i) => (
                        <div key={i} className="flex gap-3 bg-himalaya-red/5 p-3 rounded-xl border border-himalaya-red/10 italic text-sm font-tibetan">
                          <Quote size={14} className="text-himalaya-gold flex-shrink-0" />
                          <span>{cite}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-20 text-gray-400 space-y-4">
                  <BrainCircuit size={48} className="mx-auto opacity-10" />
                  <p className="italic">尚未建立作品档案。开始创作后，AI 将自动追踪您的长篇小说脉络。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
