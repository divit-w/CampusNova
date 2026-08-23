import sys, os, math
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import asyncio
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.core.security import get_password_hash

# ─────────────────────────────────────────────────────────────────────────────
# Canonical Constants
# ─────────────────────────────────────────────────────────────────────────────
CAMPUS_LAT = settings.CAMPUS_LAT  # 28.6304
CAMPUS_LON = settings.CAMPUS_LON  # 77.3711

# 1. Canonical Faculty (7 Teachers)
CANONICAL_FACULTY = [
    {
        "teacher_id": "F01",
        "id": "F01",
        "full_name": "Dr. Sharma",
        "name": "Dr. Sharma",
        "subject": "Data Structures",
        "subjects": ["Data Structures"],
        "email": "dr.sharma@campusnova.edu",
        "max_hours": 14,
        "max_hours_per_week": 14,
        "total_historical_substitutions": 3,
        "historical_leave_probability": 0.05,
        "subject_compatibility_score": 0.95,
    },
    {
        "teacher_id": "F02",
        "id": "F02",
        "full_name": "Dr. Verma",
        "name": "Dr. Verma",
        "subject": "Database Systems",
        "subjects": ["Database Systems"],
        "email": "dr.verma@campusnova.edu",
        "max_hours": 14,
        "max_hours_per_week": 14,
        "total_historical_substitutions": 2,
        "historical_leave_probability": 0.08,
        "subject_compatibility_score": 0.90,
    },
    {
        "teacher_id": "F03",
        "id": "F03",
        "full_name": "Prof. Gupta",
        "name": "Prof. Gupta",
        "subject": "Operating Systems",
        "subjects": ["Operating Systems", "Data Structures"],
        "email": "prof.gupta@campusnova.edu",
        "max_hours": 14,
        "max_hours_per_week": 14,
        "total_historical_substitutions": 1,
        "historical_leave_probability": 0.04,
        "subject_compatibility_score": 0.92,
    },
    {
        "teacher_id": "F04",
        "id": "F04",
        "full_name": "Dr. Mukherjee",
        "name": "Dr. Mukherjee",
        "subject": "Computer Networks",
        "subjects": ["Computer Networks"],
        "email": "dr.mukherjee@campusnova.edu",
        "max_hours": 12,
        "max_hours_per_week": 12,
        "total_historical_substitutions": 4,
        "historical_leave_probability": 0.06,
        "subject_compatibility_score": 0.88,
    },
    {
        "teacher_id": "F05",
        "id": "F05",
        "full_name": "Prof. Saxena",
        "name": "Prof. Saxena",
        "subject": "Discrete Mathematics",
        "subjects": ["Discrete Mathematics"],
        "email": "prof.saxena@campusnova.edu",
        "max_hours": 16,
        "max_hours_per_week": 16,
        "total_historical_substitutions": 0,
        "historical_leave_probability": 0.02,
        "subject_compatibility_score": 0.96,
    },
    {
        "teacher_id": "F08",
        "id": "F08",
        "full_name": "Prof. Nair",
        "name": "Prof. Nair",
        "subject": "Digital Electronics",
        "subjects": ["Digital Electronics"],
        "email": "prof.nair@campusnova.edu",
        "max_hours": 14,
        "max_hours_per_week": 14,
        "total_historical_substitutions": 2,
        "historical_leave_probability": 0.07,
        "subject_compatibility_score": 0.89,
    },
    {
        "teacher_id": "F14",
        "id": "F14",
        "full_name": "Prof. Sen",
        "name": "Prof. Sen",
        "subject": "Technical Communication",
        "subjects": ["Technical Communication"],
        "email": "prof.sen@campusnova.edu",
        "max_hours": 12,
        "max_hours_per_week": 12,
        "total_historical_substitutions": 1,
        "historical_leave_probability": 0.03,
        "subject_compatibility_score": 0.94,
    },
]

