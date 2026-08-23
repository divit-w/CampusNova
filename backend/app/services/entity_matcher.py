import re
import difflib
import logging
from typing import Optional, List, Dict, Any, Tuple
from app.services.mongo_service import mongo_db

logger = logging.getLogger(__name__)

# Common handwritten OCR character confusions in names
OCR_CHAR_EQUIVALENTS = [
    ("l", "i"), ("1", "i"), ("1", "l"), ("|", "l"),
    ("rn", "m"), ("nn", "m"), ("nn", "rm"), ("cl", "d"), ("vv", "w"),
    ("0", "o"), ("u", "v"), ("n", "u"),
    ("c", "e"), ("s", "5"), ("b", "8"),
    ("shanna", "sharma"), ("sharna", "sharma")
]

def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes standard Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]

class EntityMatchResult:
    def __init__(
        self,
        raw_ocr_name: str,
        entity_type: str, # "student" or "faculty"
        matched_id: Optional[str] = None,
        matched_name: Optional[str] = None,
        confidence: float = 0.0,
        is_exact: bool = False,
        requires_admin_selection: bool = False,
        status: str = "needs_review", # "matched", "ambiguous", "needs_review", "not_found"
        candidates: Optional[List[Dict[str, Any]]] = None,
        extra_meta: Optional[Dict[str, Any]] = None
    ):
        self.raw_ocr_name = raw_ocr_name
        self.entity_type = entity_type
        self.matched_id = matched_id
        self.matched_name = matched_name
        self.confidence = confidence
        self.is_exact = is_exact
        self.requires_admin_selection = requires_admin_selection
        self.status = status
        self.candidates = candidates or []
        self.extra_meta = extra_meta or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_ocr_name": self.raw_ocr_name,
            "entity_type": self.entity_type,
            "matched_id": self.matched_id,
            "matched_name": self.matched_name,
            "confidence": round(self.confidence, 4),
            "is_exact": self.is_exact,
            "requires_admin_selection": self.requires_admin_selection,
            "status": self.status,
            "candidates": self.candidates,
            "extra_meta": self.extra_meta
        }

