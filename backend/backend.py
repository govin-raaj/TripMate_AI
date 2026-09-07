import os
import certifi
from dotenv import load_dotenv

load_dotenv()
os.environ["SSL_CERT_FILE"] = certifi.where()
os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()

from typing import Any, TypedDict, Annotated
import operator
import uuid
import asyncio
import json
import re
import ast
import time
import psycopg
from psycopg.rows import dict_row
from langgraph.graph import StateGraph, START, END
from pymongo import MongoClient
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.types import Command, interrupt
from langchain_core.messages import (
    AnyMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
)
from langchain_groq import ChatGroq

from client.mcp_client import (
    tavily_mcp_search,
    aviation_mcp_call,
    extract_destination,
    forecast_mcp_search,
    weather_mcp_search,
)


def get_mongodb_uri():
    mongodb_uri = os.getenv("MONGODB_URI")

    if not mongodb_uri:
        raise ValueError(
            "MONGODB_URI is missing. Please add it to your .env file."
        )

    return mongodb_uri



GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY is missing. Please add it to your .env file.")

# Groq on-demand TPM for openai/gpt-oss-120b is 8000 (input + output).
# Keep each request well under that so graph steps in the same minute still fit.
GROQ_TPM_LIMIT = 8000
GROQ_MAX_OUTPUT_TOKENS = 1800
GROQ_MAX_INPUT_TOKENS = 5200
_tpm_events: list[tuple[float, int]] = []

# =========================
# LLM - original model kept
# =========================
llm = ChatGroq(
    model="openai/gpt-oss-120b",
    api_key=GROQ_API_KEY,
    max_tokens=GROQ_MAX_OUTPUT_TOKENS,
)

# =========================
# State
# =========================
class TravelState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str

    # Supervisor + guardrail state
    guardrail_allowed: bool
    guardrail_reason: str
    selected_agents: list[str]
    trip_constraints: dict[str, Any]
    supervisor_reasoning: str

    # Original specialist results
    flight_results: str
    hotel_results: str
    weather_results: str
    itinerary: str

    # New budget + HITL state
    budget_results: str
    approval_request: str
    approved: bool
    human_feedback: str
    final_response: str

    llm_calls: int


# =========================
# Shared helpers
# =========================
KNOWN_AGENTS = {
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
}

AGENT_ORDER = [
    "flight_agent",
    "hotel_agent",
    "weather_agent",
    "budget_agent",
    "itinerary_agent",
]