# 2. Canonical Cohorts / Classes (3 Cohorts)
CANONICAL_COHORTS = [
    {
        "class_id": "CSE-A",
        "cohort_id": "CSE-A",
        "name": "CSE 3rd Year - Sec A",
        "student_count": 55,
        "grade": "3rd Year",
        "section": "A",
        "capacity": 60,
        "room": "LH-101",
        "subject": "Computer Science & Engineering",
        "teacher_id": "F01",
        "schedule_time": "09:00 - 15:00",
    },
    {
        "class_id": "CSE-B",
        "cohort_id": "CSE-B",
        "name": "CSE 3rd Year - Sec B",
        "student_count": 52,
        "grade": "3rd Year",
        "section": "B",
        "capacity": 60,
        "room": "LH-102",
        "subject": "Computer Science & Engineering",
        "teacher_id": "F02",
        "schedule_time": "09:00 - 15:00",
    },
    {
        "class_id": "ECE-A",
        "cohort_id": "ECE-A",
        "name": "ECE 3rd Year - Sec A",
        "student_count": 45,
        "grade": "3rd Year",
        "section": "ECE-A",
        "capacity": 60,
        "room": "TR-201",
        "subject": "Electronics & Communication",
        "teacher_id": "F08",
        "schedule_time": "09:00 - 15:00",
    },
]

# 3. Canonical Subjects (7 Subjects)
CANONICAL_SUBJECTS = [
    {"id": "SUB-CS101", "subject_id": "SUB-CS101", "name": "Data Structures", "room_type": "lab", "required_weekly_hours": 4},
    {"id": "SUB-CS102", "subject_id": "SUB-CS102", "name": "Operating Systems", "room_type": "lecture", "required_weekly_hours": 3},
    {"id": "SUB-CS103", "subject_id": "SUB-CS103", "name": "Database Systems", "room_type": "lecture", "required_weekly_hours": 3},
    {"id": "SUB-CS104", "subject_id": "SUB-CS104", "name": "Computer Networks", "room_type": "lecture", "required_weekly_hours": 3},
    {"id": "SUB-EC101", "subject_id": "SUB-EC101", "name": "Digital Electronics", "room_type": "lecture", "required_weekly_hours": 4},
    {"id": "SUB-BS101", "subject_id": "SUB-BS101", "name": "Discrete Mathematics", "room_type": "lecture", "required_weekly_hours": 3},
    {"id": "SUB-HS101", "subject_id": "SUB-HS101", "name": "Technical Communication", "room_type": "lecture", "required_weekly_hours": 2},
]

# 4. Canonical Rooms (4 Rooms)
CANONICAL_ROOMS = [
    {"id": "R101", "room_id": "R101", "name": "LH-101", "capacity": 60, "room_type": "lecture"},
    {"id": "R102", "room_id": "R102", "name": "LH-102", "capacity": 60, "room_type": "lecture"},
    {"id": "TR201", "room_id": "TR201", "name": "TR-201", "capacity": 30, "room_type": "seminar"},
    {"id": "LAB1", "room_id": "LAB1", "name": "Computing Lab", "capacity": 60, "room_type": "lab"},
]

# 5. 152 Canonical Students Pool
FIRST_NAMES = [
    "Aarav", "Priya", "Rohan", "Ananya", "Aditya", "Kavya", "Ishaan", "Neha", "Vikram", "Sanya",
    "Arjun", "Meghna", "Rahul", "Pooja", "Karan", "Tanvi", "Siddharth", "Rhea", "Nikhil", "Shreya",
    "Varun", "Divya", "Sameer", "Isha", "Manish", "Aishwarya", "Gaurav", "Anushka", "Kunal", "Sneha",
    "Harsh", "Deepika", "Pranav", "Simran", "Ayush", "Ritu", "Akash", "Swati", "Tushar", "Pallavi",
    "Abhishek", "Kritika", "Suraj", "Bhavna", "Vishal", "Akanksha", "Kartik", "Meera", "Mayank", "Preeti",
    "Dev", "Komal", "Yash", "Monika", "Deepak", "Payal", "Ankit", "Shruti", "Alok", "Rashmi",
    "Rohit", "Richa", "Sanjay", "Garima", "Mohit", "Jyoti", "Rajesh", "Nidhi", "Vivek", "Archana",
    "Sumit", "Vandana", "Amit", "Sapna", "Ashish", "Chhavi", "Sachin", "Barkha", "Sunil", "Charu"
]

