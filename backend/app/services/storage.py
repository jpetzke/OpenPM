import os
import uuid
from pathlib import Path
from typing import Awaitable, Callable

from app.config import settings


def _project_docs_dir(project_id: str) -> Path:
    return Path(settings.storage_path) / "projects" / project_id / "documents"


def save_document(project_id: str, file_bytes: bytes, original_filename: str) -> str:
    docs_dir = _project_docs_dir(project_id)
    docs_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}_{original_filename}"
    file_path = docs_dir / filename
    file_path.write_bytes(file_bytes)
    relative = str(file_path.relative_to(settings.storage_path))
    return relative


def get_document_bytes(original_path: str) -> bytes:
    full_path = Path(settings.storage_path) / original_path
    return full_path.read_bytes()


def delete_document(original_path: str) -> None:
    full_path = Path(settings.storage_path) / original_path
    if full_path.exists():
        full_path.unlink()


class UploadTooLarge(Exception):
    def __init__(self, limit: int) -> None:
        super().__init__(f"upload exceeds {limit} bytes")
        self.limit = limit


async def stream_document_to_disk(
    project_id: str,
    original_filename: str,
    read_chunk: Callable[[int], Awaitable[bytes]],
    max_bytes: int,
    chunk_size: int = 1024 * 1024,
) -> tuple[str, int]:
    """Stream an upload to disk in fixed-size chunks.

    `read_chunk` should match `starlette.datastructures.UploadFile.read`.
    Returns (relative_path, total_bytes_written). Raises UploadTooLarge
    (and removes the partial file) if the upload exceeds `max_bytes`.
    """
    docs_dir = _project_docs_dir(project_id)
    docs_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}_{original_filename}"
    file_path = docs_dir / filename
    total = 0
    try:
        with file_path.open("wb") as fh:
            while True:
                chunk = await read_chunk(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise UploadTooLarge(max_bytes)
                fh.write(chunk)
    except UploadTooLarge:
        if file_path.exists():
            file_path.unlink()
        raise
    relative = str(file_path.relative_to(settings.storage_path))
    return relative, total
