# Provider Setup

OpenPM stores LLM and embedding provider configurations encrypted in PostgreSQL. There is no env-var fallback at runtime — providers must exist in the database before chat or embeddings work.

## First-time setup

1. Boot the stack (`./dev.sh` for development, or your production compose file).
2. Open the frontend, log in, and open **Settings**.
3. Add one provider with `purpose=llm` and activate it.
4. (Optional) Add one provider with `purpose=embedding` and activate it. Without an active embedding provider, document search and the `search_documents` chat tool are disabled — uploads still complete, the embedding step is skipped.

## Bootstrapping from env vars

If you are upgrading from a version that read `LLM_*` / `EMBEDDING_*` from `.env`, set the `SEED_*` variables documented in `.env.example` and run:

```bash
docker compose exec backend python -m scripts.seed_providers
```

The script is idempotent — it skips any purpose that already has a configured provider.

## Supported provider types

| Purpose | Provider type | Required credentials |
|---------|---------------|----------------------|
| llm | openrouter | api_key |
| llm | openai_compat | api_key, base_url |
| llm | azure_openai | api_key, endpoint, api_version |
| embedding | openai_compat | api_key, base_url |
| embedding | azure_openai | api_key, endpoint, api_version |
| embedding | kreuzberg | — |

## Encryption key

Credentials are encrypted at rest with AES-256-GCM using `OPENPM_ENCRYPTION_KEY` (32 bytes, base64). Rotating this key invalidates all stored credentials — re-create providers via the UI after rotation.

---

## LLM provider reference

### OpenRouter (default)

[OpenRouter](https://openrouter.ai) is the recommended LLM provider. It offers a single OpenAI-compatible endpoint with access to dozens of models and automatic failover.

**Getting an API key:**

1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Go to **Keys** and create a new key.
3. Fund your account or enable per-request billing.

**Configuration via Settings UI:**

| Field | Value |
|-------|-------|
| Provider type | `openrouter` |
| API key | your OpenRouter key |
| Model | see below |

**Model selection:**

The model used for extraction and chat is set per-provider in the Settings UI. The file `backend/app/agent_config.py` is the canonical source of supported model IDs and their pricing estimates. Examples from that file:

- `openai/gpt-4o`
- `anthropic/claude-sonnet-4`
- `google/gemini-2.5-flash`
- `meta-llama/llama-3.3-70b`

**Rate-limit fallback:**

The chat agent automatically falls back across the model list defined in `agent_config.py` when it receives a rate-limit response. This happens transparently — the user sees a continued response, just potentially from a different model.

---

### Azure OpenAI

Use provider type `azure_openai` in the Settings UI.

**Configuration:**

| Field | Value |
|-------|-------|
| Provider type | `azure_openai` |
| API key | your Azure OpenAI resource key |
| Endpoint | `https://{resource-name}.openai.azure.com` |
| API version | e.g. `2025-01-01-preview` |
| Model / deployment | your deployment name (e.g. `gpt-4o`) |

**Notes:**

- The endpoint must be the resource-level URL, not the deployment URL. OpenPM appends the deployment path internally.
- The `api-version` query parameter is required by Azure's API; it is stored as `api_version` in the provider config and appended automatically.
- The deployment name you configure maps directly to the model — name it to match what you want to call in the chat agent.
- Azure OpenAI exposes an OpenAI-compatible API surface. No special client is needed.

---

## Embeddings

Embeddings power semantic document search (the `search_documents` tool in the chat agent).

Configure an embedding provider via **Settings → Add Provider → purpose: embedding**.

Supported types and their required credentials are listed in the table above.

**Toggling embeddings at runtime:**

Embeddings can be disabled without restarting the stack. In the Settings UI, deactivate the active embedding provider. OpenPM writes a flag to Redis; the backend picks it up immediately and removes `search_documents` from the chat agent's tool list. Re-activate to re-enable.

When embeddings are off:
- New document uploads complete normally; the embedding step is skipped.
- Existing Qdrant vectors are preserved and will be used once embeddings are re-enabled.
- The `search_documents` chat tool is not available.