LAST_NAMES = [
    "Patel", "Singh", "Gupta", "Reddy", "Kumar", "Joshi", "Mehta", "Chatterjee", "Malhotra", "Nair",
    "Rao", "Das", "Banerjee", "Agarwal", "Verma", "Saxena", "Choudhury", "Bhattacharya", "Kapoor", "Mishra",
    "Sen", "Iyer", "Thomas", "Sharma", "Aggarwal", "Deshmukh", "Kulkarni", "Patil", "Shah", "Pandey",
    "Tiwari", "Dubey", "Shukla", "Tripathi", "Srivastava", "Yadav", "Chauhan", "Bhatia", "Grover", "Seth"
]

def generate_canonical_students():
    students = []
    # Distribution: 55 in CSE-A, 52 in CSE-B, 45 in ECE-A (Total = 152)
    cohort_specs = [
        ("CSE-A", "3rd Year", "A", 55, 1),
        ("CSE-B", "3rd Year", "B", 52, 56),
        ("ECE-A", "3rd Year", "ECE-A", 45, 108),
    ]

    for cohort_id, grade, section, count, start_num in cohort_specs:
        for i in range(count):
            num = start_num + i
            student_id = f"STU-{num:03d}"
            
            # Deterministic name selection
            fn = FIRST_NAMES[(num * 3 + 7) % len(FIRST_NAMES)]
            ln = LAST_NAMES[(num * 5 + 11) % len(LAST_NAMES)]
            full_name = f"{fn} {ln}"
            email = f"{fn.lower()}.{ln.lower()}{num}@campusnova.edu" if num > 15 else f"{fn.lower()}.{ln.lower()}@campusnova.edu"
            
            # Deterministic geographic coordinates clustered in Delhi-NCR / Noida
            # Natural golden-angle Fermat spiral around campus (28.6304, 77.3711) within 1.8km to 11.5km
            angle = (num * 137.507764) * (math.pi / 180.0)  # Golden ratio spread
            radius_km = 1.8 + ((num * 17) % 95) / 10.0      # 1.8km to 11.2km continuous radius
            lat_km = radius_km * math.cos(angle)
            lon_km = radius_km * math.sin(angle)
            
            dlat = lat_km / 111.0
            dlon = lon_km / (111.0 * math.cos(math.radians(CAMPUS_LAT)))
            
            student_lat = round(CAMPUS_LAT + dlat, 5)
            student_lon = round(CAMPUS_LON + dlon, 5)
            
            # Deterministic attendance rate (78% to 99%)
            attendance_rate = round(80.0 + ((num * 17) % 200) / 10.0, 1)

            students.append({
                "student_id": student_id,
                "id": student_id,
                "full_name": full_name,
                "name": full_name,
                "class_id": cohort_id,
                "cohort_id": cohort_id,
                "grade": grade,
                "section": section,
                "email": email,
                "attendance_rate": attendance_rate,
                "home_location": [student_lat, student_lon],
            })
            
    return students

CANONICAL_STUDENTS = generate_canonical_students()

