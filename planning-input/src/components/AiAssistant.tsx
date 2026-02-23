
import React, { useState, useRef, useEffect } from 'react';
import { StyleEntry, ChatMessage } from '../types';
import { streamGeminiResponse, generateDeepAnalysis } from '../services/aiService';
import ReactMarkdown from 'react-markdown';

interface AiAssistantProps {
  data: StyleEntry[];
  isOpen: boolean;
  onClose: () => void;
}

const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M9 3v4" /><path d="M7 3v4" /><path d="M3 7h4" /><path d="M3 5h4" /></svg>;
const BoltIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
const BrainIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" /></svg>;
const SendIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" x2="11" y1="2" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 18 18" /></svg>;

export const AiAssistant: React.FC<AiAssistantProps> = ({ data, isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Hello! I am your Production Analyst. I can help you find bottlenecks, summarize plans, or analyze specific lines. How can I help?', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<'fast' | 'deep'>('fast');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      history.push({ role: 'user', text: userMsg.text });

      let fullResponse = "";
      const modelMsgId = (Date.now() + 1).toString();

      // Add placeholder for streaming
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: '', isThinking: true, timestamp: Date.now() }]);

      const stream = streamGeminiResponse(history, data, mode);

      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: fullResponse, isThinking: false } : m));
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I encountered an error analyzing the schedule.", timestamp: Date.now() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleDeepAnalysis = async () => {
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: "Generate a Deep Risk Analysis Report", timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setMode('deep'); // Force switch visual

    try {
      // Temporary placeholder
      const modelMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: "Analyzing entire workbook (this may take a moment)...", isThinking: true, timestamp: Date.now() }]);

      const report = await generateDeepAnalysis(data);
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { ...m, text: report, isThinking: false } : m));
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-[#121214] border-l border-zinc-800 shadow-2xl z-[100] flex flex-col animate-[slideIn_0.3s_ease-out]">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#18181b]">
        <div className="flex items-center gap-2 text-white font-medium">
          <SparklesIcon /> AI Analyst
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white p-2">
          <XIcon />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="p-4 border-b border-zinc-800 bg-[#09090b]">
        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button
            onClick={() => setMode('fast')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded transition-all ${mode === 'fast' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <BoltIcon /> Fast Chat
          </button>
          <button
            onClick={() => setMode('deep')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded transition-all ${mode === 'deep' ? 'bg-indigo-900/50 text-indigo-300 shadow border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <BrainIcon /> Deep Reasoning
          </button>
        </div>
        {mode === 'deep' && (
          <div className="mt-3">
            <button
              onClick={handleDeepAnalysis}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded flex items-center justify-center gap-2 transition-colors"
              disabled={isTyping}
            >
              <SparklesIcon /> Run Full Schedule Audit
            </button>
          </div>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-orange-600 text-white'
                : msg.isThinking
                  ? 'bg-zinc-800/50 text-zinc-400 italic border border-zinc-700 ai-pulse'
                  : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                }`}
            >
              {msg.role === 'model' && !msg.isThinking ? (
                <div className="markdown prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#18181b] border-t border-zinc-800">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={mode === 'deep' ? "Ask a complex question..." : "Ask about a style or line..."}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-orange-500 transition-colors"
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={isTyping || !input.trim()}
            className="absolute right-2 top-2 p-1.5 bg-orange-600 rounded text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <SendIcon />
          </button>
        </div>
        <div className="text-[10px] text-zinc-600 mt-2 text-center">
          {mode === 'deep' ? 'Using Gemini 3.0 Pro (Thinking Mode)' : 'Using Gemini 2.5 Flash Lite (Low Latency)'}
        </div>
      </div>
    </div>
  );
};