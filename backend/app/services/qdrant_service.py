from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime

import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from app.config import settings

logger = logging.getLogger(__name__)


def _qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(url=settings.qdrant_url)


def _collection_name(project_id: str) -> str:
    return f"project_{project_id}"


async def _embed(texts: list[str]) -> list[list[float]]:
    if settings.embedding_provider == "kreuzberg":
        from kreuzberg import embed
        return await embed(texts)

    url = settings.embedding_base_url.rstrip("/") + "/embeddings"
    headers = {"Authorization": f"Bearer {settings.embedding_api_key}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=60.0) as client:
        # Try batch first
        resp = await client.post(url, headers=headers, json={"model": settings.embedding_model, "input": texts})
        resp.raise_for_status()
        body = resp.json()
        items = body.get("data", [])
        if items and all(item.get("embedding") for item in items):
            return [item["embedding"] for item in items]

        # OpenRouter proxied models (e.g. nvidia/llama-nemotron-embed-vl-*) return data:[]
        # for list input — fall back to one request per text
        logger.warning("Batch embedding returned empty data for %r, falling back to per-text requests. Response: %r", settings.embedding_model, body)
        embeddings: list[list[float]] = []
        for text in texts:
            r = await client.post(url, headers=headers, json={"model": settings.embedding_model, "input": text})
            r.raise_for_status()
            b = r.json()
            items = b.get("data", [])
            if not items or not items[0].get("embedding"):
                raise ValueError(f"No embedding data from {settings.embedding_base_url!r} model={settings.embedding_model!r}. Response: {b!r}")
            embeddings.append(items[0]["embedding"])
        return embeddings


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
