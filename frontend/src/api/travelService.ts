import type { StructuredPlan } from '../types/travel.ts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://mcp-bot-backend.vercel.app';

export interface TravelRequest {
  message: string;
  thread_id?: string | null;
}

export interface TravelResponse {
  success: boolean;
  error?: string;
  message?: string;
  answer?: string;
  plan?: StructuredPlan | null;
  structured_plan?: StructuredPlan | null;
  status?: string;
  requires_approval?: boolean;
  approval_request?: string;
  thread_id?: string | null;
  itinerary?: string;
  flight_results?: unknown;
  hotel_results?: unknown;
  weather_results?: unknown;
  budget_results?: unknown;
  // New fields for response completeness tracking
  plan_is_complete?: boolean;
  missing_fields?: string[];
  llm_calls?: number;
  selected_agents?: string[];
  supervisor_reasoning?: string;
}

export interface ApprovalRequest {
  thread_id: string;
  approved: boolean;
  feedback: string;
}

export const travelService = {
  async sendTravelRequest(data: TravelRequest): Promise<TravelResponse> {
    const response = await fetch(`${API_BASE_URL}/api/travel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async approveTravelPlan(data: ApprovalRequest): Promise<TravelResponse> {
    const response = await fetch(`${API_BASE_URL}/api/travel/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async checkHealth(): Promise<{ status: string; message: string }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  },
};
