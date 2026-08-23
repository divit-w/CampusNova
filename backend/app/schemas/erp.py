from typing import Union, List, Optional, Dict, Any
from pydantic import BaseModel

class PromptRequest(BaseModel):
    query: str

class PromptResponse(BaseModel):
    action_type: str
    target_collection: str
    results: Union[List[dict], dict]
    summary: Optional[str] = None
    intent: Optional[str] = "query"
    total_matches: Optional[int] = None
    preview_count: Optional[int] = None
    preview_limit: Optional[int] = None
    route: Optional[str] = None
    suggested_action: Optional[str] = None
    action_card: Optional[Dict[str, Any]] = None
