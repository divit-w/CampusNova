# AI Coding Rules for CampusNova

1. **No Hallucinations:** You must strictly adhere to `data_contracts.json`. Do not invent new fields or modify the data shape without explicit permission.
2. **Backend (Python):** 
   - Use `FastAPI` and `Pydantic` v2 for all API routes. 
   - Use the official `google-genai` SDK (`from google import genai`) for Gemini calls. Do not use the legacy `google-generativeai` package.
   - Use `ortools.sat.python.cp_model` for all timetable logic.
   - Never mock data silently; if an API call is required, write the actual integration.
3. **Validation & Quality:** 
   - Do not return placeholder logic or `TODO` comments. Write complete, working, and testable units.
   - Handle all CORS configurations and environment variables securely.