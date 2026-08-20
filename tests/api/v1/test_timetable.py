import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def test_generate_feasible_timetable():
    """Test generating a feasible timetable successfully."""
    payload = {
        "days_per_week": 2,
        "periods_per_day": 2,
        "teachers": [
            {"id": "t1", "name": "Alice", "max_hours": 10},
            {"id": "t2", "name": "Bob", "max_hours": 10}
        ],
        "rooms": [
            {"id": "r1", "capacity": 30},
            {"id": "r2", "capacity": 30}
        ],
        "subjects": [
            {"id": "s1", "name": "Math", "required_weekly_hours": 2},
            {"id": "s2", "name": "Science", "required_weekly_hours": 1}
        ],
        "hard_constraints": ["no_double_booking", "max_hours_respected"]
    }
    
    response = client.post("/api/v1/timetable/generate", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["OPTIMAL", "FEASIBLE"]
    assert len(data["schedule"]) == 3


def test_timetable_validation_error():
    """Test 422 validation error when passing invalid constraints (e.g. negative max_hours)."""
    payload = {
        "days_per_week": 2,
        "periods_per_day": 2,
        "teachers": [
            {"id": "t1", "name": "Alice", "max_hours": -5}, # Violates Field(gt=0)
        ],
        "rooms": [
            {"id": "r1", "capacity": 30}
        ],
        "subjects": [
            {"id": "s1", "name": "Math", "required_weekly_hours": 2}
        ],
        "hard_constraints": ["no_double_booking"]
    }
    
    response = client.post("/api/v1/timetable/generate", json=payload)
    
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data
