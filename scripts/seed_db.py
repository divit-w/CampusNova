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
        {"id": "s1", "name": "Alice Johnson", "batch": "A", "grade_level": 10},
        {"id": "s2", "name": "Bob Smith", "batch": "B", "grade_level": 11},
        {"id": "s3", "name": "Charlie Brown", "batch": "A", "grade_level": 10},
        {"id": "s4", "name": "Diana Ross", "batch": "C", "grade_level": 12},
        {"id": "s5", "name": "Ethan Hunt", "batch": "B", "grade_level": 11},
        {"id": "s6", "name": "Fiona Gallagher", "batch": "A", "grade_level": 10},
        {"id": "s7", "name": "George Constanza", "batch": "C", "grade_level": 12},
        {"id": "s8", "name": "Hannah Abbott", "batch": "B", "grade_level": 11},
        {"id": "s9", "name": "Ian Malcolm", "batch": "A", "grade_level": 10},
        {"id": "s10", "name": "Julia Child", "batch": "C", "grade_level": 12}
    ]
    await db.students.insert_many(students)
    
    logger.info("Seeding teachers...")
    teachers = [
        {"id": "t1", "name": "Dr. Alan Grant", "max_hours": 15},
        {"id": "t2", "name": "Prof. Charles Xavier", "max_hours": 10},
        {"id": "t3", "name": "Ms. Frizzle", "max_hours": 20},
        {"id": "t4", "name": "Walter White", "max_hours": 12},
        {"id": "t5", "name": "Minerva McGonagall", "max_hours": 18}
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
