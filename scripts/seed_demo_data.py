import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

# Fallback to localhost if environment variable is not set
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "campusnova")

async def seed_database():
    print(f"Connecting to MongoDB at {MONGO_URI}...")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    print("Purging existing demo data for idempotency...")
    await db.classes.delete_many({})
    await db.teachers.delete_many({})
    await db.students.delete_many({})
    await db.alerts.delete_many({})

    # 1. Seed Classes
    print("Seeding Classes...")
    classes_data = [
        {"class_id": "CLS-10A", "name": "Grade 10-A", "capacity": 40, "room": "Room 101"},
        {"class_id": "CLS-10B", "name": "Grade 10-B", "capacity": 40, "room": "Room 102"},
        {"class_id": "CLS-11C", "name": "Grade 11-Commerce", "capacity": 35, "room": "Room 201"},
        {"class_id": "CLS-12S", "name": "Grade 12-Science", "capacity": 30, "room": "Room 301"},
        {"class_id": "CLS-12H", "name": "Grade 12-Humanities", "capacity": 30, "room": "Room 302"},
    ]
    await db.classes.insert_many(classes_data)

    # 2. Seed Teachers
    print("Seeding Teachers...")
    teachers_data = [
        {"teacher_id": "TCH-001", "full_name": "Dr. Arvind Sharma", "subject": "Advanced Mathematics", "email": "arvind.sharma@campusnova.edu", "max_hours_per_week": 20},
        {"teacher_id": "TCH-002", "full_name": "Prof. Meera Verma", "subject": "Physics", "email": "meera.verma@campusnova.edu", "max_hours_per_week": 18},
        {"teacher_id": "TCH-003", "full_name": "Mr. Rajesh Iyer", "subject": "Computer Science", "email": "rajesh.iyer@campusnova.edu", "max_hours_per_week": 25},
        {"teacher_id": "TCH-004", "full_name": "Ms. Kavita Desai", "subject": "Chemistry", "email": "kavita.desai@campusnova.edu", "max_hours_per_week": 22},
        {"teacher_id": "TCH-005", "full_name": "Dr. Anil Kapoor", "subject": "English Literature", "email": "anil.kapoor@campusnova.edu", "max_hours_per_week": 15},
    ]
    await db.teachers.insert_many(teachers_data)

    # 3. Seed Students
    print("Seeding Students...")
    students_data = [
        {"student_id": "STU-001", "full_name": "Aarav Patel", "class_id": "CLS-10A", "attendance_rate": 95.5},
        {"student_id": "STU-002", "full_name": "Priya Singh", "class_id": "CLS-10A", "attendance_rate": 98.0},
        {"student_id": "STU-003", "full_name": "Rohan Gupta", "class_id": "CLS-10A", "attendance_rate": 82.5},
        {"student_id": "STU-004", "full_name": "Ananya Reddy", "class_id": "CLS-10B", "attendance_rate": 91.0},
        {"student_id": "STU-005", "full_name": "Aditya Kumar", "class_id": "CLS-10B", "attendance_rate": 88.5},
        {"student_id": "STU-006", "full_name": "Kavya Joshi", "class_id": "CLS-11C", "attendance_rate": 99.0},
        {"student_id": "STU-007", "full_name": "Ishaan Mehta", "class_id": "CLS-11C", "attendance_rate": 76.0},
        {"student_id": "STU-008", "full_name": "Neha Chatterjee", "class_id": "CLS-11C", "attendance_rate": 94.5},
        {"student_id": "STU-009", "full_name": "Vikram Malhotra", "class_id": "CLS-12S", "attendance_rate": 97.5},
        {"student_id": "STU-010", "full_name": "Sanya Nair", "class_id": "CLS-12S", "attendance_rate": 89.0},
        {"student_id": "STU-011", "full_name": "Arjun Rao", "class_id": "CLS-12S", "attendance_rate": 92.5},
        {"student_id": "STU-012", "full_name": "Meghna Das", "class_id": "CLS-12H", "attendance_rate": 85.0},
        {"student_id": "STU-013", "full_name": "Rahul Banerjee", "class_id": "CLS-12H", "attendance_rate": 90.0},
        {"student_id": "STU-014", "full_name": "Pooja Agarwal", "class_id": "CLS-12H", "attendance_rate": 96.0},
        {"student_id": "STU-015", "full_name": "Karan Singh", "class_id": "CLS-10B", "attendance_rate": 81.0},
    ]
    await db.students.insert_many(students_data)

    # 4. Seed Alerts
    print("Seeding Alerts...")
    alerts_data = [
        {
            "alert_id": "ALT-001",
            "type": "WARNING",
            "message": "High absenteeism detected in Grade 10-A. 3 students absent today.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        },
        {
            "alert_id": "ALT-002",
            "type": "CRITICAL",
            "message": "Substitute required for Prof. Meera Verma (Physics) at 10:00 AM.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": False
        },
        {
            "alert_id": "ALT-003",
            "type": "INFO",
            "message": "Network maintenance scheduled for Campus Wi-Fi at Midnight.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "resolved": True
        }
    ]
    await db.alerts.insert_many(alerts_data)

    print("Database seeding completed successfully! Your demo data is locked and loaded.")

if __name__ == "__main__":
    asyncio.run(seed_database())