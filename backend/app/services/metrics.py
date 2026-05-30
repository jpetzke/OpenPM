"""Prometheus metrics (section W observability).

Defines the process-wide registry metrics named in the roadmap and small
helpers to record them. Importing this module is side-effect free beyond
registering the collectors with the default registry. Scrape at ``/metrics``.
"""

from __future__ import annotations

from prometheus_client import Counter, Histogram

# HTTP request latency — broad observability, labelled by method + route
# template (not raw path, to avoid cardinality blow-up) + status class.
http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "route", "status"],
)

# Per-pipeline-step duration. ``step`` is the step label (parsing, extract, …),
# ``status`` is ok|error.
pipeline_step_duration_seconds = Histogram(
    "pipeline_step_duration_seconds",
    "Document pipeline step duration in seconds.",
    ["step", "status"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120),
)

# Extraction outcomes by model + status (ok|error).
extraction_total = Counter(
    "extraction_total",
    "LLM extraction runs.",
    ["model", "status"],
)

# Persisted chat messages by model.
chat_messages_total = Counter(
    "chat_messages_total",
    "Persisted chat messages.",
    ["model"],
)

# Pipeline failures keyed by typed error class.
pipeline_errors_total = Counter(
    "pipeline_errors_total",
    "Pipeline errors by error class.",
    ["error_class"],
)


def record_extraction(model: str | None, status: str) -> None:
    extraction_total.labels(model=model or "unknown", status=status).inc()


def record_chat_message(model: str | None) -> None:
    chat_messages_total.labels(model=model or "unknown").inc()


def record_pipeline_error(error_class: str | None) -> None:
    pipeline_errors_total.labels(error_class=error_class or "unknown").inc()


def observe_pipeline_step(step: str, status: str, seconds: float) -> None:
    pipeline_step_duration_seconds.labels(step=step, status=status).observe(seconds)
