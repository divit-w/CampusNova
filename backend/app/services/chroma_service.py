import logging
import os
import chromadb
from app.core.config import settings, PROJECT_ROOT

logger = logging.getLogger(__name__)

class ChromaManager:
    def __init__(self, path: str = None):
        self.path = path or settings.CHROMA_PERSIST_DIR
        # Auto-discover pre-indexed chroma_db directory in project root or relative paths
        root_chroma = str(PROJECT_ROOT / "chroma_db")
        if os.path.exists(os.path.join(root_chroma, "chroma.sqlite3")):
            self.path = root_chroma
        elif os.path.exists("./chroma_db") and os.path.exists("./chroma_db/chroma.sqlite3"):
            self.path = "./chroma_db"
        elif os.path.exists("../chroma_db") and os.path.exists("../chroma_db/chroma.sqlite3"):
            self.path = "../chroma_db"
        elif os.path.exists("./chroma_data") and not os.path.exists(self.path):
            self.path = "./chroma_data"
            
        logger.info("Initializing ChromaDB PersistentClient at: %s", self.path)
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

