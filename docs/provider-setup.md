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
