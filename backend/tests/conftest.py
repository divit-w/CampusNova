import pytest
from app.core.config import settings
from app.services.mongo_service import mongo_db, MongoManager


@pytest.fixture(autouse=True)
def reinit_mongo_client():
    # Re-initialize motor client so it is bound cleanly to active loop
    mongo_db.client = None

