import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import asyncio
import logging
from seed_demo_data import seed_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def seed_db():
    logger.info("Executing canonical university database seed...")
    await seed_database()

if __name__ == "__main__":
    asyncio.run(seed_db())

