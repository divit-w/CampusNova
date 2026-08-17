from typing import Dict, Any, Tuple
from app.schemas.documents import UniversalDocumentSchema

def route_document(document: UniversalDocumentSchema, validation_results: Dict[str, Any]) -> Tuple[str, str]:
    """
    Deterministically routes the document based on extraction confidence and validation results.
    Returns a tuple of (DECISION, DECISION_REASON).
    Decision is one of: 'AUTO', 'REVIEW', 'EXCEPTION'.
    """
    
    # 1. Check for CRITICAL validation failures. These override everything.
    critical_failures = []
    for key, result in validation_results.items():
        if not result.get("passed") and result.get("severity") == "CRITICAL":
            critical_failures.append(result.get("message", f"Critical failure on {key}"))
            
    if critical_failures:
        reason = "Critical validation failure: " + " | ".join(critical_failures)
        return "EXCEPTION", reason

    # 2. Check for WARNING or POLICY_FLAG which require human review
    review_flags = []
    for key, result in validation_results.items():
        if not result.get("passed") and result.get("severity") in ["WARNING", "POLICY_FLAG"]:
            review_flags.append(result.get("message", f"Flag on {key}"))

    # 3. Check LLM Extraction Confidence
    low_confidence = False
    for field in document.extracted_fields:
        if str(field.confidence).lower() != "high":
            low_confidence = True
            break
            
    if low_confidence:
        review_flags.append("Medium/Low extraction confidence requires human verification.")

    if review_flags:
        reason = "Requires review: " + " | ".join(review_flags)
        return "REVIEW", reason

    # 4. AUTO - Only if everything is perfect
    return "AUTO", "All validations passed and model confidence is high."

from app.schemas.attendance import ProcessedAttendanceRow, BulkAttendanceResponse

def route_bulk_attendance(processed_rows: list[ProcessedAttendanceRow]) -> Tuple[str, str]:
    """
    Evaluates individual rows and calculates row-level decisions, 
    then computes the overall batch decision.
    """
    for row in processed_rows:
        critical_failures = []
        review_flags = []
        
        for key, result in row.validations.items():
            if not result.passed:
                if result.severity == "CRITICAL":
                    critical_failures.append(result.message)
                else:
                    review_flags.append(result.message)
                    
        if critical_failures:
            row.decision = "EXCEPTION"
            row.decision_reason = " | ".join(critical_failures)
        elif review_flags:
            row.decision = "REVIEW"
            row.decision_reason = " | ".join(review_flags)
        else:
            row.decision = "VALID"
            row.decision_reason = "Row is valid."

    total_rows = len(processed_rows)
    valid_count = sum(1 for r in processed_rows if r.decision == "VALID")
    review_count = sum(1 for r in processed_rows if r.decision == "REVIEW")
    exception_count = sum(1 for r in processed_rows if r.decision == "EXCEPTION")

    if exception_count == total_rows and total_rows > 0:
        return "EXCEPTION", "All rows failed validation."
        
    if total_rows == 0:
        return "EXCEPTION", "No rows extracted."

    if review_count > 0 or exception_count > 0:
        return "REVIEW", f"Batch requires review. {valid_count} valid, {review_count} review, {exception_count} exception."

    return "AUTO", "All rows validated successfully."
