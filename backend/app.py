import asyncio
from pathlib import Path
import traceback

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

# This is kept from the original project to allow the existing synchronous
# agent functions to call async MCP helpers inside FastAPI.
import nest_asyncio

nest_asyncio.apply()

# nest_asyncio patches asyncio.run() to a signature that predates Python
# 3.12's `loop_factory` kwarg. Vercel's own server bootstrap (which starts
# AFTER this module is imported) calls asyncio.run(..., loop_factory=...),
# which crashes against the patched function. Wrap it so unknown kwargs
# introduced by newer Python versions are safely ignored instead of raising.
_patched_asyncio_run = asyncio.run


def _compat_asyncio_run(main, *args, **kwargs):
    kwargs.pop("loop_factory", None)
    return _patched_asyncio_run(main, *args, **kwargs)


asyncio.run = _compat_asyncio_run

from backend import run_travel_agent, resume_travel_agent

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="TripMate AI",
    description=(
        "LangGraph Multi-Agent Travel Planner with Supervisor, Guardrails, "
        "Human-in-the-Loop, and FastAPI Frontend"
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TravelRequest(BaseModel):
    message: str
    thread_id: str | None = None


class ApprovalRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    approved: bool
    feedback: str = ""


@app.post("/api/travel")
async def travel_planner(request_data: TravelRequest):
    try:
        user_message = request_data.message.strip()

        if not user_message:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Message cannot be empty.",
                },
            )

        result = run_travel_agent(
            user_input=user_message,
            thread_id=request_data.thread_id,
        )

        return JSONResponse(
            content={
                "success": True,
                **result,
            }
        )

    except Exception as exc:
        print("ERROR:", exc)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(exc),
            },
        )


@app.post("/api/travel/approve")
async def approve_travel_plan(request_data: ApprovalRequest):
    try:
        if not request_data.approved and not request_data.feedback.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Please provide revision feedback when rejecting the draft.",
                },
            )

        result = resume_travel_agent(
            thread_id=request_data.thread_id,
            approved=request_data.approved,
            feedback=request_data.feedback,
        )

        return JSONResponse(
            content={
                "success": True,
                **result,
            }
        )

    except Exception as exc:
        print("APPROVAL ERROR:", exc)
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(exc),
            },
        )


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "TripMate AI API is running",
        "features": [
            "supervisor_agent",
            "input_guardrail",
            "human_in_the_loop",
        ],
    }


@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(content={})


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )