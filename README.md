# TripMate AI

TripMate AI is a travel-planning application that combines a LangGraph multi-agent backend with a React + Vite frontend. The app plans trips using specialized agents for flights, hotels, weather, budget, and itinerary generation, and it supports human approval before finalizing a draft itinerary.

## Features

- Multi-agent travel planning with a LangGraph workflow
- Flight, hotel, weather, budget, and itinerary specialist agents
- Human-in-the-loop approval flow for itinerary drafts
- FastAPI backend with CORS-enabled API endpoints
- React frontend for interactive trip chat and plan review
- MongoDB-backed state persistence via LangGraph checkpoints

## Project structure

- `backend/` — FastAPI app, LangGraph workflow, and travel agents
- `frontend/` — Vite + React + TypeScript UI
- `LICENSE` — project license

## Tech stack

- Python 3.10+
- FastAPI
- LangGraph
- LangChain Groq integration
- MongoDB
- React
- Vite
- TypeScript

## Prerequisites

- Python environment with pip
- Node.js and npm
- MongoDB instance or connection string
- Groq API key

## Environment setup

Create a `.env` file inside `backend/` with the following variables:

```env
GROQ_API_KEY=your_groq_api_key
MONGODB_URI=mongodb://localhost:27017/travel_agent_mcp
```

If you are using a remote MongoDB instance, replace the `MONGODB_URI` value accordingly.

## Backend setup

From the project root:

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
```

Then run the FastAPI app:

```bash
python app.py
```

The backend will start on:

- `http://127.0.0.1:8000`

Key endpoints:

- `POST /api/travel` — generate a travel plan
- `POST /api/travel/approve` — approve or revise the draft plan
- `GET /health` — backend health check

## Frontend setup

From the project root:

```bash
cd frontend
npm install
npm run dev
```

The Vite frontend will start on:

- `http://localhost:5173`

## Typical workflow

1. Start the backend.
2. Start the frontend.
3. Enter a trip request in the chat UI.
4. Review the generated itinerary draft.
5. Approve the itinerary or send revision feedback.

## Notes

- The backend stores graph state in MongoDB using the configured checkpoint connection.
- The app expects a valid Groq API key to generate travel recommendations.
- If MongoDB or the Groq key is missing, the backend will fail at startup.

## License

This project is licensed under the MIT License. See `LICENSE` for details.