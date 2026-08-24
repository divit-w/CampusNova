import logging
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from app.core.security import get_password_hash
from app.services.mongo_service import mongo_db

logger = logging.getLogger(__name__)

DEMO_UNIVERSITY_ID = settings.DEMO_UNIVERSITY_ID
DEMO_UNIVERSITY_NAME = "CampusNova Demo University"

CANONICAL_FACULTY = [
    {"teacher_id": "F01", "id": "F01", "full_name": "Dr. Sharma", "name": "Dr. Sharma", "subject": "Data Structures", "subjects": ["Data Structures"], "email": "dr.sharma@campusnova.edu", "max_hours": 14, "max_hours_per_week": 14, "total_historical_substitutions": 3, "historical_leave_probability": 0.05, "subject_compatibility_score": 0.95},
    {"teacher_id": "F02", "id": "F02", "full_name": "Dr. Verma", "name": "Dr. Verma", "subject": "Database Systems", "subjects": ["Database Systems"], "email": "dr.verma@campusnova.edu", "max_hours": 14, "max_hours_per_week": 14, "total_historical_substitutions": 2, "historical_leave_probability": 0.08, "subject_compatibility_score": 0.90},
    {"teacher_id": "F03", "id": "F03", "full_name": "Prof. Gupta", "name": "Prof. Gupta", "subject": "Operating Systems", "subjects": ["Operating Systems", "Data Structures"], "email": "prof.gupta@campusnova.edu", "max_hours": 14, "max_hours_per_week": 14, "total_historical_substitutions": 1, "historical_leave_probability": 0.04, "subject_compatibility_score": 0.92},
    {"teacher_id": "F04", "id": "F04", "full_name": "Dr. Iyer", "name": "Dr. Iyer", "subject": "Algorithms", "subjects": ["Algorithms", "Data Structures"], "email": "dr.iyer@campusnova.edu", "max_hours": 12, "max_hours_per_week": 12, "total_historical_substitutions": 4, "historical_leave_probability": 0.06, "subject_compatibility_score": 0.94},
    {"teacher_id": "F05", "id": "F05", "full_name": "Prof. Saxena", "name": "Prof. Saxena", "subject": "Computer Networks", "subjects": ["Computer Networks"], "email": "prof.saxena@campusnova.edu", "max_hours": 16, "max_hours_per_week": 16, "total_historical_substitutions": 0, "historical_leave_probability": 0.02, "subject_compatibility_score": 0.96},
    {"teacher_id": "F08", "id": "F08", "full_name": "Prof. Nair", "name": "Prof. Nair", "subject": "Digital Electronics", "subjects": ["Digital Electronics"], "email": "prof.nair@campusnova.edu", "max_hours": 14, "max_hours_per_week": 14, "total_historical_substitutions": 2, "historical_leave_probability": 0.07, "subject_compatibility_score": 0.89},
    {"teacher_id": "F14", "id": "F14", "full_name": "Prof. Sen", "name": "Prof. Sen", "subject": "Technical Communication", "subjects": ["Technical Communication"], "email": "prof.sen@campusnova.edu", "max_hours": 12, "max_hours_per_week": 12, "total_historical_substitutions": 1, "historical_leave_probability": 0.03, "subject_compatibility_score": 0.91},
]

CANONICAL_COHORTS = [
    {"class_id": "CSE-A", "id": "CSE-A", "grade": "3rd Year", "section": "A", "department": "Computer Science", "student_count": 55, "teacher_id": "F01"},
    {"class_id": "CSE-B", "id": "CSE-B", "grade": "3rd Year", "section": "B", "department": "Computer Science", "student_count": 52, "teacher_id": "F02"},
    {"class_id": "ECE-A", "id": "ECE-A", "grade": "2nd Year", "section": "A", "department": "Electronics", "student_count": 45, "teacher_id": "F08"},
]

CANONICAL_SUBJECTS = [
    {"subject_id": "SUB-CS101", "name": "Data Structures", "code": "CS101", "department": "Computer Science", "credits": 4},
    {"subject_id": "SUB-CS102", "name": "Database Systems", "code": "CS102", "department": "Computer Science", "credits": 4},
    {"subject_id": "SUB-CS103", "name": "Operating Systems", "code": "CS103", "department": "Computer Science", "credits": 3},
    {"subject_id": "SUB-CS104", "name": "Algorithms", "code": "CS104", "department": "Computer Science", "credits": 4},
    {"subject_id": "SUB-CS105", "name": "Computer Networks", "code": "CS105", "department": "Computer Science", "credits": 3},
    {"subject_id": "SUB-EC201", "name": "Digital Electronics", "code": "EC201", "department": "Electronics", "credits": 4},
    {"subject_id": "SUB-HS101", "name": "Technical Communication", "code": "HS101", "department": "Humanities", "credits": 2},
]

