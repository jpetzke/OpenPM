# Observability

## Health endpoints

Both endpoints are unauthenticated and safe to call from load-balancer health checks.

### `GET /api/health/live`

Returns `{"status": "ok"}` as long as the process is running. Use this for liveness probes — it never touches external services.

### `GET /api/health/ready`

Checks all three backing services and returns a combined status:

```json
{
  "db": "ok",
  "redis": "ok",
  "qdrant": "ok",
  "status": "ready"
}
```

`status` is `"ready"` when all three checks pass, or `"degraded"` when any check fails (individual errors are reported inline). Use this for readiness probes and smoke-testing after a deployment.

```bash
curl https://openpm.example.com/api/health/ready
```

---

## Prometheus metrics

A `/metrics` endpoint on the backend (port 8000) exposes Prometheus-format metrics. A co-worker is adding this endpoint; it will expose the following:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `path`, `status` | Latency of all HTTP requests |
| `pipeline_step_duration_seconds` | Histogram | `step` | Time spent in each pipeline step (parse, summarise, extract, embed, …) |
| `extraction_total` | Counter | `model`, `status` | Count of LLM extraction calls (status: `ok` / `error`) |
| `chat_messages_total` | Counter | `model` | Count of chat completions by model |
| `pipeline_errors_total` | Counter | `error_class` | Count of pipeline failures by exception class |

### Example Prometheus scrape config

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: openpm
    static_configs:
      - targets: ["<your-vps-ip>:8000"]
    metrics_path: /metrics
    scheme: http   # metrics endpoint is on the internal port; keep it off the public proxy
```

If the backend is not directly reachable from your Prometheus instance, expose port 8000 selectively (e.g. via a Hetzner private network or a firewall rule scoped to your monitoring host) rather than opening it publicly.

---

## Grafana dashboard

A pre-built dashboard is available at `ops/grafana/openpm-dashboard.json`. Import it via **Dashboards → Import → Upload JSON file**. It includes panels for request rate, p99 latency, pipeline throughput, extraction error rate, and per-model chat volume.
