import base64
import json
import uuid
from openai import AsyncOpenAI
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.config import settings
from app.schemas.documents import DocumentSchema
from app.services.document_service import document_service

router = APIRouter()

# Initialize client with OpenRouter's base URL
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.OPENROUTER_API_KEY,
)

@router.post("/extract")
async def extract_document(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Uploaded file must be an image.")

    # Read and encode the uploaded image
    image_bytes = await file.read()
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    mime_type = file.content_type or "image/png"

    # Call OpenRouter's free router
    response = await client.chat.completions.create(
        model="openrouter/free",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract the timetable data from this image and format it into JSON matching our strict schema."
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
    )
    
    # Parse and return the extracted JSON data
    extracted_data = json.loads(response.choices[0].message.content)
    parsed_doc = DocumentSchema(**extracted_data)
    
    document_id = str(uuid.uuid4())
    document_service.index_document(parsed_doc, document_id)
    
    response_dict = parsed_doc.model_dump()
    response_dict["document_id"] = document_id
    return response_dict