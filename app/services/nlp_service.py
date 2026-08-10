import json
import httpx
from fastapi import HTTPException
from app.core.config import settings
from app.services.mongo_service import mongo_db

# Strict allowlist — only read-only collections are queryable via NLP prompt.
# This prevents prompt injection from reaching write-capable collections like users.
ALLOWED_COLLECTIONS = {
    "students": mongo_db.students_collection,
    "teachers": mongo_db.teachers_collection,
    "student_attendance": mongo_db.student_attendance_collection,
    "faculty_attendance": mongo_db.faculty_attendance_collection,
    "substitutions": mongo_db.substitutions_collection,
    "rooms": mongo_db.rooms_collection,
    "subjects": mongo_db.subjects_collection,
}

SYSTEM_PROMPT = """You are a MongoDB query generator for a school ERP system.
Given a natural language query, you must respond ONLY with a JSON object containing exactly two keys:
- "collection": one of ["students", "teachers", "student_attendance", "faculty_attendance", "substitutions", "rooms", "subjects"]
- "mongodb_query": a valid MongoDB query filter dictionary (used in a find() call)

Do not include any explanation, markdown formatting, or additional text. Output ONLY the raw JSON object.

Example:
User: "Show me all absent students in class CS101"
Output: {"collection": "student_attendance", "mongodb_query": {"status": "absent", "class_id": "CS101"}}
"""


class ERPCommandAgent:
    async def run(self, query: str) -> dict:
        if not settings.OPENROUTER_API_KEY:
            raise HTTPException(
                status_code=503,
                detail="OPENROUTER_API_KEY is not configured"
            )

        # 1. Call the LLM to parse the NL query into a structured MongoDB filter
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "meta-llama/llama-3.1-8b-instruct",
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": query},
                        ],
                        "temperature": 0.0,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"LLM API error: {e.response.status_code}"
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"LLM request failed: {str(e)}")

        # 2. Parse the LLM's JSON response
        try:
            raw_content = response.json()["choices"][0]["message"]["content"].strip()
            # Strip markdown fences if the model wraps them anyway
            if raw_content.startswith("```"):
                raw_content = raw_content.split("```")[1]
                if raw_content.startswith("json"):
                    raw_content = raw_content[4:]
                raw_content = raw_content.strip()
            llm_output = json.loads(raw_content)
        except (KeyError, json.JSONDecodeError) as e:
            raise HTTPException(
                status_code=422,
                detail=f"LLM returned unparseable response: {str(e)}"
            )

        # 3. Validate the collection name against the strict allowlist
        collection_name = llm_output.get("collection", "").strip()
        mongo_filter = llm_output.get("mongodb_query", {})

        if collection_name not in ALLOWED_COLLECTIONS:
            raise HTTPException(
                status_code=422,
                detail=f"LLM suggested disallowed collection: '{collection_name}'"
            )

        if not isinstance(mongo_filter, dict):
            raise HTTPException(
                status_code=422,
                detail="LLM returned a non-dict mongodb_query"
            )

        # 4. Execute strictly as a find() — never insert/update/delete
        collection = ALLOWED_COLLECTIONS[collection_name]
        cursor = collection.find(mongo_filter, {"_id": 0})
        records = await cursor.to_list(length=100)

        return {
            "action_type": "find",
            "target_collection": collection_name,
            "results": records,
        }


erp_agent = ERPCommandAgent()
