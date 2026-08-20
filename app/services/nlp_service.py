import json
import logging
import httpx
import re
from typing import Any
from fastapi import HTTPException
from app.core.config import settings
from app.services.mongo_service import mongo_db

logger = logging.getLogger(__name__)

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

# MongoDB operators that can execute arbitrary server-side code or bypass query
# logic entirely. These must never appear in an LLM-generated filter, regardless
# of the collection allowlist.
DANGEROUS_OPERATORS: frozenset[str] = frozenset({
    "$where",        # executes arbitrary JavaScript on the server
    "$function",     # BSON function execution (MongoDB 4.4+)
    "$accumulator",  # custom aggregation accumulator with server-side JS
    "$expr",         # aggregation expressions — can embed $function
    "$jsonSchema",   # schema validation — can be abused for enumeration
    "$text",         # full-text search — potentially expensive / injectable
    "$regex",        # regex can cause ReDoS on unvalidated patterns
})


def sanitize_mongo_filter(filter_dict: Any, path: str = "root") -> dict:
    """
    Recursively walk a MongoDB filter dictionary and reject any key that is a
    prohibited operator. Raises HTTPException(400) on the first violation so
    the request is blocked before any DB I/O occurs.

    This is a strict allowlist-by-exclusion approach: all standard equality and
    comparison operators ($eq, $gt, $lt, $gte, $lte, $in, $nin, $ne, $and,
    $or, $not, $nor, $exists, $type, $mod, $all, $elemMatch, $size) are
    permitted because they cannot execute arbitrary code on the server.
    """
    if not isinstance(filter_dict, dict):
        return filter_dict  # scalars and lists pass through unchanged

    sanitized: dict = {}
    for key, value in filter_dict.items():
        if key in DANGEROUS_OPERATORS:
            logger.warning(
                f"NLP agent blocked dangerous operator '{key}' at path '{path}'"
            )
            raise HTTPException(
                status_code=400,
                detail="Dangerous MongoDB operator detected.",
            )
        # Recurse into nested dicts (e.g., {"field": {"$gt": 5}}) and lists
        if isinstance(value, dict):
            sanitized[key] = sanitize_mongo_filter(value, path=f"{path}.{key}")
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_mongo_filter(item, path=f"{path}.{key}[]")
                if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            sanitized[key] = value

    return sanitized


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

        # 2. Parse the LLM's JSON response using Regex for robustness
        try:
            raw_content = response.json()["choices"][0]["message"]["content"]
            match = re.search(r'(\{.*\}|\[.*\])', raw_content, re.DOTALL)
            if not match:
                raise ValueError("No JSON object found in response")
            json_str = match.group(1)
            llm_output = json.loads(json_str)
        except (KeyError, json.JSONDecodeError, ValueError) as e:
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

        # 4. Parameterization guard: strip dangerous MongoDB operators before DB I/O.
        # This is defense-in-depth on top of the collection allowlist — it prevents
        # $where, $function, $regex, and other arbitrary-execution operators from
        # reaching MongoDB regardless of how the LLM constructs the filter.
        mongo_filter = sanitize_mongo_filter(mongo_filter)

        # 5. Execute strictly as a find() — never insert/update/delete
        collection = ALLOWED_COLLECTIONS[collection_name]
        cursor = collection.find(mongo_filter, {"_id": 0})
        records = await cursor.to_list(length=100)

        return {
            "action_type": "find",
            "target_collection": collection_name,
            "results": records,
        }


erp_agent = ERPCommandAgent()