CANONICAL_ROOMS = [
    {"room_id": "R101", "name": "Lecture Hall 101", "capacity": 60, "type": "LECTURE", "building": "Academic Block A"},
    {"room_id": "R102", "name": "Lecture Hall 102", "capacity": 60, "type": "LECTURE", "building": "Academic Block A"},
    {"room_id": "TR201", "name": "Seminar Room 201", "capacity": 50, "type": "SEMINAR", "building": "Academic Block B"},
    {"room_id": "LAB1", "name": "Computing Lab 1", "capacity": 40, "type": "LAB", "building": "Tech Tower"},
]

from pymongo import UpdateOne

async def seed_canonical_demo_data():
    """Seeds the full canonical demo university dataset into MongoDB cleanly and quickly."""
    logger.info("Seeding canonical demo data...")

    # Seed Institution
    await mongo_db.institutions_collection.update_one(
        {"university_id": DEMO_UNIVERSITY_ID},
        {"$set": {
            "university_id": DEMO_UNIVERSITY_ID,
            "name": DEMO_UNIVERSITY_NAME,
            "is_setup_complete": True,
            "is_demo": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True
    )

    # Seed Teachers
    teacher_ops = []
    for f in CANONICAL_FACULTY:
        doc = dict(f)
        doc["university_id"] = DEMO_UNIVERSITY_ID
        teacher_ops.append(UpdateOne(
            {"university_id": DEMO_UNIVERSITY_ID, "teacher_id": doc["teacher_id"]},
            {"$set": doc},
            upsert=True
        ))
    if teacher_ops:
        await mongo_db.teachers_collection.bulk_write(teacher_ops)

    # Seed Classes
    class_ops = []
    for c in CANONICAL_COHORTS:
        doc = dict(c)
        doc["university_id"] = DEMO_UNIVERSITY_ID
        class_ops.append(UpdateOne(
            {"university_id": DEMO_UNIVERSITY_ID, "class_id": doc["class_id"]},
            {"$set": doc},
            upsert=True
        ))
    if class_ops:
        await mongo_db.classes_collection.bulk_write(class_ops)

    # Seed Subjects
    subject_ops = []
    for s in CANONICAL_SUBJECTS:
        doc = dict(s)
        doc["university_id"] = DEMO_UNIVERSITY_ID
        subject_ops.append(UpdateOne(
            {"university_id": DEMO_UNIVERSITY_ID, "subject_id": doc["subject_id"]},
            {"$set": doc},
            upsert=True
        ))
    if subject_ops:
        await mongo_db.subjects_collection.bulk_write(subject_ops)

    # Seed Rooms
    room_ops = []
    for r in CANONICAL_ROOMS:
        doc = dict(r)
        doc["university_id"] = DEMO_UNIVERSITY_ID
        room_ops.append(UpdateOne(
            {"university_id": DEMO_UNIVERSITY_ID, "room_id": doc["room_id"]},
            {"$set": doc},
            upsert=True
        ))
    if room_ops:
        await mongo_db.rooms_collection.bulk_write(room_ops)

    # Seed 152 Students via bulk_write
    student_ops = []
    first_names = ["Aarav", "Priya", "Rohan", "Ananya", "Vihaan", "Isha", "Aditya", "Kavya", "Siddharth", "Diya"]
    last_names = ["Patel", "Singh", "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Reddy", "Joshi", "Kumar"]
    cohort_assignments = [("CSE-A", 55), ("CSE-B", 52), ("ECE-A", 45)]
    global_student_idx = 1
    for class_id, count in cohort_assignments:
        for i in range(count):
            sid = f"STU-{global_student_idx:03d}"
            fn = first_names[(global_student_idx * 3 + i) % len(first_names)]
            ln = last_names[(global_student_idx * 7 + i) % len(last_names)]
            doc = {
                "student_id": sid,
                "id": sid,
                "full_name": f"{fn} {ln}",
                "name": f"{fn} {ln}",
                "email": f"{fn.lower()}.{ln.lower()}{global_student_idx}@campusnova.edu",
                "class_id": class_id,
                "roll_number": f"{class_id}-{i+1:02d}",
                "university_id": DEMO_UNIVERSITY_ID,
            }
            student_ops.append(UpdateOne(
                {"university_id": DEMO_UNIVERSITY_ID, "student_id": sid},
                {"$set": doc},
                upsert=True
            ))
            global_student_idx += 1

    if student_ops:
        await mongo_db.students_collection.bulk_write(student_ops)

    logger.info("Canonical demo dataset seeded successfully.")
