"""Usage & cost-transparency endpoint for Section K."""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_project_member
from app.config import settings
from app.database import get_db
from app.models.document import Document
from app.models.project import Project, ProjectMember
from app.models.state import ChatMessage
from app.models.user import User

log = structlog.get_logger()

router = APIRouter(
    prefix="/api/projects/{project_id}",
    tags=["usage"],
)

_PERIOD_DAYS: dict[str, int | None] = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "mtd": None,   # month-to-date computed below
    "today": 1,
}


def _period_start(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "mtd":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    days = _PERIOD_DAYS.get(period, 30) or 30
    return now - timedelta(days=days)


def _date_key(dt: datetime) -> str:
    return dt.date().isoformat()


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _aggregate_usage(records: list[dict]) -> dict[str, Any]:
    """Aggregate a flat list of usage record dicts (with 'date', 'model', 'purpose',
    'prompt', 'completion', 'cost_usd') into the response shape."""
    daily: dict[str, dict] = {}
    by_model: dict[str, dict] = {}
    by_purpose: dict[str, dict] = {}
    total_prompt = 0
    total_completion = 0
    total_cost = 0.0

    for r in records:
        d = r.get("date", "")
        model = r.get("model", "unknown")
        purpose = r.get("purpose", "unknown")
        prompt = int(r.get("prompt", 0) or 0)
        completion = int(r.get("completion", 0) or 0)
        cost = _safe_float(r.get("cost_usd", 0))

        # Daily
        if d not in daily:
            daily[d] = {"date": d, "prompt": 0, "completion": 0, "cost_usd": 0.0}
        daily[d]["prompt"] += prompt
        daily[d]["completion"] += completion
        daily[d]["cost_usd"] += cost

        # By model
        if model not in by_model:
            by_model[model] = {"model": model, "prompt": 0, "completion": 0, "cost_usd": 0.0}
        by_model[model]["prompt"] += prompt
        by_model[model]["completion"] += completion
        by_model[model]["cost_usd"] += cost

        # By purpose
        if purpose not in by_purpose:
            by_purpose[purpose] = {"purpose": purpose, "cost_usd": 0.0}
        by_purpose[purpose]["cost_usd"] += cost

        total_prompt += prompt
        total_completion += completion
        total_cost += cost

    return {
        "daily": sorted(daily.values(), key=lambda x: x["date"]),
        "by_model": sorted(by_model.values(), key=lambda x: -x["cost_usd"]),
        "by_purpose": sorted(by_purpose.values(), key=lambda x: -x["cost_usd"]),
        "total": {
            "prompt": total_prompt,
            "completion": total_completion,
            "cost_usd": round(total_cost, 6),
        },
    }


@router.get("/usage")
async def get_usage(
    project_id: uuid.UUID,
    period: str = Query(default="30d", description="7d | 30d | 90d | mtd | today"),
    db: AsyncSession = Depends(get_db),
    _member: ProjectMember = Depends(get_project_member),
) -> dict:
    """Return token usage and cost aggregates for a project."""
    if period not in _PERIOD_DAYS:
        period = "30d"

    since = _period_start(period)

    # Fetch project for budget
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    budget_usd = float(project.monthly_budget_usd) if (project and project.monthly_budget_usd) else None

    flat_records: list[dict] = []

    # --- Chat messages ---
    chat_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.project_id == project_id,
            ChatMessage.role == "assistant",
            ChatMessage.token_usage.isnot(None),
            ChatMessage.created_at >= since,
        )
    )
    for msg in chat_result.scalars().all():
        u = msg.token_usage or {}
        flat_records.append({
            "date": _date_key(msg.created_at),
            "model": u.get("model", "unknown"),
            "purpose": u.get("purpose", "chat"),
            "prompt": u.get("prompt", 0),
            "completion": u.get("completion", 0),
            "cost_usd": _safe_float(u.get("cost_usd", 0)),
        })

    # --- Document extraction ---
    doc_result = await db.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.extraction_token_usage.isnot(None),
            Document.uploaded_at >= since,
        )
    )
    for doc in doc_result.scalars().all():
        u = doc.extraction_token_usage or {}
        breakdown = u.get("breakdown", [])
        if breakdown:
            for b in breakdown:
                flat_records.append({
                    "date": _date_key(doc.uploaded_at),
                    "model": b.get("model", "unknown"),
                    "purpose": b.get("purpose", "extraction"),
                    "prompt": b.get("prompt_tokens", 0),
                    "completion": b.get("completion_tokens", 0),
                    "cost_usd": _safe_float(b.get("cost_usd", 0)),
                })
        else:
            # Fallback to top-level aggregates
            flat_records.append({
                "date": _date_key(doc.uploaded_at),
                "model": "unknown",
                "purpose": "extraction",
                "prompt": u.get("prompt_total", 0),
                "completion": u.get("completion_total", 0),
                "cost_usd": _safe_float(u.get("cost_total_usd", 0)),
            })

    aggregated = _aggregate_usage(flat_records)

    # Month-to-date cost (for budget tracking regardless of query period)
    if period == "mtd":
        mtd_cost = aggregated["total"]["cost_usd"]
    else:
        # Compute MTD separately
        mtd_since = _period_start("mtd")
        mtd_records: list[dict] = []
        chat_mtd = await db.execute(
            select(ChatMessage).where(
                ChatMessage.project_id == project_id,
                ChatMessage.role == "assistant",
                ChatMessage.token_usage.isnot(None),
                ChatMessage.created_at >= mtd_since,
            )
        )
        for msg in chat_mtd.scalars().all():
            u = msg.token_usage or {}
            mtd_records.append({"cost_usd": _safe_float(u.get("cost_usd", 0))})
        doc_mtd = await db.execute(
            select(Document).where(
                Document.project_id == project_id,
                Document.extraction_token_usage.isnot(None),
                Document.uploaded_at >= mtd_since,
            )
        )
        for doc in doc_mtd.scalars().all():
            u = doc.extraction_token_usage or {}
            mtd_records.append({"cost_usd": _safe_float(u.get("cost_total_usd", 0))})
        mtd_cost = sum(r["cost_usd"] for r in mtd_records)

    budget_used_pct: float | None = None
    if budget_usd and budget_usd > 0:
        budget_used_pct = round((mtd_cost / budget_usd) * 100, 1)

    return {
        **aggregated,
        "budget_usd": budget_usd,
        "month_to_date_cost_usd": round(mtd_cost, 6),
        "budget_used_pct": budget_used_pct,
    }
