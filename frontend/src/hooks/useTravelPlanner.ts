import { useState, useCallback } from 'react';
import { travelService } from '../api/travelService.ts';
import type { TravelResponse } from '../api/travelService.ts';
import { parseStructuredPlan, validatePlanCompleteness } from '../types/travel.ts';
import type { StructuredPlan, ResponseMetadata } from '../types/travel.ts';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'text' | 'approval';
  threadId?: string;
  plan?: StructuredPlan | null;
  approvalRequest?: string;
  metadata?: ResponseMetadata;
}

export function useTravelPlanner() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  /**
   * Extract and validate response metadata from API response
   */
  const extractMetadata = useCallback((response: TravelResponse): ResponseMetadata => {
    const missingFields = response.missing_fields || [];
    const planIsComplete = response.plan_is_complete !== false;
    
    return {
      planIsComplete,
      missingFields,
      llmCalls: response.llm_calls || 0,
      selectedAgents: response.selected_agents || [],
      supervisorReasoning: response.supervisor_reasoning || '',
      hasWarnings: missingFields.length > 0,
    };
  }, []);

  /**
   * Process API response and extract plan + metadata
   */
  const processResponse = useCallback((response: TravelResponse) => {
    const parsedPlan = parseStructuredPlan(
      response.structured_plan ?? response.plan ?? response.answer ?? response.itinerary
    );

    // Validate plan completeness
    const completeness = validatePlanCompleteness(parsedPlan);
    
    // Extract metadata
    const metadata = extractMetadata(response);

    // Determine display content
    let content = response.answer || response.message || 'I have processed your request.';
    
    // If we have a valid plan, use overview/headline instead of raw JSON
    if (parsedPlan && (content.trim().startsWith('{') || content.includes('```json'))) {
      content = parsedPlan.overview || parsedPlan.headline || 'Here is your custom travel plan.';
    }

    return { parsedPlan, content, metadata, completeness };
  }, [extractMetadata]);

  const sendMessage = useCallback(
    async (text: string) => {
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

        const { parsedPlan, content, metadata, completeness } = processResponse(response);

        // Log completeness issues for debugging
        if (!completeness.isComplete) {
          console.warn('Incomplete trip plan:', completeness.missingFields);
        }

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          type: response.requires_approval || response.status === 'awaiting_approval' ? 'approval' : 'text',
          threadId: response.thread_id || currentThreadId || undefined,
          plan: parsedPlan,
          approvalRequest: response.approval_request,
          metadata,
        };

        if (assistantMsg.threadId) {
          setCurrentThreadId(assistantMsg.threadId);
        }

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to process your request. Please try again.';
        setError(errorMessage);
        console.error('Error in sendMessage:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [currentThreadId, processResponse]
  );

  const approvePlan = useCallback(
    async (approved: boolean, feedback: string) => {
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

        const { parsedPlan, content, metadata, completeness } = processResponse(response);

        // Log completeness issues for debugging
        if (!completeness.isComplete) {
          console.warn('Incomplete trip plan after approval:', completeness.missingFields);
        }

        const assistantMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content,
          type: response.requires_approval || response.status === 'awaiting_approval' ? 'approval' : 'text',
          threadId: response.thread_id || currentThreadId || undefined,
          plan: parsedPlan,
          approvalRequest: response.approval_request,
          metadata,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to process your approval. Please try again.';
        setError(errorMessage);
        console.error('Error in approvePlan:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [currentThreadId, processResponse]
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    approvePlan,
    setCurrentThreadId,
  };
}
