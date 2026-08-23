import re
import calendar
from datetime import datetime, date
from typing import Optional, Tuple, List, Dict, Any

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}

class DateExtractionResult:
    def __init__(
        self,
        raw_value: Optional[str] = None,
        normalized_iso: Optional[str] = None,
        confidence: float = 0.0,
        status: str = "missing", # "valid", "needs_review", "impossible_date", "invalid_range", "missing"
        message: Optional[str] = None
    ):
        self.raw_value = raw_value
        self.normalized_iso = normalized_iso
        self.confidence = confidence
        self.status = status
        self.message = message or ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "raw_value": self.raw_value,
            "normalized_iso": self.normalized_iso,
            "confidence": self.confidence,
            "status": self.status,
            "message": self.message,
        }

class HandwrittenDateExtractor:
    """
    Robust date extraction and normalization engine designed for handwritten documents.
    Handles multiple handwritten numeric & written month patterns, OCR character confusion,
    and strict calendar & range validation without fabricating dates.
    """

    def clean_ocr_date_token(self, token: str) -> str:
        """Fixes common OCR character confusions in numeric date fragments."""
        # Replace OCR character misrecognitions commonly seen in handwritten numbers
        # e.g., '24/S/26' -> '24/5/26', '24/O8/2O26' -> '24/08/2026', 'l8/O8/26' -> '18/08/26'
        cleaned = token.strip()
        # Keep separators
        parts = re.split(r'([/\-\.\s])', cleaned)
        corrected_parts = []
        for p in parts:
            if p in ["/", "-", ".", " "]:
                corrected_parts.append(p)
            elif p.isalpha() and p.lower() in MONTH_MAP:
                # Keep valid written month
                corrected_parts.append(p)
            else:
                sub = p
                # If part is mostly numeric/mixed with OCR artifacts
                sub = sub.replace("O", "0").replace("o", "0").replace("D", "0")
                sub = sub.replace("l", "1").replace("I", "1").replace("|", "1").replace("i", "1")
                sub = sub.replace("S", "5").replace("s", "5")
                sub = sub.replace("Z", "2").replace("z", "2")
                sub = sub.replace("B", "8")
                corrected_parts.append(sub)
        return "".join(corrected_parts)

    def parse_single_date(self, raw_str: str) -> DateExtractionResult:
        """
        Parses a single date string into ISO YYYY-MM-DD.
        Performs calendar validity checking.
        """
        if not raw_str or not raw_str.strip():
            return DateExtractionResult(status="missing", message="No date string provided.")

        cleaned = self.clean_ocr_date_token(raw_str.strip())

        # 1. ISO format: YYYY-MM-DD
        iso_match = re.search(r'\b(20\d{2})[-/.]([01]?\d)[-/.]([0-3]?\d)\b', cleaned)
        if iso_match:
            y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
            return self._validate_and_build(raw_str, y, m, d, confidence=0.98)

        # 2. Written month formats: 24th August 2026, 24 Aug 2026, August 24 2026, 24-Aug-26, etc.
        written_pattern = re.search(
            r'\b([0-3]?\d)(?:st|nd|rd|th)?[\s\-_/.]([A-Za-z]{3,9})[\s\-_/.](20\d{2}|\d{2})\b',
            cleaned,
            re.IGNORECASE
        )
        if written_pattern:
            d_str, mon_str, y_str = written_pattern.group(1), written_pattern.group(2).lower(), written_pattern.group(3)
            mon = MONTH_MAP.get(mon_str) or MONTH_MAP.get(mon_str[:3])
            if mon:
                d = int(d_str)
                y = int(y_str) if len(y_str) == 4 else 2000 + int(y_str)
                return self._validate_and_build(raw_str, y, mon, d, confidence=0.95)

        # Month first: August 24, 2026 or Aug 24 2026
        written_pattern2 = re.search(
            r'\b([A-Za-z]{3,9})[\s\-_/.]([0-3]?\d)(?:st|nd|rd|th)?(?:,)?[\s\-_/.](20\d{2}|\d{2})\b',
            cleaned,
            re.IGNORECASE
        )
        if written_pattern2:
            mon_str, d_str, y_str = written_pattern2.group(1).lower(), written_pattern2.group(2), written_pattern2.group(3)
            mon = MONTH_MAP.get(mon_str) or MONTH_MAP.get(mon_str[:3])
            if mon:
                d = int(d_str)
                y = int(y_str) if len(y_str) == 4 else 2000 + int(y_str)
                return self._validate_and_build(raw_str, y, mon, d, confidence=0.95)

        # 3. Standard handwritten DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        dmy_4digit = re.search(r'\b([0-3]?\d)[/\-.]([01]?\d)[/\-.](20\d{2}|19\d{2})\b', cleaned)
        if dmy_4digit:
            d, m, y = int(dmy_4digit.group(1)), int(dmy_4digit.group(2)), int(dmy_4digit.group(3))
            return self._validate_and_build(raw_str, y, m, d, confidence=0.94)

        # 4. Standard handwritten 2-digit year: DD/MM/YY (e.g. 24/8/26, 24-08-26, 24.8.26)
        dmy_2digit = re.search(r'\b([0-3]?\d)[/\-.]([01]?\d)[/\-.](\d{2})\b', cleaned)
        if dmy_2digit:
            d, m, yy = int(dmy_2digit.group(1)), int(dmy_2digit.group(2)), int(dmy_2digit.group(3))
            y = 2000 + yy if yy < 70 else 1900 + yy
            return self._validate_and_build(raw_str, y, m, d, confidence=0.90)

        # If no pattern matched
        return DateExtractionResult(
            raw_value=raw_str,
            normalized_iso=None,
            confidence=0.30,
            status="needs_review",
            message=f"Could not parse handwritten date '{raw_str}'. Manual review required."
        )

    def _validate_and_build(self, raw_str: str, year: int, month: int, day: int, confidence: float) -> DateExtractionResult:
        """Validates day/month/year against real calendar days in that month."""
        if month < 1 or month > 12:
            return DateExtractionResult(
                raw_value=raw_str,
                normalized_iso=None,
                confidence=0.20,
                status="impossible_date",
                message=f"Invalid month ({month}) in extracted date."
            )

        # Get maximum valid days in this specific month/year (handles leap years)
        _, max_days = calendar.monthrange(year, month)
        if day < 1 or day > max_days:
            return DateExtractionResult(
                raw_value=raw_str,
                normalized_iso=None,
                confidence=0.20,
                status="impossible_date",
                message=f"Impossible calendar date: Day {day} does not exist in month {month}/{year} (max {max_days} days)."
            )

        iso_date = f"{year:04d}-{month:02d}-{day:02d}"
        return DateExtractionResult(
            raw_value=raw_str,
            normalized_iso=iso_date,
            confidence=confidence,
            status="valid",
            message="Date parsed and verified."
        )

    def extract_leave_dates(self, text: str, field_dict: Optional[Dict[str, str]] = None) -> Tuple[DateExtractionResult, DateExtractionResult]:
        """
        Extracts start and end leave dates from document text or structured fields.
        Validates date ordering (start <= end) and surrounding labels.
        """
        start_result = DateExtractionResult(status="missing")
        end_result = DateExtractionResult(status="missing")

        field_dict = field_dict or {}

        # 1. Check explicit fields if passed
        for k, v in field_dict.items():
            k_low = k.lower()
            if any(x in k_low for x in ["from", "start", "leave start", "begin", "date from"]):
                if v and not start_result.normalized_iso:
                    start_result = self.parse_single_date(v)
            elif any(x in k_low for x in ["to", "end", "leave end", "until", "date to"]):
                if v and not end_result.normalized_iso:
                    end_result = self.parse_single_date(v)
            elif "leave date" in k_low or "date" == k_low:
                if v and not start_result.normalized_iso:
                    start_result = self.parse_single_date(v)

        # 2. Context Label Regex on raw text
        if not start_result.normalized_iso or not end_result.normalized_iso:
            # Look for "From: <date> To: <date>" or "Leave Period: <date> - <date>"
            range_match = re.search(
                r'(?:from|period|dates?|leave\s*dates?)[:\s]+([0-9A-Za-z\s/.\-]+?)\s+(?:to|until|-|–|—)\s+([0-9A-Za-z\s/.\-]+)',
                text,
                re.IGNORECASE
            )
            if range_match:
                s_raw = range_match.group(1).strip()
                e_raw = range_match.group(2).strip()
                if not start_result.normalized_iso:
                    start_result = self.parse_single_date(s_raw)
                if not end_result.normalized_iso:
                    end_result = self.parse_single_date(e_raw)

        # 3. Label-based single searches
        if not start_result.normalized_iso:
            from_match = re.search(r'(?:leave\s*from|from|starting)[:\s]+([0-9A-Za-z\s/.\-]+)', text, re.IGNORECASE)
            if from_match:
                start_result = self.parse_single_date(from_match.group(1).strip())

        if not end_result.normalized_iso:
            to_match = re.search(r'(?:leave\s*to|to|until|ending)[:\s]+([0-9A-Za-z\s/.\-]+)', text, re.IGNORECASE)
            if to_match:
                end_result = self.parse_single_date(to_match.group(1).strip())

        # 4. Fallback: Find all dates in text chronologically
        if not start_result.normalized_iso:
            # Find any date pattern in text
            date_candidates = re.findall(
                r'\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[\s\-_/.][A-Za-z]{3,9}[\s\-_/.]\d{2,4})\b',
                text
            )
            parsed_candidates = []
            for cand in date_candidates:
                res = self.parse_single_date(cand)
                if res.status == "valid":
                    parsed_candidates.append(res)
            
            if parsed_candidates:
                start_result = parsed_candidates[0]
                if len(parsed_candidates) > 1 and not end_result.normalized_iso:
                    end_result = parsed_candidates[1]

        # If start is found but end is missing, single-day leave defaults end = start
        if start_result.status == "valid" and end_result.status == "missing":
            end_result = DateExtractionResult(
                raw_value=start_result.raw_value,
                normalized_iso=start_result.normalized_iso,
                confidence=start_result.confidence,
                status="valid",
                message="Single day leave; end date equals start date."
            )

        # 5. Range Validity Check (start <= end)
        if start_result.status == "valid" and end_result.status == "valid":
            try:
                s_dt = datetime.strptime(start_result.normalized_iso, "%Y-%m-%d").date()
                e_dt = datetime.strptime(end_result.normalized_iso, "%Y-%m-%d").date()
                if s_dt > e_dt:
                    end_result.status = "invalid_range"
                    end_result.confidence = 0.40
                    end_result.message = f"Inconsistent leave range: start ({start_result.normalized_iso}) is after end ({end_result.normalized_iso})."
            except Exception:
                pass

        return start_result, end_result

date_extractor = HandwrittenDateExtractor()
