import chromadb

class ChromaManager:
    def __init__(self, path: str = "./chroma_data"):
        self.client = chromadb.PersistentClient(path=path)

    def get_or_create_collection(self, name: str):
        return self.client.get_or_create_collection(name=name)

chroma_db = ChromaManager()
