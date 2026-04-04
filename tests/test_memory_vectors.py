"""Tests for MEM-03/MEM-05: ChromaDB vector memory layer.

These tests verify that MemoryVectors correctly creates a ChromaDB collection,
stores documents with embeddings, and returns semantically similar results.

NOTE: First run downloads all-MiniLM-L6-v2 model (~22 MB). Subsequent runs use cache.
"""

import pytest


def test_memory_vectors_init(tmp_path) -> None:
    """MemoryVectors(tmp_path) creates a PersistentClient and collection without error."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    assert mv._collection is not None


def test_collection_has_embedding_model_metadata(tmp_path) -> None:
    """Collection metadata contains key 'embedding_model' with value 'all-MiniLM-L6-v2' (MEM-05)."""
    from jarvis.memory.vectors import MemoryVectors, EMBEDDING_MODEL

    mv = MemoryVectors(chroma_path=str(tmp_path))
    meta = mv._collection.metadata
    assert "embedding_model" in meta
    assert meta["embedding_model"] == EMBEDDING_MODEL


def test_add_and_query_memory(tmp_path) -> None:
    """add_memory upserts; query_memories returns the stored document."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    mv.add_memory("doc1", "hello world")
    results = mv.query_memories("hello", n_results=1)
    assert results == ["hello world"]


def test_query_empty_collection_returns_empty_list(tmp_path) -> None:
    """query_memories on empty collection returns [] not exception."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    results = mv.query_memories("anything")
    assert results == []


def test_add_memory_upsert_same_id(tmp_path) -> None:
    """add_memory with same id twice updates document (upsert, not duplicate)."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    mv.add_memory("doc1", "first version")
    mv.add_memory("doc1", "second version")

    results = mv.query_memories("version", n_results=5)
    # Only one result — upsert replaced, not duplicated
    assert len(results) == 1
    assert results[0] == "second version"


def test_query_returns_at_most_n_results(tmp_path) -> None:
    """query_memories returns at most n_results documents."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    for i in range(5):
        mv.add_memory(f"doc{i}", f"document number {i}")

    results = mv.query_memories("document", n_results=3)
    assert len(results) <= 3


def test_add_memory_with_metadata(tmp_path) -> None:
    """add_memory with metadata dict stores metadata alongside document."""
    from jarvis.memory.vectors import MemoryVectors

    mv = MemoryVectors(chroma_path=str(tmp_path))
    mv.add_memory("doc1", "text with metadata", metadata={"source": "test", "turn": "1"})

    # Document should still be queryable
    results = mv.query_memories("text with metadata", n_results=1)
    assert results == ["text with metadata"]