# 6. Canonical Auth User Accounts
CANONICAL_USERS = [
    {
        "id": "USR-ADMIN-001",
        "email": "demo-judge@campusnova.com",
        "password": "judge123",
        "full_name": "Hackathon Judge",
        "role": "admin",
    },
    {
        "id": "USR-ADMIN-002",
        "email": "admin@campusnova.edu",
        "password": "AdminPassword123!",
        "full_name": "CampusNova System Admin",
        "role": "admin",
    },
    # Primary Demo Faculty Account
    {
        "id": "USR-TCH-F01",
        "email": "dr.sharma@campusnova.edu",
        "password": "teacher123",
        "full_name": "Dr. Sharma",
        "role": "teacher",
    },
    {
        "id": "USR-TCH-F02",
        "email": "dr.verma@campusnova.edu",
        "password": "teacher123",
        "full_name": "Dr. Verma",
        "role": "teacher",
    },
    {
        "id": "USR-TCH-F03",
        "email": "prof.gupta@campusnova.edu",
        "password": "teacher123",
        "full_name": "Prof. Gupta",
        "role": "teacher",
    },
    {
        "id": "USR-TCH-F08",
        "email": "prof.nair@campusnova.edu",
        "password": "teacher123",
        "full_name": "Prof. Nair",
        "role": "teacher",
    },
    # Primary Demo Student Accounts
    {
        "id": "USR-STU-001",
        "email": "aarav.patel@campusnova.edu",
        "password": "student123",
        "full_name": "Aarav Patel",
        "role": "student",
    },
    {
        "id": "USR-STU-002",
        "email": "priya.singh@campusnova.edu",
        "password": "student123",
        "full_name": "Priya Singh",
        "role": "student",
    },
]

# 7. Canonical Operational Alerts
CANONICAL_ALERTS = [
    {
        "alert_id": "ALT-001",
        "type": "WARNING",
        "message": "High absenteeism risk flagged in CSE 3rd Year - Sec A. 3 students absent today.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "resolved": False,
    },
    {
        "alert_id": "ALT-002",
        "type": "CRITICAL",
        "message": "Substitute required for Dr. Sharma (Data Structures) during period P1.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "resolved": False,
    },
    {
        "alert_id": "ALT-003",
        "type": "INFO",
        "message": "Computing Lab (LAB1) maintenance scheduled for 18:00 UTC.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "resolved": True,
    },
]

DEMO_UNIVERSITY_ID = "demo-university"
DEMO_UNIVERSITY_NAME = "CampusNova Demo University"

for item in CANONICAL_FACULTY:
    item["university_id"] = DEMO_UNIVERSITY_ID

for item in CANONICAL_COHORTS:
    item["university_id"] = DEMO_UNIVERSITY_ID

for item in CANONICAL_SUBJECTS:
    item["university_id"] = DEMO_UNIVERSITY_ID

for item in CANONICAL_ROOMS:
    item["university_id"] = DEMO_UNIVERSITY_ID

for item in CANONICAL_STUDENTS:
    item["university_id"] = DEMO_UNIVERSITY_ID

for item in CANONICAL_ALERTS:
    item["university_id"] = DEMO_UNIVERSITY_ID

# ─────────────────────────────────────────────────────────────────────────────
# Seed Logic
# ─────────────────────────────────────────────────────────────────────────────

