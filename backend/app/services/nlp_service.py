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


SYSTEM_PROMPT = """You are the intelligent NLP Intent Classifier & Query Generator for CampusNova, a university operations ERP system.

Given a user's natural language input, classify the request into EXACTLY ONE of four categories and respond with ONLY a JSON object:

CATEGORY 1: "query" — Valid informational ERP data query
Use when the user is asking to look up or aggregate real database records (students, teachers/faculty, classes/cohorts, attendance, substitutions, rooms, subjects).
Response JSON:
{
  "intent": "query",
  "collection": "<one of 'students', 'teachers', 'classes', 'student_attendance', 'faculty_attendance', 'substitutions', 'rooms', 'subjects'>",
  "mongodb_query": <dict for find() filter>,  // optional if using pipeline
  "pipeline": <list of aggregation stages>,    // optional if using mongodb_query
  "sort": <dict specifying sort order>,        // optional
  "limit": <integer max results up to 100>     // optional
}

Schema Context for queries:
- students: { student_id (e.g. "STU-001"), full_name, class_id ("CSE-A", "CSE-B", "ECE-A"), attendance_rate (0-100), grade ("3rd Year"), section ("A"|"B"), email }
- teachers: { teacher_id (e.g. "F01"), full_name ("Dr. Sharma"), subject ("Data Structures"), email, max_hours_per_week }
- classes: { class_id ("CSE-A"), name, capacity, room ("R101", "LAB1"), teacher_id, subject }
- student_attendance: { student_id, date ("YYYY-MM-DD"), status ("present"|"absent"|"excused"), class_id }
- subjects: { subject_id ("SUB-CS101"), name ("Data Structures"), department ("Computer Science") }
- rooms: { room_id ("R101"), name ("LH-101"), capacity (60), room_type ("Lecture Hall"|"Lab") }
- substitutions: { absent_teacher_id ("F01"), substitute_teacher_id ("F03"), date, time_slot ("P1") }

CATEGORY 2: "action" — Operational workflow intent
Use when the user wants to perform an operational action (e.g. resolve a substitute, generate a timetable, optimize transport routes, scan/upload a document, register a student/faculty, check policy in knowledge base).
Response JSON:
{
  "intent": "action",
  "message": "<Clear explanation of the operational workflow and what the user can do>",
  "route": "<one of '/substitute', '/timetable', '/transport', '/documents', '/knowledge', '/admin/users', '/attendance'>",
  "suggested_action": "<Label for the action button, e.g. 'Open Substitute Resolution'>"
}

CATEGORY 3: "conversational" — Casual remarks, greetings, nonsense, or unsupported inputs
Use for inputs like "yoo brother", "hello", "hi", "what's up", "how are you", or random text with no ERP query intent.
Response JSON:
{
  "intent": "conversational",
  "message": "Hello! I am your CampusNova ERP Operations Assistant. I can help you query students, faculty, timetables, attendance, substitutions, transport routes, and policy documents. Try asking 'Show all students in CSE-A' or 'Show faculty members'."
}

CATEGORY 4: "clarification" — Ambiguous queries needing more specifics
Use when a query is too vague to safely execute (e.g. "Show attendance", "Show records").
Response JSON:
{
  "intent": "clarification",
  "message": "Would you like to view overall student attendance, faculty clock-ins, or attendance for a specific cohort (e.g. CSE-A, CSE-B, ECE-A)?"
}

Rules:
1. Do NOT generate a database query for greetings, casual chatter, or operational tasks.
2. University cohorts are "CSE-A", "CSE-B", "ECE-A".
3. To query students by cohort/class (e.g. "Show students in CSE-A"), query collection "students" with {"class_id": "CSE-A"}.
4. To query faculty/teachers (e.g. "Show faculty members"), query collection "teachers" with {}.
5. Faculty IDs are "F01", "F02", etc.
6. Output ONLY the raw JSON object. No other text or markdown fences.
"""


FACULTY_MAP = {
    "sharma": ("F01", "Dr. Sharma"),
    "f01": ("F01", "Dr. Sharma"),
    "verma": ("F02", "Dr. Verma"),
    "f02": ("F02", "Dr. Verma"),
    "gupta": ("F03", "Prof. Gupta"),
    "f03": ("F03", "Prof. Gupta"),
    "mukherjee": ("F04", "Dr. Mukherjee"),
    "f04": ("F04", "Dr. Mukherjee"),
    "saxena": ("F05", "Prof. Saxena"),
    "f05": ("F05", "Prof. Saxena"),
    "nair": ("F08", "Prof. Nair"),
    "f08": ("F08", "Prof. Nair"),
    "sen": ("F14", "Prof. Sen"),
    "f14": ("F14", "Prof. Sen"),
}

