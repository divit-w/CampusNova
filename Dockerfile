FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Copy requirements file
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/app/ ./app/

# Runtime data is intentionally outside the source tree. Mount /app/runtime
# for local stateful containers, or use managed storage in production.
RUN useradd --create-home appuser \
    && mkdir -p /app/runtime/chroma /app/runtime/uploads \
    && chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Start FastAPI application
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
