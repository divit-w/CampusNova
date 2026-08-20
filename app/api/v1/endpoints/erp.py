from fastapi import APIRouter, Depends, Request
from app.api.v1.deps import require_roles
from app.schemas.erp import PromptRequest, PromptResponse
from app.services.nlp_service import erp_agent
from app.core.limiter import limiter

router = APIRouter()


@router.post("/prompt", response_model=PromptResponse)
@limiter.limit("10/minute")
async def erp_prompt(
    request: Request,
    prompt_body: PromptRequest,
    current_user: dict = Depends(require_roles(["admin"])),
):
    result = await erp_agent.run(prompt_body.query)
    return PromptResponse(**result)