PERIOD_TIMES = {
    0: ("P1", "09:00–10:00"),
    1: ("P2", "10:00–11:00"),
    2: ("P3", "11:00–12:00"),
    3: ("P4", "13:00–14:00"),
    4: ("P5", "14:00–15:00"),
    5: ("P6", "15:00–16:00"),
}

CANONICAL_TEACHER_SCHEDULES = {
    "F01": [
        {"day": 0, "period": 0, "cohort": "CSE-A", "subject": "Data Structures (SUB-CS101)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 2, "cohort": "CSE-B", "subject": "Data Structures (SUB-CS101)", "room": "LH-102 (R102)"},
        {"day": 1, "period": 1, "cohort": "CSE-A", "subject": "Data Structures (SUB-CS101)", "room": "LH-101 (R101)"},
        {"day": 2, "period": 0, "cohort": "CSE-B", "subject": "Data Structures (SUB-CS101)", "room": "LH-102 (R102)"},
        {"day": 3, "period": 3, "cohort": "CSE-A", "subject": "Data Structures (SUB-CS101)", "room": "Computing Lab (LAB1)"},
        {"day": 4, "period": 1, "cohort": "CSE-B", "subject": "Data Structures (SUB-CS101)", "room": "Computing Lab (LAB1)"},
    ],
    "F02": [
        {"day": 0, "period": 1, "cohort": "CSE-A", "subject": "Database Systems (SUB-CS103)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 3, "cohort": "CSE-B", "subject": "Database Systems (SUB-CS103)", "room": "LH-102 (R102)"},
        {"day": 2, "period": 2, "cohort": "CSE-A", "subject": "Database Systems (SUB-CS103)", "room": "LH-101 (R101)"},
    ],
    "F03": [
        {"day": 0, "period": 3, "cohort": "CSE-A", "subject": "Operating Systems (SUB-CS102)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 4, "cohort": "CSE-B", "subject": "Operating Systems (SUB-CS102)", "room": "LH-102 (R102)"},
    ],
    "F04": [
        {"day": 0, "period": 4, "cohort": "CSE-A", "subject": "Computer Networks (SUB-CS104)", "room": "LH-101 (R101)"},
        {"day": 1, "period": 0, "cohort": "CSE-A", "subject": "Computer Networks (SUB-CS104)", "room": "LH-101 (R101)"},
    ],
    "F05": [
        {"day": 0, "period": 5, "cohort": "CSE-A", "subject": "Discrete Mathematics (SUB-BS101)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 1, "cohort": "ECE-A", "subject": "Engineering Math III (SUB-BS102)", "room": "TR-201 (R201)"},
    ],
    "F08": [
        {"day": 0, "period": 0, "cohort": "ECE-A", "subject": "Digital Electronics (SUB-EC101)", "room": "Hardware Lab (LAB2)"},
        {"day": 0, "period": 2, "cohort": "ECE-A", "subject": "Signals & Systems (SUB-EC102)", "room": "TR-201 (R201)"},
    ],
    "F14": [
        {"day": 0, "period": 2, "cohort": "CSE-A", "subject": "Technical Communication (SUB-HS101)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 5, "cohort": "CSE-B", "subject": "Technical Communication (SUB-HS101)", "room": "LH-102 (R102)"},
    ]
}


class ERPCommandAgent:
    async def run(self, query: str) -> dict:
        q_lower = query.lower().strip()
        from datetime import datetime, timezone
        today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        day_idx = datetime.now(timezone.utc).weekday()

        # ── Pre-Classification Heuristics for Instant & Deterministic Routing ───
        
        # 1. Conversational greetings / chatter
        conversational_patterns = [
            r"^(hi|hello|hey|yoo|yoo brother|yo|greetings|good (morning|afternoon|evening)|howdy)\b",
            r"^what can you do\??$",
            r"^who are you\??$",
            r"^help\??$",
            r"^what is campusnova\??$"
        ]
        if any(re.search(p, q_lower) for p in conversational_patterns):
            return {
                "action_type": "conversational",
                "intent": "conversational",
                "target_collection": "system",
                "results": [],
                "summary": "Hello! I am your CampusNova ERP Operations Assistant. I can help you query students, faculty, timetables, attendance, substitutions, transport routes, and policy documents. Try asking 'Show all students in CSE-A' or 'Show Dr. Sharma's classes today'."
            }

        # 1b. Student Cohort Queries (e.g. "Show students in CSE-A")
        if any(c in q_lower for c in ["cse-a", "cse-b", "ece-a", "cse_a", "cse_b", "ece_a"]) and any(k in q_lower for k in ["student", "students", "cohort", "class", "all"]):
            cohort_id = "CSE-A" if ("cse-a" in q_lower or "cse_a" in q_lower) else ("CSE-B" if ("cse-b" in q_lower or "cse_b" in q_lower) else "ECE-A")
            collection = mongo_db.students_collection
            total_matches = await collection.count_documents({"class_id": cohort_id})
            cursor = collection.find({"class_id": cohort_id}, {"_id": 0}).limit(10)
            records = await cursor.to_list(length=10)
            preview_count = len(records)
            
            if total_matches == 0:
                summary = f"No students found enrolled in {cohort_id}."
            elif total_matches > preview_count:
                summary = f"{total_matches} records match this query. Showing the first {preview_count} records."
            else:
                summary = f"Found {total_matches} student{'s' if total_matches != 1 else ''} in {cohort_id}."

            return {
                "action_type": "find",
                "intent": "query",
                "target_collection": "students",
                "results": records,
                "total_matches": total_matches,
                "preview_count": preview_count,
                "preview_limit": 10,
                "summary": summary
            }

        # 2. Teacher Schedule & Timetable Intent
        schedule_keywords = ["classes today", "schedule today", "teaching today", "teaching at", "timetable", "periods does", "classes does", "classes of", "schedule of"]
        is_schedule_query = any(kw in q_lower for kw in schedule_keywords) or ("classes" in q_lower and any(f in q_lower for f in FACULTY_MAP.keys()))
        
        if is_schedule_query and not any(kw in q_lower for kw in ["substitute", "cover", "replace", "absence"]):
            matched_faculty = None
            for key, (fid, fname) in FACULTY_MAP.items():
                if key in q_lower:
                    matched_faculty = (fid, fname)
                    break
            
            if matched_faculty:
                fid, fname = matched_faculty
                # Retrieve schedule from canonical mapping or completed solver
                canonical_entries = CANONICAL_TEACHER_SCHEDULES.get(fid, [])
                slots = []
                for entry in canonical_entries:
                    if entry.get("day") == (day_idx % 5):
                        period = entry.get("period", 0)
                        slot_code, slot_time = PERIOD_TIMES.get(period, (f"P{period+1}", f"Period {period+1}"))
                        slots.append({
                            "period": slot_code,
                            "time": slot_time,
                            "cohort": entry.get("cohort", "CSE-A"),
                            "subject": entry.get("subject", "Subject"),
                            "room": entry.get("room", "LH-101"),
                            "faculty": fname,
                            "teacher_id": fid,
                        })
                
                # Sort slots by period
                slots.sort(key=lambda s: s["period"])

                if slots:
                    summary_text = f"{fname} ({fid}) has {len(slots)} scheduled classes today ({slots[0]['time']} to {slots[-1]['time']})."
                else:
                    summary_text = f"{fname} ({fid}) has no classes scheduled for today."

                return {
                    "action_type": "find",
                    "intent": "query",
                    "target_collection": "timetable",
                    "results": slots,
                    "total_matches": len(slots),
                    "preview_count": len(slots),
                    "preview_limit": 100,
                    "summary": summary_text,
                    "route": f"/timetable?faculty={fid}&date={today_date}",
                    "suggested_action": f"Open {fname}'s Schedule in Timetable",
                    "action_card": {
                        "title": f"Faculty Schedule — {fname} ({fid})",
                        "detail": f"{len(slots)} classes scheduled for today",
                        "faculty_name": fname,
                        "faculty_id": fid,
                        "route": f"/timetable?faculty={fid}&date={today_date}",
                        "action_label": "View in Timetable →"
                    }
                }

        # 3. Operational Substitute / Absence Workflow Action
        if any(kw in q_lower for kw in ["substitute", "cover for", "find a substitute", "assign substitute", "resolve substitute", "substitute resolution"]):
            matched_faculty = None
            for key, (fid, fname) in FACULTY_MAP.items():
                if key in q_lower:
                    matched_faculty = (fid, fname)
                    break
            
            fid, fname = matched_faculty if matched_faculty else ("F01", "Dr. Sharma")
            return {
                "action_type": "action",
                "intent": "action",
                "target_collection": "system",
                "results": [],
                "summary": f"To assign or resolve substitute coverage for {fname} ({fid}), navigate to the Substitute Resolution module. You can inspect their affected classes and select from ML-ranked candidates.",
                "route": f"/substitute?faculty={fid}",
                "suggested_action": f"Resolve Coverage for {fname}",
                "action_card": {
                    "title": "Faculty Absence Resolution",
                    "detail": f"Resolve coverage for {fname} ({fid})",
                    "faculty_name": fname,
                    "faculty_id": fid,
                    "route": f"/substitute?faculty={fid}",
                    "action_label": "Open Substitute Resolution →"
                }
            }

        # 4. Absent students query
        if any(kw in q_lower for kw in ["who is absent", "absent students", "absent today", "show absent"]):
            try:
                total_absent = await mongo_db.student_attendance_collection.count_documents({"status": "absent"})
                cursor = mongo_db.student_attendance_collection.find({"status": "absent"}, {"_id": 0}).limit(10)
                absent_records = await cursor.to_list(length=10)
                
                summary = (
                    f"{total_absent} students are currently marked absent. Showing the first {len(absent_records)} records."
                    if total_absent > len(absent_records)
                    else f"{total_absent} students are currently marked absent."
                )
                
                return {
                    "action_type": "find",
                    "intent": "query",
                    "target_collection": "student_attendance",
                    "results": absent_records,
                    "total_matches": total_absent,
                    "preview_count": len(absent_records),
                    "preview_limit": 10,
                    "summary": summary,
                    "route": "/attendance?filter=absent",
                    "suggested_action": "View All Absent Students in Attendance",
                    "action_card": {
                        "title": "Daily Student Attendance",
                        "detail": f"{total_absent} students marked absent today",
                        "route": "/attendance?filter=absent",
                        "action_label": "View in Attendance →"
                    }
                }
            except Exception as e:
                logger.error(f"Failed to query absent students: {e}")

        # 5. Timetable Generation Workflow Action
        if any(kw in q_lower for kw in ["generate a timetable", "create timetable", "solve timetable", "generate timetable", "run timetable solver"]):
            return {
                "action_type": "action",
                "intent": "action",
                "target_collection": "system",
                "results": [],
                "summary": "To generate or inspect class timetables across cohorts, launch the Timetable Engine to run the OR-Tools CP-SAT solver with 0-conflict constraints.",
                "route": "/timetable",
                "suggested_action": "Open Timetable Generator",
                "action_card": {
                    "title": "Timetable Solver Workspace",
                    "detail": "Run CP-SAT mathematical optimization for conflict-free scheduling",
                    "route": "/timetable",
                    "action_label": "Open Timetable Generator →"
                }
            }

        # 6. Transport Route Optimization Action
        if any(kw in q_lower for kw in ["optimize transport", "plan bus routes", "optimize bus", "create bus routes", "transport optimization"]):
            return {
                "action_type": "action",
                "intent": "action",
                "target_collection": "system",
                "results": [],
                "summary": "To configure vehicle fleet capacities and generate optimal student pickup routes with KMeans + TSP clustering, open the Smart Transport module.",
                "route": "/transport",
                "suggested_action": "Open Smart Transport",
                "action_card": {
                    "title": "Smart Transport Optimization",
                    "detail": "KMeans clustering & TSP route sequencing for campus vehicles",
                    "route": "/transport",
                    "action_label": "Open Transport Module →"
                }
            }

        # 7. Document OCR Intake Action
        if any(kw in q_lower for kw in ["upload document", "scan document", "ocr document", "intake document"]):
            return {
                "action_type": "action",
                "intent": "action",
                "target_collection": "system",
                "results": [],
                "summary": "To scan or upload student leave applications and certificates for multi-factor OCR verification, open the Document Intake module.",
                "route": "/documents",
                "suggested_action": "Open Document Intake",
                "action_card": {
                    "title": "Document Intake & OCR",
                    "detail": "Upload medical/leave documents for OCR extraction and attendance sync",
                    "route": "/documents",
                    "action_label": "Open Document Intake →"
                }
            }

        # 8. Ambiguous queries requiring clarification
        if q_lower in ["show attendance", "attendance", "view attendance", "attendance records"]:
            return {
                "action_type": "clarification",
                "intent": "clarification",
                "target_collection": "system",
                "results": [],
                "summary": "Would you like to view overall student attendance, faculty clock-ins, or attendance for a specific cohort (e.g. CSE-A, CSE-B, ECE-A)?",
                "route": "/attendance",
                "suggested_action": "Open Attendance Overview"
            }

        if not settings.OPENROUTER_API_KEY:
            # Fallback when no API key configured: perform regex matching on student cohorts
            if "cse-a" in q_lower or "cse_a" in q_lower:
                collection = mongo_db.students_collection
                total_matches = await collection.count_documents({"class_id": "CSE-A"})
                records = await collection.find({"class_id": "CSE-A"}, {"_id": 0}).limit(10).to_list(length=10)
                return {
                    "action_type": "find",
                    "intent": "query",
                    "target_collection": "students",
                    "results": records,
                    "total_matches": total_matches,
                    "preview_count": len(records),
                    "preview_limit": 10,
                    "summary": f"{total_matches} students match CSE-A. Showing the first {len(records)} records."
                }
            elif "faculty" in q_lower or "teachers" in q_lower:
                collection = mongo_db.teachers_collection
                total_matches = await collection.count_documents({})
                records = await collection.find({}, {"_id": 0}).limit(10).to_list(length=10)
                return {
                    "action_type": "find",
                    "intent": "query",
                    "target_collection": "teachers",
                    "results": records,
                    "total_matches": total_matches,
                    "preview_count": len(records),
                    "preview_limit": 10,
                    "summary": f"Found {total_matches} faculty members registered in CampusNova."
                }
            else:
                raise HTTPException(
                    status_code=503,
                    detail="OPENROUTER_API_KEY is not configured"
                )

        # 9. Call LLM for general unstructured NL query parsing
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
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

        # 10. Parse LLM JSON output
        try:
            raw_content = response.json()["choices"][0]["message"]["content"]
            match = re.search(r'(\{.*\}|\[.*\])', raw_content, re.DOTALL)
            if not match:
                raise ValueError("No JSON object found in response")
            json_str = match.group(1)
            llm_output = json.loads(json_str)
        except (KeyError, json.JSONDecodeError, ValueError):
            return {
                "action_type": "conversational",
                "intent": "conversational",
                "target_collection": "system",
                "results": [],
                "summary": "I can help with CampusNova operations. Try asking about students in CSE-A, faculty timetables, attendance, substitutions, transport, or documents."
            }

        intent = llm_output.get("intent", "query")

        # 11. Non-Query Intents (action, conversational, clarification)
        if intent in ["action", "conversational", "clarification"]:
            return {
                "action_type": intent,
                "intent": intent,
                "target_collection": "system",
                "results": [],
                "summary": llm_output.get("message", "How can I assist you with university operations?"),
                "route": llm_output.get("route"),
                "suggested_action": llm_output.get("suggested_action")
            }

        # 12. Validate and execute database query with true total count
        collection_name = llm_output.get("collection", "").strip()
        mongo_filter = llm_output.get("mongodb_query", {})

        if collection_name not in ALLOWED_COLLECTIONS:
            return {
                "action_type": "conversational",
                "intent": "conversational",
                "target_collection": "system",
                "results": [],
                "summary": "I could not find a matching dataset for that query. You can ask about students, faculty, classes, attendance, or substitutions."
            }

        pipeline = llm_output.get("pipeline")
        collection = ALLOWED_COLLECTIONS[collection_name]
        preview_limit = 10
        
        if pipeline is not None:
            if not isinstance(pipeline, list):
                raise HTTPException(status_code=422, detail="LLM returned a non-list pipeline")
                
            pipeline = sanitize_mongo_filter(pipeline)
            # Count total by running count on matches if first stage is $match
            all_records = await collection.aggregate(pipeline).to_list(length=200)
            total_matches = len(all_records)
            records = all_records[:preview_limit]
            action_type = "aggregate"
        else:
            if not isinstance(mongo_filter, dict):
                mongo_filter = {}
            mongo_filter = sanitize_mongo_filter(mongo_filter)
            
            # Calculate TRUE total matches count
            total_matches = await collection.count_documents(mongo_filter)
            
            cursor = collection.find(mongo_filter, {"_id": 0})
            
            # Apply optional sort
            sort_dict = llm_output.get("sort")
            if isinstance(sort_dict, dict) and sort_dict:
                sort_list = [(k, int(v)) for k, v in sort_dict.items()]
                cursor = cursor.sort(sort_list)
                
            cursor = cursor.limit(preview_limit)
            records = await cursor.to_list(length=preview_limit)
            action_type = "find"

        preview_count = len(records)

        # 13. Generate Executive Summary clearly communicating total vs preview
        if total_matches == 0:
            summary = f"No matching records found in {collection_name} for this query."
        elif total_matches > preview_count:
            summary = f"{total_matches} records match this query. Showing the first {preview_count} records."
        else:
            summary = f"Found {total_matches} matching record{'s' if total_matches != 1 else ''} in {collection_name}."

        return {
            "action_type": action_type,
            "intent": "query",
            "target_collection": collection_name,
            "results": records,
            "total_matches": total_matches,
            "preview_count": preview_count,
            "preview_limit": preview_limit,
            "summary": summary
        }


erp_agent = ERPCommandAgent()
