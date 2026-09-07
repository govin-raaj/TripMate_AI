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

const SUGGESTIONS = [
  '5 days in Kyoto on a mid-range budget',
  'Romantic weekend in Paris from London',
  'Family trip to Costa Rica in December',
  'Beach escape in Bali with good food',
];

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
  }, [messages, isLoading]);

  const handleSend = (text = inputValue) => {
    if (!text.trim() || isLoading) return;
    onSendMessage(text);
    setInputValue('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
        <div>
          <p className="font-display text-lg text-white">Trip studio</p>
          <p className="text-xs text-slate-400">Flights, stays, weather, budget, and a day-by-day plan</p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-teal-300/20 bg-teal-400/10 px-3 py-1 text-[11px] text-teal-100 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
          Multi-agent planning
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-teal-400/30 to-amber-300/20 text-3xl shadow-inner">
              ✈
            </div>
            <h2 className="font-display text-3xl text-white">Where should we take you?</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
              Share a destination, dates, budget, or travel style. TripMate will draft a complete plan you can approve or refine.
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-teal-300/30 hover:bg-white/8"
                >
                  {suggestion}
                </button>
              ))}
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
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-teal-300 delay-100" />
              <div className="h-2 w-2 animate-pulse rounded-full bg-amber-300 delay-200" />
            </div>
            <span className="text-sm text-slate-300">Designing your itinerary...</span>
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3">
            <p className="text-sm font-medium text-rose-100">We could not finish that request</p>
            <p className="mt-1 text-sm text-rose-200/80">{error}</p>
          </div>
        )}
      </div>

      <div className="border-t border-white/8 bg-navy-950/30 p-4 sm:p-5">
        <div className="flex items-end gap-2 sm:gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe the trip: destination, dates, budget, and vibe..."
            disabled={isLoading}
            rows={1}
            className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-300/40 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !inputValue.trim()}
            className="rounded-2xl bg-linear-to-r from-teal-400 to-cyan-400 px-5 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  );
};
