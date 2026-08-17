from typing import Dict, Any, Optional
from datetime import datetime
import re
from app.services.mongo_service import mongo_db
from app.schemas.documents import UniversalDocumentSchema

class DocumentValidator:
    def __init__(self, document: UniversalDocumentSchema):
        self.document = document
        self.results: Dict[str, Any] = {}

    def add_result(self, key: str, passed: bool, code: str, message: str, severity: str = "INFO"):
        self.results[key] = {
            "passed": passed,
            "code": code,
            "message": message,
            "severity": severity
        }

    async def validate(self) -> Dict[str, Any]:
        return self.results

class LeaveApplicationValidator(DocumentValidator):
    async def validate(self) -> Dict[str, Any]:
        # 1. Identity Validation
        student_id = self.document.student_id
        student_name = self.document.student_name

        if not student_id and not student_name:
            self.add_result(
                "identity", 
                passed=False, 
                code="V001", 
                message="Neither student_id nor student_name were found in the document.", 
                severity="CRITICAL"
            )
        else:
            # Query the database
            query = {}
            if student_id:
                query["student_id"] = student_id
            elif student_name:
                query["full_name"] = {"$regex": f"^{re.escape(student_name)}$", "$options": "i"}

            student = await mongo_db.students_collection.find_one(query)
            if student:
                self.add_result(
                    "identity", 
                    passed=True, 
                    code="V002", 
                    message="Student identity verified against the database.", 
                    severity="INFO"
                )
                self.document.student_id = student.get("student_id", student_id)
            else:
                self.add_result(
                    "identity", 
                    passed=False, 
                    code="E006", 
                    message="Student could not be found in the database.", 
                    severity="CRITICAL"
                )

        # 2. Temporal Validation
        start_date_str = self.document.leave_start_date
        end_date_str = self.document.leave_end_date
        
        start_dt: Optional[datetime] = None
        end_dt: Optional[datetime] = None

        def parse_date(d_str: str) -> Optional[datetime]:
            if not d_str:
                return None
            try:
                return datetime.strptime(d_str, "%Y-%m-%d")
            except (ValueError, TypeError):
                return None

        start_dt = parse_date(start_date_str) if start_date_str else None
        end_dt = parse_date(end_date_str) if end_date_str else None

        if start_date_str and end_date_str:
            if not start_dt or not end_dt:
                self.add_result(
                    "temporal", 
                    passed=False, 
                    code="E008", 
                    message="Dates are malformed or not in YYYY-MM-DD format.", 
                    severity="CRITICAL"
                )
            elif start_dt > end_dt:
                self.add_result(
                    "temporal", 
                    passed=False, 
                    code="E008", 
                    message="Start date cannot be after end date.", 
                    severity="CRITICAL"
                )
            else:
                self.add_result(
                    "temporal", 
                    passed=True, 
                    code="V003", 
                    message="Date range is logically valid.", 
                    severity="INFO"
                )
        elif start_date_str:
            if not start_dt:
                self.add_result(
                    "temporal", 
                    passed=False, 
                    code="E008", 
                    message="Start date is malformed.", 
                    severity="CRITICAL"
                )
        else:
            self.add_result(
                "temporal", 
                passed=False, 
                code="E008", 
                message="Missing required leave dates.", 
                severity="CRITICAL"
            )

        # 3. Conflict Validation
        # Only check conflict if identity is verified and we have valid dates
        identity_pass = self.results.get("identity", {}).get("passed", False)
        if identity_pass and start_dt and self.document.student_id:
            end = end_dt or start_dt
            overlap = await mongo_db.student_attendance_collection.find_one({
                "student_id": self.document.student_id,
                "date": {"$gte": start_dt.strftime("%Y-%m-%d"), "$lte": end.strftime("%Y-%m-%d")},
                "status": {"$in": ["excused", "leave", "present"]}
            })
            if overlap:
                self.add_result(
                    "conflict", 
                    passed=False, 
                    code="E010", 
                    message="Existing attendance or leave record conflicts with the requested dates.", 
                    severity="WARNING"
                )
            else:
                self.add_result(
                    "conflict", 
                    passed=True, 
                    code="V004", 
                    message="No conflicting records found.", 
                    severity="INFO"
                )

        # 4. Business Policy Validation
        if start_dt and end_dt:
            delta_days = (end_dt - start_dt).days + 1
            if delta_days > 3:
                self.add_result(
                    "policy", 
                    passed=False, 
                    code="E009", 
                    message="Leave duration exceeds the 3-day automatic approval threshold and requires administrative approval.", 
                    severity="POLICY_FLAG"
                )
            else:
                self.add_result(
                    "policy", 
                    passed=True, 
                    code="V005", 
                    message="Leave duration is within automatic approval limits.", 
                    severity="INFO"
                )
                
            # Exam conflict logic natively ported from original _process_single_document
            start_m = start_dt.month
            start_d = start_dt.day
            end_m = end_dt.month
            end_d = end_dt.day
            
            # Very basic check spanning Oct 20-28
            is_exam_conflict = False
            if start_m <= 10 and end_m >= 10:
                # Check if there's overlap with Oct 20 - Oct 28
                overlap_start = max(start_dt, datetime(start_dt.year, 10, 20))
                overlap_end = min(end_dt, datetime(end_dt.year, 10, 28))
                if overlap_start <= overlap_end:
                    is_exam_conflict = True
                    
            if is_exam_conflict:
                self.add_result(
                    "exam_conflict",
                    passed=False,
                    code="E011",
                    message="Warning: Leave requested during mid-term examination window — requires Principal override.",
                    severity="POLICY_FLAG"
                )

        return self.results

