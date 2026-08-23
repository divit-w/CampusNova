from datetime import datetime, timezone, timedelta
from typing import Tuple, Optional

def get_tenant_now(tz_offset_minutes: int = 0) -> datetime:
    """Returns timezone-aware datetime adjusted for caller/tenant offset in minutes (UTC - Local)."""
    return datetime.now(timezone.utc) - timedelta(minutes=tz_offset_minutes)

def get_tenant_today_str(tz_offset_minutes: int = 0) -> str:
    """Returns tenant local date in YYYY-MM-DD format."""
    return get_tenant_now(tz_offset_minutes).strftime("%Y-%m-%d")

def parse_date_to_weekday(date_str: str) -> Tuple[int, str]:
    """
    Parses YYYY-MM-DD string and returns (weekday_index, day_name).
    weekday_index: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    idx = dt.weekday()
    return idx, days[idx]

def check_is_working_day(date_str: str, working_days_per_week: int = 5) -> bool:
    """
    Returns True if the date falls within the institution's configured working days per week.
    e.g. working_days_per_week=5 -> Monday(0)..Friday(4) are working days. Saturday(5) & Sunday(6) are False.
    """
    try:
        weekday_idx, _ = parse_date_to_weekday(date_str)
        return weekday_idx < working_days_per_week
    except Exception:
        return True
