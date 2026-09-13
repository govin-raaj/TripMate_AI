export interface HotelSuggestion {
  name: string;
  area?: string;
  why?: string;
  price_range?: string;
}

export interface BudgetItem {
  category: string;
  amount?: string;
  notes?: string;
}

export interface TripDay {
  day: number | string;
  title?: string;
  morning?: string;
  afternoon?: string;
  evening?: string;
  tips?: string;
}

export interface FlightInfo {
  summary?: string;
  route?: string;
  airlines?: string[];
  duration?: string;
  price_range?: string;
  tips?: string[];
}

export interface WeatherInfo {
  summary?: string;
  forecast?: string;
  packing_tips?: string[];
}

export interface BudgetInfo {
  feasible?: boolean;
  total_estimate?: string;
  breakdown?: BudgetItem[];
  saving_tips?: string[];
}

export interface TripSummary {
  destination?: string;
  origin?: string;
  duration?: string;
  travel_style?: string;
  best_for?: string;
}

export interface StructuredPlan {
  headline?: string;
  overview?: string;
  highlights?: string[];
  trip_summary?: TripSummary;
  flights?: FlightInfo;
  hotels?: HotelSuggestion[];
  weather?: WeatherInfo;
  itinerary?: TripDay[];
  budget?: BudgetInfo;
  recommendations?: string[];
  // Metadata for tracking response quality
  _completeness?: {
    isComplete: boolean;
    missingFields: string[];
  };
}

// Response metadata interface
export interface ResponseMetadata {
  planIsComplete: boolean;
  missingFields: string[];
  llmCalls: number;
  selectedAgents: string[];
  supervisorReasoning: string;
  hasWarnings: boolean;
}

function repairJsonString(raw: string): string {
  let cleaned = raw.replace(/\/\/.*$/gm, '');
  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  return cleaned;
}

function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  // Check for markdown code fence first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    if (extracted.startsWith('{') && extracted.endsWith('}')) {
      return extracted;
    }
  }

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > start) {
      return text.slice(start, lastBrace + 1);
    }
    return null;
  }
  return text.slice(start, end);
}

function safeJsonParse(jsonStr: string): unknown {
  try {
    return JSON.parse(jsonStr);
  } catch {
    const repaired = repairJsonString(jsonStr);
    try {
      return JSON.parse(repaired);
    } catch {
      // Escape raw unescaped newlines/tabs inside strings
      // eslint-disable-next-line no-control-regex
      const normalized = repaired.replace(/[\u0000-\u001F\u007F-\u009F]/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '\\r';
        if (match === '\t') return '\\t';
        return '';
      });
      return JSON.parse(normalized);
    }
  }
}

function toArray<T>(val: unknown): T[] | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'string' && val.trim()) return [val.trim() as unknown as T];
  if (typeof val === 'object') return [val as T];
  return undefined;
}

