import os
import uuid
from pathlib import Path

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