from app.schemas.attendance import BulkAttendanceExtraction, ProcessedAttendanceRow, ValidationResult
import uuid

class BulkAttendanceValidator:
    async def validate_batch(self, extraction: BulkAttendanceExtraction) -> list[ProcessedAttendanceRow]:
        processed_rows = []
        
        for idx, row in enumerate(extraction.records):
            validations = {}
            student_id = row.student_id
            student_name = row.student_name
            status = row.status and row.status.lower().strip()
            
            # 1. Identity
            if not student_id and not student_name:
                validations["identity"] = ValidationResult(
                    passed=False, code="V101", message="Missing student identity.", severity="CRITICAL"
                )
            else:
                query = {}
                if student_id:
                    query["student_id"] = student_id
                elif student_name:
                    query["full_name"] = {"$regex": f"^{re.escape(student_name)}$", "$options": "i"}
                
                student = await mongo_db.students_collection.find_one(query)
                if student:
                    validations["identity"] = ValidationResult(
                        passed=True, code="V102", message="Student verified.", severity="INFO"
                    )
                    student_id = student.get("student_id", student_id)
                    student_name = student.get("full_name", student_name)
                else:
                    validations["identity"] = ValidationResult(
                        passed=False, code="V103", message="Student not found in database.", severity="CRITICAL"
                    )

            # 2. Status
            valid_statuses = {"present", "absent", "leave"}
            if not status:
                validations["status"] = ValidationResult(
                    passed=False, code="V104", message="Missing attendance status.", severity="CRITICAL"
                )
            elif status not in valid_statuses:
                validations["status"] = ValidationResult(
                    passed=False, code="V105", message=f"Invalid status {status}.", severity="CRITICAL"
                )
            else:
                validations["status"] = ValidationResult(
                    passed=True, code="V106", message="Valid status.", severity="INFO"
                )

            # 3. Date & Conflict
            date_str = extraction.date
            date_valid = False
            if not date_str:
                validations["date"] = ValidationResult(
                    passed=False, code="V107", message="Missing batch date.", severity="CRITICAL"
                )
            else:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    validations["date"] = ValidationResult(
                        passed=True, code="V108", message="Valid date.", severity="INFO"
                    )
                    date_valid = True
                except ValueError:
                    validations["date"] = ValidationResult(
                        passed=False, code="V109", message="Invalid date format.", severity="CRITICAL"
                    )
                    
            if date_valid and validations.get("identity", ValidationResult(passed=False, code="", message="")).passed:
                existing = await mongo_db.student_attendance_collection.find_one({
                    "student_id": student_id,
                    "date": date_str
                })
                if existing:
                    validations["conflict"] = ValidationResult(
                        passed=False, code="V110", message="Attendance record already exists.", severity="WARNING"
                    )
                else:
                    validations["conflict"] = ValidationResult(
                        passed=True, code="V111", message="No conflict.", severity="INFO"
                    )

            processed_rows.append(ProcessedAttendanceRow(
                row_id=str(uuid.uuid4()),
                student_id=student_id,
                student_name=student_name,
                status=status,
                validations=validations,
                decision="VALID"
            ))
            
        return processed_rows
