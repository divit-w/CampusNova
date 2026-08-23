import uuid
import logging
from datetime import datetime, timezone
from app.services.mongo_service import mongo_db
from app.services.chroma_service import chroma_db
from app.services.ingestion_service import IngestionService

logger = logging.getLogger(__name__)

DEMO_DOCUMENTS = [
    {
        "id": "doc-academic-policy-2026",
        "title": "Campus_Academic_and_Examination_Policy_2026.pdf",
        "category": "Institutional Academic Policy",
        "text": """# CampusNova Academic Regulations, Attendance Mandate & Grading Standards 2026

## 1. Student Attendance Policy and Minimum Thresholds
All enrolled undergraduate and postgraduate students are required to maintain a minimum attendance threshold of **75%** in each registered course to be eligible to appear for the end-semester final examinations.
- Attendance is recorded on a per-session basis through digital rosters or verified attendance forms.
- If a student's attendance falls between **65% and 74%** due to verified medical illness or hospitalisation, the Academic Dean may grant attendance condonation upon submission of valid medical documentation within 5 working days of recovery.
- Attendance below **65%** results in automatic course detention ("F-Grade / Incomplete Attendance") requiring the student to re-register for the course in a subsequent academic term.

## 2. Letter Grading Scale and Academic Performance Evaluation
Academic performance is assessed using a standard 10-point Grade Point Average (GPA) system:
- **Grade A+ (90% to 100%)**: Outstanding (10.0 Grade Points)
- **Grade A (80% to 89%)**: Excellent (9.0 Grade Points)
- **Grade B (70% to 79%)**: Very Good (8.0 Grade Points)
- **Grade C (60% to 69%)**: Good / Satisfactory (7.0 Grade Points)
- **Grade D (50% to 59%)**: Pass (6.0 Grade Points)
- **Grade F (Below 50%)**: Fail (0.0 Grade Points)

## 3. Makeup Examination Guidelines
Students who miss a scheduled mid-semester assessment due to approved medical leave, institutional sports representation, or bereavement must submit a makeup examination request within **10 calendar days** of the missed examination.
- Makeup examinations carry no grade penalty and are scheduled by the Controller of Examinations during the designated mid-term makeup window.
- Unexcused absences from examinations automatically receive a zero score.
"""
    },
    {
        "id": "doc-faculty-regulations-2026",
        "title": "Faculty_Workload_and_Leave_Regulations_2026.pdf",
        "category": "Faculty & Administrative Regulations",
        "text": """# Faculty Workload Guidelines, Leave Administration & Substitution Protocol 2026

## 1. Faculty Weekly Teaching Load Limits
To maintain high academic standards and allow adequate time for research and student mentorship, teaching loads are strictly governed:
- **Assistant Professors**: Maximum weekly teaching load of **20 hours per week** (typically 16 lecture hours and 4 laboratory hours).
- **Associate Professors**: Maximum weekly teaching load of **16 hours per week** (12 lecture hours and 4 laboratory/seminar hours).
- **Full Professors & Department Heads**: Maximum weekly teaching load of **12 hours per week** to accommodate doctoral supervision and administrative leadership.

## 2. Faculty Leave Policy and Advance Notice
Faculty members are entitled to 12 days of Casual Leave and 10 days of Academic/Duty Leave per academic year.
- Planned leave requests must be submitted at least **48 hours in advance** via the CampusNova administrative portal.
- Emergency medical leave must be logged on or before 08:30 AM on the day of absence.
- Submitting a leave request automatically flags all scheduled timetable slots for that faculty member as requiring substitute coverage.

## 3. AI Predictive Substitute Allocation Protocol
When a faculty leave request is approved:
- The system checks the master timetable to locate all affected student cohorts and class periods.
- The **Predictive Allocator** ranks candidate substitute teachers based on domain expertise compatibility, current weekly teaching load, and availability during the target period.
- Once assigned, both the substitute faculty member and the class cohort receive instant schedule updates and dashboard notifications.
"""
    },
    {
        "id": "doc-facilities-guide-2026",
        "title": "Campus_Facilities_and_Library_Operations_Guide_2026.pdf",
        "category": "Campus Facilities & Student Services",
        "text": """# Campus Facilities, Central Library Hours & Laboratory Access Regulations 2026

## 1. Central Library Operating Hours and Regulations
The CampusNova Central Library provides quiet study spaces, digital repository access, and lending services:
- **Monday through Friday (Weekdays)**: Operating hours are **08:00 AM to 10:00 PM (22:00)**.
- **Saturday and Sunday (Weekends)**: Operating hours are **10:00 AM to 06:00 PM (18:00)**.
- **Final Examination Periods**: The 24-hour reading hall on the Ground Floor remains open 24/7 with valid student ID card access.
- Undergraduates may borrow up to 5 books for a period of 14 days, with one online renewal allowed.

## 2. Computing Laboratories & Specialized Research Centers
- General Computing Labs (Lab 101-104) are open from **08:30 AM to 08:00 PM** on all instructional working days.
- High-Performance Computing (HPC) clusters and Advanced AI workstations are accessible 24/7 for postgraduate students and research scholars upon advisor endorsement.
- All hardware and software issues must be reported to the IT Help Desk located in Building 3, Room 102, or via internal extension 4040.

## 3. Campus Dining & Health Services
- The Student Center Food Court operates from **07:30 AM to 09:30 PM** daily.
- The University Health & Wellness Clinic is open 24/7 for first aid, emergency consultations, and triage with a resident medical officer on duty.
"""
    }
]

