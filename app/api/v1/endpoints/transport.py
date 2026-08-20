import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.transport import TransportOptimizationRequest, TransportOptimizationResponse
from app.services.transport_service import TransportOptimizer
from app.services.mongo_service import mongo_db
from app.api.v1.deps import require_roles

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/optimize-routes", response_model=TransportOptimizationResponse)
async def optimize_routes(
    payload: TransportOptimizationRequest,
    current_user: dict = Depends(require_roles(["admin"])),
):
    """
    Optimizes school bus routes using KMeans geographic clustering and a
    greedy Nearest-Neighbor TSP heuristic.

    Steps:
      1. Load student pickup points (from request overrides or MongoDB).
      2. Cluster students by proximity using KMeans (n_clusters = n_vehicles).
      3. Enforce per-vehicle capacity — spill overflow to nearest under-cap vehicle.
      4. Order each cluster's stops via Nearest-Neighbor greedy TSP from vehicle depot.
      5. Persist the plan to `transport_routes` collection and return the structured response.
    """
    try:
        optimizer = TransportOptimizer(payload)
        result = await optimizer.optimize()
    except Exception as e:
        logger.error(f"Transport optimization failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Route optimization encountered an internal error")

    # Persist the generated plan for audit / historical replay
    plan_doc = {
        "generated_at": datetime.now(timezone.utc),
        "requested_by": current_user.get("id"),
        "total_vehicles_used": result.total_vehicles_used,
        "total_students_routed": result.total_students_routed,
        "routes": [r.model_dump() for r in result.routes],
    }
    await mongo_db.transport_routes_collection.insert_one(plan_doc)

    return result
