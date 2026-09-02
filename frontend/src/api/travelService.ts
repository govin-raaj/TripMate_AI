const API_BASE_URL = 'http://127.0.0.1:8000';

export interface TravelRequest {
  message: string;
  thread_id?: string | null;
}

export interface TravelResponse {
  success: boolean;
  error?: string;
  message?: string;
  answer?: string;
  plan?: any;
  status?: string;
  requires_approval?: boolean;
  approval_request?: string;
  thread_id?: string | null;
  itinerary?: string;
  flight_results?: any;
  hotel_results?: any;
  weather_results?: any;
  budget_results?: any;
  [key: string]: any;
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
