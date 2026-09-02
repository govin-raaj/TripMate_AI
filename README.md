# MCP_bot

TripMate AI travel planner.

Quick start:

1. Activate the project environment.
2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Start the Streamlit UI:
   ```bash
   streamlit run streamlit_app.py
   ```
4. Or start the FastAPI backend:
   ```bash
   python backend/app.py
   ```

The Streamlit interface connects to the same LangGraph travel-planning backend used by the API routes.