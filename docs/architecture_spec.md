# CampusNova: Architecture Spec

## Tech Stack
* **Frontend:** Next.js (App Router), Tailwind CSS, v0 (for UI components), Zustand (State Management).
* **Backend:** Python, FastAPI, Pydantic (validation).
* **AI & Algorithms:** 
  * `openai` Python SDK (using OpenRouter's `openrouter/free` model) for OCR Document Extraction.
  * Google OR-Tools (CP-SAT Solver) for Timetable Constraint Resolution.
* **Database:** MongoDB Atlas (primary data), ChromaDB (local SQLite for RAG validation).

## Core API Routes (Backend)
1. `POST /api/v1/documents/extract` -> Accepts an image upload, returns `DocumentSchema`.
2. `POST /api/v1/timetable/generate` -> Accepts `TimetableRequest`, returns an optimized schedule.
3. `GET /api/v1/alerts/stream` -> Server-Sent Events (SSE) endpoint for proactive dashboard alerts.