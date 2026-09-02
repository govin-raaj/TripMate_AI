import React from 'react';
import type { Message } from '../hooks/useTravelPlanner.ts';

interface MessageProps {
  message: Message;
  onApprove: (approved: boolean, feedback: string) => void;
}

export const MessageComponent: React.FC<MessageProps> = ({ message, onApprove }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slideUp`}>
      <div
        className={`max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg px-4 sm:px-5 py-3 rounded-2xl shadow-md transition-all hover:shadow-lg ${
          isUser
            ? 'bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none border border-gray-200'
        }`}
      >
        {/* Message Header */}
        <div className="text-xs font-bold opacity-75 mb-1.5 tracking-wide uppercase">
          {isUser ? '👤 You' : '🤖 TripMate AI'}
        </div>

        {/* Message Content */}
        <div className="text-sm sm:text-base leading-relaxed wrap-break-word whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Approval Section */}
        {message.type === 'approval' && (
          <div className="mt-4 pt-4 border-t border-current border-opacity-20 space-y-3">
            <p className="font-semibold text-sm sm:text-base">✨ Do you approve this travel plan?</p>
            
            {/* Plan Details */}
            {message.plan && (
              <div className={`text-xs sm:text-sm p-3 rounded-lg ${
                isUser ? 'bg-blue-500/20' : 'bg-gray-200'
              } space-y-1 font-medium`}>
                <p>Plan Summary:</p>
                <p className="opacity-90">{typeof message.plan === 'string' ? message.plan : JSON.stringify(message.plan).slice(0, 100)}...</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onApprove(true, '')}
                className="flex-1 btn-secondary py-2 px-3 text-xs sm:text-sm font-bold rounded-lg hover:scale-105 transform transition-transform"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => {
                  const feedback = prompt('Please provide feedback for revisions:');
                  if (feedback !== null) onApprove(false, feedback);
                }}
                className="flex-1 btn-danger py-2 px-3 text-xs sm:text-sm font-bold rounded-lg hover:scale-105 transform transition-transform"
              >
                ✎ Revise
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
