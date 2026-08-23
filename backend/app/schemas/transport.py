from typing import List, Tuple, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class VehicleSpec(BaseModel):
    vehicle_id: str
    capacity: int = Field(..., ge=1, description="Maximum number of students this vehicle can carry")
    start_location: Tuple[float, float] = Field(
        ..., description="Vehicle depot/start coordinates as (latitude, longitude)"
    )


class StudentPickupPoint(BaseModel):
    student_id: str
    location: Tuple[float, float] = Field(
        ..., description="Student home coordinates as (latitude, longitude)"
    )


class TransportOptimizationRequest(BaseModel):
    vehicles: List[VehicleSpec] = Field(..., min_length=1)
    student_overrides: Optional[List[StudentPickupPoint]] = Field(
        default=None,
        description="Explicit student pickup points. If omitted, students are queried from the database.",
    )


class RouteStop(BaseModel):
    stop_order: int = Field(..., description="1-indexed sequence position within the route")
    student_ids: List[str]
    location: Tuple[float, float]


class OptimizedRoute(BaseModel):
    vehicle_id: str
    assigned_student_count: int
    estimated_distance_km: float = Field(..., description="Total route distance in kilometres")
    estimated_duration_min: float = Field(..., description="Estimated transit time in minutes")
    stops: List[RouteStop]
    road_geometry: Optional[List[Tuple[float, float]]] = Field(
        default=None, description="Detailed road network path coordinates as (lat, lon) for map rendering"
    )
    road_routing_status: Optional[str] = Field(
        default="success", description="Status of road routing: 'success' | 'unavailable'"
    )
    road_distance_km: Optional[float] = Field(
        default=None, description="Physical road network distance in km from OSRM"
    )
    road_duration_min: Optional[float] = Field(
        default=None, description="Actual road transit duration in minutes from OSRM"
    )


class TransportOptimizationResponse(BaseModel):
    total_vehicles_used: int
    total_students_routed: int
    total_unassigned: int = 0
    unassigned_students: List[str] = Field(default_factory=list)
    routes: List[OptimizedRoute]


class TransportRoutesSummaryResponse(BaseModel):
    """Aggregate view of the most recently generated route plan, for admin KPI display."""
    has_plan: bool
    active_routes: int = 0
    total_students_routed: int = 0
    total_unassigned: int = 0
    generated_at: Optional[datetime] = None
