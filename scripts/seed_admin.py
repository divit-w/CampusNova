import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
import asyncio
from app.services.auth_service import create_user, get_user_by_email

async def seed():
    users_to_seed = [
        {
            "email": "admin@campusnova.edu",
            "password": "AdminPassword123!",
            "full_name": "CampusNova System Admin",
            "role": "admin",
            "university_id": "demo-university",
            "university_name": "CampusNova Demo University",
            "is_demo": True,
            "is_setup_complete": True,
        },
        {
            "email": "demo-judge@campusnova.com",
            "password": "judge123",
            "full_name": "Hackathon Judge",
            "role": "admin",
            "university_id": "demo-university",
            "university_name": "CampusNova Demo University",
            "is_demo": True,
            "is_setup_complete": True,
        }
    ]
    
    for u in users_to_seed:
        existing = await get_user_by_email(u["email"])
        if existing:
            print(f"User {u['email']} already exists.")
        else:
            await create_user(u.copy())
            print(f"Successfully seeded user: {u['email']} / {u['password']}")

if __name__ == "__main__":
    asyncio.run(seed())
