import { useState, useCallback } from 'react';
import { travelService } from '../api/travelService.ts';
import type { TravelResponse } from '../api/travelService.ts';
import { parseStructuredPlan } from '../types/travel.ts';
import type { StructuredPlan } from '../types/travel.ts';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'text' | 'approval';
  threadId?: string;
  plan?: StructuredPlan | null;
  approvalRequest?: string;
}

export function useTravelPlanner() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    setIsLoading(true);
    setError(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      type: 'text',
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const response: TravelResponse = await travelService.sendTravelRequest({
        message: text,
        thread_id: currentThreadId,
      });

      if (!response.success) {
        throw new Error(response.error || 'Something went wrong');
      }

      const parsedPlan = parseStructuredPlan(
        response.structured_plan ?? response.plan ?? response.answer ?? response.itinerary
      );

      let content = response.answer || response.message || 'I have processed your request.';
      if (parsedPlan && (content.trim().startsWith('{') || content.includes('```json'))) {
        content = parsedPlan.overview || parsedPlan.headline || 'Here is your custom travel plan.';
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        type: response.requires_approval || response.status === 'awaiting_approval' ? 'approval' : 'text',
        threadId: response.thread_id || currentThreadId || undefined,
        plan: parsedPlan,
        approvalRequest: response.approval_request,
      };

      if (assistantMsg.threadId) {
        setCurrentThreadId(assistantMsg.threadId);
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentThreadId]);

  const approvePlan = useCallback(async (approved: boolean, feedback: string) => {
    if (!currentThreadId) {
      setError('No active thread found for approval.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: TravelResponse = await travelService.approveTravelPlan({
        thread_id: currentThreadId,
        approved,
        feedback,
      });

      if (!response.success) {
        throw new Error(response.error || 'Approval failed');
      }

      const parsedPlan = parseStructuredPlan(
        response.structured_plan ?? response.plan ?? response.answer ?? response.itinerary
      );

      let content = response.answer || response.message || 'Plan updated based on your feedback.';
      if (parsedPlan && (content.trim().startsWith('{') || content.includes('```json'))) {
        content = parsedPlan.overview || parsedPlan.headline || 'Plan updated based on your feedback.';
      }

      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        type: response.requires_approval || response.status === 'awaiting_approval' ? 'approval' : 'text',
        threadId: response.thread_id || currentThreadId || undefined,
        plan: parsedPlan,
        approvalRequest: response.approval_request,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [currentThreadId]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    approvePlan,
    setCurrentThreadId,
  };
}
