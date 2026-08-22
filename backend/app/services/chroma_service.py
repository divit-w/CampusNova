import logging
import os
import chromadb
from app.core.config import settings

logger = logging.getLogger(__name__)

class ChromaManager:
    def __init__(self, path: str = None):
        self.path = path or settings.CHROMA_PERSIST_DIR
        # Fallback to ./chroma_data if chroma_data directory exists
        if os.path.exists("./chroma_data") and not os.path.exists(self.path):
            self.path = "./chroma_data"
        self.client = chromadb.PersistentClient(path=self.path)

    def get_or_create_collection(self, name: str):
        try:
            return self.client.get_or_create_collection(name=name)
        except Exception as e:
            logger.warning(f"ChromaDB collection '{name}' dimension or schema mismatch ({e}). Recreating fresh collection...")
            try:
                self.client.delete_collection(name=name)
            except Exception:
                pass
            return self.client.get_or_create_collection(name=name)

    def reset_collection(self, name: str = "student_documents"):
        try:
            self.client.delete_collection(name=name)
            logger.info(f"ChromaDB collection '{name}' dropped successfully.")
        except Exception as e:
            logger.warning(f"Could not drop collection '{name}': {e}")
        return self.client.get_or_create_collection(name=name)

chroma_db = ChromaManager()

