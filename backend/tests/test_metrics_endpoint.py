"""Section W: /metrics Prometheus endpoint + counters."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient


async def test_metrics_endpoint_exposes_named_metrics():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Hit a real route first so the HTTP histogram has a sample.
        await client.get("/api/health/live")
        resp = await client.get("/metrics")

    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    body = resp.text
    for name in (
        "http_request_duration_seconds",
        "pipeline_step_duration_seconds",
        "extraction_total",
        "chat_messages_total",
        "pipeline_errors_total",
    ):
        assert name in body


async def test_counter_helpers_increment():
    from app.services import metrics

    def _val(counter, **labels):
        return counter.labels(**labels)._value.get()

    before = _val(metrics.pipeline_errors_total, error_class="llm_timeout")
    metrics.record_pipeline_error("llm_timeout")
    assert _val(metrics.pipeline_errors_total, error_class="llm_timeout") == before + 1

    before_chat = _val(metrics.chat_messages_total, model="gpt-x")
    metrics.record_chat_message("gpt-x")
    assert _val(metrics.chat_messages_total, model="gpt-x") == before_chat + 1
