from fastapi import APIRouter, Depends
from app.api.v1.deps import require_roles
from app.schemas.erp import PromptRequest, PromptResponse
from app.services.nlp_service import erp_agent

router = APIRouter()

@router.post("/prompt", response_model=PromptResponse)
async def erp_prompt(
    request: PromptRequest,
    current_user: dict = Depends(require_roles(["admin"])),
):
    result = await erp_agent.run(request.query)
    return PromptResponse(**result)
