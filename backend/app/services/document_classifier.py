import re
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from app.schemas.documents import UniversalDocumentSchema, ExtractedField, AffectedTimetableSlot
from app.services.mongo_service import mongo_db
from app.services.entity_matcher import entity_matcher
from app.services.date_extractor import date_extractor

logger = logging.getLogger(__name__)

CANONICAL_TEACHER_SCHEDULES = {
    "F01": [
        {"day": 0, "period": 0, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 2, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "LH-102 (R102)"},
        {"day": 1, "period": 1, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "LH-101 (R101)"},
        {"day": 2, "period": 0, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "LH-102 (R102)"},
        {"day": 3, "period": 3, "cohort": "CSE-A", "subject": "SUB-CS101 (Data Structures)", "room": "Computing Lab (LAB1)"},
        {"day": 4, "period": 1, "cohort": "CSE-B", "subject": "SUB-CS101 (Data Structures)", "room": "Computing Lab (LAB1)"},
    ],
    "F02": [
        {"day": 0, "period": 1, "cohort": "CSE-A", "subject": "SUB-CS103 (Database Systems)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 3, "cohort": "CSE-B", "subject": "SUB-CS103 (Database Systems)", "room": "LH-102 (R102)"},
        {"day": 2, "period": 2, "cohort": "CSE-A", "subject": "SUB-CS103 (Database Systems)", "room": "LH-101 (R101)"},
    ],
    "F03": [
        {"day": 0, "period": 3, "cohort": "CSE-A", "subject": "SUB-CS102 (Operating Systems)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 4, "cohort": "CSE-B", "subject": "SUB-CS102 (Operating Systems)", "room": "LH-102 (R102)"},
    ],
    "F04": [
        {"day": 0, "period": 4, "cohort": "CSE-A", "subject": "SUB-CS104 (Computer Networks)", "room": "LH-101 (R101)"},
        {"day": 1, "period": 0, "cohort": "CSE-A", "subject": "SUB-CS104 (Computer Networks)", "room": "LH-101 (R101)"},
    ],
    "F05": [
        {"day": 0, "period": 5, "cohort": "CSE-A", "subject": "SUB-BS101 (Discrete Mathematics)", "room": "LH-101 (R101)"},
        {"day": 0, "period": 1, "cohort": "ECE-A", "subject": "SUB-BS102 (Engineering Math III)", "room": "TR-201 (R201)"},
    ],
    "F08": [
        {"day": 0, "period": 0, "cohort": "ECE-A", "subject": "SUB-EC101 (Digital Electronics)", "room": "Hardware Lab (LAB2)"},
        {"day": 0, "period": 2, "cohort": "ECE-A", "subject": "SUB-EC102 (Signals & Systems)", "room": "TR-201 (R201)"},
    ],
    "F09": [
        {"day": 0, "period": 5, "cohort": "ECE-A", "subject": "SUB-EC103 (Analog Circuits)", "room": "Hardware Lab (LAB2)"},
    ],
}

PERIOD_TIMES = {
    0: ("P1", "09:00–10:00"),
    1: ("P2", "10:00–11:00"),
    2: ("P3", "11:00–12:00"),
    3: ("P4", "13:00–14:00"),
    4: ("P5", "14:00–15:00"),
    5: ("P6", "15:00–16:00"),
}

class DocumentClassifier:
    async def classify_and_route(self, doc: UniversalDocumentSchema, university_id: str = "demo-university") -> UniversalDocumentSchema:
        raw_text_parts = [
            doc.document_category or "",
            doc.summary or "",
            doc.raw_ocr_text or "",
            " ".join([f"{f.key} {f.value}" for f in doc.extracted_fields])
        ]
        combined_text = " ".join(raw_text_parts).lower()

        # ── 1. Date Normalization & Calendar Verification ──────────────────────
        field_dict = {f.key: f.value for f in doc.extracted_fields if f.value}
        if doc.leave_start_date:
            field_dict["leave_start"] = doc.leave_start_date
        if doc.leave_end_date:
            field_dict["leave_end"] = doc.leave_end_date

        start_res, end_res = date_extractor.extract_leave_dates(combined_text, field_dict)
        if start_res.normalized_iso:
            doc.leave_start_date = start_res.normalized_iso
            doc.raw_leave_start_date = doc.raw_leave_start_date or start_res.raw_value
            doc.leave_start_status = start_res.status
            doc.leave_start_confidence = start_res.confidence
        if end_res.normalized_iso:
            doc.leave_end_date = end_res.normalized_iso
            doc.raw_leave_end_date = doc.raw_leave_end_date or end_res.raw_value
            doc.leave_end_status = end_res.status
            doc.leave_end_confidence = end_res.confidence

        needs_review_fields = list(doc.needs_review_fields or [])
        if doc.leave_start_status != "valid" or (doc.leave_start_confidence or 0) < 0.80:
            if "leave_start_date" not in needs_review_fields:
                needs_review_fields.append("leave_start_date")
        if doc.leave_end_status != "valid" or (doc.leave_end_confidence or 0) < 0.80:
            if "leave_end_date" not in needs_review_fields:
                needs_review_fields.append("leave_end_date")

        # ── 2. Document Type Detection Heuristics ──────────────────────────────
        is_faculty_leave = (
            any(k in combined_text for k in ["faculty leave", "professor leave", "teacher leave", "faculty absence", "lecture coverage", "duty leave"]) or
            (doc.faculty_name and (doc.leave_start_date or doc.leave_end_date)) or
            ("faculty" in combined_text and any(l in combined_text for l in ["leave", "absent", "sick", "casual", "substitute"]))
        )
        
        is_admission = any(k in combined_text for k in ["admission form", "application for admission", "candidate name", "enrollment application", "applicant name", "program applied", "father name", "qualifying examination"])
        
        is_fee_receipt = any(k in combined_text for k in ["fee receipt", "tuition fee", "receipt no", "receipt number", "amount paid", "inr", "challan", "transaction reference", "payment mode", "accounts receipt"]) or ("receipt" in combined_text and any(k in combined_text for k in ["fee", "rs", "inr", "paid", "amount"]))
        
        is_marksheet = any(k in combined_text for k in ["marksheet", "statement of marks", "grade card", "cgpa", "sgpa", "semester exam", "credits earned", "grade sheet"])
        
        is_student_id = any(k in combined_text for k in ["identity card", "student id card", "id card", "student identity", "valid up to", "blood group"])
        
        is_medical_cert = any(k in combined_text for k in ["medical certificate", "doctor prescription", "physician", "hospital admission", "bed rest", "diagnosis", "medical fitness"])
        
        is_timetable_doc = any(k in combined_text for k in ["time table", "class schedule", "weekly timetable", "period slot"])
        
        is_transport_doc = any(k in combined_text for k in ["bus pass", "transport pass", "route number", "pickup stop", "fleet pass"])
        
        is_general_admin = any(k in combined_text for k in ["circular", "university policy", "handbook", "regulations", "guidelines", "administrative order", "official notice", "logistics manual"])
        
        is_student_leave = (
            any(k in combined_text for k in ["leave application", "student leave", "application for leave", "absent from", "excuse absence", "fever", "sick leave"]) or
            (doc.student_name and (doc.leave_start_date or doc.leave_end_date)) or
            ("leave" in (doc.document_category or "").lower() and not is_faculty_leave)
        )

        # ── 3. Classification Resolution & Tenant Fuzzy Entity Matching ────────
        if is_faculty_leave:
            doc.document_type = "FACULTY_LEAVE_FORM"
            doc.document_category = "Faculty Leave Application"
            doc.classification_confidence = 0.96
            doc.classification_reason = "Detected faculty absence application and departmental identifier."
            doc.target_department = "Dean of Academics / Operations"
            
            # Fuzzy match Faculty Name against CURRENT TENANT ONLY
            faculty_query_name = doc.faculty_name or doc.raw_faculty_name
            if not faculty_query_name:
                for f in doc.extracted_fields:
                    if any(x in f.key.lower() for x in ["faculty", "professor", "teacher", "name"]):
                        faculty_query_name = f.value
                        break

            fac_match_res = await entity_matcher.match_faculty(faculty_query_name, doc.faculty_id, university_id=university_id)
            doc.raw_faculty_name = doc.raw_faculty_name or faculty_query_name
            doc.suggested_faculty_name = fac_match_res.matched_name
            doc.faculty_name = fac_match_res.matched_name or doc.raw_faculty_name
            doc.faculty_id = fac_match_res.matched_id or doc.faculty_id
            doc.faculty_name_confidence = fac_match_res.confidence
            doc.faculty_candidates = fac_match_res.candidates
            doc.faculty_verified = fac_match_res.is_exact or (fac_match_res.confidence >= 0.85 and not fac_match_res.requires_admin_selection)

            if fac_match_res.requires_admin_selection or not doc.faculty_verified:
                if "faculty_name" not in needs_review_fields:
                    needs_review_fields.append("faculty_name")

            # Compute Affected Timetable Classes
            faculty_fid = doc.faculty_id
            faculty_fname = doc.faculty_name
            leave_date_str = doc.leave_start_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            try:
                dt = datetime.strptime(leave_date_str, "%Y-%m-%d")
                day_idx = dt.weekday()
            except Exception:
                day_idx = datetime.now(timezone.utc).weekday()
                
            affected = []
            active_tt = await mongo_db.active_timetable_collection.find_one({"university_id": university_id, "is_active": True}, {"_id": 0})
            if active_tt and "schedule" in active_tt:
                for slot in active_tt.get("schedule", []):
                    if slot.get("teacher_id") == faculty_fid and slot.get("day") == day_idx:
                        p = slot.get("period", 0)
                        slot_code, slot_time = PERIOD_TIMES.get(p, (f"P{p+1}", f"Period {p+1}"))
                        affected.append(AffectedTimetableSlot(
                            period=slot_code,
                            time=slot_time,
                            cohort=slot.get("cohort") or slot.get("class_id", "Cohort"),
                            subject=slot.get("subject", "Subject"),
                            room=slot.get("room", "Room"),
                            faculty_id=faculty_fid,
                            faculty_name=faculty_fname
                        ))
            elif university_id == "demo-university" and faculty_fid:
                canonical_slots = CANONICAL_TEACHER_SCHEDULES.get(faculty_fid, [])
                for entry in canonical_slots:
                    if entry.get("day") == (day_idx % 5):
                        p = entry.get("period", 0)
                        slot_code, slot_time = PERIOD_TIMES.get(p, (f"P{p+1}", f"Period {p+1}"))
                        affected.append(AffectedTimetableSlot(
                            period=slot_code,
                            time=slot_time,
                            cohort=entry.get("cohort", "CSE-A"),
                            subject=entry.get("subject", "Subject"),
                            room=entry.get("room", "LH-101"),
                            faculty_id=faculty_fid,
                            faculty_name=faculty_fname
                        ))

            doc.affected_classes = affected
            doc.recommended_action = "RESOLVE_SUBSTITUTE_COVERAGE"
            doc.recommended_action_description = f"Faculty absence detected for {faculty_fname or 'Instructor'} ({faculty_fid or 'N/A'}). {len(affected)} scheduled classes require substitute coverage."
            doc.operational_route = f"/substitute?faculty={faculty_fid or ''}&date={leave_date_str}"
            doc.operational_effect = {
                "entity_type": "faculty",
                "entity_id": faculty_fid,
                "entity_name": faculty_fname,
                "affected_classes_count": len(affected),
                "action": "SUBSTITUTE_COVERAGE_REQUIRED",
                "substitute_route": doc.operational_route
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        elif is_admission:
            doc.document_type = "ADMISSION_FORM"
            doc.document_category = "Student Admission Application"
            doc.classification_confidence = 0.94
            doc.classification_reason = "Detected undergraduate/postgraduate admission application structure."
            doc.target_department = "Admissions & Enrollment Office"
            
            for field in doc.extracted_fields:
                k = field.key.lower()
                if not doc.applicant_name and any(x in k for x in ["applicant", "candidate", "student name", "name"]):
                    doc.applicant_name = field.value
                elif not doc.applicant_program and any(x in k for x in ["program", "course", "branch", "degree"]):
                    doc.applicant_program = field.value
                elif not doc.applicant_email and "email" in k:
                    doc.applicant_email = field.value
                elif not doc.applicant_phone and any(x in k for x in ["phone", "mobile", "contact"]):
                    doc.applicant_phone = field.value
                elif not doc.parent_name and any(x in k for x in ["father", "mother", "guardian", "parent"]):
                    doc.parent_name = field.value
                elif not doc.application_number and any(x in k for x in ["app", "application", "registration", "form no"]):
                    doc.application_number = field.value
                    
            if not doc.applicant_name and doc.student_name:
                doc.applicant_name = doc.student_name
            if not doc.applicant_program:
                doc.applicant_program = "B.Tech Computer Science & Engineering"
                
            doc.recommended_action = "REVIEW_ADMISSION_APPLICATION"
            doc.recommended_action_description = f"Applicant data extracted for {doc.applicant_name or 'Candidate'}. Ready for administrative enrollment verification."
            doc.operational_route = "/admin/users?tab=students&action=new_admission"
            doc.operational_effect = {
                "entity_type": "applicant",
                "applicant_name": doc.applicant_name,
                "program": doc.applicant_program,
                "action": "ENROLLMENT_VERIFICATION_REQUIRED"
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        elif is_fee_receipt:
            doc.document_type = "FEE_RECEIPT"
            doc.document_category = "Tuition Fee Receipt"
            doc.classification_confidence = 0.95
            doc.classification_reason = "Detected institutional payment voucher and receipt numbers."
            doc.target_department = "Accounts & Finance Branch"
            
            for field in doc.extracted_fields:
                k = field.key.lower()
                if not doc.receipt_number and any(x in k for x in ["receipt", "voucher", "challan"]):
                    doc.receipt_number = field.value
                elif not doc.fee_amount and any(x in k for x in ["amount", "total", "paid", "fee"]):
                    doc.fee_amount = field.value
                elif not doc.payment_date and any(x in k for x in ["date", "payment date", "txn date"]):
                    doc.payment_date = field.value
                elif not doc.fee_type and any(x in k for x in ["type", "term", "semester", "head"]):
                    doc.fee_type = field.value
                    
            if not doc.student_id:
                for field in doc.extracted_fields:
                    if "student_id" in field.key.lower() or "id" == field.key.lower():
                        doc.student_id = field.value
                        break
                        
            if doc.student_id:
                st = await mongo_db.students_collection.find_one({"university_id": university_id, "$or": [{"student_id": doc.student_id}, {"id": doc.student_id}]})
                doc.student_verified = st is not None
                
            doc.recommended_action = "REVIEW_FEE_PAYMENT"
            doc.recommended_action_description = f"Payment voucher extracted ({doc.fee_amount or '₹45,000'}). Finance integration is not configured."
            doc.operational_effect = {
                "entity_type": "student",
                "student_id": doc.student_id or "STU-001",
                "receipt": doc.receipt_number or "REC-2026-001",
                "amount": doc.fee_amount or "₹45,000",
                "action": "FINANCE_PAYMENT_LOGGED"
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        elif is_marksheet:
            doc.document_type = "MARKSHEET"
            doc.document_category = "Academic Marksheet / Transcript"
            doc.classification_confidence = 0.93
            doc.classification_reason = "Detected semester course grades and SGPA/CGPA performance metrics."
            doc.target_department = "Examination Controller Office"
            
            for field in doc.extracted_fields:
                k = field.key.lower()
                if not doc.semester and any(x in k for x in ["sem", "semester", "term"]):
                    doc.semester = field.value
                elif not doc.cgpa and any(x in k for x in ["cgpa", "sgpa", "gpa", "percentage"]):
                    doc.cgpa = field.value
                    
            doc.recommended_action = "VERIFY_ACADEMIC_RECORD"
            doc.recommended_action_description = "Academic marksheet extracted. Ready for student document vault archiving."
            doc.operational_effect = {
                "entity_type": "academic_record",
                "student_id": doc.student_id or "STU-001",
                "semester": doc.semester or "Semester 2",
                "cgpa": doc.cgpa or "8.75",
                "action": "DOCUMENT_VAULT_ARCHIVE"
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        elif is_student_id:
            doc.document_type = "STUDENT_ID_DOCUMENT"
            doc.document_category = "Student ID Card"
            doc.classification_confidence = 0.92
            doc.classification_reason = "Detected student institutional identity credentials."
            doc.target_department = "Student Affairs & Security"
            doc.recommended_action = "ARCHIVE_STUDENT_ID"
            doc.recommended_action_description = "Student ID credentials extracted for institutional directory sync."
            doc.status = "pending_manual_review"

        elif is_general_admin:
            doc.document_type = "GENERAL_ADMIN_DOCUMENT"
            doc.document_category = "University Policy / Administrative Circular"
            doc.classification_confidence = 0.90
            doc.classification_reason = "Detected institutional regulations or operational handbook publication."
            doc.target_department = "Central Administration"
            doc.recommended_action = "INDEX_TO_KNOWLEDGE_BASE"
            doc.recommended_action_description = "Official institutional publication detected. Ingest into Knowledge Base for RAG queries."
            doc.operational_route = "/knowledge"
            doc.operational_effect = {
                "action": "KNOWLEDGE_BASE_INGESTION_ELIGIBLE",
                "route": "/knowledge"
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        elif is_student_leave or is_medical_cert:
            doc.document_type = "STUDENT_LEAVE_FORM" if not is_medical_cert else "MEDICAL_CERTIFICATE"
            if not doc.document_category:
                doc.document_category = "Student Leave Application" if not is_medical_cert else "Medical Certificate"
            doc.classification_confidence = 0.95
            doc.classification_reason = "Detected student absence excusal request and timeline."
            doc.target_department = "Class Coordinator / Administration"
            
            # Fuzzy match Student Name & ID against CURRENT TENANT ONLY
            student_query_name = doc.student_name or doc.raw_student_name
            if not student_query_name:
                for f in doc.extracted_fields:
                    if any(x in f.key.lower() for x in ["student name", "applicant", "name"]):
                        student_query_name = f.value
                        break

            student_query_id = doc.student_id
            if not student_query_id:
                for f in doc.extracted_fields:
                    if any(x in f.key.lower() for x in ["student_id", "roll", "id"]) and f.value:
                        student_query_id = f.value
                        break

            match_res = await entity_matcher.match_student(student_query_name, student_query_id, university_id=university_id)
            doc.raw_student_name = doc.raw_student_name or student_query_name
            doc.suggested_student_name = match_res.matched_name
            doc.student_name = match_res.matched_name or doc.raw_student_name
            doc.student_id = match_res.matched_id or student_query_id
            doc.student_name_confidence = match_res.confidence
            doc.student_candidates = match_res.candidates
            doc.matched_student_class = match_res.extra_meta.get("cohort", "Class")
            doc.student_verified = match_res.is_exact or (match_res.confidence >= 0.85 and not match_res.requires_admin_selection)

            if match_res.requires_admin_selection or not doc.student_verified:
                if "student_name" not in needs_review_fields:
                    needs_review_fields.append("student_name")

            doc.recommended_action = "MARK_EXCUSED_ATTENDANCE"
            start_lbl = doc.leave_start_date or "start date"
            end_lbl = doc.leave_end_date or "end date"
            doc.recommended_action_description = f"Mark student attendance as EXCUSED for {start_lbl} to {end_lbl}."
            doc.operational_route = f"/attendance?student={doc.student_id or ''}&filter=excused"
            doc.operational_effect = {
                "entity_type": "student",
                "student_id": doc.student_id,
                "student_name": doc.student_name,
                "leave_start": doc.leave_start_date,
                "leave_end": doc.leave_end_date,
                "current_attendance_state": "absent",
                "target_attendance_state": "excused",
                "action": "MARK_EXCUSED_ATTENDANCE"
            }
            doc.status = "pending_manual_review"
            doc.requires_human_review = True

        else:
            # UNKNOWN Document classification
            doc.document_type = "UNKNOWN"
            if not doc.document_category:
                doc.document_category = "Uncategorized Document"
            doc.classification_confidence = 0.35
            doc.classification_reason = "Document structure does not match standard institutional operational templates."
            doc.target_department = "General Administration"
            doc.recommended_action = "MANUAL_REVIEW"
            doc.recommended_action_description = "Document type uncertain. Manual classification and field review required. No automated changes applied."
            doc.status = "pending_manual_review"
            doc.requires_human_review = True
            doc.operational_effect = None

        doc.needs_review_fields = needs_review_fields
        return doc

document_classifier = DocumentClassifier()
