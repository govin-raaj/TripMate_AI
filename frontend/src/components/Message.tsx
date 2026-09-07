import React, { useState } from 'react';
import type { Message } from '../hooks/useTravelPlanner.ts';
import { TripPlan } from './TripPlan.tsx';
import { isStructuredPlan, parseStructuredPlan } from '../types/travel.ts';

interface MessageProps {
  message: Message;
  onApprove: (approved: boolean, feedback: string) => void;
}

export const MessageComponent: React.FC<MessageProps> = ({ message, onApprove }) => {
  const isUser = message.role === 'user';
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const structured =
    isStructuredPlan(message.plan) ? message.plan : parseStructuredPlan(message.content);

  const displayText = React.useMemo(() => {
    if (structured) return '';
    const text = (message.content || '').trim();
    if (text.startsWith('{') || text.startsWith('```json')) {
      return "I've drafted your itinerary. If the cards don't render, please ask to regenerate or refine the plan.";
    }
    return message.content;
  }, [structured, message.content]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slideUp`}>
      <div
        className={`max-w-[92%] px-4 py-3.5 shadow-lg sm:max-w-[85%] sm:px-5 ${
          isUser
            ? 'rounded-3xl rounded-br-md bg-linear-to-br from-teal-400 to-cyan-500 text-navy-950'
            : 'w-full rounded-3xl rounded-bl-md border border-white/10 bg-white/6 text-slate-100 backdrop-blur-md'
        }`}
      >
        <div
          className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isUser ? 'text-navy-900/70' : 'text-teal-200/80'
          }`}
        >
          {isUser ? 'You' : 'TripMate'}
        </div>

        {structured ? (
          <TripPlan plan={structured} isDraft={message.type === 'approval'} />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap sm:text-[15px]">
            {displayText}
          </div>
        )}

        {message.type === 'approval' && (
          <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
            <p className="text-sm font-medium text-white">
              {message.approvalRequest || 'Does this trip feel right?'}
            </p>

            {!showFeedback ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => onApprove(true, '')}
                  className="flex-1 rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-semibold text-navy-950 transition hover:bg-teal-300"
                >
                  Approve plan
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Request changes
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell TripMate what to change — more beach time, a lower budget, skip museums..."
                  className="min-h-24 w-full rounded-xl border border-white/10 bg-navy-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-300/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!feedback.trim()) return;
                      onApprove(false, feedback.trim());
                      setShowFeedback(false);
                      setFeedback('');
                    }}
                    disabled={!feedback.trim()}
                    className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-navy-950 disabled:opacity-40"
                  >
                    Send revisions
                  </button>
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="rounded-xl px-4 py-2 text-sm text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