async def seed_canonical_demo_knowledge(university_id: str = "demo-university"):
    """
    Seeds the 3 canonical institutional documents into MongoDB knowledge_collection
    and indexes their hierarchical vector chunks in ChromaDB for demo-university.
    """
    ingestion = IngestionService()
    collection = chroma_db.get_or_create_collection("student_documents")
    
    for doc_info in DEMO_DOCUMENTS:
        doc_id = doc_info["id"]
        title = doc_info["title"]
        text = doc_info["text"]
        category = doc_info["category"]
        
        chunks = ingestion.hierarchical_chunk_text(text, parent_size=1500, parent_overlap=150, child_size=350, child_overlap=50)
        
        # 1. Update/Insert MongoDB record
        mongo_doc = {
            "id": doc_id,
            "document_id": doc_id,
            "university_id": university_id,
            "title": title,
            "upload_date": datetime.now(timezone.utc).isoformat(),
            "total_chunks": len(chunks),
            "sha256_hash": f"canonical-{doc_id}",
            "file_hash": f"canonical-{doc_id}",
            "indexing_status": "completed",
            "document_type": "INSTITUTIONAL_POLICY",
            "document_category": category,
            "summary": f"Canonical institutional reference document for {title.replace('_', ' ').replace('.pdf', '')}.",
            "extracted_fields": [],
            "status": "approved",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await mongo_db.knowledge_collection.update_one(
            {"id": doc_id, "university_id": university_id},
            {"$set": mongo_doc},
            upsert=True
        )
        
        # 2. Index in ChromaDB
        if chunks:
            ids = [f"{doc_id}_{d['chunk_index']}" for d in chunks]
            metadatas = [
                {
                    "document_id": doc_id,
                    "university_id": university_id,
                    "chunk_index": d["chunk_index"],
                    "filename": title,
                    "parent_id": f"{doc_id}_{d['parent_id']}",
                    "parent_text": d["parent_text"],
                    "document_category": category
                }
                for d in chunks
            ]
            child_docs = [d["child_text"] for d in chunks]
            
            try:
                collection.upsert(
                    ids=ids,
                    documents=child_docs,
                    metadatas=metadatas
                )
            except Exception as e:
                try:
                    collection.add(ids=ids, documents=child_docs, metadatas=metadatas)
                except Exception:
                    pass
                    
    logger.info(f"Successfully seeded {len(DEMO_DOCUMENTS)} canonical knowledge documents for tenant {university_id}.")