export function parseStructuredPlan(value: unknown): StructuredPlan | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const candidateJson = extractJsonObject(trimmed);
    if (candidateJson) {
      try {
        const parsed = safeJsonParse(candidateJson);
        const next = parseStructuredPlan(parsed);
        if (next) return next;
      } catch {
        // Ignore invalid JSON and fall through.
      }
    }

    return null;
  }

  if (typeof value !== 'object') return null;

  let rawPlan = value as Record<string, unknown>;

  const usefulKeys = [
    'headline',
    'overview',
    'highlights',
    'trip_summary',
    'flights',
    'hotels',
    'weather',
    'itinerary',
    'budget',
    'recommendations',
  ] as const;

  // Unwrap wrapper object if nested under a key like trip_plan, plan, data, etc.
  if (!usefulKeys.some((key) => Boolean(rawPlan[key]))) {
    for (const wrapKey of ['trip_plan', 'plan', 'travel_plan', 'data', 'result', 'response', 'itinerary_plan']) {
      const candidateWrap = rawPlan[wrapKey];
      if (
        candidateWrap &&
        typeof candidateWrap === 'object' &&
        usefulKeys.some((k) => Boolean((candidateWrap as Record<string, unknown>)[k]))
      ) {
        rawPlan = candidateWrap as Record<string, unknown>;
        break;
      }
    }
  }

  if (!usefulKeys.some((key) => Boolean(rawPlan[key]))) {
    return null;
  }

  // Normalize fields to ensure array types required by UI components
  const plan: StructuredPlan = { ...(rawPlan as unknown as StructuredPlan) };

  if (plan.highlights !== undefined) {
    plan.highlights = toArray<string>(plan.highlights);
  }

  if (plan.hotels !== undefined) {
    plan.hotels = toArray<HotelSuggestion>(plan.hotels);
  }

  if (plan.itinerary !== undefined) {
    plan.itinerary = toArray<TripDay>(plan.itinerary);
  }

  if (plan.recommendations !== undefined) {
    plan.recommendations = toArray<string>(plan.recommendations);
  }

  if (plan.flights) {
    if (plan.flights.airlines !== undefined) {
      plan.flights.airlines = toArray<string>(plan.flights.airlines);
    }
    if (plan.flights.tips !== undefined) {
      plan.flights.tips = toArray<string>(plan.flights.tips);
    }
  }

  if (plan.weather && plan.weather.packing_tips !== undefined) {
    plan.weather.packing_tips = toArray<string>(plan.weather.packing_tips);
  }

  if (plan.budget) {
    if (plan.budget.breakdown !== undefined) {
      plan.budget.breakdown = toArray<BudgetItem>(plan.budget.breakdown);
    }
    if (plan.budget.saving_tips !== undefined) {
      plan.budget.saving_tips = toArray<string>(plan.budget.saving_tips);
    }
  }

  return plan;
}

export function isStructuredPlan(value: unknown): value is StructuredPlan {
  return parseStructuredPlan(value) !== null;
}

/**
 * Validates if a structured plan has all critical sections populated
 */
export function validatePlanCompleteness(plan: StructuredPlan | null | undefined): { isComplete: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (!plan) {
    return { isComplete: false, missingFields: ['No plan data'] };
  }

  // Check required top-level sections
  const requiredSections: (keyof StructuredPlan)[] = ['headline', 'overview', 'flights', 'hotels', 'itinerary', 'budget'];
  for (const section of requiredSections) {
    if (!plan[section]) {
      missingFields.push(section);
    }
  }

  // Check nested sections
  if (plan.flights && typeof plan.flights === 'object') {
    const flights = plan.flights as Record<string, unknown>;
    if (!flights.route) missingFields.push('flights.route');
    if (!flights.airlines || (Array.isArray(flights.airlines) && flights.airlines.length === 0)) {
      missingFields.push('flights.airlines');
    }
    if (!flights.duration) missingFields.push('flights.duration');
  }

  if (plan.itinerary) {
    if (!Array.isArray(plan.itinerary) || plan.itinerary.length === 0) {
      missingFields.push('itinerary.empty');
    } else {
      const firstDay = plan.itinerary[0];
      if (firstDay && typeof firstDay === 'object') {
        const day = firstDay as unknown as Record<string, unknown>;
        if (!day.morning) missingFields.push('itinerary[0].morning');
        if (!day.afternoon) missingFields.push('itinerary[0].afternoon');
        if (!day.evening) missingFields.push('itinerary[0].evening');
      }
    }
  }

  if (plan.budget && typeof plan.budget === 'object') {
    const budget = plan.budget as Record<string, unknown>;
    if (budget.feasible === undefined && budget.feasible !== false) {
      missingFields.push('budget.feasible');
    }
    if (!budget.total_estimate) missingFields.push('budget.total_estimate');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Helper to get a user-friendly warning message for incomplete responses
 */
export function getCompletenessWarning(missingFields: string[]): string {
  if (missingFields.length === 0) return '';

  const fieldDisplay = missingFields.slice(0, 3).join(', ');
  const more = missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : '';
  return `Note: This plan is missing some details (${fieldDisplay}${more}). You can still use it or ask for refinements.`;
}
