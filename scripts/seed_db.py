import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_db():
    logger.info("Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGO_URI)
    db = client[settings.MONGO_DB_NAME]
    
    logger.info("Dropping existing collections...")
    await db.students.drop()
    await db.teachers.drop()
    await db.rooms.drop()
    await db.subjects.drop()
    
    logger.info("Seeding students...")
    students = [
        {"student_id": "s1", "full_name": "Alice Johnson", "section": "A", "grade": "10", "email": "s1@school.edu"},
        {"student_id": "s2", "full_name": "Bob Smith", "section": "B", "grade": "11", "email": "s2@school.edu"},
        {"student_id": "s3", "full_name": "Charlie Brown", "section": "A", "grade": "10", "email": "s3@school.edu"},
        {"student_id": "s4", "full_name": "Diana Ross", "section": "C", "grade": "12", "email": "s4@school.edu"},
        {"student_id": "s5", "full_name": "Ethan Hunt", "section": "B", "grade": "11", "email": "s5@school.edu"},
        {"student_id": "s6", "full_name": "Fiona Gallagher", "section": "A", "grade": "10", "email": "s6@school.edu"},
        {"student_id": "s7", "full_name": "George Constanza", "section": "C", "grade": "12", "email": "s7@school.edu"},
        {"student_id": "s8", "full_name": "Hannah Abbott", "section": "B", "grade": "11", "email": "s8@school.edu"},
        {"student_id": "s9", "full_name": "Ian Malcolm", "section": "A", "grade": "10", "email": "s9@school.edu"},
        {"student_id": "s10", "full_name": "Julia Child", "section": "C", "grade": "12", "email": "s10@school.edu"}
    ]
    await db.students.insert_many(students)
    
    logger.info("Seeding teachers...")
    teachers = [
        {"teacher_id": "t1", "full_name": "Dr. Alan Grant", "subjects": ["Science"], "email": "t1@school.edu"},
        {"teacher_id": "t2", "full_name": "Prof. Charles Xavier", "subjects": ["Mathematics"], "email": "t2@school.edu"},
        {"teacher_id": "t3", "full_name": "Ms. Frizzle", "subjects": ["Science"], "email": "t3@school.edu"},
        {"teacher_id": "t4", "full_name": "Walter White", "subjects": ["Science", "Mathematics"], "email": "t4@school.edu"},
        {"teacher_id": "t5", "full_name": "Minerva McGonagall", "subjects": ["English"], "email": "t5@school.edu"}
    ]
    await db.teachers.insert_many(teachers)
    
    logger.info("Seeding rooms...")
    rooms = [
        {"id": "r1", "capacity": 30},
        {"id": "r2", "capacity": 25},
        {"id": "r3", "capacity": 40},
        {"id": "r4", "capacity": 20}
    ]
    await db.rooms.insert_many(rooms)
    
    logger.info("Seeding subjects...")
    subjects = [
        {"id": "sub1", "name": "Mathematics", "required_weekly_hours": 5},
        {"id": "sub2", "name": "Science", "required_weekly_hours": 4},
        {"id": "sub3", "name": "History", "required_weekly_hours": 3},
        {"id": "sub4", "name": "English", "required_weekly_hours": 4},
        {"id": "sub5", "name": "Physical Education", "required_weekly_hours": 2},
        {"id": "sub6", "name": "Computer Science", "required_weekly_hours": 3}
    ]
    await db.subjects.insert_many(subjects)
    
    logger.info("Database seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_db())
