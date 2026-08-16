from typing import Union, List
from pydantic import BaseModel

class PromptRequest(BaseModel):
    query: str

class PromptResponse(BaseModel):
    action_type: str
    target_collection: str
    results: Union[List[dict], dict]
    summary: Union[str, None] = None
