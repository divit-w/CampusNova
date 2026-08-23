import pytest
from app.core.config import settings
from app.services.mongo_service import mongo_db, MongoManager


@pytest.fixture(autouse=True)
def reinit_mongo_client():
    # Re-initialize motor client so it is bound cleanly
    mongo_db.client = MongoManager().client
    mongo_db.db = mongo_db.client[settings.MONGO_DB_NAME]
    mongo_db.knowledge_collection = mongo_db.db.get_collection("knowledge_documents")
    mongo_db.users_collection = mongo_db.db.get_collection("users")
    mongo_db.teachers_collection = mongo_db.db.get_collection("teachers")
    mongo_db.substitutions_collection = mongo_db.db.get_collection("substitutions")
    mongo_db.faculty_attendance_collection = mongo_db.db.get_collection("faculty_attendance")
    mongo_db.student_attendance_collection = mongo_db.db.get_collection("student_attendance")
    mongo_db.students_collection = mongo_db.db.get_collection("students")
    mongo_db.rooms_collection = mongo_db.db.get_collection("rooms")
    mongo_db.subjects_collection = mongo_db.db.get_collection("subjects")
    mongo_db.classes_collection = mongo_db.db.get_collection("classes")
    mongo_db.transport_routes_collection = mongo_db.db.get_collection("transport_routes")
    mongo_db.timetable_jobs_collection = mongo_db.db.get_collection("timetable_jobs")
    mongo_db.active_timetable_collection = mongo_db.db.get_collection("active_timetable")
    mongo_db.document_audit_collection = mongo_db.db.get_collection("document_audits")
    mongo_db.institutions_collection = mongo_db.db.get_collection("institutions")
    mongo_db.alerts_collection = mongo_db.db.get_collection("alerts")
