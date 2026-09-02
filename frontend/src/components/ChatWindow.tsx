import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../hooks/useTravelPlanner.ts';
import { MessageComponent } from './Message.tsx';

interface ChatWindowProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onApprove: (approved: boolean, feedback: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  onApprove,
  isLoading,
  error
}) => {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-screen sm:h-auto sm:max-h-[80vh] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl bg-white border border-gray-200">
      {/* Chat Header */}
      <div className="bg-linear-to-r from-blue-600 to-indigo-600 px-6 py-4 sm:py-5 text-white shadow-md">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          🤖 TripMate AI Travel Planner
        </h2>
        <p className="text-blue-100 text-xs sm:text-sm mt-1">Powered by Multi-Agent AI</p>
      </div>

      {/* Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 bg-linear-to-b from-white to-gray-50 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <p className="text-4xl mb-3">✈️</p>
              <p className="text-gray-500 text-sm sm:text-base font-medium">
                Start planning your adventure!
              </p>
              <p className="text-gray-400 text-xs sm:text-sm mt-2">
                Tell me about your dream destination...
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageComponent
            key={msg.id}
            message={msg}
            onApprove={onApprove}
          />
        ))}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse delay-100"></div>
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse delay-200"></div>
            </div>
            <span className="ml-3 text-gray-600 text-sm font-medium">TripMate is thinking...</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
            <p className="text-red-700 text-sm font-medium">⚠️ Error</p>
            <p className="text-red-600 text-xs sm:text-sm mt-1">{error}</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4 sm:p-6 shadow-lg">
        <div className="flex gap-2 sm:gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (handleSend(), e.preventDefault())}
            placeholder="Describe your dream trip (e.g., beach vacation in Bali)..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base transition-all"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="btn-primary px-6 py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-sm sm:text-base"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Press Enter to send or Shift+Enter for new line</p>
      </div>
    </div>
  );
};