class EntityMatcher:
    """
    Fuzzy entity matching engine for handwritten OCR names.
    Guarantees strict tenant isolation: only searches current tenant directory.
    Calculates multi-metric similarity scores and handles name ambiguities without fabricating entities.
    """

    def clean_name(self, name: str) -> str:
        """Normalizes whitespace, casing, and common OCR artifacts."""
        if not name:
            return ""
        # Remove unwanted punctuation and non-alpha characters except spaces, dots, hyphens
        cleaned = re.sub(r'[^a-zA-Z\s\.\-]', ' ', name)
        # Remove title prefixes for matching
        cleaned = re.sub(r'\b(mr|mrs|ms|dr|prof|doctor|professor)\b\.?', '', cleaned, flags=re.IGNORECASE)
        # Collapse whitespace
        cleaned = " ".join(cleaned.split()).strip().title()
        return cleaned

    def compute_similarity(self, s1: str, s2: str) -> float:
        """
        Computes composite similarity score between two names combining:
        1. Levenshtein edit distance ratio
        2. SequenceMatcher ratio
        3. Token sort ratio (handles 'Sharma Divit' vs 'Divit Sharma')
        4. OCR-aware character normalized similarity
        """
        n1 = self.clean_name(s1).lower()
        n2 = self.clean_name(s2).lower()

        if not n1 or not n2:
            return 0.0

        if n1 == n2:
            return 1.0

        max_len = max(len(n1), len(n2))
        lev_dist = levenshtein_distance(n1, n2)
        lev_ratio = max(0.0, 1.0 - (lev_dist / max_len))

        # 1. Base sequence similarity
        seq_ratio = difflib.SequenceMatcher(None, n1, n2).ratio()

        # 2. Token sort similarity
        tokens1 = " ".join(sorted(n1.split()))
        tokens2 = " ".join(sorted(n2.split()))
        token_ratio = difflib.SequenceMatcher(None, tokens1, tokens2).ratio()

        # 3. OCR confusion normalized ratio
        norm1, norm2 = n1, n2
        for (a, b) in OCR_CHAR_EQUIVALENTS:
            norm1 = norm1.replace(a, b)
            norm2 = norm2.replace(a, b)
        
        ocr_lev = max(0.0, 1.0 - (levenshtein_distance(norm1, norm2) / max(len(norm1), len(norm2), 1)))
        ocr_ratio = difflib.SequenceMatcher(None, norm1, norm2).ratio()

        # Prefix bonus if initial letters match strongly
        prefix_bonus = 0.0
        min_len = min(len(n1), len(n2))
        for k in range(min(4, min_len)):
            if n1[k] == n2[k]:
                prefix_bonus += 0.02
            else:
                break

        composite = max(
            token_ratio * 0.96,
            seq_ratio,
            lev_ratio,
            ocr_lev * 0.98,
            ocr_ratio * 0.98
        ) + prefix_bonus

        return min(1.0, composite)

    async def match_student(
        self,
        raw_name: Optional[str],
        raw_id: Optional[str],
        university_id: str
    ) -> EntityMatchResult:
        """
        Fuzzy matches student name/ID against the CURRENT TENANT's directory.
        Never searches another tenant.
        """
        if not university_id:
            return EntityMatchResult(raw_ocr_name=raw_name or "", entity_type="student", status="not_found")

        # Query all active students belonging exclusively to this university
        tenant_students = []
        try:
            cursor = mongo_db.students_collection.find(
                {"university_id": university_id, "status": {"$ne": "deleted"}},
                {"_id": 0}
            )
            tenant_students = await cursor.to_list(500)
        except Exception as e:
            logger.error(f"Failed to fetch students for tenant {university_id}: {e}")

        # Fallback to demo defaults if collection is empty in test/demo mode
        if not tenant_students and university_id == "demo-university":
            tenant_students = [
                {"student_id": "STU-001", "full_name": "Divit Sharma", "grade": "CSE-A", "cohort_id": "CSE-A"},
                {"student_id": "STU-002", "full_name": "Aarav Patel", "grade": "CSE-A", "cohort_id": "CSE-A"},
                {"student_id": "STU-003", "full_name": "Meera Gupta", "grade": "CSE-B", "cohort_id": "CSE-B"},
                {"student_id": "STU-004", "full_name": "Rohan Sharma", "grade": "ECE-A", "cohort_id": "ECE-A"},
                {"student_id": "STU-005", "full_name": "Rohan Verma", "grade": "ECE-A", "cohort_id": "ECE-A"},
                {"student_id": "STU-006", "full_name": "Aditi Rao", "grade": "CSE-B", "cohort_id": "CSE-B"},
            ]

        # 1. Exact ID check first if ID present
        if raw_id:
            clean_id = raw_id.strip().upper().replace(" ", "-")
            for st in tenant_students:
                s_id = (st.get("student_id") or st.get("id", "")).upper()
                if s_id == clean_id:
                    return EntityMatchResult(
                        raw_ocr_name=raw_name or st.get("full_name", ""),
                        entity_type="student",
                        matched_id=s_id,
                        matched_name=st.get("full_name") or st.get("name"),
                        confidence=1.0,
                        is_exact=True,
                        status="matched",
                        candidates=[{
                            "id": s_id,
                            "name": st.get("full_name") or st.get("name"),
                            "score": 1.0,
                            "cohort": st.get("grade") or st.get("cohort_id")
                        }],
                        extra_meta={"cohort": st.get("grade") or st.get("cohort_id")}
                    )

        if not raw_name or not raw_name.strip():
            return EntityMatchResult(
                raw_ocr_name="",
                entity_type="student",
                confidence=0.0,
                status="missing",
                requires_admin_selection=True
            )

        # 2. Fuzzy match against all tenant students
        candidates = []
        for st in tenant_students:
            s_name = st.get("full_name") or st.get("name", "")
            s_id = st.get("student_id") or st.get("id", "")
            cohort = st.get("grade") or st.get("cohort_id", "Class")
            
            score = self.compute_similarity(raw_name, s_name)
            if score >= 0.50:
                candidates.append({
                    "id": s_id,
                    "name": s_name,
                    "score": round(score, 3),
                    "cohort": cohort
                })

        # Sort candidates descending by score
        candidates.sort(key=lambda x: x["score"], reverse=True)

        if not candidates:
            return EntityMatchResult(
                raw_ocr_name=raw_name,
                entity_type="student",
                confidence=0.20,
                status="not_found",
                requires_admin_selection=True
            )

        top_match = candidates[0]
        top_score = top_match["score"]
        is_exact = top_score >= 0.99

        # Check if multiple people have similar names (ambiguity detection)
        # If second match exists and score difference is < 0.08 or top score < 0.85
        is_ambiguous = False
        if len(candidates) > 1 and (candidates[0]["score"] - candidates[1]["score"]) < 0.08:
            is_ambiguous = True
        elif top_score < 0.85:
            is_ambiguous = True

        status = "matched" if (top_score >= 0.85 and not is_ambiguous) else ("ambiguous" if is_ambiguous else "needs_review")

        return EntityMatchResult(
            raw_ocr_name=raw_name,
            entity_type="student",
            matched_id=top_match["id"],
            matched_name=top_match["name"],
            confidence=top_score,
            is_exact=is_exact,
            requires_admin_selection=is_ambiguous or top_score < 0.85,
            status=status,
            candidates=candidates[:5],
            extra_meta={"cohort": top_match.get("cohort")}
        )

    async def match_faculty(
        self,
        raw_name: Optional[str],
        raw_id: Optional[str],
        university_id: str
    ) -> EntityMatchResult:
        """
        Fuzzy matches faculty name/ID against the CURRENT TENANT's directory.
        Never searches another tenant.
        """
        if not university_id:
            return EntityMatchResult(raw_ocr_name=raw_name or "", entity_type="faculty", status="not_found")

        tenant_teachers = []
        try:
            cursor = mongo_db.teachers_collection.find(
                {"university_id": university_id, "status": {"$ne": "deleted"}},
                {"_id": 0}
            )
            tenant_teachers = await cursor.to_list(200)
        except Exception as e:
            logger.error(f"Failed to fetch teachers for tenant {university_id}: {e}")

        if not tenant_teachers and university_id == "demo-university":
            tenant_teachers = [
                {"teacher_id": "F01", "full_name": "Dr. Sharma", "subject": "Data Structures"},
                {"teacher_id": "F02", "full_name": "Prof. Verma", "subject": "Database Systems"},
                {"teacher_id": "F03", "full_name": "Dr. Anita Desai", "subject": "Operating Systems"},
                {"teacher_id": "F04", "full_name": "Prof. Rajesh Kumar", "subject": "Computer Networks"},
                {"teacher_id": "F05", "full_name": "Dr. Sneha Patil", "subject": "Discrete Mathematics"},
                {"teacher_id": "F08", "full_name": "Prof. Vikram Malhotra", "subject": "Digital Electronics"},
                {"teacher_id": "F09", "full_name": "Dr. Meenakshi Sundaram", "subject": "Analog Circuits"},
            ]

        # 1. Exact ID check
        if raw_id:
            clean_id = raw_id.strip().upper()
            for t in tenant_teachers:
                t_id = (t.get("teacher_id") or t.get("id", "")).upper()
                if t_id == clean_id:
                    return EntityMatchResult(
                        raw_ocr_name=raw_name or t.get("full_name", ""),
                        entity_type="faculty",
                        matched_id=t_id,
                        matched_name=t.get("full_name") or t.get("name"),
                        confidence=1.0,
                        is_exact=True,
                        status="matched",
                        candidates=[{
                            "id": t_id,
                            "name": t.get("full_name") or t.get("name"),
                            "score": 1.0,
                            "subject": t.get("subject")
                        }],
                        extra_meta={"subject": t.get("subject")}
                    )

        if not raw_name or not raw_name.strip():
            return EntityMatchResult(
                raw_ocr_name="",
                entity_type="faculty",
                confidence=0.0,
                status="missing",
                requires_admin_selection=True
            )

        # 2. Fuzzy match against tenant teachers
        candidates = []
        for t in tenant_teachers:
            t_name = t.get("full_name") or t.get("name", "")
            t_id = t.get("teacher_id") or t.get("id", "")
            subject = t.get("subject", "")
            
            score = self.compute_similarity(raw_name, t_name)
            if score >= 0.45:
                candidates.append({
                    "id": t_id,
                    "name": t_name,
                    "score": round(score, 3),
                    "subject": subject
                })

        candidates.sort(key=lambda x: x["score"], reverse=True)

        if not candidates:
            return EntityMatchResult(
                raw_ocr_name=raw_name,
                entity_type="faculty",
                confidence=0.20,
                status="not_found",
                requires_admin_selection=True
            )

        top_match = candidates[0]
        top_score = top_match["score"]
        is_exact = top_score >= 0.99

        is_ambiguous = False
        if len(candidates) > 1 and (candidates[0]["score"] - candidates[1]["score"]) < 0.08:
            is_ambiguous = True
        elif top_score < 0.85:
            is_ambiguous = True

        status = "matched" if (top_score >= 0.85 and not is_ambiguous) else ("ambiguous" if is_ambiguous else "needs_review")

        return EntityMatchResult(
            raw_ocr_name=raw_name,
            entity_type="faculty",
            matched_id=top_match["id"],
            matched_name=top_match["name"],
            confidence=top_score,
            is_exact=is_exact,
            requires_admin_selection=is_ambiguous or top_score < 0.85,
            status=status,
            candidates=candidates[:5],
            extra_meta={"subject": top_match.get("subject")}
        )

entity_matcher = EntityMatcher()
