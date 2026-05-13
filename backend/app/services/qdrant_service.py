from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.config import settings


def _qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(url=settings.qdrant_url)


def _collection_name(project_id: str) -> str:
    return f"project_{project_id}"


async def _embed(texts: list[str]) -> list[list[float]]:
    if settings.embedding_provider == "kreuzberg":
        from kreuzberg import embed
        return await embed(texts)
    client = AsyncOpenAI(base_url=settings.embedding_base_url, api_key=settings.embedding_api_key)
    response = await client.embeddings.create(model=settings.embedding_model, input=texts)
    return [item.embedding for item in response.data]


async def create_collection(project_id: str) -> None:
    client = _qdrant()
    await client.create_collection(
        collection_name=_collection_name(project_id),
        vectors_config=VectorParams(size=settings.embedding_dimension, distance=Distance.COSINE),
    )


async def upsert_chunks(project_id: str, chunks: list[str], document_id: str, source_filename: str) -> None:
    if not chunks:
        return
    client = _qdrant()
    vectors = await _embed(chunks)
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=vector,
            payload={
                "document_id": document_id,
                "project_id": project_id,
                "chunk_text": text,
                "chunk_index": i,
                "source_filename": source_filename,
                "uploaded_at": datetime.utcnow().isoformat(),
            },
        )
        for i, (text, vector) in enumerate(zip(chunks, vectors))
    ]
    await client.upsert(collection_name=_collection_name(project_id), points=points)


@dataclass
class SearchResult:
    chunk_text: str
    document_id: str
    source_filename: str
    score: float


async def search(project_id: str, query: str, limit: int = 5) -> list[SearchResult]:
    client = _qdrant()
    vectors = await _embed([query])
    results = await client.query_points(
        collection_name=_collection_name(project_id),
        query=vectors[0],
        limit=limit,
    )
    return [
        SearchResult(
            chunk_text=r.payload.get("chunk_text", ""),
            document_id=r.payload.get("document_id", ""),
            source_filename=r.payload.get("source_filename", ""),
            score=r.score,
        )
        for r in results.points
    ]


async def delete_by_document(project_id: str, document_id: str) -> None:
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    client = _qdrant()
    await client.delete(
        collection_name=_collection_name(project_id),
        points_selector=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
    )


async def delete_collection(project_id: str) -> None:
    client = _qdrant()
    await client.delete_collection(collection_name=_collection_name(project_id))