async def seed_database():
    print(f"Connecting to MongoDB at {settings.MONGO_URI} (DB: {settings.MONGO_DB_NAME})...")
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]

    print("Purging existing demo-university records for clean idempotent seed...")
    await db.teachers.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.classes.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.students.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.subjects.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.rooms.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.alerts.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.substitutions.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.student_attendance.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.faculty_attendance.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.active_timetable.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.timetable_jobs.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.knowledge_documents.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.document_audits.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.transport_routes.delete_many({"university_id": DEMO_UNIVERSITY_ID})
    await db.institutions.delete_many({"university_id": DEMO_UNIVERSITY_ID})

    # 0. Seed Demo Institution
    await db.institutions.update_one(
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

    # 1. Seed Faculty
    print(f"Seeding {len(CANONICAL_FACULTY)} canonical faculty members...")
    await db.teachers.insert_many([dict(f) for f in CANONICAL_FACULTY])

    # 2. Seed Cohorts / Classes
    print(f"Seeding {len(CANONICAL_COHORTS)} canonical cohorts...")
    await db.classes.insert_many([dict(c) for c in CANONICAL_COHORTS])

    # 3. Seed Subjects
    print(f"Seeding {len(CANONICAL_SUBJECTS)} canonical subjects...")
    await db.subjects.insert_many([dict(s) for s in CANONICAL_SUBJECTS])

    # 4. Seed Rooms
    print(f"Seeding {len(CANONICAL_ROOMS)} canonical rooms...")
    await db.rooms.insert_many([dict(r) for r in CANONICAL_ROOMS])

    # 5. Seed Students
    print(f"Seeding {len(CANONICAL_STUDENTS)} canonical students across 3 cohorts...")
    await db.students.insert_many([dict(st) for st in CANONICAL_STUDENTS])

    # 6. Seed Users (Idempotent upsert with hashed passwords)
    print(f"Seeding {len(CANONICAL_USERS)} auth user credentials...")
    for u in CANONICAL_USERS:
        hashed_pw = get_password_hash(u["password"])
        user_doc = {
            "id": u["id"],
            "email": u["email"],
            "hashed_password": hashed_pw,
            "full_name": u["full_name"],
            "role": u["role"],
            "university_id": DEMO_UNIVERSITY_ID,
            "university_name": DEMO_UNIVERSITY_NAME,
            "is_demo": True,
            "is_setup_complete": True,
        }
        await db.users.update_one(
            {"email": u["email"]},
            {"$set": user_doc},
            upsert=True
        )

    # 7. Seed Alerts
    print(f"Seeding {len(CANONICAL_ALERTS)} operational alerts...")
    await db.alerts.insert_many([dict(a) for a in CANONICAL_ALERTS])

    # 8. Seed Realistic 7-Day Attendance for Active Dashboard Visuals
    print("Seeding baseline historical student attendance records (past 6 days)...")
    today = datetime.now(timezone.utc).date()
    attendance_records = []
    
    # Seed historical days only (offset 6 down to 1). Today (day 0) starts clean with 0 records.
    for day_offset in range(6, 0, -1):
        record_date = (today - timedelta(days=day_offset)).strftime("%Y-%m-%d")
        for idx, student in enumerate(CANONICAL_STUDENTS):
            # Deterministic status: ~90% present, ~7% absent, ~3% excused
            hash_val = (idx * 31 + day_offset * 17) % 100
            if hash_val < 88:
                status = "present"
            elif hash_val < 96:
                status = "absent"
            else:
                status = "excused"
                
            attendance_records.append({
                "student_id": student["student_id"],
                "date": record_date,
                "status": status,
                "class_id": student["class_id"],
                "teacher_id": "F01" if student["class_id"] == "CSE-A" else ("F02" if student["class_id"] == "CSE-B" else "F08"),
                "university_id": DEMO_UNIVERSITY_ID,
                "updated_at": datetime.now(timezone.utc),
            })
            
    if attendance_records:
        await db.student_attendance.insert_many(attendance_records)

    print("\n==================================================")
    print("CANONICAL UNIVERSITY DEMO DATA SEEDED SUCCESSFULLY")
    print("==================================================")
    print(f"• Tenant ID:       {DEMO_UNIVERSITY_ID} ({DEMO_UNIVERSITY_NAME})")
    print(f"• Faculty Count:   {len(CANONICAL_FACULTY)} (F01, F02, F03, F04, F05, F08, F14)")
    print(f"• Cohorts Count:   {len(CANONICAL_COHORTS)} (CSE-A: 55, CSE-B: 52, ECE-A: 45)")
    print(f"• Students Count:  {len(CANONICAL_STUDENTS)} (STU-001 to STU-152 with geolocations)")
    print(f"• Subjects Count:  {len(CANONICAL_SUBJECTS)} (SUB-CS101 to SUB-HS101)")
    print(f"• Rooms Count:     {len(CANONICAL_ROOMS)} (R101, R102, TR201, LAB1)")
    print(f"• Auth Accounts:   {len(CANONICAL_USERS)} (Admin, Faculty, Student)")
    print(f"• Attendance Days: 7 days ({len(attendance_records)} records)")
    print("==================================================\n")

if __name__ == "__main__":
    asyncio.run(seed_database())