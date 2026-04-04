"""ChromaDB vector memory — semantic search over past conversations and profile facts.

Per D-02: Uses sentence-transformers all-MiniLM-L6-v2 locally (22 MB, 384-dim, CPU).
Per MEM-05: Embedding model name stored in collection metadata for versioning.
"""
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from loguru import logger

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
COLLECTION_NAME = "jarvis_memories"


class MemoryVectors:
    """Manages the ChromaDB collection for semantic memory retrieval.

    Created ONCE at session start — never per-call (Pitfall 2 from Research).
    """

    def __init__(self, chroma_path: str) -> None:
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._ef = SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL,
            device="cpu",
            normalize_embeddings=True,
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL},
        )

    def add_memory(self, doc_id: str, text: str, metadata: dict | None = None) -> None:
        """Upsert a document into the vector store. Per MEM-02."""
        try:
            upsert_kwargs: dict = {
                "ids": [doc_id],
                "documents": [text],
            }
            # ChromaDB rejects empty metadata dicts — only pass metadatas if non-empty
            if metadata:
                upsert_kwargs["metadatas"] = [metadata]
            self._collection.upsert(**upsert_kwargs)
        except Exception as e:
            logger.warning(f"Failed to add memory {doc_id}: {e}")

    def query_memories(self, query_text: str, n_results: int = 5) -> list[str]:
        """Return top-K documents by semantic similarity. Per D-01."""
        try:
            count = self._collection.count()
            if count == 0:
                return []
            # Clamp n_results to available documents to avoid ChromaDB error
            actual_n = min(n_results, count)
            results = self._collection.query(
                query_texts=[query_text],
                n_results=actual_n,
            )
            return results["documents"][0] if results["documents"] else []
        except Exception as e:
            logger.warning(f"Failed to query memories: {e}")
            return []