def _estimate_tokens(text: str) -> int:
    """Conservative token estimate so we stay under Groq TPM, not just char length."""
    return max(1, (len(text or "") + 2) // 3)


def _clip_text(text: str, max_chars: int) -> str:
    text = text or ""
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    marker = "\n...[truncated to fit model token limit]..."
    keep = max(0, max_chars - len(marker))
    return text[:keep].rstrip() + marker


def _clip_to_tokens(text: str, max_tokens: int) -> str:
    return _clip_text(text or "", max(0, max_tokens) * 3)


def _is_token_limit_error(exc: BaseException) -> bool:
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status in (413, 429):
        return True
    text = str(exc).lower()
    return any(
        marker in text
        for marker in (
            "413",
            "request too large",
            "rate_limit_exceeded",
            "tokens per minute",
            "please reduce your message size",
        )
    )


def _compact_tool_output(data: Any, max_chars: int = 1800) -> str:
    """Keep Tavily / MCP payloads as short notes instead of raw JSON dumps."""
    if data is None:
        return ""

    parsed: Any = data
    if isinstance(data, str):
        stripped = data.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
            except Exception:
                return _clip_text(data, max_chars)
        else:
            return _clip_text(data, max_chars)

    results = None
    if isinstance(parsed, dict):
        results = parsed.get("results") or parsed.get("organic") or parsed.get("data")
    elif isinstance(parsed, list):
        results = parsed

    if isinstance(results, list) and results:
        lines: list[str] = []
        for item in results[:6]:
            if isinstance(item, dict):
                title = str(
                    item.get("title")
                    or item.get("name")
                    or item.get("airline_name")
                    or item.get("airport_name")
                    or ""
                ).strip()
                url = str(item.get("url") or "").strip()
                snippet = str(
                    item.get("content")
                    or item.get("snippet")
                    or item.get("description")
                    or item.get("iata_code")
                    or ""
                ).strip()
                line = " - ".join(part for part in (title, snippet) if part)
                if url:
                    line = f"{line} ({url})" if line else url
                if line:
                    lines.append(f"- {_clip_text(line, 280)}")
            else:
                lines.append(f"- {_clip_text(str(item), 280)}")
        if lines:
            return _clip_text("\n".join(lines), max_chars)

    return _clip_text(str(parsed), max_chars)


def _reserve_tpm(estimated_tokens: int) -> None:
    """Stay under Groq's rolling 60-second token budget across graph steps."""
    global _tpm_events
    now = time.monotonic()
    _tpm_events = [(stamp, count) for stamp, count in _tpm_events if now - stamp < 60]
    used = sum(count for _, count in _tpm_events)
    headroom = GROQ_TPM_LIMIT - 400
    if used + estimated_tokens <= headroom:
        _tpm_events.append((now, estimated_tokens))
        return

    oldest = min(stamp for stamp, _ in _tpm_events) if _tpm_events else now
    wait = max(0.5, 61 - (now - oldest))
    print(
        f"Pacing Groq TPM: waiting {wait:.1f}s "
        f"(used ~{used}, next ~{estimated_tokens})",
        flush=True,
    )
    time.sleep(wait)
    _reserve_tpm(estimated_tokens)


def _llm_text(system_prompt: str, user_prompt: str) -> str:
    system_prompt = system_prompt or ""
    user_prompt = user_prompt or ""
    input_budget = GROQ_MAX_INPUT_TOKENS

    last_error: Exception | None = None
    for attempt in range(4):
        system_fitted = _clip_to_tokens(system_prompt, min(800, input_budget // 4))
        remaining = max(200, input_budget - _estimate_tokens(system_fitted) - 40)
        user_fitted = _clip_to_tokens(user_prompt, remaining)
        _reserve_tpm(
            _estimate_tokens(system_fitted)
            + _estimate_tokens(user_fitted)
            + GROQ_MAX_OUTPUT_TOKENS
        )
        try:
            response = llm.invoke(
                [
                    SystemMessage(content=system_fitted),
                    HumanMessage(content=user_fitted),
                ]
            )
            return _message_text(response.content)
        except Exception as exc:
            last_error = exc
            if not _is_token_limit_error(exc):
                raise
            print(
                f"Groq token limit hit (attempt {attempt + 1}), "
                f"shrinking prompt: {exc}",
                flush=True,
            )
            input_budget = max(800, int(input_budget * 0.55))

    raise last_error or RuntimeError("Groq request exceeded the token limit.")


def _message_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
        return "\n".join(part for part in parts if part)
    return str(content)


def _extract_json_object(text: str) -> str | None:
    """Return the first balanced JSON object embedded in text, if any."""
    if not text or not str(text).strip():
        return None

    cleaned = str(text).strip()

    # Look for fenced code blocks first
    code_block_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if code_block_match:
        extracted = code_block_match.group(1).strip()
        if extracted.startswith("{") and extracted.endswith("}"):
            return extracted

    start = -1
    depth = 0
    in_string = False
    escaped = False

    for idx, char in enumerate(cleaned):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char == "{":
            if depth == 0:
                start = idx
            depth += 1
        elif char == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start != -1:
                    return cleaned[start : idx + 1]

    # Fallback to outer braces if string tracking got misaligned by unescaped quotes
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        return cleaned[first_brace : last_brace + 1]

    return None


def _repair_json_string(candidate: str) -> str:
    cleaned = re.sub(r"//.*", "", candidate)
    cleaned = re.sub(r"\bTrue\b", "true", cleaned)
    cleaned = re.sub(r"\bFalse\b", "false", cleaned)
    cleaned = re.sub(r"\bNone\b", "null", cleaned)
    # Remove trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([\]}])", r"\1", cleaned)
    return cleaned


def _json_from_llm(text: str) -> dict[str, Any]:
    """Extract and parse the JSON object returned by the model with multiple repair layers."""
    candidate = _extract_json_object(text)
    if candidate is None:
        raise ValueError("The model did not return a JSON object.")

    # 1. Standard parse with strict=False (allows unescaped control characters/newlines in strings)
    try:
        return json.loads(candidate, strict=False)
    except Exception:
        pass

    # 2. Parse after repairing trailing commas, python booleans, comments
    repaired = _repair_json_string(candidate)
    try:
        return json.loads(repaired, strict=False)
    except Exception:
        pass

    # 3. Try ast.literal_eval in case LLM output single-quoted Python dict
    try:
        val = ast.literal_eval(repaired)
        if isinstance(val, dict):
            return val
    except Exception:
        pass

    try:
        val = ast.literal_eval(candidate)
        if isinstance(val, dict):
            return val
    except Exception:
        pass

    # 4. Try regex quote cleanup for unescaped internal quotes
    try:
        fixed_quotes = re.sub(r'(?<=:\s")([^"]*?)"([^"]*?)(?=")', r'\1\"\2', candidate)
        return json.loads(_repair_json_string(fixed_quotes), strict=False)
    except Exception:
        pass

    # Final attempt: let standard strict=False raise the informative error
    return json.loads(candidate, strict=False)


def _empty_constraints() -> dict[str, Any]:
    return {
        "destination": "",
        "origin": "",
        "duration": "",
        "budget": "",
        "travel_style": "",
        "special_preferences": [],
    }


TRIP_PLAN_JSON_INSTRUCTIONS = """
Return strict JSON only. Do not wrap it in markdown. Use this schema:

{
  "headline": "Short catchy trip title",
  "overview": "2-3 warm sentences in second person explaining the plan",
  "highlights": ["3 to 5 short highlights"],
  "trip_summary": {
    "destination": "",
    "origin": "",
    "duration": "",
    "travel_style": "",
    "best_for": ""
  },
  "flights": {
    "summary": "Friendly paragraph about the route",
    "route": "Origin to destination",
    "airlines": ["Airline names"],
    "duration": "Typical flight time",
    "price_range": "Approximate range or 'Check live fares'",
    "tips": ["Practical booking tips"]
  },
  "hotels": [
    {
      "name": "Hotel or stay name",
      "area": "Neighborhood",
      "why": "Why it suits this traveler",
      "price_range": "Approximate nightly range"
    }
  ],
  "weather": {
    "summary": "What the weather will feel like",
    "forecast": "Short forecast notes",
    "packing_tips": ["What to pack"]
  },
  "itinerary": [
    {
      "day": 1,
      "title": "Theme for the day",
      "morning": "Friendly morning plan",
      "afternoon": "Friendly afternoon plan",
      "evening": "Friendly evening plan",
      "tips": "One local tip"
    }
  ],
  "budget": {
    "feasible": true,
    "total_estimate": "Approximate total",
    "breakdown": [
      {"category": "Flights", "amount": "", "notes": ""}
    ],
    "saving_tips": ["Easy ways to save"]
  },
  "recommendations": ["Closing advice, next steps, or cautions"]
}

Writing style:
- Sound like a helpful travel concierge, not a technical report.
- Use plain language, short sentences, and second person ("you", "your").
- Skip empty sections rather than inventing fake live prices.
- If live ticket prices are unavailable, say travelers should check current fares.
- Keep hotel, weather, and budget details practical and easy to scan.
- Prefer 3 hotel ideas and a realistic day-by-day plan.
"""


def _extract_structured_plan(text: str) -> dict[str, Any] | None:
    if not text or not str(text).strip():
        return None

    cleaned = str(text).strip()

    try:
        parsed = _json_from_llm(cleaned)
    except Exception:
        return None

    if not isinstance(parsed, dict):
        return None

    useful_keys = {
        "headline",
        "overview",
        "highlights",
        "trip_summary",
        "flights",
        "hotels",
        "weather",
        "itinerary",
        "budget",
        "recommendations",
    }

    # Unwrap if wrapped inside an outer object
    if not useful_keys.intersection(parsed.keys()):
        for wrap_key in (
            "trip_plan",
            "plan",
            "travel_plan",
            "data",
            "result",
            "response",
            "itinerary_plan",
        ):
            candidate_wrap = parsed.get(wrap_key)
            if isinstance(candidate_wrap, dict) and useful_keys.intersection(
                candidate_wrap.keys()
            ):
                parsed = candidate_wrap
                break

    if not useful_keys.intersection(parsed.keys()):
        return None

    return parsed


def _friendly_answer_from_plan(plan: dict[str, Any]) -> str:
    parts: list[str] = []
    headline = str(plan.get("headline") or "").strip()
    overview = str(plan.get("overview") or "").strip()

    if headline:
        parts.append(headline)
    if overview:
        parts.append(overview)

    highlights = plan.get("highlights") or []
    if isinstance(highlights, list) and highlights:
        parts.append("Highlights: " + "; ".join(str(item) for item in highlights[:5]))
    elif isinstance(highlights, str) and highlights.strip():
        parts.append("Highlights: " + highlights.strip())

    return "\n\n".join(parts) if parts else ""



# =========================
# Supervisor Agent + Input Guardrail
# =========================
def supervisor_agent(state: TravelState):
    query = state["user_query"]
    llm_calls = state.get("llm_calls", 0)

    guardrail_prompt = f"""
        Determine whether the following request belongs to travel planning or travel
        information. Valid requests can include destinations, flights, hotels, weather,
        budgets, visas, transportation, sightseeing, food, packing, or itineraries.

        Block clearly unrelated requests and requests asking for harmful or illegal
        instructions. Do not block a valid travel request merely because some details
        are missing.

        Return strict JSON only:
        {{
        "allowed": true,
        "reason": ""
        }}

        User request:
        {query}
        """

    # Fail open on parser/model errors so a temporary JSON-format issue does not
    # break the original travel-planning behavior.
    try:
        guardrail_raw = _llm_text(
            "You are the input guardrail for a travel-planning application. "
            "Return strict JSON only.",
            guardrail_prompt,
        )
        guardrail_result = _json_from_llm(guardrail_raw)
        allowed = bool(guardrail_result.get("allowed", True))
        guardrail_reason = str(guardrail_result.get("reason", "")).strip()
        llm_calls += 1
    except Exception as exc:
        print(f"Guardrail fallback used: {exc}")
        allowed = True
        guardrail_reason = "Guardrail validation fallback allowed the request."

    if not allowed:
        reason = guardrail_reason or (
            "TripMate AI can only help with travel-planning requests. "
            "Please ask about a destination, flight, hotel, weather, budget, "
            "or itinerary."
        )
        return {
            "guardrail_allowed": False,
            "guardrail_reason": reason,
            "selected_agents": [],
            "trip_constraints": _empty_constraints(),
            "supervisor_reasoning": reason,
            "final_response": reason,
            "messages": [AIMessage(content=f"Guardrail blocked request: {reason}")],
            "llm_calls": llm_calls,
        }

    supervisor_prompt = f"""
        You are the supervisor of a multi-agent travel-planning system.
        Choose only the specialist agents needed for the request.

        Available agents:
        - flight_agent: flights, airports, airlines, routes, airfare, or booking advice
        - hotel_agent: hotels, accommodation, neighborhoods, or places to stay
        - weather_agent: weather, climate, season, forecast, or packing advice
        - budget_agent: cost, affordability, price limits, or budget feasibility
        - itinerary_agent: creates the integrated travel plan and must always be included

        Return strict JSON only using this schema:
        {{
        "selected_agents": ["flight_agent", "hotel_agent", "weather_agent", "budget_agent", "itinerary_agent"],
        "trip_constraints": {{
            "destination": "",
            "origin": "",
            "duration": "",
            "budget": "",
            "travel_style": "",
            "special_preferences": []
        }},
        "reasoning": ""
        }}

        User request:
        {query}
        """

    try:
        supervisor_raw = _llm_text(
            "You route work to travel specialist agents. Return strict JSON only.",
            supervisor_prompt,
        )
        parsed = _json_from_llm(supervisor_raw)
        requested_agents = parsed.get("selected_agents", [])
        selected_agents = [
            name for name in AGENT_ORDER
            if name in requested_agents and name in KNOWN_AGENTS
        ]

        # The itinerary agent integrates whichever specialist results were selected.
        if "itinerary_agent" not in selected_agents:
            selected_agents.append("itinerary_agent")

        constraints = _empty_constraints()
        parsed_constraints = parsed.get("trip_constraints", {})
        if isinstance(parsed_constraints, dict):
            constraints.update(parsed_constraints)

        reasoning = str(parsed.get("reasoning", "")).strip()
        llm_calls += 1
    except Exception as exc:
        print(f"Supervisor fallback used: {exc}")
        # Original workflow behavior is preserved as the fallback.
        selected_agents = AGENT_ORDER.copy()
        constraints = _empty_constraints()
        reasoning = (
            "Supervisor parsing failed, so the original full travel workflow "
            "was selected as a safe fallback."
        )

    return {
        "guardrail_allowed": True,
        "guardrail_reason": guardrail_reason,
        "selected_agents": selected_agents,
        "trip_constraints": constraints,
        "supervisor_reasoning": reasoning,
        "messages": [AIMessage(content="Supervisor created the agent plan.")],
        "llm_calls": llm_calls,
    }


# =========================
# Guardrail blocked response
# =========================
def guardrail_blocked_agent(state: TravelState):
    reason = state.get("final_response") or state.get("guardrail_reason") or (
        "This request was blocked by the travel input guardrail."
    )
    return {
        "final_response": reason,
        "messages": [AIMessage(content=reason)],
    }


# =========================
# Flight Agent 
# =========================
FLIGHT_AGENT_PROMPT = """
    You are a travel flight expert writing notes for another travel planner.

    User Query:
    {query}

    Airport Information:
    {airport_data}

    Airline Information:
    {airline_data}

    Write a concise, traveler-friendly briefing covering:
    1. Likely departure airport
    2. Likely arrival airport
    3. Airlines serving this route
    4. Typical flight duration
    5. Estimated airfare range
    6. Peak season pricing warning
    7. Booking advice

    Use plain language. If live ticket prices are unavailable, say so clearly.
    """


def flight_agent(state: TravelState):
    print("\nINSIDE FLIGHT AGENT\n")
    query = state["user_query"]

    try:
        airports = asyncio.run(aviation_mcp_call("list_airports"))
        airlines = asyncio.run(aviation_mcp_call("list_airlines"))

        print("\nAIRPORTS:", airports)
        print("\nAIRLINES:", airlines)

        prompt = FLIGHT_AGENT_PROMPT.format(
            query=_clip_text(query, 800),
            airport_data=_compact_tool_output(airports, 1200),
            airline_data=_compact_tool_output(airlines, 1200),
        )

        flight_data = _llm_text(
            "You are an expert travel flight planner.",
            prompt,
        )
    except Exception as exc:
        flight_data = f"Flight information unavailable: {exc}"

    return {
        "flight_results": flight_data,
        "messages": [AIMessage(content="Flight recommendations generated")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Hotel Agent 
# =========================
def hotel_agent(state: TravelState):
    print("\nInside Hotel agent\n")
    query = (
        f"Best hotels for "
        f"{state['user_query']}"
    )

    try:
        hotel_results = asyncio.run(
            tavily_mcp_search(query)
        )

    except Exception as exc:
        print(
            f"HOTEL AGENT MCP ERROR: "
            f"{type(exc).__name__}: {exc}",
            flush=True,
        )

        hotel_results = (
            "Live hotel search is temporarily unavailable. "
            "Provide general accommodation and neighborhood "
            "guidance based on the destination and clearly "
            "label it as non-live advice."
        )

    hotel_results = _compact_tool_output(hotel_results, 1800)

    return {
        "hotel_results": hotel_results,
        "messages": [
            AIMessage(
                content="Hotel information processed."
            )
        ],
        "llm_calls": (
            state.get("llm_calls", 0) + 1
        ),
    }


# =========================
# Weather Agent 
# =========================
def weather_agent(state: TravelState):
    print("\nInside weather agent\n")
    city = extract_destination(
        state["user_query"]
    )

    try:
        weather_data = asyncio.run(
            weather_mcp_search(city)
        )

        forecast_data = asyncio.run(
            forecast_mcp_search(city)
        )

        weather_results = _clip_text(
            f"Current Weather:\n{_compact_tool_output(weather_data, 700)}\n\n"
            f"Forecast:\n{_compact_tool_output(forecast_data, 700)}",
            1600,
        )

    except Exception as exc:
        print(
            f"WEATHER AGENT MCP ERROR: "
            f"{type(exc).__name__}: {exc}",
            flush=True,
        )

        weather_results = (
            f"Live weather information for {city} "
            "is temporarily unavailable. Give general "
            "seasonal guidance and advise the traveler "
            "to verify the forecast before departure."
        )

    return {
        "weather_results": weather_results,
        "messages": [
            AIMessage(
                content="Weather information processed."
            )
        ],
    }


# =========================
# Budget Agent 
# =========================
def budget_agent(state: TravelState):
    print("\nInside Budget agent\n")
    prompt = f"""
        Analyze whether this trip is realistic for the user's budget.

        User Query:
        {state['user_query']}

        Trip Constraints:
        {state.get('trip_constraints', {})}

        Flight Results:
        {_clip_text(str(state.get('flight_results', '')), 1200)}

        Hotel Results:
        {_clip_text(str(state.get('hotel_results', '')), 1200)}

        Weather Results:
        {_clip_text(str(state.get('weather_results', '')), 800)}

        Write a traveler-friendly budget briefing covering:
        1. Estimated cost categories
        2. Budget risk areas
        3. Money-saving suggestions
        4. Overall feasibility in plain language

        If exact live prices are unavailable, clearly label estimates as approximate.
        """

    return {
        "budget_results": _llm_text(
            "You are a practical travel budget analyst.",
            prompt,
        ),
        "messages": [AIMessage(content="Budget assessment generated.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Itinerary Agent 
# =========================
def itinerary_agent(state: TravelState):
    print("\nInside Itinerary agent\n")
    prompt = f"""
        {TRIP_PLAN_JSON_INSTRUCTIONS}

        Create a complete draft travel itinerary for the traveler to review.
        Make it practical, budget-aware, and easy to follow.

        User Query:
        {_clip_text(str(state.get('user_query', '')), 800)}

        Trip Constraints:
        {_clip_text(str(state.get('trip_constraints', {})), 500)}

        Flight Results:
        {_clip_text(str(state.get('flight_results', '')), 1200)}

        Hotel Results:
        {_clip_text(str(state.get('hotel_results', '')), 1200)}

        Weather Results:
        {_clip_text(str(state.get('weather_results', '')), 800)}

        Budget Results:
        {_clip_text(str(state.get('budget_results', '')), 1000)}
        """

    response_text = _llm_text(
        "You are a warm, expert travel concierge. "
        "Return strict JSON only using the requested schema.",
        prompt,
    )

    approval_request = (
        "Take a look at this draft trip. Approve it to polish the final plan, "
        "or tell us what to change."
    )

    return {
        "itinerary": response_text,
        "approval_request": approval_request,
        "messages": [AIMessage(content="Draft itinerary created for human review.")],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }


# =========================
# Human-in-the-Loop approval
# =========================
def human_approval_agent(state: TravelState):
    
    review = interrupt(
        {
            "question": "Do you approve this itinerary?",
            "draft_itinerary": state.get("itinerary", ""),
            "approval_request": state.get("approval_request", ""),
            "selected_agents": state.get("selected_agents", []),
            "supervisor_reasoning": state.get("supervisor_reasoning", ""),
            "expected_response": {
                "approved": True,
                "feedback": "Optional revision feedback",
            },
        }
    )

    approved = bool(review.get("approved", False))
    human_feedback = str(review.get("feedback", "")).strip()

    return {
        "approved": approved,
        "human_feedback": human_feedback,
        "messages": [AIMessage(content="Human approval step completed.")],
    }


# =========================
# Final Response Agent
# =========================
def final_agent(state: TravelState):
    if state.get("approved", False):
        review_instruction = (
            "The user approved the draft. Preserve its decisions while polishing it."
        )
    else:
        review_instruction = f"""
            The user requested a revision. Apply this feedback carefully:
            {state.get('human_feedback', '') or 'Improve the draft before finalizing it.'}
            """

    final_prompt = f"""
        {TRIP_PLAN_JSON_INSTRUCTIONS}

        Generate the final travel plan for the traveler.

        Important:
        - Be clear, warm, and practical.
        - Mention that live flight APIs may not provide ticket prices when pricing is unavailable.
        - Include weather-based packing and timing advice.
        - Keep the plan useful for real travel.
        - Incorporate the human feedback when revision was requested.

        Human Review:
        {_clip_text(review_instruction, 700)}

        User Request:
        {_clip_text(str(state.get('user_query', '')), 800)}

        Supervisor Constraints:
        {_clip_text(str(state.get('trip_constraints', {})), 500)}

        Flights:
        {_clip_text(str(state.get('flight_results', '')), 1000)}

        Hotels:
        {_clip_text(str(state.get('hotel_results', '')), 1000)}

        Weather:
        {_clip_text(str(state.get('weather_results', '')), 700)}

        Budget Analysis:
        {_clip_text(str(state.get('budget_results', '')), 900)}

        Draft Itinerary:
        {_clip_text(str(state.get('itinerary', '')), 1800)}
        """

    response_text = _llm_text(
        "You are a professional travel concierge. "
        "Return strict JSON only using the requested schema.",
        final_prompt,
    )

    return {
        "final_response": response_text,
        "messages": [AIMessage(content=response_text)],
        "llm_calls": state.get("llm_calls", 0) + 1,
    }



# =========================
# Dynamic Supervisor Routing
# =========================
ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "flight_agent": "flight_agent",
    "hotel_agent": "hotel_agent",
    "weather_agent": "weather_agent",
    "budget_agent": "budget_agent",
    "itinerary_agent": "itinerary_agent",
}


def _selected_agents(state: TravelState) -> list[str]:
    selected = state.get("selected_agents", [])
    return [agent for agent in AGENT_ORDER if agent in selected]


def route_from_supervisor(state: TravelState) -> str:
    if not state.get("guardrail_allowed", True):
        return "guardrail_blocked"

    selected = _selected_agents(state)
    return selected[0] if selected else "itinerary_agent"


def route_after_agent(current_agent: str):
    def route(state: TravelState) -> str:
        selected = _selected_agents(state)
        current_index = AGENT_ORDER.index(current_agent)

        for next_agent in AGENT_ORDER[current_index + 1 :]:
            if next_agent in selected:
                return next_agent

        return "itinerary_agent"

    return route


# =========================
# Build Graph
# =========================
graph = StateGraph(TravelState)

graph.add_node("supervisor", supervisor_agent)
graph.add_node("guardrail_blocked", guardrail_blocked_agent)
graph.add_node("flight_agent", flight_agent)
graph.add_node("hotel_agent", hotel_agent)
graph.add_node("weather_agent", weather_agent)
graph.add_node("budget_agent", budget_agent)
graph.add_node("itinerary_agent", itinerary_agent)
graph.add_node("human_approval", human_approval_agent)
graph.add_node("final_agent", final_agent)

graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", route_from_supervisor, ROUTE_MAP)

graph.add_conditional_edges(
    "flight_agent", route_after_agent("flight_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "hotel_agent", route_after_agent("hotel_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "weather_agent", route_after_agent("weather_agent"), ROUTE_MAP
)
graph.add_conditional_edges(
    "budget_agent", route_after_agent("budget_agent"), ROUTE_MAP
)

graph.add_edge("itinerary_agent", "human_approval")
graph.add_edge("human_approval", "final_agent")
graph.add_edge("final_agent", END)
graph.add_edge("guardrail_blocked", END)


# =========================
# MongoDB Checkpointer
# =========================
MONGODB_URI = get_mongodb_uri()
client = MongoClient(MONGODB_URI)
db = client["travel_agent_mcp"]
checkpointer = MongoDBSaver(client=client,db_name="travel_agent_mcp")
travel_graph = graph.compile(checkpointer=checkpointer)


# =========================
# FastAPI-facing helpers
# =========================
def _interrupt_payload(result: dict[str, Any]) -> dict[str, Any] | None:
    interrupts = result.get("__interrupt__", [])
    if not interrupts:
        return None

    first_interrupt = interrupts[0]
    payload = getattr(first_interrupt, "value", first_interrupt)
    return payload if isinstance(payload, dict) else {"value": payload}


def _serialize_result(
    result: dict[str, Any],
    thread_id: str,
) -> dict[str, Any]:
    messages = result.get("messages", [])
    last_message = _message_text(messages[-1].content) if messages else ""
    answer = _message_text(result.get("final_response") or last_message)
    interrupt_payload = _interrupt_payload(result)
    itinerary_text = _message_text(result.get("itinerary", ""))

    if interrupt_payload:
        answer = _message_text(
            interrupt_payload.get("draft_itinerary") or itinerary_text
        )
        itinerary_text = _message_text(
            interrupt_payload.get("draft_itinerary", "") or itinerary_text
        )

    structured_plan = _extract_structured_plan(answer) or _extract_structured_plan(
        itinerary_text
    )
    friendly_answer = (
        _friendly_answer_from_plan(structured_plan) if structured_plan else ""
    )

    if structured_plan:
        display_answer = (
            friendly_answer
            or str(
                structured_plan.get("overview")
                or structured_plan.get("headline")
                or ""
            ).strip()
            or "Here is your custom travel plan."
        )
    else:
        trimmed_ans = (answer or itinerary_text or "").strip()
        if trimmed_ans.startswith("{") or "```json" in trimmed_ans:
            display_answer = (
                "I've drafted your travel plan. Please review the details below."
            )
        else:
            display_answer = answer or "I have processed your request."

    return {
        "thread_id": thread_id,
        "answer": display_answer,
        "plan": structured_plan,
        "structured_plan": structured_plan,
        "requires_approval": interrupt_payload is not None,
        "approval_request": (
            interrupt_payload.get("approval_request", "")
            if interrupt_payload
            else result.get("approval_request", "")
        ),
        "flight_results": result.get("flight_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "weather_results": result.get("weather_results", ""),
        "budget_results": result.get("budget_results", ""),
        "itinerary": itinerary_text,
        "selected_agents": result.get("selected_agents", []),
        "trip_constraints": result.get("trip_constraints", {}),
        "supervisor_reasoning": result.get("supervisor_reasoning", ""),
        "guardrail_allowed": result.get("guardrail_allowed", True),
        "guardrail_reason": result.get("guardrail_reason", ""),
        "approved": result.get("approved"),
        "human_feedback": result.get("human_feedback", ""),
        "llm_calls": result.get("llm_calls", 0),
    }


def run_travel_agent(user_input: str, thread_id: str | None = None):
    """Start a new travel-planning run and pause at human approval."""
    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    config = {"configurable": {"thread_id": thread_id}}

    result = travel_graph.invoke(
        {
            "messages": [HumanMessage(content=user_input)],
            "user_query": user_input,
            "guardrail_allowed": True,
            "guardrail_reason": "",
            "selected_agents": [],
            "trip_constraints": _empty_constraints(),
            "supervisor_reasoning": "",
            "flight_results": "",
            "hotel_results": "",
            "weather_results": "",
            "budget_results": "",
            "itinerary": "",
            "approval_request": "",
            "approved": False,
            "human_feedback": "",
            "final_response": "",
            "llm_calls": 0,
        },
        config=config,
    )

    return _serialize_result(result, thread_id)


def resume_travel_agent(
    thread_id: str,
    approved: bool,
    feedback: str = "",
):
    """Resume the paused LangGraph thread after human review."""
    if not thread_id:
        raise ValueError("thread_id is required to resume a travel plan.")

    config = {"configurable": {"thread_id": thread_id}}
    result = travel_graph.invoke(
        Command(
            resume={
                "approved": approved,
                "feedback": feedback.strip(),
            }
        ),
        config=config,
    )

    return _serialize_result(result, thread_id)