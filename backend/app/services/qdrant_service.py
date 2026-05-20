from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams

from app.config import settings
from app.services.provider_resolver import (
    NoActiveProviderError,
    build_embedding_call,
    require_active_provider,
)

log = structlog.get_logger()


def _qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(url=settings.qdrant_url)


def _collection_name(project_id: str) -> str:
    return f"project_{project_id}"


class EmbeddingDimensionMismatch(Exception):
    """Raised when the active embedding provider produces vectors with a
    different dimensionality than the existing Qdrant collection was created
    with. Recreating the collection is destructive — must be triggered
    explicitly by the user via the recreate endpoint.
    """

    def __init__(self, *, project_id: str, expected: int, got: int) -> None:
        self.project_id = project_id
        self.expected = expected
        self.got = got
        super().__init__(
            f"embedding_dimension_mismatch: collection expects dim={expected}, "
            f"active provider returns dim={got}. Recreate the embedding index "
            f"to use the new provider (this deletes existing vectors)."
        )


async def _collection_exists(client: AsyncQdrantClient, name: str) -> bool:
    try:
        await client.get_collection(collection_name=name)
        return True
    except (UnexpectedResponse, ValueError):
        return False
    except Exception:
        return False


async def _collection_dim(client: AsyncQdrantClient, name: str) -> int | None:
    """Return the configured vector dimension for an existing collection,
    or None if the collection doesn't exist / shape is unexpected."""
    try:
        info = await client.get_collection(collection_name=name)
    except Exception:
        return None
    try:
        params = info.config.params.vectors  # type: ignore[union-attr]
        if isinstance(params, VectorParams):
            return params.size
        if isinstance(params, dict):
            for v in params.values():
                if isinstance(v, VectorParams):
                    return v.size
    except AttributeError:
        return None
    return None


async def _embed(texts: list[str]) -> list[list[float]]:
    provider = await require_active_provider("embedding")
    fn = build_embedding_call(provider)
    return await fn(texts)


async def _ensure_collection(client: AsyncQdrantClient, project_id: str, sample_vector: list[float]) -> None:
    name = _collection_name(project_id)
    new_dim = len(sample_vector)
    if await _collection_exists(client, name):
        existing_dim = await _collection_dim(client, name)
        if existing_dim is not None and existing_dim != new_dim:
            log.warning(
                "qdrant_dim_mismatch",
                project_id=project_id,
                existing_dim=existing_dim,
                new_dim=new_dim,
            )
            raise EmbeddingDimensionMismatch(
                project_id=project_id, expected=existing_dim, got=new_dim
            )
        return
    await client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=new_dim, distance=Distance.COSINE),
    )
    log.info("qdrant_collection_created", project_id=project_id, dim=new_dim)


async def collection_status(project_id: str) -> dict:
    """Report the current embedding-index status for a project. Used by the
    frontend to surface a one-click "recreate" affordance when the active
    embedding provider has a dim mismatch."""
    client = _qdrant()
    name = _collection_name(project_id)
    if not await _collection_exists(client, name):
        return {"exists": False, "collection_dim": None, "provider_dim": None, "mismatch": False}
    existing_dim = await _collection_dim(client, name)
    try:
        probe = await _embed(["dimension probe"])
        provider_dim = len(probe[0]) if probe else None
    except NoActiveProviderError:
        provider_dim = None
    mismatch = (
        existing_dim is not None and provider_dim is not None and existing_dim != provider_dim
    )
    return {
        "exists": True,
        "collection_dim": existing_dim,
        "provider_dim": provider_dim,
        "mismatch": mismatch,
    }


async def recreate_collection(project_id: str) -> dict:
    """Destructively recreate the Qdrant collection using the current active
    embedding provider's dimension. All existing vectors are lost — the caller
    is expected to re-process documents afterwards."""
    client = _qdrant()
    name = _collection_name(project_id)
    if await _collection_exists(client, name):
        await client.delete_collection(collection_name=name)
        log.info("qdrant_collection_deleted_for_recreate", project_id=project_id)
    vectors = await _embed(["dimension probe"])
    new_dim = len(vectors[0])
    await client.create_collection(
        collection_name=name,
        vectors_config=VectorParams(size=new_dim, distance=Distance.COSINE),
    )
    log.info("qdrant_collection_recreated", project_id=project_id, dim=new_dim)
    return {"exists": True, "collection_dim": new_dim, "provider_dim": new_dim, "mismatch": False}


async def create_collection(project_id: str) -> None:
    """Eagerly create a collection if an embedding provider is active.

    Otherwise defer to first upsert. Caller does not need to gate on provider state.
    """
    try:
        vectors = await _embed(["dimension probe"])
    except NoActiveProviderError:
        log.info("qdrant_collection_create_deferred", project_id=project_id)
        return
    client = _qdrant()
    await _ensure_collection(client, project_id, vectors[0])


async def upsert_chunks(project_id: str, chunks: list[str], document_id: str, source_filename: str) -> None:
    if not chunks:
        return
    client = _qdrant()
    vectors = await _embed(chunks)
    await _ensure_collection(client, project_id, vectors[0])
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
    name = _collection_name(project_id)
    if not await _collection_exists(client, name):
        return []
    vectors = await _embed([query])
    results = await client.query_points(
        collection_name=name,
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
    client = _qdrant()
    name = _collection_name(project_id)
    if not await _collection_exists(client, name):
        return
    await client.delete(
        collection_name=name,
        points_selector=Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        ),
    )


async def delete_collection(project_id: str) -> None:
    client = _qdrant()
    name = _collection_name(project_id)
    if not await _collection_exists(client, name):
        return
    await client.delete_collection(collection_name=name)
