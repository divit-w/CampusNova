import asyncio
from app.services.auth_service import create_user, get_user_by_email

async def seed():
    email = "admin@campusnova.edu"
    existing = await get_user_by_email(email)
    if existing:
        print(f"User {email} already exists.")
        return
        
    admin_user = {
        "email": email,
        "password": "AdminPassword123!",
        "full_name": "CampusNova System Admin",
        "role": "admin"
    }
    
    await create_user(admin_user)
    print(f"Successfully seeded admin user: {email} / AdminPassword123!")

if __name__ == "__main__":
    asyncio.run(seed())
