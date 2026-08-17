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
    "classes": mongo_db.classes_collection,
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
    "$lookup",       # prevents heavy join attacks
    "$out",          # prevents db writes
    "$merge",        # prevents db writes
})

def sanitize_mongo_filter(filter_dict: Any, path: str = "root") -> Any:
    """
    Recursively walk a MongoDB filter dictionary or pipeline list and reject any key that is a
    prohibited operator. Raises HTTPException(400) on the first violation so
    the request is blocked before any DB I/O occurs.

    This is a strict allowlist-by-exclusion approach: all standard equality and
    comparison operators ($eq, $gt, $lt, $gte, $lte, $in, $nin, $ne, $and,
    $or, $not, $nor, $exists, $type, $mod, $all, $elemMatch, $size, $match, $group, $project) are
    permitted because they cannot execute arbitrary code on the server.
    """
    if isinstance(filter_dict, list):
        return [
            sanitize_mongo_filter(item, path=f"{path}[]")
            if isinstance(item, (dict, list))
            else item
            for item in filter_dict
        ]
        
    if not isinstance(filter_dict, dict):
        return filter_dict  # scalars pass through unchanged

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
            
        # Basic ReDoS guard: allow $regex but restrict length and complexity
        if key == "$regex":
            if not isinstance(value, str) or len(value) > 40:
                raise HTTPException(status_code=400, detail="Regex pattern too complex or long.")
        
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
Given a natural language query, you must respond ONLY with a JSON object containing up to four keys:
- "collection" (required): one of ["students", "teachers", "classes", "student_attendance", "faculty_attendance", "substitutions", "rooms", "subjects"]
- "mongodb_query" (optional): a valid MongoDB query filter dictionary (used in a find() call).
- "pipeline" (optional): a list of MongoDB aggregation stages (e.g. [{"$match": ...}, {"$group": ...}]) for analytical queries like counts or averages.
- "sort" (optional): a dictionary specifying the sort order.
- "limit" (optional): an integer specifying the maximum number of results.

You MUST provide either "mongodb_query" OR "pipeline", but not both.

Schema Context:
- students: { student_id, full_name, class_id, attendance_rate (float 0-100), grade, section, email }
- teachers: { teacher_id, full_name, subject, email, max_hours_per_week }
- classes: { class_id, name, capacity, room, teacher_id, subject }
- student_attendance: { student_id, date, status ("present" or "absent"), class_id }

Rules:
1. Typo Tolerance: Automatically correct minor typos in names, subjects, or roles.
2. Data Format: Class IDs follow the format `CLS-[Grade][Section]` (e.g., "CLS-10A").
3. Partial Matching: If the user queries for a broad group like "class 10", generate a safe regex query: {"class_id": {"$regex": "10", "$options": "i"}}.
4. Analytics: Use "pipeline" for math. You may use $match, $group, $project, $avg, $sum, $count.

Do not include any explanation. Output ONLY the raw JSON object.

Example 1 (Find):
User: "Show me the 3 students in class 10 with the lowest attendance."
Output: {"collection": "students", "mongodb_query": {"class_id": {"$regex": "10", "$options": "i"}}, "sort": {"attendance_rate": 1}, "limit": 3}

Example 2 (Aggregate Math):
User: "What is the average attendance of class 10?"
Output: {"collection": "students", "pipeline": [{"$match": {"class_id": {"$regex": "10", "$options": "i"}}}, {"$group": {"_id": "$class_id", "average_attendance": {"$avg": "$attendance_rate"}}}]}

Example 3 (Aggregate Count):
User: "Count the number of teachers in each department"
Output: {"collection": "teachers", "pipeline": [{"$group": {"_id": "$subject", "total": {"$sum": 1}}}]}
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

        pipeline = llm_output.get("pipeline")
        collection = ALLOWED_COLLECTIONS[collection_name]
        
        if pipeline is not None:
            if not isinstance(pipeline, list):
                raise HTTPException(status_code=422, detail="LLM returned a non-list pipeline")
                
            pipeline = sanitize_mongo_filter(pipeline)
            cursor = collection.aggregate(pipeline)
            records = await cursor.to_list(length=100)
            action_type = "aggregate"
        else:
            if not isinstance(mongo_filter, dict):
                raise HTTPException(
                    status_code=422,
                    detail="LLM returned a non-dict mongodb_query"
                )
            mongo_filter = sanitize_mongo_filter(mongo_filter)
            cursor = collection.find(mongo_filter, {"_id": 0})
            
            # Apply optional sort
            sort_dict = llm_output.get("sort")
            if isinstance(sort_dict, dict) and sort_dict:
                sort_list = [(k, int(v)) for k, v in sort_dict.items()]
                cursor = cursor.sort(sort_list)
                
            # Apply limit with a hard maximum of 100
            limit_val = llm_output.get("limit")
            if isinstance(limit_val, int) and limit_val > 0:
                limit_val = min(limit_val, 100)
            else:
                limit_val = 100
                
            cursor = cursor.limit(limit_val)
            records = await cursor.to_list(length=limit_val)
            action_type = "find"

        # 6. Generate Executive AI Summary
        summary = None
        if records:
            # Slice records to avoid blowing up context window (max 15 rows)
            sample_data = records[:15]
            summary_prompt = (
                "You are an executive assistant for a school ERP. "
                "Provide a concise, 1-2 sentence executive summary of the data below in response to the user's query. Do not use markdown or list formatting. Just return conversational text.\n"
                f"User Query: {query}\n"
                f"Data Extract: {json.dumps(sample_data, default=str)}"
            )
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    summary_resp = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "meta-llama/llama-3.1-8b-instruct",
                            "messages": [{"role": "system", "content": summary_prompt}],
                            "temperature": 0.3,
                        },
                    )
                    summary_resp.raise_for_status()
                    summary_content = summary_resp.json()["choices"][0]["message"]["content"].strip()
                    if summary_content:
                        summary = summary_content
            except Exception as e:
                logger.error(f"Failed to generate AI summary: {e}")
                # Degrade gracefully if summarization fails
                pass

        return {
            "action_type": action_type,
            "target_collection": collection_name,
            "results": records,
            "summary": summary
        }


erp_agent = ERPCommandAgent()
