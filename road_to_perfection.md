# OpenPM — Road to Perfection

> Lebendes Referenz-Dokument. Definiert pro Feature/Detail den absolut perfekten Zielzustand, hält den aktuellen Ist-Stand fest und listet messbare Akzeptanz-Kriterien als Checkliste. Wird über viele Sessions hinweg fortgeschrieben.
>
> **Last update:** 2026-05-29 (M/N/O/P/Q/R durch) · **Stand:** OpenPM @ `main` (M–R seriell gemerged + browser-verifiziert)
> **Aktueller Gesamt-Score:** **90 / 100** (A–L + M Onboarding/Nav + N Paste + O Slash-Commands + P Keyboard + Q Auth-Refresh + R Notifications durch; Mobile-Drawer/Phase-2-Cookie/Whisper-Bundle deferred; verbleibend S/T/U/V/W + Polish)

---

## 0. Wie dieses Dokument benutzt wird

- **🎯 Soll** beschreibt den perfekten Zustand. Nicht verhandelbar, sondern Maßstab.
- **📍 Ist** dokumentiert den aktuellen Stand mit Datei + Zeilenreferenzen.
- **✅ Checkliste** zerlegt das Soll in messbare Akzeptanz-Kriterien — pro PR abhakbar.
- **🛠 Vorgehen** skizziert den nächsten konkreten Schritt (nicht alle Schritte).
- **⚖️ Decision** markiert offene Trade-offs mit pragmatischem Default. Jonas kann überschreiben.

Reihenfolge der Sektionen orientiert sich am Nutzerpfad — vom ersten Öffnen bis zum täglichen Power-User-Workflow.

Statuslegende für Sub-Items:
- `[x]` erfüllt
- `[~]` teilweise erfüllt (siehe Kommentar)
- `[ ]` offen

---

## 1. Leitprinzipien

1. **Zuverlässigkeit > Geschwindigkeit > Features.** Lieber ein State-Item auslassen als eines erfinden.
2. **Reaktiv, nicht dekorativ.** Jede Animation transportiert Information.
3. **Progressive Disclosure.** Ruhezustand kompakt, Aktivität expandiert, Abschluss wieder kompakt.
4. **Keine toten Momente.** Zwischen Klick und Ergebnis passiert immer etwas Sichtbares.
5. **Single Cockpit.** Eine Seite pro Projekt — Chat dominiert, der Rest atmet drumherum.
6. **Quelle für jede Information.** Jeder State-Eintrag verweist auf das auslösende Dokument.
7. **Power-User-First.** Tastatur, Slash-Commands, Clipboard-Paste sind keine Add-ons.
8. **Self-hosted, KI-Provider-agnostisch.** OpenRouter / Azure austauschbar; eigene Infra zwingend.

### Konflikt-Resolver

Prinzip 1 (Reliability) und Prinzip 4 (No-Dead-Moments) kollidieren bei langsamen Operationen. Regel: **lange Operationen brauchen sichtbares Working-State mit echtem Status — nie Spinner ohne Info, nie Mock-Response.** Jonas sieht „extrahiere Kontakte…" mit pulsendem Label statt „fertig (gelogen)" als Optimierung.

Prinzip 3 (Progressive Disclosure) und Prinzip 7 (Power-User) kollidieren bei Defaults. Regel: **kompakter Default + sichtbarer Expand-Trigger.** Power-User-Detail nie aufgezwungen, immer eine Geste entfernt.

---

## 2. Status-Übersicht (Scorecard)

Formel: **Gesamt = Σ (Bereich-Score × Gewicht) / 100**. Gewichte spiegeln User-Story-Prioritäten (Reliability + Cockpit + Chat schwer, Polish leicht). Bereich-Score = % erfüllter Checklist-Items in der jeweiligen Sektion. Konsistenz-Regel: Score ≤ 30 wenn Kern-Feature der Sektion komplett fehlt, unabhängig von Drumherum-Punkten.

| Bereich | Gewicht | Score | Kurzbefund |
|---|---|---|---|
| A. Cockpit-Layout (Single Page) | 10 % | 80 / 100 | Single-page Cockpit live; Mobile-Bottom-Sheet + Banner-Continuity offen |
| B. Chat-Interface | 8 % | 75 / 100 | Streaming + Tool-Pillen + Mutation-Undo + Sessions; Slash + File-Anhang-Karte offen |
| C. Chat-Archiv & Sessions | 5 % | 80 / 100 | `chat_sessions` Tabelle + UI + Auto-Titel + state-version-Badge live |
| D. Dokument-Upload-Flow | 7 % | 95 / 100 | Cancel + Retry + Dedup + 4-Phasen + Paste + Page-Drop + Paperclip live; Drop-as-Attachment-Karte partial |
| E. Live-Extraction-Feedback | 6 % | 100 / 100 | `extracted_item` SSE + Throttle + Live-Feed + Flash-Scroll + Count-Up + Pulse + Disconnect-Banner |
| F. State + Source-Attribution | 9 % | 94 / 100 | Source-ID-Arrays + Backfill + Merge-Union + Confidence + Konflikte + Chat-Source; `manual:{user_id}` blockiert auf Mutation-API |
| G. State-UI (Status-Block) | 5 % | 100 / 100 | StateGrid + StatusPanel-Summary + Flash-on-State-Change + Versions-Footer + nextDeadline-Util live |
| H. Reliability + Error-Paths | 9 % | 100 / 100 | Typed LLM-Exceptions + Retry-Matrix + JSON-Schema-Re-Prompt + completed_partial + /api/health/live+ready + Doc-Error-Banner |
| I. Dokument-Lifecycle | 5 % | 100 / 100 | Soft-Delete + State-Recompose + Git-Revert-Variant + Replace-Dry-Run + Replace-Commit + 30s-Undo + Kebab-Menü in DocumentRow |
| J. Briefing + Context-Window | 5 % | 100 / 100 | tiktoken SOFT 1000 / HARD 1500 + Slot-Priorisierung + Cache-Skip (briefing_state_version) + UI-Pille |
| K. Token-Budget + Kosten | 5 % | 95 / 100 | PRICING + Usage-Tuple + ChatMessage/Document JSONB + /usage Endpoint + Budget Hard/Soft + Dashboard; ARQ-Cron-Aggregator deferred (on-demand mit Redis-Cache) |
| L. Format-Support (EML/Audio/Bilder) | 5 % | 90 / 100 | ALLOWED erweitert + EML-Parser + Image-OCR + Audio-Transcribe-Provider + source_format/parent_document_id + Format-Icons + Attachment-Gruppierung; WHISPER_PROVIDER default=off statt local (faster-whisper opt-in) |
| M. Onboarding + Multi-Projekt-Nav | 3 % | 90 / 100 | Onboarding-Wizard + Sidebar-Collapse + Badges + Archiv + New-Project-Modal + seen-Tracking durch; Mobile-Drawer offen |
| N. Clipboard-Paste | 2 % | 85 / 100 | Page-level Paste-Handler + Multi-Image + editable-Guard live; per-Projekt-Threshold + Chat-Attachment-Karte partial |
| O. Slash-Commands | 2 % | 100 / 100 | Registry + Popover + 11 Commands + /search-Endpoint + lokale Zero-Token-Messages live |
| P. Keyboard-Navigation | 2 % | 95 / 100 | keybindings.ts single-source + Cmd+K/N/B/,/U// + zweistufiges Esc + IME-Guard + Cheat-Sheet live; Cmd+1/2/3 deprecated |
| Q. Session/Auth-Lifecycle | 3 % | 90 / 100 | Refresh-Token-Tabelle + /refresh + Silent-Refresh-Interceptor + 5min-Timer + Message-Puffer + BroadcastChannel + Logout-Revoke live; Phase 2 (HttpOnly-Cookie/CSRF) deferred |
| R. Notifications & Recovery | 2 % | 100 / 100 | Browser-Notification Opt-in + Complete/Failed-Hook (tab-hidden) + Click-to-Doc + per-Projekt-Tag + requireInteraction live |
| S. Bulk-Upload | 2 % | 95 / 100 | change_session_id persistiert (0019) + BulkUploadGroup (collapse + Live-Counts + Close-Summary); StatusPanel-Count-Up der Gruppe partial |
| T. Stale Detection | 2 % | 100 / 100 | ARQ daily-Cron + last_activity_at/stale_marker + overdue-Patch + StaleBanner + bilinguales stale_notice (zero-LLM) |
| U. Export | 2 % | 0 / 100 | Komplett fehlend |
| V. Animationen + Timing | 3 % | 60 / 100 | Count-Up + Pulse-Soft + Flash + Pulse-Phase live |
| W. Nicht-funktional (DevOps/Tests/Obs) | 4 % | 60 / 100 | Docker + Alembic + E2E vorhanden; Observability fehlt |
| **Summe** | **100 %** | — | — |

**Gesamt-Score: 90 / 100.** Berechnung: Σ Bereich × Gewicht ≈ 90. Sprung gegenüber 82 stammt aus M/N/O/P/Q/R-Welle (Onboarding-Wizard + Multi-Projekt-Nav · Page-Paste · Slash-Commands + /search-Endpoint · zentrale Keybindings · Auth-Refresh-Lifecycle · Browser-Notifications). Verbleibend zu 100: S (Bulk-Gruppierung), T (Stale-Cron), U (Export/ZIP), V (Timing-Tokens), W (Observability/CI/Backup) + Deferrals (Mobile-Drawer, Auth-Phase-2-Cookie, Whisper-Bundle).

**(historisch) Gesamt-Score: 82 / 100.** Sprung gegenüber 72 stammt aus J/K/L-Welle (Briefing tiktoken-Cap + Slot-Priorisierung + Cache-Skip · Token-Usage-Capture in llm.py + ChatMessage/Document JSONB + /usage Endpoint + Budget Hard/Soft + Dashboard · Format-Support EML/Image-OCR/Audio-Provider-Abstraction + source_format/parent_document_id + Icons). Restliche Punkte zu 100 liegen in: K (ARQ-Hourly-Cron-Aggregator), L (Whisper local-default + Bundle), M (Onboarding-Wizard), O (Slash-Commands), P (Cmd+K/N/B Mapping), Q (Refresh + Recovery), R (Browser-Push), T (Stale-Cron), U (Export), W (Observability/Backup).

Score-Update-Pflicht: bei jedem PR der Items abhakt → Bereich-Score neu berechnen (`erfüllte Items / Gesamt-Items × 100`), dann Gesamt neu summieren. Helfer-Skript siehe Sektion 5.

---

## 2.1 Session-Log

### 2026-05-29 — M + N + O + P + Q + R Sweep

**Vorgehen:** Seriell (eine Sektion nach der anderen, Commit dazwischen) gemäß Multi-Section-Sweep-Protokoll — alle 6 Sektionen fassen geteilte Frontend-Files an (ChatInput, CockpitLayout, AppSidebar, layout.tsx, api.ts, uiStore). Backend-Contract + Migrations + Wiring-Verifikation durch Opus-Main-Thread; chunkige UI-Builds (M, O, Q-Frontend) an Sonnet-Subagents delegiert, danach Render-Tree-Grep + tsc + Browser-Smoke verifiziert. Kein Worktree, keine Parallelität, keine Merge-Konflikte.

- **M Onboarding + Multi-Projekt-Nav** (35→90) — Alembic `0016` (`projects.archived_at` + partial index `ix_projects_active`, `user_project_views` Tabelle). `list_projects` filtert archived default + `?include_archived`; `ProjectResponse` + `archived_at`/`failed_document_count`/`unread_change_count`; `POST /projects/{id}/{seen,archive,unarchive}`. Frontend: Sidebar-Collapse (`uiStore` + localStorage), per-Projekt-Badges, Archiv-Sektion, Row-Kebab, `NewProjectModal`, seen-on-mount, `/onboarding` 3-Step-Wizard (Provider→Test+Latenz→Projekt), First-Login-Redirect. Mobile-Drawer deferred.
- **N Clipboard-Paste** (70→85) — Page-level `paste`-Handler in CockpitLayout (skippt editable Targets → ChatInput behält Fokus-Paste), Multi-Image-Upload, jedes nicht-leere Text-Paste außerhalb editable → TextPasteModal. `lib/ui-config.ts` `PASTE_THRESHOLD_CHARS`. Per-Projekt-Threshold + Chat-Attachment-Karte partial.
- **O Slash-Commands** (0→100) — `lib/slash-commands.ts` Registry (11 Commands), `SlashCommandPopover`, ChatInput-Keyboard-Nav, `CockpitLayout.handleSlashCommand` (lokale `is_local_command`-Messages „lokal · 0 Token"). Backend `POST /api/projects/{id}/search` (Qdrant, kein LLM). `/export` = client-side briefing.md.
- **P Keyboard-Navigation** (35→95) — `lib/keybindings.ts` single-source + `useGlobalKeybindings` Hook: Cmd+K/N/B/,/U//. `KeyboardShortcutsModal` (Cmd+/), zweistufiges Esc, IME-Guard, Cross-Component via CustomEvents. CommandPalette uiStore-controlled + sucht Projekte/Chats/Dokumente.
- **Q Auth-Lifecycle Phase 1** (40→90) — Alembic `0017` `refresh_tokens` (token_hash SHA-256). Login gibt refresh_token; `POST /auth/refresh` (non-rotating); logout revoked. Frontend: `authClient.ts` (refresh-dedupe + BroadcastChannel cross-tab), api.ts 401-Silent-Refresh-Interceptor + Retry, `useTokenRefresh` (5min vor exp), Message-Puffer + Replay-on-mount. Phase 2 (HttpOnly-Cookie/CSRF) deferred.
- **R Notifications** (25→100) — `lib/notifications.ts` + `NotificationSettings` Opt-in. `useProjectSSE` notify bei `document_complete`/`document_failed` wenn `document.hidden`; tag=project_id, click→`#document-{id}`, failed→requireInteraction.

**Score-Effekt:** M 35→90 (+1.65), N 70→85 (+0.30), O 0→100 (+2.00), P 35→95 (+1.20), Q 40→90 (+1.50), R 25→100 (+1.50). **Gesamt 82 → 90.**

**Test-Bilanz:** Backend pytest **421 passed / 2 pre-existing failures** (`test_config.embedding_dimension`, unrelated) / 1 skipped — inkl. 9 neuer Tests (`test_projects_archive.py` 4, `test_auth_refresh.py` 5). Frontend `tsc --noEmit` clean, ESLint clean. Playwright `mnr-smoke.spec.ts` **9/9 grün** (M Sidebar+Modal+Onboarding, P Cheat-Sheet+Palette+Sidebar-Toggle, Q UI-Login-Refresh-Persist + /refresh-Endpoint, R Notif-Opt-in, O Popover+Local-Message). Alembic head = `0017`. Live-curl-Validierung aller neuen Backend-Endpoints (archive/seen/badge, /search, refresh→logout→401).

**Offen / Follow-ups:**
- M: Mobile-Sidebar-Drawer (Hamburger) offen; AppSidebar-Projekt-Links zeigen noch auf `/upload`-Redirect-Stub statt `/projects/{id}`.
- N: per-Projekt `paste_threshold_chars` DB-Override + Chat-Image-Attachment-Karte (Sektion B) deferred.
- Q: Phase 2 (Refresh-Token in HttpOnly-Cookie + CSRF) deferred.
- O: lokale Command-Messages sind ephemer (verschwinden bei nächstem echten Send / Reload) — by design.

---

### 2026-05-28 — J + K + L Sweep

**Streams gelandet** (2 parallele Sonnet-Subagents via Worktree-Isolation für K + L, plus 1 sequenzieller J + Main-Thread-Merge mit Konflikt-Resolution in 5 Dateien):

- **J Briefing-Cap + Caching** — Alembic `0013_project_briefing_meta` (4 Spalten: `briefing_priority_order JSONB`, `briefing_token_count INT`, `briefing_was_truncated BOOL`, `briefing_state_version INT`). `services/briefing.py::render_briefing` refactored zu Slot-by-Slot mit `BriefingResult(text, token_count, was_truncated)` Return; tiktoken `cl100k_base` SOFT=1000/HARD=1500. `DEFAULT_PRIORITY_ORDER = [blockers, open_tasks, deadlines, decisions, contacts, custom, dynamic_sections]`; Conflict-Sektion + Header außerhalb der Priorisierung; unknown slots → warn+skip. Pipeline + Chat-Tool + State-Router Cache-Skip wenn `briefing_state_version == state.version` (Log `briefing_cached=true`). `BriefingPanel` Footer-Pille mit Token-Count + amber `gekürzt`-Pill bei was_truncated. 23 neue Tests + Live-API Validierung: `briefing_token_count=1269, briefing_was_truncated=true, briefing_state_version=91`.

- **K Token-Budget + Kosten** — Alembic `0014_token_usage_budget` (`chat_messages.token_usage JSONB`, `documents.extraction_token_usage JSONB`, `projects.monthly_budget_usd NUMERIC(10,4)`). `agent_config.PRICING` Dict mit 9 Modellen + `FALLBACK_PRICING` + `estimate_cost_usd()`. `services/llm.py::complete()` return `(response, UsageRecord)`; `stream()` yields `{type:delta}|{type:usage}`; `agent_round()` yields per-round + cumulative usage events. `BudgetExceededError` raised in `_check_budget()` (80%→Redis pubsub warning, 100%→raise auf neue Ops). Pipeline schreibt `Document.extraction_token_usage = {prompt_total, completion_total, cost_total_usd, breakdown[]}` mit per-Step Records (`document_summary`, `document_state_extraction`). Chat schreibt `ChatMessage.token_usage` mit `purpose` ∈ {chat, title, tool}. Neuer Router `/api/projects/{id}/usage?period={today|7d|30d|mtd|90d}` mit Aggregation by-model/by-purpose/daily + `hypothetical_cheapest` Re-Pricing + Redis 60s Cache. `PATCH /usage/budget` für Project. Frontend: `ChatMessage` Subline `{model} · Xk in · Y out · ≈ $Z`, `StatusPanel` Footer `Verbrauch heute: $X.XX` + MTD-Budget-Bar, `AppSidebar` Verbrauch-Link, vollständige `/projects/[id]/usage` Page (recharts stacked bar + Tabellen + Budget-Input + cheapest-Comparison). `useProjectSSE` budget_warning Toast + budget_exceeded inline-Banner. 34/34 neue Tests grün. ARQ Hourly-Cron-Aggregator deferred (on-demand + Redis-Cache reicht für UI). Live-Validierung: `total: prompt=17288, completion=127, cost_usd=$0.0177`.

- **L Format-Support EML/Audio/Image** — Alembic `0015_document_formats` (`documents.source_format VARCHAR(32)`, `documents.parent_document_id UUID FK self-ref ON DELETE SET NULL` + partial index). `models/document.py` mit `parent`/`children` Relationship. ALLOWED_EXTENSIONS erweitert: `eml,png,jpg,jpeg,webp,mp3,m4a,wav,ogg` + MIME-Guard (image/*, audio/*, message/rfc822). `services/email_parser.py` stdlib-only (`email.policy.default`) mit `parse_eml() → ParsedEmail{subject,from,to,date,body,attachments}` + `to_plain_text()`. `services/transcription.py` Provider-Abstraktion `OffProvider | LocalProvider(faster-whisper) | OpenAIProvider`. Pipeline routet `source_format=audio` zu Phase 0 `transcribe` Step (vor parse), `image` zu kreuzberg `force_ocr=True`, `eml` zu email_parser + Attachments als sub-documents via `parent_document_id`. `config.py` `WHISPER_PROVIDER` ∈ {off,local,openai}, Default **off** (Abweichung vom Roadmap-Default `local` — faster-whisper braucht pip-install + Modell-Download nicht im PR gebundelt). Frontend: `FormatIcon` switch (Mail/Image/Mic/FileText) in `DocumentCard` + `DocumentsPanel`, EML attachment-Gruppierung mit expand/collapse, audio `Transkribieren…` Pill, `pipeline-phases.ts` Phase 0 `transcribe`, DropZone + ChatInput accept-Listen erweitert. 77 neue Tests grün (1 skipped: faster-whisper nicht installiert).

- **Main-Thread-Konsolidierung** — K + L Worktrees waren auf falscher Basis (`badcf06` statt `fbf8b8f`/J-HEAD) gespawnt → 5-Datei Merge-Konflikt-Resolution (`routers/documents.py`, `tasks/pipeline.py`, `cockpit/DocumentsPanel.tsx`, `upload/DocumentCard.tsx`, `lib/pipeline-phases.ts`); L-Migration `down_revision` von `0008` auf `0014` re-chained. `_new_document_row` signature erweitert für `source_format` + `parent_document_id`. Schema-Wiring fix in commit `269a5cf`: `_project_response()` ergänzte briefing-meta + budget Feld-Passthrough; `DocumentResponse.extraction_token_usage` ergänzt — beide on disk vorhanden, Serialization-Layer war Lücke. ChatInput accept-Liste mit-extended für File-Anhänge.

**Score-Effekt:** J 60→100 (+40, weight 5%), K 0→95 (+95, weight 5%), L 35→90 (+55, weight 5%). **Gesamt 72 → 82.**

**Test-Bilanz:** Backend pytest 412 passed / 2 pre-existing failures (`test_config.embedding_dimension`, unrelated) / 1 skipped. Frontend lint clean, `tsc --noEmit` clean. Playwright `jkl-smoke.spec.ts` 7/7 grün (Briefing-Pille + Usage-Page + StatusPanel-Cost + Format-Icons + DropZone-Accept). Live podman-Stack-Validierung via curl + Browser: alle 4 neuen API-Fields serialisiert, Briefing-Cap aktiv (1269/1500 tokens, truncated=true), Usage aggregiert $0.0177 aus 2 probe-Pipelines.

**Offen / Follow-ups:**
- K: ARQ Hourly-Cron-Aggregator → eigenes Item in Phase 5; on-demand + Redis-60s-Cache deckt UI-Latenz ab.
- L: Whisper-Default `local` braucht `pip install faster-whisper` + Modell-Download im Docker-Image; Provider-Abstraktion + Stub steht, opt-in via `WHISPER_PROVIDER=local`.
- L: Settings-Page Whisper-Toggle ist informational (Text-Beschreibung) statt vollem Radio + Persist; Erweiterung gehört zu M (Settings-Refactor).
- J: Drag-sort Settings-Page für `briefing_priority_order` deferred — Column existiert, Override via API möglich; UI-Builder kommt mit M.

---

### 2026-05-23 — G + H + I Sweep

**Streams gelandet** (3 parallele Sonnet-Subagents via Plan in `/home/jonas/.claude/plans/alright-go-ahead-scalable-puppy.md`, plus Main-Thread-Konsolidierung der UI-Wiring-Lücke):

- **G State-UI** — `services/state_manager.compute_next_deadline()` deterministische Logik (resolved-skip, upcoming-asc, overdue-fallback, alphabetische Tiebreak); `lib/deadlines.ts` als TS-Mirror (single source of truth). `tasks/pipeline.py` publiziert `state_changed` SSE-Event mit `sections`-Array nach State-Persist. `pipelineStore.perProjectLastStateChange` + `useFlashingSections`-Hook in StateGrid → `.flash`-Klasse 500 ms auf betroffener SectionCard (`globals.css` keyframe respektiert `prefers-reduced-motion`). `StatusPanel.useFlashOnChange(version)` für die Summary-Pille. `StateDetailModal` Sticky-Footer „Zuletzt geändert vor … · Version V · Historie ansehen" mit Anchor `#state-history`. StateGrid empty-state mit zentraler Roadmap-Copy. 14/14 neue Backend-Tests + Playwright `state-flash.spec.ts` grün.

- **H Reliability** — Typed LLM-Exceptions `LLMRateLimit | LLMTimeout | LLMServerError | LLMInvalidJSON` in `services/llm.py` mit `_wrap_openai_exc()` für `openai.RateLimitError / APITimeoutError / APIStatusError`-Mapping. `services/extraction.py` Re-Prompt mit `ExtractedDelta.model_json_schema()` injection bei erstem `JSONDecodeError`, zweiter Fail → raise `LLMInvalidJSON`. `tasks/pipeline.py` `_RETRY_MATRIX` + `_step_with_retry()` Helper konsumiert Backoff-Tabelle aus Roadmap; Extract-Step wrappt LLM-Exceptions zu `llm_*` error_class; Embed-Step non-fatal (`processing_status = "completed_partial"` bei Erschöpfung der Retries). Run-Start cleart `error_class` + `processing_error`. `settings.debug_tracebacks` schreibt Stacktraces in `pipeline_logs[].traceback`. `routers/chat.py::search_documents` prepended Warnung bei `completed_partial` Docs. `main.py` `/api/health/live` (sofort 200) + `/api/health/ready` (DB+Redis+Qdrant parallel, 503 bei degradiert). Alembic `0012` ergänzt `completed_partial` im DB-CheckConstraint. `DocumentCard` (legacy) + `DocumentRow` (cockpit) zeigen amber „Embedding fehlgeschlagen"-Pille bei partial. 35/35 neue Tests grün.

- **I Lifecycle** — Alembic `0011_document_lifecycle` (`documents.archived_at` + `replaces_document_id` FK + partial index `ix_documents_active`). `state_manager.remove_document_source()` mit 3 Re-Komposition-Regeln (drop, orphan, keep) + `_ensure_sources` schreibt `last_modified_source`. `git_service.revert_to_version()` für hard-rollback. `routers/documents.py` komplett rewritten: `DELETE` default soft (archive + recompose + Qdrant-cascade + SSE `document_archived`); `?strategy=git_revert` rollt State auf Pre-Upload-Version zurück; `POST /restore` clear archived_at + Re-Enqueue Pipeline; `POST /replace?dry_run=true` simuliert auf state-copy ohne Commit; `POST /replace` (commit) verbindet `replaces_document_id` + archiviert Alt-Doc + Re-Pipeline-Run. List-Endpoint filtert `archived_at IS NULL` default, `?include_archived=true` opt-in. Frontend: `DiffPreviewModal` (additions/removals/modifications mit grün/rot/amber Border); `DocumentRow`-Kebab in DocumentsPanel (Ersetzen…/Löschen…) sowie auch in legacy `DocumentCard`; 30 s Undo-Toast in DocumentsPanel mit `restoreDocument`-Call; `SourcePill` rendert `orphaned:`-Prefix. 21/21 neue Backend-Tests + Playwright `document-replace.spec.ts` + `delete-undo.spec.ts` grün.

- **Main-Thread-Konsolidierung** — Agent I implementierte Kebab in `DocumentCard.tsx`, das jedoch nach Cockpit-Refactor nicht gerendert wird (DocumentsPanel zeigt `DocumentRow`, nicht DocumentCard). Behoben durch Port von Kebab-Menü + DiffPreviewModal-Hook + error-banner + completed_partial-Pille direkt in `DocumentRow` (cockpit DocumentsPanel). Dry-run Endpoint hatte Signatur-Fehler (`parse_document(tmp_path)` statt `parse_document(file_bytes, mime_type)` mit 3-tuple Return) — gefixt + Test-Mock aktualisiert. `/upload`-Route bleibt Redirect zu Cockpit `#docs` (Section-A-Prinzip gewahrt).

**Score-Effekt:** G 50→100 (+50, weight 5%), H 65→100 (+35, weight 9%), I 25→100 (+75, weight 5%). **Gesamt 63 → 72.**

**Test-Bilanz:** Backend pytest 260 passed / 2 pre-existing failures (`test_config.embedding_dimension`, unrelated). Frontend lint clean, `tsc --noEmit` clean. Playwright 21 passed / 6 skipped / 0 failed inkl. 4 neuer Specs (`state-flash`, `error-banner`, `document-replace`, plus `delete-undo` Regression-grün).

**Offen / Follow-ups:**
- I: Chat-message Tool-Use-Pille zeigt noch nicht „Quell-Doc gelöscht"-Badge bei archived doc_ids (Folge-Polish, nicht Blocker).
- H: ARQ-Worker `max_tries` ist global 3 ohne klassen-spezifischen Backoff — der per-Step `_step_with_retry` ersetzt das im Pipeline-Code, der ARQ-Fallback bleibt aber simpel.
- E1: `extracted_item.action` weiter `"added"` only (unverändert seit D/E/F-Sweep).

---

### 2026-05-22 — D + E + F Sweep

**Streams gelandet** (3 Wellen, 7 Subagents parallel via Plan in `/home/jonas/.claude/plans/alright-make-a-plan-enumerated-aurora.md`):

- **D1 + E1 (Backend Pipeline)** — Alembic `0009_document_cancel_dedup_retry` (Spalten `arq_job_id`, `content_hash`, `retry_count`, `error_class` + partial Hash-Index + `cancelled` Status). `routers/documents.py`: SHA-256 Dedup mit 409 + `?allow_duplicate=true` Bypass, strukturiertes 415 mit `hint`, `DELETE …?cancel_pipeline=true`, `POST …/retry`. `tasks/pipeline.py`: `CancelledPipeline` + `_check_cancel()` Top jeder Step-Funktion, `_publish_extracted_items()` mit 50 ms/200 ms Burst-Throttle Cap 5 s. `services/extraction.py`: `ExtractedItem` Pydantic + `_normalise_extracted_delta()` mit stabilen IDs. 16/16 neue Tests grün.

- **D2 (Frontend Upload-UX)** — `CockpitLayout.tsx` page-wide Drag-Overlay (enter-counter, Chat-Input-Bypass). `ChatInput.tsx` Paperclip + `onPaste` (Bild → `screenshot-{ts}.png`, > 200 Zeichen → `TextPasteModal` pre-filled). `TextPasteModal.tsx` `initialContent` Prop. `DocumentCard.tsx` 4-Phasen-Chip-Row + Details-Toggle (9 Steps) + Retry/Cancel-Buttons. `lib/upload.ts` typed Errors `Duplicate`/`UnsupportedUploadError` + `lib/uploadFlow.ts` 409-Confirm + 415-Toast mit „Als Text einfügen?"-Action. `tests/e2e/upload-paste-drop.spec.ts` (7 Specs, 5 pass + 2 skip).

- **F1 (Backend State-Schema)** — Alembic `0010_state_source_ids_backfill` Data-Migration (pro Projekt Versionen ASC, erste Item-Auftauchen → `triggered_by_document_id`, Rest → `legacy:pre-migration`). `services/state_manager.merge_state` accept `document_id`, Set-Union für alle Core-Typen via `_ensure_sources()`. `services/briefing.py` accept `documents_by_id` + `_render_source(item)` + `## ⚠ Konflikte` Sektion + neue Deadlines-Sektion. `tasks/pipeline.py` Call-Site updated. 24/24 neue Tests grün.

- **E2 (Frontend Live-Extraction)** — `useProjectSSE.ts` `extracted_item` Handler + `isConnected` Export. `pipelineStore.ts` `liveItemsByDoc` + `lastItemAtByDoc` + `expandedDocs` + `addLiveItem`/`collapseDoc`. `DocumentCard.tsx::LiveFeed` Sub-Component (Icons per Typ, Confidence-Dot, Click → `scrollIntoView` + `.flash` Klasse 500 ms). `StatusPanel.tsx` `<AnimatedCount>` framer-motion 200 ms easeOut. `GlobalStatusBar.tsx` Pulse-Soft + 3 s-Grace Disconnect-Banner. `globals.css` `@keyframes flash` + `@keyframes pulse-soft`.

- **F2 (Backend Confidence + Konflikte + Chat-Source)** — `extraction.py` `confidence: Literal["high","medium","low"]` required mit einmaligem Re-Prompt bei Fehlschlag. `state_manager.detect_conflicts(state)` per-Typ Key-Field-Vergleich nach Title-Normalisierung; `merge_state` schreibt `state["conflicts"]`. `routers/chat.py` `_append_chat_source(item, session_id)` (dedupe + legacy-Promotion) auf `_update_task_status` + `_execute_tool`/`_run_agent` mit `session_id`-Threading. 26/26 neue Tests grün.

- **F3 (Frontend Source/Confidence/Konflikt-UI)** — `hooks/useDocuments.ts` (`useQuery(["documents", projectId])` + `useDocumentsById()`). `lib/conflicts.ts` `Conflict`-Typ + `conflictForItem()`. `components/state/SourcePill.tsx` (Chips für Doc-ID/`chat:`/`manual:`/`legacy:` mit Mid-Truncate + „+N more"-Overflow + Drawer-CustomEvent). `ConfidenceBadge.tsx` + `confidenceBorderClass()` Helper. `ConflictBadge.tsx` rot mit Field-Tooltip. Integriert in TaskCard, ContactCard, BlockerCard, DecisionCard, StateGrid (Deadlines + Dynamic-Items inline). `id={\`${type}-${item.id}\`}` auf jedem Card-Wurzel-Element.

- **Wave 3 Final-Verify** — Backend pytest 191/193 (2 vorbestehende `test_config.embedding_dimension` Failures, unrelated). Frontend lint clean. Playwright 18/23 pass + 5 skip + 0 fail (`upload-errors.spec.ts` Assertion auf neue Toast-Variante angepasst). Migrations `0009` + `0010` angewandt; DB head = `0010`. Frontend-Container nach Build-Cache-Konflikt 1× neu gestartet (Anwendung von `feedback_container-restart-after-refactor`).

**Score-Effekt:** A→80, B→75, C→80, D→95, E→100, F→94, H→65 (Retry+Cancel-Endpoint+`error_class`+`retry_count`), N→70 (Bild+Lang-Text-Paste), V→60 (Count-Up + Pulse-Soft + Flash). **Gesamt 40 → 63.**

**Offen / Follow-ups:**
- F: `manual:{user_id}` Source blockiert auf Mutation-API (UI-Pille ready).
- D: Drop-on-Chat-Input vollständige Inline-Referenzkarte gehört zu B.
- E1: `extracted_item.action` aktuell immer `"added"`; `updated`-Diff via Pre-Merge-Snapshot deferred.
- SourcePill Doc-Click feuert `openDocumentDrawer` CustomEvent — Drawer-Listener fehlt noch.
- H: Retry-Backoff-Tabelle pro Error-Klasse + `/api/health/{live,ready}` Endpoints offen.

---

## A. Cockpit-Layout (Single Page)

### 🎯 Soll
Ein Cockpit pro Projekt. Eine Route. Chat dominiert visuell und im DOM. Status-Block, Dokumente-Bereich, Chat-Archiv sind im Ruhezustand kompakt/collapsed. Sobald der Nutzer tippt oder einen alten Chat öffnet, expandieren die Chat-Region und alle anderen Bereiche weichen synchron nach oben. Zurück zum Cockpit über Klick auf Projektname oder Wischgeste (Mobile). Keine `/chat /state /upload` Sub-Routen — höchstens als Anchor-Deep-Links der einen Cockpit-Seite.

### 📍 Ist
- `frontend/src/app/projects/[id]/layout.tsx:1-79` rendert Sidebar + Header + Tabs + `{children}`.
- Drei separate Pages: `chat/page.tsx`, `state/page.tsx`, `upload/page.tsx`.
- `ProjectTabs.tsx` rendert eine Tab-Leiste — explizit Multi-Page.
- Cmd+1/2/3 wechselt zwischen Tabs (Layout-File Zeile 38-49).
- **Verstößt direkt gegen Single-Page-Anforderung der User Story.**

### ✅ Checkliste (Desktop)
- [ ] Neue Route `/projects/[id]/page.tsx` als einziger Einstieg, ohne Tabs.
- [x] Chat-Input dauerhaft am unteren Viewport-Rand sichtbar.
- [ ] Status-Block (kompakte einzeilige Zusammenfassung) ist im Ruhezustand expanded, andere Bereiche collapsed.
- [ ] Klick / Fokus auf Chat-Input animiert Cockpit-Bereiche `translateY(-100%)` aus dem Viewport (synchron, 300 ms ease-out).
- [ ] Klick auf Projektname schließt Chat-Fullscreen, animiert Cockpit zurück (Esc-Verhalten siehe Sektion P).
- [ ] Old-Tab-Routen gelöscht (keine Backwards-Compat). Anchor `#docs|#state|#archive` öffnet Cockpit mit Bereich expanded — wird beim Scroll/Expand nicht in URL persistiert.
- [ ] Status-Block-Klick expandiert vollständigen Core-State inline.

### ✅ Checkliste (Mobile)
- [ ] < 768 px Viewport: Chat öffnet sich als Fullscreen-View (kein Cockpit darunter sichtbar).
- [ ] Cockpit-Sektionen als Bottom-Sheet erreichbar (Tap auf „Projekt-Info"-Icon im Header).
- [ ] Swipe-Down auf Chat-Header schließt Fullscreen zurück zum Cockpit.
- [ ] Touch-Targets ≥ 44 px Höhe.

### ✅ Checkliste (Continuity während Aktivität)
- [ ] Während Chat offen + neuer Upload läuft: ephemeral Banner über Chat-Top („Upload: brief.pdf — verarbeitet…").
- [ ] Pipeline-Complete während Chat offen: Banner wechselt zu „brief.pdf fertig: 3 Tasks, 1 Deadline" mit Klick → öffnet Doc-Card im darunterliegenden Cockpit.
- [ ] Banner auto-dismiss nach 8 s, manuell schließbar.

### 🛠 Vorgehen
1. Cockpit-Page-Komponente in `page.tsx` aufsetzen; bestehende Sub-Pages als Sektionen kompositionell wiederverwenden (`<DocumentsSection collapsed/>`, `<StateSection compact/>`).
2. CSS-Grid mit `grid-template-rows` für Expand/Collapse (Framer-Motion nur wenn nötig).
3. Sub-Routen-Pages und `ProjectTabs.tsx` löschen.
4. SSE-Connection-Lifecycle: bleibt auf Layout-Level verbunden (gehört zu W. Performance).

### ⚖️ Decisions
- **Deep-Link-Verhalten** → Anchor-Hash `#docs|#state|#archive` öffnet Cockpit mit entsprechendem Bereich expanded. Anchor wird beim manuellen Scroll/Collapse aus URL entfernt. Kein `?section=` Query-Param (würde wie Route wirken). Bookmarks funktionieren.
- **Esc-Verhalten** → siehe Sektion P (zweistufig: erstes Esc = Input unfokussieren, zweites Esc = Chat schließen).

---

## B. Chat-Interface

### 🎯 Soll
Der Chat ist die Hauptinteraktion. Token-Streaming wirkt natürlich und nicht ruckelig. Tool-Use sichtbar als kompakte Inline-Pille mit Expand auf Detail. State-Mutationen vom Agent erscheinen als interaktive Artifact-Karten im Stream mit 30 s Undo-Window. Undo wirkt **nur auf die einzelne Mutation**, nie auf den ganzen State (kein Git-Revert). Datei-Anhänge per Büroklammer; sie wandern parallel ins Dokument-Set und werden extrahiert. Input-Feld auto-resized (max 6 Zeilen). Modell-Wahl per Inline-Dropdown ohne Settings-Sprung. Slash-Commands per Autocomplete-Popup über dem Input.

### 📍 Ist
- `frontend/src/components/chat/ChatInterface.tsx` — Streaming via `useChatStream`, optimistic Messages, Tool-Indicator-Liste (`activeTools.join(", ")`) am Boden — funktioniert, aber **flach + textuell**, nicht als Inline-Pille pro Tool-Call.
- `ChatMessage.tsx` rendert Markdown sauber; **kein Mutation-Artifact-Card-Block**.
- `ChatInput.tsx` Auto-Resize bis 120 px (~6 Zeilen) ✓.
- Modell-Wahl-Dropdown vorhanden ✓.
- **Kein** Datei-Anhang-Button im Chat.
- **Kein** Slash-Command-Autocomplete.
- Fehler-Banner solide (provider_config_corrupt, no_active_provider).

### ✅ Checkliste
- [x] Token-Streaming wortweise (natürlich, nicht ruckelig).
- [x] Markdown-Rendering inkl. Code / Listen.
- [x] Modell-Dropdown im Chat-Input.
- [x] Abort-Button während Streaming.
- [x] Tool-Use-Indikator inline als Pille pro Tool-Call.
- [x] Inline-Pille pro Tool-Call (`🔍 Durchsuche Dokumente…` → collapsed `🔍 3 Dokumente durchsucht`).
- [x] Tool-Pille expandierbar mit Argument + Ergebnis-Auszug.
- [x] Mutation-Artifact-Karte (`✓ Task X als erledigt markiert [Rückgängig]`).
- [x] Undo-Button schaltet nach 30 s grau aus und verschwindet.
- [x] Undo = inverse Operation auf das einzelne Item (Task-Status zurück), nie Git-Revert.
- [x] Datei-Anhang-Button (Büroklammer) im Input.
- [~] Drop von Datei auf Chat-Input → Upload + Inline-Referenzkarte über der Nachricht.
- [ ] Slash-Command-Autocomplete (siehe Sektion O).
- [x] Shift+Enter = Newline, Enter = Send (Desktop).
- [ ] Mobile: Enter = Newline, Send-Button explizit (Touch).
- [x] Empty-State zeigt 3 statische Beispiel-Prompts: „Was sind die offenen Tasks?", „Welche Deadlines stehen an?", „Fasse den aktuellen Status zusammen".

### 🛠 Vorgehen
1. Streaming-Throttle (aktuell 12 char/frame) bleibt Implementation-Detail; Wert frei tunebar wenn Stream als ruckelig empfunden wird.
2. Tool-Use-Event-Schema im SSE-Stream erweitern (`tool_call_start`, `tool_call_end` mit args + summary).
3. `ChatMessage` um neuen Block-Typ `tool_use_pill` erweitern.
4. Mutation-Artifact: Backend sendet bei `update_task_status` ein zusätzliches `mutation_card`-Event mit Undo-Token (Redis-Key, TTL 30 s, payload = `{tool_name, original_value, new_value, target_id}`).
5. Undo-Endpoint `POST /api/projects/{id}/chat/mutations/{undo_token}/revert` → ruft inverse Operation auf (z.B. `update_task_status(id, original_status)`), erzeugt neuen Changelog-Eintrag mit `triggered_by=undo`.

### ⚖️ Decisions
- **Datei-im-Chat-Race** → Datei wird beim Drop/Paste sofort hochgeladen (HTTP 201) und als Pipeline-Job gequeued. Inline-Referenzkarte erscheint ab Upload-Complete (nicht ab Extraction-Done). Chat-Nachricht kann sofort gesendet werden, LLM sieht initial nur Dateiname + „Verarbeitung läuft". Sobald Extraction durch ist, ist die Datei in `get_document_content` abrufbar.
- **Mutation-Undo-Scope** → genau eine Mutation, nie eine ganze Version. State-Version-Revert nur für Doc-Delete (Sektion I).

---

## C. Chat-Archiv & Session-Modell

### 🎯 Soll
Vergangene Chats sind eigenständige Sessions mit eigenem Verlauf, auto-generiertem Titel und Datum. Sidebar / Bereich im Cockpit zeigt alle Sessions des Projekts. Klick öffnet die Session geladen im Chat-Interface. Inline-Suche über alle Session-Titel + Nachrichten-Volltext. Sessions sind **immutable Snapshots** — jede Message ist mit der State-Version zum Antwort-Zeitpunkt verknüpft, damit alte Chats kohärent bleiben auch wenn der State weiterzieht.

### 📍 Ist
- Backend: `ChatMessage` Model existiert (`models/state.py`) — flach pro `project_id`. **Keine Session-Tabelle, keine Session-ID-Spalte.**
- `chat.py::get_chat_history` liefert *alle* Messages des Projekts in Reihenfolge — also ein einziger endloser Chat.
- `chat_messages.state_version` Feld bereits vorhanden (siehe `models/state.py`) ✓ — wird genutzt für historische Konsistenz.
- Frontend: kein Archiv-UI, keine Sidebar-Sektion „Vergangene Chats".

### ✅ Checkliste
- [x] DB-Migration: Neue Tabelle `chat_sessions` (id, project_id, title, summary, created_at, last_message_at, message_count, archived_at NULL).
- [x] `chat_messages.session_id` als FK; Alembic-Backfill: alle Bestehenden in eine „Migration"-Session pro Projekt mit Titel „Importierter Verlauf".
- [x] Endpoint `POST /api/projects/{id}/chat/sessions` (neuer Chat) + `GET .../sessions` (Liste) + `GET .../sessions/{sid}/messages`.
- [x] Auto-Titel: nach erster User-Message via kurzem LLM-Call (Output max 60 Token, fallback = erste 40 Zeichen der ersten Message). Kosten siehe Sektion K (wird im Token-Counter mitgezählt).
- [x] Manuell editierbarer Titel (PATCH `/sessions/{sid}`).
- [x] Frontend: Chat-Archiv-Bereich im Cockpit (collapsed, expand-Klick zeigt Liste).
- [ ] Inline-Suchfeld beim Expand, Debounce 300 ms, filtert nach Titel + Nachrichten-Volltext (Postgres `to_tsvector` mit deutscher Stopword-Liste; Fallback `ILIKE`).
- [x] „Neuer Chat"-Button (Back-Arrow in ConversationView) erzeugt frische Session, aktiver Chat-Switch ohne Page-Reload.
- [x] Keyboard-Shortcut Ctrl/Cmd+N startet neue Session.
- [ ] Beim Cockpit-Mount: letzte Session innerhalb 24 h wird automatisch geladen (collapsed im Input). Älter → frische Slot, leer.
- [x] Session-Delete archiviert (soft-delete via `archived_at`), versteckt aus Liste, behält DB-Daten.
- [ ] Historische Render-Konsistenz: beim Öffnen alter Session wird `state_version` pro Message in Tool-Pillen sichtbar („antwortet basierend auf State v12").

### ⚖️ Decisions
- **New-vs-Continue Default** → Cockpit-Mount zeigt letzte aktive Session aus den letzten 24 h. Nach 24 h Inaktivität → frischer Slot. Cmd+N immer = neue Session. „Neuer Chat"-Button immer = neue Session. Kein impliziter Auto-Split bei Idle.
- **Titel-Generierung-Kosten** → ~50 Output-Token pro Session = vernachlässigbar; trotzdem im Cost-Dashboard sichtbar als eigene Kategorie „titles".
- **Session-Delete-Cascade** → Soft-delete. Chat-Messages bleiben in DB für Audit. Suche/Liste filtert default `archived_at IS NULL`.
- **State-Version-Verlinkung** → Existierendes Feld nutzen. Zeigt bei alten Chats dezentes Badge „aus v12" wenn aktuelle Version > 12. Klick erklärt im Tooltip „State hat sich seit dieser Antwort weiterentwickelt — neue Frage stellen für aktuelle Info".

---

## D. Dokument-Upload-Flow

### 🎯 Soll
Drag & Drop auf gesamte Seite (nicht nur Zone). Datei-Picker via Button. Clipboard-Paste (Ctrl+V) für Bild + Text. Multi-File OK. Während Upload: Pro-Datei-Zeile als organische neue Zeile im Dokumente-Bereich (kein Modal, kein Toast). Inline-Progressbar mit 4 sichtbaren Phasen-Labels (Default-Modus) und Detail-Toggle für alle 9 internen Steps (Power-User-Modus). Sofortiges Cancel pro Datei während HTTP-Upload + Pipeline-Abbruch während Backend-Run. Duplikat-Detection per Hash. Bei Fehlern: Zeile bleibt expanded mit Retry-Button und konkretem Fehler.

### 📍 Ist
- `DropZone.tsx` solide: enter-counter gegen Flicker [[feedback_visual-consistency-openpm]], multi-file, MAX_SIZE 50 MB, cancel via UploadHandle.
- `routers/documents.py:34-36` ALLOWED: PDF/DOCX/DOC/XLSX/XLS/RTF/TXT/MD/CSV/JSON/HTML/HTM/LOG. **Keine** Bilder, **kein** EML, **kein** Audio.
- `TextPasteModal` für Plaintext-Paste vorhanden, aber separates Modal, nicht inline im Chat/Drop.
- Drag-Zone ist Container-bound, nicht page-wide.
- 9 Backend-Steps (`queued → parsing → summarize_extract → state_merge → state_persist → changelog → git_commit → embed → briefing`) — UI zeigt aktuell alle.

### ✅ Checkliste
- [x] Drag-Enter / Leave ohne Flicker (enter-counter).
- [x] Multi-File-Upload parallel.
- [x] Pro-Datei-Fehler isoliert.
- [x] Cancel während HTTP-Upload (via `UploadHandle.abort()`).
- [x] Size-Limit-Toast.
- [x] Pipeline-Cancel-Endpoint `DELETE /api/projects/{id}/documents/{doc_id}?cancel_pipeline=true` → ARQ Job-Cancel-Flag (`cancel:{job_id}` Redis-Key) + Doc-Status `cancelled` + SSE `pipeline_cancelled`. (`routers/documents.py`, `tasks/pipeline.py::_check_cancel`, Alembic `0009`.)
- [x] Page-wide Drag-Overlay (Drop anywhere auf der Cockpit-Seite, außer auf Chat-Input). (`components/cockpit/CockpitLayout.tsx`.)
- [~] Drop auf Chat-Input = Anhang an aktuelle Nachricht — basic Drop → Upload via Cockpit-Pfad; vollständige Inline-Referenzkarte gehört zu Sektion B.
- [x] Drop überall sonst = neues Dokument.
- [x] Ctrl+V Paste-Handler: Bild aus Clipboard → Upload als `screenshot-{YYYY-MM-DD-HHmmss}.png`; Text > 200 Zeichen → `TextPasteModal` vorbefüllt (`initialContent` prop); Text ≤ 200 Zeichen + Chat-Input fokussiert → normales Paste in Input. (`components/chat/ChatInput.tsx`, `lib/utils.ts::formatTs`.)
- [x] Datei-Anhang aus Chat-Input (Büroklammer-Icon).
- [x] Bei `unsupported_media_type`: strukturiertes 415 mit `allowed` + `hint`; Frontend Toast mit „Inhalt als Text einfügen?"-Action. (`routers/documents.py`, `lib/uploadFlow.ts`.)
- [x] Per-File-Retry-Button auf gefailten/cancelled Upload-Zeilen → `POST /api/projects/{id}/documents/{did}/retry` resets error + new `arq_job_id` + `retry_count++`. (`routers/documents.py`, `components/upload/DocumentCard.tsx`.)
- [x] Fortschrittsanzeige Default-Modus zeigt 4 Phasen: **Hochladen → Parsen → Extrahieren → Mergen** über `STEP_TO_PHASE` Map (`lib/pipeline-phases.ts`); UI in DocumentCard.
- [x] „Details"-Toggle pro Doc-Card öffnet alle 9 Backend-Steps mit Status + Timing.
- [x] Duplikat-Detection: SHA-256 Hash des File-Bytes als `documents.content_hash` (Alembic `0009`). Bei identischem Hash im Projekt → 409 `{detail: {code: "duplicate", existing_document_id, filename}}`; Frontend Confirm-Dialog → Retry mit `?allow_duplicate=true`.
- [x] Hash-Index: `ix_documents_project_hash ON documents(project_id, content_hash) WHERE content_hash IS NOT NULL` (partial unique; Alembic `0009`).

### 🛠 Vorgehen
1. Drag-Overlay als globaler Layer im Cockpit (`onDragEnter` window-level Listener). Chat-Input fängt sein eigenes drop-Event ab und stoppt Propagation.
2. Clipboard-Listener (`onPaste`) auf Cockpit-Root mit Conflict-Detection.
3. Phasen-Mapping (9 Steps → 4 sichtbare Phasen) in `frontend/src/lib/pipeline-phases.ts`.
4. Hash beim Upload server-seitig berechnen (kein Frontend-Hash — File könnte groß sein).
5. Pipeline-Cancel: ARQ unterstützt `redis.set(f"cancel:{job_id}", "1")` → Pipeline checkt vor jedem Step.

---

## E. Live-Extraction-Feedback

### 🎯 Soll
Während Extraction läuft, erscheint unter der Datei-Zeile ein Live-Feed mit einzeln eingetrudelten Fakten. Jedes Item klickbar (Hover-Tooltip mit Source-Doc, Klick öffnet State-Bereich expanded auf dem Item):
- `→ Neuer Kontakt: Thomas Müller (Projektleiter)` ← linked to contact_id
- `→ Deadline aktualisiert: Lieferung bis 14.06.` ← linked to deadline_id
- `→ Task erkannt: API-Dokumentation erstellen` ← linked to task_id

Nach Abschluss collapsed der Feed zu einer Zusammenfassungs-Zeile (`3 Tasks, 1 Deadline, 1 Kontakt extrahiert`). Status-Block oben animiert Count-Up auf neue Zahlen. Bei Fehlern bleibt der Feed expanded mit dezentem Warn-Indikator. Auto-Collapse pausiert wenn neue Aktivität in der Region läuft.

### 📍 Ist
- `tasks/pipeline.py:114 _log_pipeline` published 8 Step-Events nach Redis `pipeline:{project_id}`.
- `_extracted_summary` (Z. 159) sammelt counts pro Item-Typ — **wird berechnet, aber nicht als eigenes Event published**.
- Frontend `LiveExtractionPanel`, `ActivityTimeline`, `DocumentCard` zeigen Step-Progress + Statuszeile — **aber keinen Item-für-Item-Live-Feed**.
- `ChangeSession.aggregate_summary` rollt counts pro Session auf — wird genutzt für „X neue Tasks"-Badge.

### ✅ Checkliste
- [x] SSE-Stream pro Projekt.
- [x] Step-Events pro Dokument (8 Steps).
- [x] Aggregierte Session-Counts.
- [x] Neues Event `extracted_item` pro Item-Typ während Extraction: `{event, document_id, type, item_id, title, action, confidence}`. (`tasks/pipeline.py::_publish_extracted_items`.) Anmerkung: `action` = `"added"` für erste Version; `updated`-Refinement deferred.
- [x] Pro Dokument-Zeile ein expandierbarer Live-Feed der Events. (`components/upload/DocumentCard.tsx::LiveFeed`.)
- [x] Live-Item Hover-Tooltip zeigt Source-Doc + Confidence; Klick scrollt zum State-Item (`getElementById(\`${type}-${itemId}\`)`) und highlightet es 500 ms via `.flash`-Klasse.
- [x] Feed collapsed nach Abschluss zu einzeiliger Summary mit 3 s Delay — **pausiert** wenn neue Doc-Activity im Bereich läuft (`useEffect` reset auf `lastItemAtByDoc`).
- [x] Bei Fehler bleibt Feed expanded + Warn-Indikator (kein Auto-Collapse).
- [x] Count-Up-Animation auf Status-Block-Zahlen (200 ms ease-out via framer-motion `animate()` in `<AnimatedCount>`).
- [x] Pulsierende Phasen-Label (Opacity-Loop 0.5 → 1.0 in 1.5 s; `.animate-pulse-soft` in `globals.css`, gated auf `prefers-reduced-motion`).
- [x] „SSE getrennt"-Banner wenn `connectionState !== "open"` für > 3 s Grace-Period (`components/layout/GlobalStatusBar.tsx`).
- [x] Backend Burst-Throttle: Items < 50 ms auseinander → künstlicher 200 ms Delay zwischen ihnen; Cap kumulativ 5 s pro Dokument (verhindert Worker-Blockade bei 100+ Items).

### 🛠 Vorgehen
1. `_log_pipeline` um zweites Event `extracted_item` erweitern, das `_extracted_summary` zerlegt und einzeln streamt.
2. **Throttle nur bei Burst:** wenn Items innerhalb < 50 ms eintrudeln, künstlicher 200 ms Delay zwischen ihnen (gemütliches Eintrudeln). Andernfalls direkt streamen. Keine künstliche Gesamt-Verzögerung.
3. Pipeline-Store erweitert um Map `docId → ExtractedItem[]`.
4. `DocumentCard` rendert Feed-Block, der Items per CSS-Transition einfaded.

---

## F. State-Management & Source-Attribution

### 🎯 Soll
Jedes Item im State (Contact / Task / Deadline / Decision / Blocker / dynamic_section.item) trägt eine `source_document_ids: string[]` Spalte. Bei Merge wird angefügt, nicht überschrieben — eine Information aus 3 Dokumenten = 3 Source-IDs. State-Mutationen via Chat-Tool tragen Source `chat:{session_id}`. Manuelle Edits tragen `manual:{user_id}`. Briefing rendert die Quelle pro Eintrag (verkürzter Dateiname). Klick auf Quelle springt zum Dokument. Jedes Extraction-Item trägt **verpflichtend** ein `confidence`-Feld (`high|medium|low`); Low-Confidence-Items werden im UI gelb hinterlegt mit „Bitte prüfen".

### 📍 Ist
- `state_manager.py::merge_state` dedupliziert Contacts (email/name), Deadlines (title+date), Decisions (append-only).
- `dynamic_sections[].source_document_ids` ✓ vorhanden.
- `Task.source_document_id` (singular, FK auf Document) ✓ — siehe `TaskCard.tsx` Z. 70.
- Contact / Deadline / Decision / Blocker: **kein source_document_id Feld im JSON-Schema des State** (Schema in `services/extraction.py` zeigt nur title/email/date/etc.).
- Briefing-Renderer (`briefing.py`): Decisions zeigen `source_filename`, andere nicht.
- Anti-Halluzination-Prompt ✓ (`extraction.py` "Erfinde nichts.").
- TaskCard zeigt `source_document_id` als rohe UUID — **nicht als Dateiname**.
- ChangeSession trackt `document_ids` pro Burst — kann für Migration-Inferenz genutzt werden.

### ✅ Checkliste
- [x] Extraction-Prompt verbietet Halluzination.
- [x] Dedup-Logik pro Item-Typ.
- [x] Source-Attribution für Tasks + Dynamic Sections.
- [x] State-JSON-Schema erweitert: alle Core-Items haben `source_document_ids: string[]` (statt singular). (Alembic `0010` Data-Migration.)
- [x] Task-Migration: bestehendes `source_document_id` → `source_document_ids: [old_id]`; singular Key wird gedroppt.
- [x] Backfill bestehender States via Inferenz: pro State-Version → `ProjectState.triggered_by_document_id` der ersten Version, in der das Item auftaucht, wird Source-ID. Items aus Versionen ohne `triggered_by_document_id` → `["legacy:pre-migration"]`, im UI als „Quelle vor Migration verloren" gerendert. (`alembic/versions/0010_state_source_ids_backfill.py::_backfill_state`.)
- [x] Merge mergt Source-IDs (Set-Union, sortiert), überschreibt nicht. (`services/state_manager.py::_ensure_sources` für alle Core-Typen + dynamic_sections.)
- [x] Briefing rendert pro Item eine Quelle-Zeile via `_render_source(item, documents_by_id)`; Markdown italic `_ (Quelle: …)_` unter Tasks/Contacts/Deadlines/Decisions/Blockers. (`services/briefing.py`.)
- [x] Chat-State-Mutations setzen `chat:{session_id}` in `source_document_ids` des betroffenen Items via `_append_chat_source` (dedupliziert). Briefing rendert „aus Chat".
- [ ] Manuelle Edits setzen `source = "manual:{user_id}"` — blockiert auf Mutation-API; Renderer für `manual:`-Prefix ist da (`components/state/SourcePill.tsx`).
- [x] TaskCard / ContactCard / BlockerCard / DecisionCard / Deadline-/Dynamic-Item lösen Source-IDs zu Filenames auf via `useDocuments(projectId)` Hook. Multi-Source: erste 2 Pillen + „+N more"-Pille mit Hover-Liste.
- [x] Source-Pille überall: `<SourcePill ids={...} documents={...} />` integriert in alle State-Cards + StateGrid (Deadlines, DynamicItems inline).
- [x] Confidence-Feld **verpflichtend** im Pydantic-`ExtractedItem` (`Literal["high","medium","low"]`); JSON-Validation auf LLM-Output mit einmaligem Re-Prompt bei Fehlschlag (`services/extraction.py`).
- [x] Extraction-Prompt erweitert: „Setze `confidence: 'low'` wenn die Information mehrdeutig, fragmentiert oder spekulativ ist. Lieber low als gar nicht extrahieren — aber Erfindung bleibt verboten."
- [x] Medium/Low-Confidence-Items: amber/orange Ring-Border + „Bitte prüfen"-Badge via `<ConfidenceBadge>` + `confidenceBorderClass()` Helper.
- [x] Konflikt-Resolution: `state_manager.detect_conflicts(state)` (Title-Normalisierung lower+strip+collapse-whitespace, dann per-Typ Key-Field-Vergleich: deadline.date, task.due_date+status, contact.email+role, decision.summary+date, blocker.description). `state["conflicts"]` wird beim Merge gesetzt; Briefing rendert eigene `## ⚠ Konflikte` Sektion; UI zeigt `<ConflictBadge>` an beiden Items mit Tooltip der divergierenden Felder.

### ⚖️ Decisions
- **Confidence-Score** → Verpflichtend. Fehlendes Feld in LLM-Output → Re-Prompt mit Schema-Schärfung (siehe Sektion H). Nicht „fehlend = high"; das würde das Feature stilllegen.
- **Migration-Backfill** → 2-Pass-Ansatz: Pass 1 inferenziell aus change_session_documents (genau dort wo eindeutig), Pass 2 `legacy:pre-migration` für Rest. Kein leerer Backfill.
- **Konflikt-Strategie** → Beide Items behalten, im UI explizit als Konflikt markieren, User entscheidet manuell. Auto-Resolution wäre eine Halluzinations-Variante.

---

## G. State-UI (Cockpit-Block)

### 🎯 Soll
Ruhezustand: eine Zeile `3 offene Tasks · Nächste Deadline: 14.06. · 1 Blocker · Letztes Update: vor 2h`. Klick expandiert zu vollständigem Core-State (Tasks, Kontakte, Deadlines, Blocker, Entscheidungen + Custom-Felder). Echtzeit-Highlight bei State-Änderung: betroffene Zeile pulsiert Background-Color für 500 ms. Versions-Footer: `Zuletzt geändert vor 2h · Version 14 · Historie ansehen`.

### 📍 Ist
- `StateGrid.tsx` rendert Sections + Card-Komponenten ✓.
- `StateTimeline.tsx` zeigt letzte 5 Changelog-Einträge mit Klick auf Diff-Modal ✓.
- **Keine** kompakte Ein-Zeilen-Zusammenfassung als Ruhezustand.
- **Keine** Highlight-Flash-Animation bei State-Update.
- Nächste Deadline nicht vorhanden — muss aus `state.core.deadlines` errechnet werden.

### ✅ Checkliste
- [x] StateGrid mit Sektions-Karten.
- [x] Changelog-Timeline mit Diff-Modal.
- [x] `StatusSummaryRow` Komponente: `StatusPanel` zeigt open_tasks-Count, Next-Deadline (via `nextDeadline()` shared util mit Backend `compute_next_deadline`), Blocker-Count, last-change relativ.
- [x] Klick auf Summary öffnet `StateDetailModal` mit StateGrid + StateTimeline darunter.
- [x] Pipeline-Event `state_changed` (publiziert in `tasks/pipeline.py` mit `sections`-Array) triggert `.flash`-Klasse auf betroffener SectionCard (`StateGrid.tsx::useFlashingSections`).
- [x] Versions-Footer im Modal: `Zuletzt geändert vor N · Version V · Historie ansehen` (Anchor zu `#state-history`).
- [x] Empty-State: zentrale Copy „Der Projektstatus wird automatisch aufgebaut, sobald Dokumente hochgeladen werden." in StateGrid integriert.

### 🛠 Vorgehen
**Nächste-Deadline-Logik** (deterministisch, ein Ort, von Frontend + Briefing-Renderer geteilt):
```
deadlines = state.core.deadlines.filter(status != "resolved")
upcoming = deadlines.filter(date >= today).sort_by(date asc)
overdue  = deadlines.filter(date <  today).sort_by(date asc)
next     = upcoming[0] if upcoming else overdue[0] if overdue else None
```
Bei mehreren am selben Tag → alphabetisch nach Titel. Anzeige: bei upcoming „Nächste Deadline: 14.06.", bei overdue „Überfällig seit 12.06." (rot).

---

## H. Reliability & Error-Paths

### 🎯 Soll
Kein gescheitertes Dokument korrumpiert den State. Jeder Pipeline-Schritt ist idempotent oder transaktional. Parsing-Failure → Doc bleibt im Status `failed`, State unverändert. Retry-Policy ist **pro Error-Klasse differenziert**, nicht uniform. Pro-Datei sichtbarer Fehlerstatus mit konkretem Grund + Retry-Button. State-Schema-Mismatch (LLM liefert kaputtes JSON) → Re-Prompt mit JSON-Schema-Injektion, dann `failed`. Embedding-Failure ist nicht-fatal (Doc geht auf `completed_partial`, Suche meldet Lücke).

### 📍 Ist
- `tasks/pipeline.py` nutzt PostgreSQL Advisory Lock pro Project (verhindert parallele State-Konflikte) ✓.
- `_translate_error` (Z. 193) übersetzt Fehler in deutsche Texte ✓.
- Doc-Status: pending/processing/completed/failed ✓.
- Extraction parsing-failure → leerer Delta (extraction.py fallback) — verhindert Korruption, aber **silent**.
- **Kein** automatisches Retry.
- **Kein** Retry-Button im UI.
- **Kein** Health-Check pro Pipeline-Schritt.

### ✅ Checkliste
- [x] Pro-Doc-Failure-Isolation (Lock + per-doc transaction).
- [x] Übersetzte Fehlermeldungen.
- [x] Kein State-Update bei Extraction-Fail.
- [x] Retry-Policy pro Error-Klasse (Matrix in `tasks/pipeline.py::_RETRY_MATRIX`, Backoff per Klasse).
- [x] Retry-Button auf gefailter DocumentCard/DocumentRow → `/retry` Endpoint resettet Status + inkrementiert `retry_count`.
- [x] `Document.processing_error` Spalte (= `error_message`) mit konkretem Fehlertext.
- [x] `Document.error_class` Spalte (`llm_rate_limit|llm_timeout|llm_5xx|llm_invalid_json|parse_error|embedding_failed|...`).
- [x] `Document.retry_count` Spalte (Reset bei manuellem Retry über `/retry`).
- [x] Bei neuem Pipeline-Run werden `error_class` + `processing_error` zu Beginn gecleart (`pipeline.py::_process`).
- [x] Error-Banner pro Doc inline in `DocumentRow` (DocumentsPanel) — zeigt `processing_error`-Text bei `failed`.
- [x] Pipeline schreibt Stacktrace in `pipeline_logs[].traceback` wenn `settings.debug_tracebacks=true`.
- [x] Bei `llm_invalid_json` ein-mal Re-Prompt mit injiziertem `ExtractedDelta.model_json_schema()` und „Return only valid JSON matching this schema."-Header (`services/extraction.py`).
- [x] Embedding-Failure → `processing_status = "completed_partial"`, State + Briefing rendern; `search_documents`-Tool warnt „Suche aktuell auf X von Y Docs eingeschränkt".
- [x] Healthcheck: `/api/health/live` (200 sofort) + `/api/health/ready` (DB + Redis + Qdrant parallel via `asyncio.gather`, 503 bei degradiert). Alembic `0012` ergänzt `completed_partial` im DB-CheckConstraint.

### Retry-Policy-Tabelle

| Error-Class | Retries | Backoff | Final-State |
|---|---|---|---|
| `llm_rate_limit` (429) | 5 | 30 s / 60 s / 120 s / 300 s / 600 s | `failed` |
| `llm_timeout` | 3 | 2 s / 8 s / 30 s | `failed` |
| `llm_5xx` (500–599) | 3 | 5 s / 15 s / 45 s | `failed` |
| `llm_invalid_json` | 1 Re-Prompt mit Schema-Injektion | 0 s | `failed` |
| `parse_error` (kreuzberg) | 0 | — | `failed` (manueller Retry möglich) |
| `embedding_failed` | 2 | 10 s / 30 s | `completed_partial` |
| `transcription_failed` | 1 | 30 s | `failed` |
| `state_lock_timeout` | 3 | 1 s / 3 s / 10 s | `failed` |

---

## I. Dokument-Lifecycle: Delete / Update / Replace

### 🎯 Soll
**Delete (Default — sanft):** Source-ID aus allen State-Items entfernen (`source_document_ids` Array). Re-Komposition-Regel pro Item: siehe unten. Qdrant-Vektoren des Docs werden gelöscht. Doc-File wird soft-deleted (`archived_at` gesetzt, nicht hard-removed). Diff-Preview-Modal vor Bestätigung.

**Delete (alternativ — Git-Revert):** Hard-Rollback auf State-Version vor Upload. Verwirft alle Änderungen die seit dem Upload kamen — gefährlich, klar als „Auf Vorversion zurücksetzen" benannt mit Warnung. Nur als expliziter Modal-Switch.

**Replace (v2 statt v1):** Zwei-Phasen-Flow:
1. *Simulation*: Backend lädt v2 hoch, parsed + extrahiert, berechnet hypothetischen State-Merge. Liefert Diff-Preview zurück (`{additions, removals, modifications}`).
2. *Commit*: User bestätigt → v1 wird archiviert, Source-IDs auf v2 umgepointet, Diff committet, neuer Changelog-Eintrag mit `triggered_by=replace`.

**Undo:** 30 s Toast nach Delete → Re-Insert + Source-IDs restoren + Qdrant Re-Index.

### 📍 Ist
- `DELETE /api/projects/{id}/documents/{doc_id}` existiert (Annahme — bestätigen via `routers/documents.py`).
- **Kein** State-Rollback bei Delete.
- **Kein** Replace-Flow.
- Git-Repo pro Projekt vorhanden (`storage/projects/{id}/git/state.json`) — Revert technisch trivial.
- **Kein** Undo-Toast.

### ✅ Checkliste
- [x] DB: `documents.replaces_document_id` FK (nullable, self-referential, Alembic `0011`).
- [x] DB: `documents.archived_at` Timestamp + partial index `WHERE archived_at IS NULL`; List-Endpoint filtert default, `?include_archived=true` zum Opt-in.
- [x] Delete-Endpoint Default = Sanft (`archived_at = now()` + `remove_document_source` + neue ProjectState-Version `triggered_by=document_delete` + Qdrant cascade + SSE `document_archived`). Optional `?strategy=git_revert` rollt auf Pre-Upload-Version zurück.
- [x] Re-Komposition-Regel pro Item nach Source-Removal in `state_manager.remove_document_source`:
  - `source_document_ids` leer + kein Chat-/Manual-Tracking → Item entfernt.
  - `source_document_ids` leer + `last_modified_source` ∈ `{chat:*, manual:*}` → Item bleibt mit `[orphaned:{doc_id}]`, UI Pill „Quell-Dokument gelöscht".
  - `source_document_ids` ≥ 1 → unverändert.
- [x] `state_items.last_modified_source` wird in `_ensure_sources` gepflegt (im Item-JSON).
- [x] Replace-Endpoint Phase 1: `POST .../replace?dry_run=true` → Diff-Preview (`{additions, removals, modifications}`) ohne State-Commit.
- [x] Replace-Endpoint Phase 2: `POST .../replace` → Commit mit `replaces_document_id` FK, archiviert Alt-Doc + recompose-State + neuer Pipeline-Run für neues Doc.
- [x] UI: Kebab-Menü „Ersetzen…" + „Löschen…" in `DocumentRow` (DocumentsPanel, sichtbar bei Hover) → öffnet `DiffPreviewModal` mit grün/rot/amber Diff.
- [x] 30 s Undo-Toast nach Delete in DocumentsPanel; Rückgängig ruft `restoreDocument` (clear archived_at + Pipeline-Re-Enqueue).
- [x] Cascade-Behandlung beim Delete:
  - Qdrant-Vektoren: hart löschen via `qdrant_service.delete_by_document`.
  - `pipeline_logs`: behalten (kein Code-Path löscht).
  - `change_session_documents`: behalten.
  - `chat_messages.state_version`: unverändert (Messages immutable). Doc-Reference-Badge „Quell-Doc gelöscht" ist Folge-Polish, kein Blocker.

### ⚖️ Decisions
- **Default-Delete = Sanft.** Git-Revert nur als expliziter Modal-Switch mit Warnung „Verwirft auch alle Änderungen seit Upload".
- **Replace = Zwei-Phasen.** Garantiert Diff-Preview vor Commit, kein blindes Überschreiben.
- **Orphaned-Items.** Chat- oder manuell-geänderte Items überleben Doc-Delete als „verwaist" sichtbar — Prinzip 6 (Quelle pro Info) erlaubt diese Ausnahme weil User-Intent dokumentiert ist.

---

## J. Briefing & Context-Window

### 🎯 Soll
Compiled Briefing = aktueller System-Prompt für Chat. **Soft-Limit 1000 Token** (sichtbarer Hinweis bei Überschreitung), **Hard-Cap 1500 Token** (nie überschreiten). Bei Überschreitung: Priorisierungs-Strategie (default unten, projekt-overrideable). Custom-Felder werden gekürzt. Briefing wird nur regeneriert wenn State-Version sich seit letztem Briefing geändert hat (Caching). Briefing-Token-Count steht in DB pro Version.

### Default-Priorisierungs-Reihenfolge
1. Offene Blocker (alle, sind kritisch)
2. Offene Tasks (max 10, sortiert nach Deadline asc)
3. Nächste 3 Deadlines
4. Letzte 5 Decisions (chronologisch absteigend)
5. Top-5-Kontakte (nach Anzahl Source-Docs)
6. Custom-Felder (gekürzt auf ~50 Token pro Feld)
7. Dynamic Sections (Top 3 Items pro Sektion)

Projekt-Setting `briefing_priority_order` (JSONB) kann Reihenfolge überschreiben.

### 📍 Ist
- `services/briefing.py::render_briefing` rendert Markdown ohne Token-Limit.
- Wird nach State-Persist in Pipeline-Step 8 (enrich) generiert ✓.
- **Keine** Token-Count-Erfassung.
- **Keine** Truncation-Strategie.
- **Keine** Priorisierung — schlicht alles raus.
- **Kein** Caching (jeder Pipeline-Run regeneriert).

### ✅ Checkliste
- [x] Auto-Render nach State-Merge.
- [x] Wird im Chat-System-Prompt eingebettet.
- [x] Token-Counter pro generiertem Briefing (tiktoken `cl100k_base`, SOFT=1000 / HARD=1500). (`services/briefing.py::BriefingResult.token_count`.)
- [x] Truncation-Strategy implementiert mit Default-Priorisierung (`DEFAULT_PRIORITY_ORDER = [blockers, open_tasks, deadlines, decisions, contacts, custom, dynamic_sections]`, Conflict-Sektion + Header außerhalb).
- [x] `projects.briefing_priority_order` JSONB-Spalte (nullable). (Alembic `0013`.)
- [x] `projects.briefing_token_count` Integer.
- [x] `projects.briefing_was_truncated` Boolean.
- [x] `projects.briefing_state_version` Integer.
- [x] Caching-Skip in Pipeline-Step 8 + Chat-Tool + State-Router: bei `briefing_state_version == state.version` skip render, log `briefing_cached=true`. (`tasks/pipeline.py::_briefing_task`.)
- [x] UI: BriefingPanel Footer-Pille Token-Count + amber `gekürzt`-Pill bei `was_truncated` mit Tooltip-Hinweis auf Settings.
- [x] Per-Item-Source-Reference im Briefing (siehe Sektion F).
- [~] Settings-Page für `briefing_priority_order` drag-sortable — Column + API-Override existiert; UI-Builder deferred (Folgewelle mit Sektion M).

---

## K. Token-Budget & Kosten-Transparenz

### 🎯 Soll
Pro Chat-Message: Token-Verbrauch (Input + Output) + USD-Schätzung sichtbar als dezente Subzeile. Pro Pipeline-Run: kumulierte Kosten pro Doc. Pro Projekt: Gesamt-Verbrauch in einer Settings-Sub-Page mit Tages-/Modell-Auflösung. Pricing-Tabelle ist statisch im Code (Source of Truth) + optionaler Live-Refresh über LiteLLM/Helicone API. Optional pro Projekt: monatlicher Budget-Cap mit Soft-Warning bei 80 % und Hard-Block neuer Operations bei 100 %. Laufende Pipelines/Chats dürfen abschließen.

### 📍 Ist
- **Komplette Lücke.** Kein Tracking in `llm.py`, kein Feld in `chat_messages`, kein Endpoint, kein UI.

### ✅ Checkliste
- [x] `llm.py` extrahiert `usage.prompt_tokens` + `usage.completion_tokens` aus Response; `complete()` returns `(response, UsageRecord)`; `stream()` yields delta + usage events; `agent_round()` yields per-round + cumulative usage.
- [x] `chat_messages.token_usage` JSONB mit `{prompt_tokens, completion_tokens, model, cost_usd, purpose}` (Alembic `0014`).
- [x] `documents.extraction_token_usage` JSONB mit `{prompt_total, completion_total, cost_total_usd, breakdown[]}`.
- [x] Pricing-Modul `agent_config.PRICING` (9 Modelle) + `FALLBACK_PRICING` + `estimate_cost_usd()`.
- [ ] Optional Live-Refresh `scripts/refresh_pricing.py` — deferred; statisches Modul reicht für v1.
- [x] Aggregations-Endpoint `GET /api/projects/{id}/usage?period={today|7d|30d|mtd|90d}` → `{daily, by_model, by_purpose, total, budget_usd, month_to_date_cost_usd, budget_used_pct, hypothetical_cheapest}`. (`routers/usage.py`.)
- [x] UI: ChatMessage-Subline `{model} · Xk in · Y out · ≈ $Z` für assistant messages mit token_usage.
- [x] Cockpit: StatusPanel Footer `Verbrauch heute: $X.XX` + (wenn Budget gesetzt) MTD-Bar.
- [x] Settings-Seite `/projects/[id]/usage` mit recharts stacked bar (daily by-model) + by-purpose Tabelle + Budget-Input + Save.
- [x] Hypothetical-Cheapest-Vergleich in Usage-Page (Re-Pricing total prompt+completion am günstigsten PRICING-Eintrag).
- [x] `projects.monthly_budget_usd` Decimal(10,4) nullable.
- [x] Soft-Warning bei 80% monatlich via Redis pubsub `budget_warning:{project_id}` → frontend sonner-Toast (8s, dedupliziert).
- [x] Hard-Block: `BudgetExceededError` aus `llm._check_budget()` bei MTD >= budget, raises **am Anfang neuer Ops**; chat-router emit SSE `error:budget_exceeded` + non-dismissable Banner.
- [~] Telemetry-Aggregation als ARQ Cron stündlich → **deferred**; on-demand SQL JSONB-Aggregation + Redis 60s-Cache deckt UI-Latenz.

---

## L. Format-Support: EML / Audio / Bilder

### 🎯 Soll
**EML:** Direkt parsen (eml-parser oder mailparser). Subject + From + To + Date + Body extrahieren. Attachments werden als separate Sub-Dokumente mit `parent_document_id = EML-ID` indiziert und rekursiv durch die Pipeline geschickt.

**Audio:** Upload (mp3/m4a/wav/ogg) → Whisper-Transkription. **Default-Provider = `local`** (whisper.cpp lokal, Self-hosted-Prinzip wahrt). Opt-in für `openai` mit klarer Datenschutz-Warnung in Settings. Original-Audio + Transkript koexistieren in einem Document (zwei Repräsentationen). Pipeline-Step `transcribe` vor `parsing`.

**Bilder:** PNG / JPG / WEBP. OCR via Kreuzberg (bereits installiert) — Pipeline erkennt `mimetype.startswith("image/")` automatisch. Bild bleibt als Vorschau verfügbar. HEIC nur wenn explizit gewünscht (braucht pyheif, zusätzliche System-Lib).

### 📍 Ist
- `routers/documents.py:34-36` ALLOWED-Liste: nur Doc/Text/Office.
- `kreuzberg` ist installiert und unterstützt laut Doku PDF + Office + Bilder via OCR — **OCR-Pfad in Pipeline nicht wired**.
- Whisper: kein Code.
- EML: kein Code.

### ✅ Checkliste
- [x] ALLOWED erweitert: `eml, png, jpg, jpeg, webp, mp3, m4a, wav, ogg` + MIME-Guard (image/*, audio/*, message/rfc822). (`routers/documents.py::_reject_unsupported_type`.)
- [ ] HEIC als Phase-5b-Add wenn iOS-Workflow konkret nachgefragt.
- [x] EML-Parser-Service `services/email_parser.py` (stdlib `email.policy.default`) → `ParsedEmail{subject, from_addr, to_addrs, date, body_text, attachments[]}` + `to_plain_text()` für Pipeline.
- [x] DB: `documents.parent_document_id` FK (nullable, self-ref, ON DELETE SET NULL, partial index). (Alembic `0015`.)
- [x] DB: `documents.source_format` VARCHAR(32) (Werte: `pdf|docx|txt|md|csv|xlsx|rtf|html|json|log|eml|image|audio|spreadsheet|other`). Backfill-SQL aus mime_type/extension.
- [x] Image-OCR via Kreuzberg `force_ocr=True` — Pipeline `_parse_with_ocr()` bei `source_format == "image"` unabhängig von globalem `kreuzberg_force_ocr` Setting.
- [x] Audio-Step: neuer Pipeline-Step `transcribe` (vor `parsing`); Setting `WHISPER_PROVIDER ∈ {off,local,openai}`. (`config.py`, `tasks/pipeline.py` Step 1b.)
- [~] Local Whisper bundled mit Docker-Image — **deferred**; `services/transcription.py::LocalProvider` nutzt `faster-whisper` (lazy import → ImportError mit Hinweis falls nicht installiert); pip-Install + Modell-Download opt-in.
- [~] OpenAI Whisper opt-in: `services/transcription.py::OpenAIProvider` impl; Settings-Page zeigt Provider-Liste mit Datenschutz-Hinweis (Text, kein Checkbox-Confirm-Flow — gehört zu Sektion M Settings-Refactor).
- [x] Audio bleibt als `storage/projects/{id}/{uuid}.{ext}`; Transkript-Text in `documents.raw_content` + `documents.extraction_token_usage` falls openai-Whisper. **Ein Document** mit `source_format="audio"`.
- [x] Pro Format ein Test-Fixture in `tests/fixtures/`: `sample.eml` (multipart mit 2 Attachments), `1x1.png`, `silence.mp3`.
- [x] Frontend DocumentCard + DocumentsPanel `FormatIcon`-Switch (Mail / Mic / Image / FileText) basierend auf source_format.
- [x] Pipeline-Card audio: `Transkribieren…` Pill während `labelRaw === "transcribe"`; `pipeline-phases.ts` mapped `transcribe → "read"` Phase 0.
- [x] WHISPER_PROVIDER Default **off** statt `local` — Local braucht `faster-whisper` pip + Modell; Provider-Abstraktion + Stub steht, opt-in via Setting. (Deviation dokumentiert, Folge-PR setzt Default auf `local` sobald Image-Bundle steht.)

### ⚖️ Decisions
- **Whisper-Default = local.** Self-hosted-Prinzip. Cloud-Whisper opt-in mit Datenschutz-Warning.
- **EML-Attachments als Sub-Dokumente.** Parent-FK ermöglicht UI-Gruppierung („Mail mit 3 Anhängen") ohne flache Dokumenten-Liste zu verwässern.
- **HEIC ausgeschlossen für v1.** Reaktiv nachziehen wenn iOS-Workflow konkret.
- **Audio = ein Document, zwei Repräsentationen.** Verhindert dass UI-Listen mit Audio + Transkript-Duplikat zugemüllt werden.

---

## M. Onboarding & Multi-Projekt-Navigation

### 🎯 Soll
**Fresh-Install-Onboarding:** Wenn `get_active_provider()` 503 → Auto-Redirect auf `/onboarding`. 3-Schritt-Wizard:
1. Provider konfigurieren (OpenRouter Key oder Azure OpenAI).
2. Modell-Test-Button („Verbindung testen") — macht 1-Token-Roundtrip und reportet Latenz + Cost.
3. Erstes Projekt anlegen + erste Datei hochladen.

**Multi-Projekt-Navigation:** AppSidebar links mit Liste aller nicht-archivierten Projekte, „+ Neues Projekt"-Button oben. Klick wechselt Projekt im Cockpit ohne Page-Reload. Sidebar collapsible (Icon-only Mode), State persistent in localStorage. Archivierte Projekte unter „Archiv" Sub-Sektion (collapsed default).

### 📍 Ist
- `AppSidebar.tsx` existiert ✓ (genaues Verhalten unverifiziert).
- Demo-User wird auto-erstellt ✓ (`demo@openmp.ai / passwort` per main.py startup).
- Provider-Setup-Page unter `/settings` vorhanden (provider_config.py / app_settings.py).
- **Kein** Onboarding-Wizard.
- **Kein** „Provider-Verbindung testen"-Button.
- **Keine** Projekt-Archivierung.

### ✅ Checkliste
- [x] Demo-User auto-Seed.
- [x] AppSidebar mit Projekt-Liste.
- [x] Settings-Page für Provider.
- [x] First-Login-Check: `providersApi.summary()` (`GET /api/settings`) liefert `llm_active=false` → `projects/page.tsx` `router.replace("/onboarding")` statt Error-Banner.
- [x] Onboarding-Page 3-Step-Wizard (`app/onboarding/page.tsx`: Provider-Form → Test → Projekt-Anlage) mit Stepper + Weiter/Zurück.
- [x] „Verbindung testen"-Button ruft `providersApi.test(id)` (Backend macht 1-Token `ping`-Call), reportet client-seitig gemessene Latenz + `≈ $0.00`.
- [x] Sidebar collapsible mit `ChevronLeft/Right` Toggle, Zustand in `store/uiStore.ts` persistiert auf localStorage (`sidebar_collapsed`) — hooks-ready für Cmd+B (Sektion P).
- [x] Sidebar-Badge pro Projekt: (a) aktive Pipelines (Pulsing/Spinner), (b) `failed_document_count` rot, (c) `unread_change_count` (changelog seit `user_project_views.last_seen_at`) indigo — unread nur wenn nicht aktuell offen.
- [x] DB: `user_project_views` (id, user_id, project_id, last_seen_at, UNIQUE(user,project)) — Alembic `0016`; `POST /api/projects/{id}/seen` upsert beim Cockpit-Mount (`layout.tsx` useEffect).
- [x] DB: `projects.archived_at` Timestamp nullable + partial index `ix_projects_active`. (Alembic `0016`.)
- [x] Sidebar-Sub-Sektion „Archiv" (collapsed default) fetcht `?include_archived=true`, zeigt archivierte Projekte mit „Aus Archiv holen".
- [x] Projekt-Menü (Sidebar-Row-Kebab `MoreVertical`, hover): „Archivieren" → `POST .../archive` (owner-only, 403 graceful); Archiv-Sektion: „Aus Archiv holen" → `POST .../unarchive`.
- [x] „+ Neues Projekt"-Button oben in Sidebar öffnet `NewProjectModal` (Name + optional client_name) → `POST /api/projects` → redirect zum neuen Projekt.
- [ ] Mobile: Sidebar als Drawer (Hamburger oben links) — offen (Folge-Polish; Desktop-Sidebar + Collapse durch).
- [x] `GET /api/projects` filtert `archived_at IS NULL` default, `?include_archived=true` Opt-in.

---

## N. Clipboard-Paste

### 🎯 Soll
Ctrl+V auf der Cockpit-Seite:
- **Bild im Clipboard** → Upload als `screenshot-{YYYY-MM-DD-HHmmss}.png`, Standard-Pipeline.
- **Text im Clipboard** (> 200 Zeichen) → öffnet TextPasteModal mit vorbefülltem Text + auto-Titel (erste 60 Zeichen).
- **Text im Clipboard** (≤ 200 Zeichen) **UND** Chat-Input fokussiert → Standard-Paste in Chat-Input.
- **Text im Clipboard** (≤ 200 Zeichen) **UND** Chat-Input nicht fokussiert → trotzdem TextPasteModal (kurze Notiz auch ein Dokument wert).

Im Chat-Input: Paste eines Bildes hängt es als Anhang an die Nachricht (siehe Sektion B).

### 📍 Ist
- `TextPasteModal.tsx` existiert, aber nur per Button erreichbar.
- **Kein** globaler Paste-Listener.
- **Kein** Bild-Paste-Handling.

### ✅ Checkliste
- [x] TextPasteModal existiert.
- [x] Globaler `paste`-Handler im Cockpit (`CockpitLayout.tsx` window-Listener); skippt editable Targets (`[data-chat-input]` / textarea / input / contentEditable) → ChatInput behält Fokus-Paste.
- [x] Bild-Paste → `File` aus `ClipboardData.items` (`getAsFile`) → `startUploadWithFlow`. Dateiname `screenshot-{ts}.{ext}` via `formatTs()`.
- [~] Text-Paste-Schwelle 200 Zeichen als `PASTE_THRESHOLD_CHARS` in `lib/ui-config.ts` (shared mit ChatInput, single source). Per-Projekt-Override `paste_threshold_chars` deferred (kein DB-Column — disproportional für den Wert).
- [x] Conflict-Detection: ChatInput fokussiert + Text ≤ 200 → natives Paste; Bild oder Text > 200 (im Input) → Modal; Paste außerhalb editable Elements → Page-Handler (jedes nicht-leere Textstück → Modal, „kurze Notiz auch ein Dokument wert").
- [~] Bild-Paste im Chat-Input → lädt aktuell als Dokument hoch; vollständige Inline-Anhang-Karte gehört zu Sektion B.
- [x] Mehrere Bilder im Clipboard → mehrere Uploads (Page-Handler + ChatInput iterieren über alle image-Items).

---

## O. Slash-Commands

### 🎯 Soll
Im Chat-Input erkennen wir `/` am Zeilenanfang → Autocomplete-Dropdown filterbar. Commands führen lokale Frontend-Logik aus, **ohne LLM-Roundtrip** → kostet null Token. `/search` ist Ausnahme (Qdrant-Backend-Call ohne LLM-Wrapper).

| Command | Aktion | LLM? |
|---|---|---|
| `/status` | Rendert aktuellen Core-State inline | nein |
| `/tasks` | Listet offene Tasks (sortiert nach Deadline) | nein |
| `/deadlines` | Listet anstehende Deadlines, gefolgt von Overdue | nein |
| `/blockers` | Listet offene Blocker | nein |
| `/contacts` | Listet Kontakte | nein |
| `/search <query>` | Direkter Qdrant-Query, rendert Treffer als Liste | nein (Embedding-Call ja, LLM-Wrapper nein) |
| `/export` | Triggert Markdown-Download (siehe Sektion U) | nein |
| `/cancel` | Bricht laufende Pipelines im Projekt ab | nein |
| `/clear` | Schließt aktive Chat-Session, startet neue | nein |
| `/version` | Zeigt aktuelle State-Version + letzten Changelog-Eintrag | nein |
| `/help` | Listet alle Commands | nein |

### 📍 Ist
- Implementiert (2026-05-29). Registry + Popover + 11 Commands + Backend-Search-Endpoint.

### ✅ Checkliste
- [x] Slash-Command-Registry `frontend/src/lib/slash-commands.ts` (`SLASH_COMMANDS`, `matchSlashCommands`, `parseSlashCommand`).
- [x] Autocomplete-Popover `SlashCommandPopover.tsx` über Chat-Input (Trigger `/` als erstes Zeichen, schließt bei Space/Argument-Start).
- [x] Tab/Enter wählt Command, ArrowUp/Down scrollt (in `ChatInput.onKeyDown`, popover hat Vorrang).
- [x] Argument-Parsing (`parseSlashCommand` → `{name, arg}`; `/search foo bar` → arg="foo bar").
- [x] Render pro Command: lokale assistant-style Message via `pushLocalMessages` (user + assistant Paar in optimisticMessages), `is_local_command: true`.
- [x] `/search` → direkter `POST /api/projects/{id}/search` (Qdrant, kein LLM-Wrapper; Backend `routers/projects.py::search_project`). Zero LLM-Token.
- [x] `/cancel` ruft pro laufender Pipeline `DELETE …/documents/{doc_id}?cancel_pipeline=true`.
- [x] `/clear` ruft `POST …/chat/sessions` + switched aktive Session (reuse `startNewSession`).
- [x] `/help` zeigt formatierte Command-Tabelle inline.
- [x] Slash-Messages mit `is_local_command`-Marker → ChatMessage rendert „lokal · 0 Token" Subzeile.
- Commands: `/status /tasks /deadlines /blockers /contacts /search /export /cancel /clear /version /help`. `/export` lädt `compiled_briefing` client-seitig als `briefing-{date}.md` (volle ZIP/Chat-Export = Sektion U).

---

## P. Keyboard-Navigation

### 🎯 Soll
Plattform-Konvention: Mac = Cmd, Linux/Windows = Ctrl. Alle Shortcuts dual gebunden.

| Shortcut | Aktion |
|---|---|
| Cmd/Ctrl+K | Globale Suche (Spotlight-Stil über Projekte/Chats/Dokumente) |
| Cmd/Ctrl+N | Neuer Chat in aktivem Projekt |
| Cmd/Ctrl+/ | Slash-Command-Cheat-Sheet öffnen |
| Cmd/Ctrl+B | Sidebar toggle |
| Cmd/Ctrl+Enter | Chat-Senden (im Input) |
| **Esc (1×)** | Wenn Input fokussiert → unfokussieren. Wenn Modal offen → Modal schließen. |
| **Esc (2×)** | Wenn Chat fullscreen offen → Chat schließen, zurück zum Cockpit. |
| Cmd/Ctrl+, | Settings öffnen (Mac-Konvention, auf allen Plattformen aktiv) |
| Cmd/Ctrl+U | File-Picker-Dialog öffnen |
| Cmd/Ctrl+Shift+A | Projekt archivieren (mit Confirm) |

### 📍 Ist
- `CommandPalette.tsx` existiert ✓ — Verhalten unbestätigt.
- Cmd+1/2/3 für Tab-Switch (entfällt nach Single-Page-Refactor).
- **Kein** Cmd+N, Cmd+K, Cmd+B Mapping bestätigt.

### ✅ Checkliste
- [x] CommandPalette-Komponente vorhanden.
- [~] Cmd+1/2/3 Navigation (deprecated, entfernt nach Cockpit-Migration).
- [x] Cmd+K öffnet CommandPalette mit Such-Modus (Projekte + Chats + Dokumente — `CommandPalette` fetcht docs + sessions des aktiven Projekts, filtert über alle drei).
- [x] Cmd+N startet neue Chat-Session (global via `openpm:new-chat` Event → `CockpitLayout.handleBackToLanding`).
- [x] Cmd+B toggled Sidebar (`uiStore.toggleSidebar`, geteilt mit Sidebar-Button).
- [x] Esc zweistufig: erstes Esc unfokussiert ChatInput → zweites Esc schließt Conversation → Landing. Modals haben Vorrang (capture-phase Esc + stopPropagation).
- [x] Cmd+, öffnet Settings (`router.push("/settings")`, dual-bound Mac/Linux).
- [x] Cmd+U triggert File-Picker (`openpm:open-file-picker` Event → ChatInput klickt `fileInputRef`).
- [x] Cmd+/ öffnet `KeyboardShortcutsModal` (Cheat-Sheet, listet alle Bindings + Esc-Verhalten).
- [x] Conflict-Vermeidung: `isComposing(e)` Guard (IME / keyCode 229) — Shortcuts feuern nicht mid-composition.
- [x] Shortcuts global registriert in `frontend/src/lib/keybindings.ts` + `useGlobalKeybindings` Hook (eine Quelle der Wahrheit; `KEY_BINDINGS` speist Cheat-Sheet + Handler).

---

## Q. Session / Auth-Lifecycle

### 🎯 Soll
JWT (Access-Token) mit 24 h TTL + Refresh-Token mit 30 d TTL. Silent Refresh 5 min vor JWT-Ablauf. Bei Refresh-Fail während Chat: Toast „Sitzung abgelaufen — bitte neu einloggen", letzte ungeschickte Message wird im localStorage gepuffert und nach Re-Login automatisch gesendet. Multi-Tab-safe.

### Migration
- **Phase 1 (schnell):** Refresh-Token im localStorage. Kompatibel mit aktueller JWT-Store-Architektur.
- **Phase 2 (sicher):** Refresh-Token wandert in HttpOnly-Cookie + SameSite=Lax. Access-Token bleibt im Memory (`authStore`). Erfordert CSRF-Schutz für refresh-Endpoint.

### 📍 Ist
- HS256 JWT mit Redis-Blocklist für Logout ✓ (siehe CLAUDE.md).
- JWT im `authStore` (localStorage, persisted).
- Demo-User auto-erstellt ✓.
- TTL aktuell unbekannt — bestätigen in `auth.py`.
- **Kein** Refresh-Token-Flow.
- **Kein** Silent-Refresh.
- **Kein** Message-Puffer bei Token-Expiry.

### ✅ Checkliste
- [x] JWT + Blocklist.
- [x] Phase 1: Refresh-Token-Modell (`refresh_tokens`: id, user_id, token_hash (SHA-256, raw nie gespeichert), expires_at, revoked_at, last_used_at, created_at). Alembic `0017`.
- [x] Phase 1: `POST /api/auth/refresh` (input refresh_token → neues Access-JWT; 401 bei invalid/expired/revoked; non-rotating für Multi-Tab-Safety). Login + gibt jetzt `refresh_token` zurück.
- [x] Phase 1: `authStore.refreshToken` persistiert in localStorage (`openpm-auth`).
- [x] Phase 1: `useTokenRefresh` Hook schedult Refresh 5 min vor `exp` (JWT decode), reschedult bei Token-Wechsel.
- [x] 401-Interceptor in `lib/api.ts`: Silent-Refresh (dedup via in-flight Promise) + Retry des Original-Requests einmal; Auth-Pfade gebypassed (kein Loop).
- [x] Bei finalem Auth-Fail: Toast „Sitzung abgelaufen" + Message-Puffer `pending_chat_messages` (Key `{project}:{session}:{ts}`) + Redirect Login. `useChatStream` signalisiert `auth_expired` → `CockpitLayout.handleSend` puffert.
- [x] Nach Re-Login: `takePendingMessages(projectId)` beim CockpitLayout-Mount, Replay älteste-zuerst (200 ms Stagger).
- [x] Multi-Tab: Puffer-Key mit Timestamp; `BroadcastChannel("openpm-auth")` synct refreshed Token zwischen Tabs (vermeidet parallele Refresh-Calls).
- [x] Logout invalidiert Refresh-Token (`revoke_refresh_token` setzt `revoked_at`); AppSidebar sendet `{refresh_token}` im Logout-Body.
- [ ] Phase 2: Refresh-Token in HttpOnly-Cookie + CSRF — deferred (Phase 1 localStorage-Flow steht).

---

## R. Notifications & Recovery

### 🎯 Soll
**Toast (in-app):** Erfolg / Info / Fehler (sonner schon vorhanden).
**Browser-Notification (opt-in):** Bei Pipeline-Abschluss wenn Tab nicht fokussiert → System-Notification. Funktioniert ohne Service-Worker via Web Notifications API direkt (Tab muss noch existieren).
**Tab-Close-Recovery (v2, optional):** Wenn echte Tab-Close-Toleranz nötig → später Service-Worker. Für v1 verzichten — komplex, browser-unzuverlässig, schmaler Use-Case.

### 📍 Ist
- `sonner` Toast-Lib im Frontend ✓ (siehe DropZone.tsx).
- **Kein** Browser-Notification-Permission-Flow.
- **Kein** Service-Worker.

### ✅ Checkliste
- [x] Toast-Infra.
- [x] Settings-Page: `NotificationSettings` „Aktivieren"-Button → `Notification.requestPermission()`; `granted` → „✓ Aktiv", `denied`/`unsupported` States. (`lib/notifications.ts`.)
- [x] Pipeline-Complete-Hook in `useProjectSSE` (`document_complete`): wenn `document.hidden` und Permission `granted` → `notify("OpenPM", {body: "{file} fertig — N Tasks, M Deadlines extrahiert", tag: project_id})`.
- [x] `tag = project_id` verhindert Stacking gleicher Projekt-Notifications.
- [x] Notification-Click: `window.focus()` + scrollt zu `#document-{id}` (DocumentRow hat jetzt `id`), Fallback `#docs`.
- [x] Multi-Projekt: Tag = `project_id`, pro Projekt eigener Tag.
- [x] Failed-Pipeline (`document_failed` + hidden): Notification mit `requireInteraction: true`.

### ⚖️ Decisions
- **Kein Service-Worker für v1.** Web Notifications API direkt reicht. Service-Worker erst wenn echte Tab-Close-Tolerance gewünscht — dann eigene Roadmap-Item.

---

## S. Bulk-Upload-Verhalten

### 🎯 Soll
Bei 5+ gleichzeitig hochgeladenen Dateien: Datei-Zeilen unter Gruppen-Header `5 Dateien hochgeladen`. Live-Feed aggregiert Counts (`2 von 5 fertig · 1 Fehler`). Gruppe expandierbar auf Einzel-Ebene. Pipeline läuft trotzdem pro Doc (Backend unverändert), nur die UI gruppiert. Gruppen-Bildung nutzt **ChangeSession** (Backend hat das schon) statt Frontend-Heuristik.

### 📍 Ist
- Pro-Datei-Cards solide (`DocumentCard`).
- Pipeline-Store hält `pipelines[docId]` Map ✓.
- ChangeSession-Modell aggregiert Burst-Uploads im Backend ✓.
- **Keine** Gruppen-Aggregation in UI.

### ✅ Checkliste
- [x] Pro-Doc-Tracking.
- [x] Backend ChangeSession existiert.
- [x] `BulkUploadGroup` Komponente: gruppiert Docs nach `change_session_id` — jetzt persistiert auf `documents.change_session_id` (Alembic `0019`, FK→change_sessions, serialisiert in `DocumentResponse`), gesetzt in `_attach_change_session`. Backend-geliefert, überlebt Reload.
- [x] Schwelle: Gruppen-Anzeige ab Member-Count ≥ 5, `BULK_UPLOAD_THRESHOLD` in `lib/ui-config.ts`.
- [x] Group-Header mit Live-Counts (`done von total fertig · N Fehler`) aus `pipelineStore.pipelines` über DB-Status gelegt.
- [x] Klick auf Header expandiert zu Einzelzeilen (`DocumentRow`).
- [~] Status-Block animiert summen alle Items der Gruppe — Group-Header zeigt Live-Counts; voller Count-Up bleibt im StatusPanel (`AnimatedCount`, E/G).
- [x] ChangeSession-Close → Gruppe als „abgeschlossen" markiert (Idle-Window backend-seitig `SESSION_IDLE_SECONDS`=5 min statt 30 s).
- [x] Aggregierte Extraction-Summary nach Session-Close (`N neue Tasks · M Deadlines · …`) aus `perProjectLastClosed.summary`.

---

## T. Stale Detection

### 🎯 Soll
Cron-Job (ARQ) läuft 1× täglich:
- Markiert abgelaufene Deadlines als `overdue`.
- Markiert Projekte ohne Upload > 14 Tage als `stale`.
- Generiert eine **statische Notiz** (kein LLM-Call, kein Token-Kosten) die als System-Banner über dem Cockpit erscheint: „Letzter Upload vor 18 Tagen. 2 Deadlines überfällig."

### 📍 Ist
- ARQ Worker existiert; `close_idle_change_sessions` als Beispiel-Cron-Task vorhanden (pipeline.py:248).
- **Keine** Deadline-Stale-Logik.
- **Keine** Project-Stale-Flag.

### ✅ Checkliste
- [x] ARQ Cron-Task `mark_stale_deadlines` (täglich, 06:00 UTC) — worker.py `cron(hour=6, minute=0)`.
- [x] `state.core.deadlines[i].status = "overdue"` automatisch wenn `date < today` — Cron patcht current-version-JSONB in place (keine neue Version), publiziert `state_changed`.
- [x] `projects.last_activity_at` Spalte (Update bei jedem Doc-Upload via `_attach_change_session` + jeder Chat-Message; bumpt + cleart `stale_marker`).
- [x] `projects.stale_marker` Boolean (true wenn `last_activity_at > 14 Tage`, Cron-gesetzt).
- [x] Cockpit-Banner (über Status-Block) wenn stale: `StaleBanner` rendert `stale_notice.text_de`, dismissable per X → `POST /stale/dismiss` (`user_project_views.stale_dismissed_at`).
- [x] Status-Block-Summary zeigt überfällige Deadlines explizit rot — `lib/deadlines.ts` `isOverdue` (datums-basiert, G-Sweep) + Cron-persistierter `status=overdue`.
- [x] Kein LLM-Call für Stale-Briefing. Template hardcoded in `services/stale_notice.py` (German + English, bilinguale `text_de`/`text_en`).

---

## U. Export

### 🎯 Soll
- **State als Markdown:** `/export` Slash-Command oder Settings-Button → lädt `briefing.md` herunter.
- **Chat als Markdown:** Pro Session ein Export-Button → `chat-{title}-{date}.md`.
- **Voller Projekt-Snapshot (ZIP):** Da OpenPM auf Source-Backlinks lebt, muss ein Snapshot die Original-Dokumente enthalten — sonst ist der State ohne Bezug. ZIP ist kein optionales Add, sondern die *richtige* Export-Form für Compliance/Übergabe.

### ZIP-Layout
```
project-{slug}-{YYYY-MM-DD}.zip
├── README.md                    # erklärt Inhalt + Generierungs-Datum
├── briefing.md                  # rendered briefing
├── state.json                   # vollständiger State (current version)
├── state-history.json           # alle Versionen + Changelog
├── documents.csv                # Tabelle: id, filename, format, uploaded_at, source_count
├── documents/
│   ├── {original-filename-1}    # mit Original-Bytes
│   └── {original-filename-2}
└── chats/
    ├── {session-title-1}-{date}.md
    └── {session-title-2}-{date}.md
```

### 📍 Ist
- **Komplett fehlend.**

### ✅ Checkliste
- [ ] `GET /api/projects/{id}/export/briefing.md` (Content-Type text/markdown).
- [ ] `GET /api/projects/{id}/chat/sessions/{sid}/export.md`.
- [ ] `GET /api/projects/{id}/export.zip` (streamt zip via `aiozipstream` o.ä.).
- [ ] ZIP-Generation läuft als ARQ-Job (bei großen Projekten > 100 MB), Status-Polling via `GET /api/projects/{id}/export.zip/status`.
- [ ] Frontend-Buttons in Settings-Page + Status-Block-Footer.
- [ ] Slash-Command `/export` triggert briefing.md Download direkt.
- [ ] „Voll-Export"-Button öffnet Confirm-Modal (Größenwarnung) und triggert ARQ-Job.

---

## V. Animationen & Timing-Disziplin

### 🎯 Soll
Konsistente Timings über das ganze System:

| Pattern | Dauer | Easing |
|---|---|---|
| Expand / Collapse | 250–300 ms | ease-out |
| Fade-In neue Elemente | 150 ms | ease-in |
| Count-Up (Zahlen) | 200 ms | ease-out |
| Highlight-Flash (State-Update) | 500 ms | ease-in-out |
| Pulse (Processing) | 1500 ms Loop | ease-in-out |
| Auto-Collapse nach Upload | 3 s Delay + 300 ms Collapse | ease-out |
| Chat öffnen / schließen | 300 ms | ease-out |

Keine bounce/elastic/spring-Easings.

### 📍 Ist
- Tailwind `transition-default` als Standard (siehe `globals.css`).
- Tatsächliche Werte und Konsistenz nicht zentral dokumentiert / erzwungen.
- Count-Up + Highlight-Flash + Auto-Collapse → vermutlich noch nicht implementiert.

### ✅ Checkliste
- [ ] `tailwind.config` mit Custom-Easing-Tokens + Duration-Tokens (`duration-expand`, `duration-pulse`, etc.).
- [ ] CSS-Variable `--timing-expand: 300ms`, `--timing-pulse: 1500ms` etc.
- [ ] CountUp-Komponente (animiert von alter zu neuer Zahl via requestAnimationFrame).
- [ ] Pulse-Klasse mit definiertem Keyframe `@keyframes pipeline-pulse`.
- [ ] Highlight-Flash-Hook (`useFlashOnChange(value)` → fügt Klasse für 500 ms hinzu).
- [ ] Visuelle Tests nur für **Start- und End-State** (Playwright Screenshot vor Trigger + nach Animationsende). Keine Mid-Animation-Frames (flaky pro GPU/Browser).
- [ ] `prefers-reduced-motion`-Media-Query respektieren: Animationen auf 0 ms reduzieren wenn User OS-Setting hat.

---

## W. Nicht-funktionale Anforderungen

### 🎯 Soll
- **Self-hosted** (Docker Compose, Hetzner).
- **Tests:** Kritische Pfade vollständig abgedeckt (Pipeline-Steps, State-Mutations, Auth-Flow, Source-Attribution-Migration). Coverage ≥ 80 % als Heuristik, nicht als Ziel.
- **Migrations:** Alembic, alle Schema-Änderungen reversibel.
- **Logging:** structlog mit Request-ID-Korrelation.
- **Healthcheck:** `/api/health/live` + `/api/health/ready`.
- **Observability:** Latency-Metriken pro Pipeline-Step, Token-Throughput, Failure-Rate. Prometheus-kompatible Endpoint optional.
- **SSE-Connection-Lifecycle:** Persistent über Layout-Wechsel, kein Reconnect bei Cockpit-Section-Switch.
- **Docs:** CLAUDE.md + Provider-Setup + Deployment-Guide aktuell.
- **CI:** GitHub-Actions für Lint + Test + Type-Check.

### 📍 Ist
- Docker Compose mit dev-override ✓.
- Alembic-Migrations ✓.
- structlog ✓.
- Playwright E2E vorhanden [[reference_e2e-suite]] — 3 passing / 2 failing.
- pytest mit asyncio_mode auto ✓.
- CI: unbekannt — `.github/workflows/` check needed.
- Healthcheck: unbekannt.

### ✅ Checkliste — Tests / CI
- [x] Docker Compose dev + prod.
- [x] Alembic.
- [x] structlog.
- [x] Playwright E2E (Auth-Setup + Upload-Pipeline).
- [ ] E2E grün (aktuell 2 failing — siehe [[reference_e2e-suite]]).
- [ ] Pytest Coverage ≥ 80 % als Heuristik. Primärziel: kritische Pfade (Pipeline-Steps, State-Merge, Auth-Refresh, Doc-Delete-Re-Komposition, Source-Migration) explizit testen.
- [ ] GitHub-Actions CI (lint + test + type-check pro PR).
- [ ] Pre-commit Hook (ruff + mypy + eslint).

### ✅ Checkliste — Observability
- [ ] `/api/health/live` (200 wenn Prozess läuft).
- [ ] `/api/health/ready` (testet LLM-Provider + Redis + Qdrant + DB).
- [ ] Prometheus-Endpoint `/metrics` mit Histogrammen pro Pipeline-Step-Duration.
- [ ] Counter: `extraction_total{model, status}`, `chat_messages_total{model}`, `pipeline_errors_total{error_class}`.
- [ ] Optional Grafana-Dashboard-Template als `.json` im Repo (`ops/grafana/`).

### ✅ Checkliste — Deployment / Docs
- [ ] Deployment-Guide (Hetzner Cloud-VPS-Setup mit Docker Compose, Let's Encrypt, Caddy als Reverse-Proxy).
- [ ] Update-Guide (`docker compose pull && docker compose up -d` + Alembic-Migration-Step).
- [ ] Provider-Setup-Guide für OpenRouter und Azure OpenAI separat.
- [ ] CLAUDE.md aktuell.

### Backup-Strategie (eigener Mini-Abschnitt — wegen Self-hosted-Anforderung)
- [ ] Daily-Backup-Skript (`scripts/backup.sh`): `pg_dump`, Qdrant-Snapshot (`/snapshots` API), tar von `storage/`.
- [ ] Zielort konfigurierbar via `.env`: lokales Verzeichnis (Default), optional S3-kompatibler Object-Storage (z.B. Hetzner Storage Box / Backblaze B2).
- [ ] Retention: 7 daily / 4 weekly / 12 monthly.
- [ ] Restore-Anleitung als Markdown im Deployment-Guide.
- [ ] Optional als ARQ-Cron-Task im Worker bei Single-Node-Deploy.

---

## 3. Cross-Cutting Concerns

### Empty States (zentral definiert, in allen Sektionen referenziert)

| Bereich | Empty-Zustand-Text |
|---|---|
| Dokumente | „Dokumente hier ablegen oder über den Upload-Button hinzufügen." + Drag-Highlight |
| Chat (keine Session) | „Stell eine Frage zu diesem Projekt." + 3 statische klickbare Prompts (siehe B) |
| State | „Der Projektstatus wird automatisch aufgebaut, sobald Dokumente hochgeladen werden." |
| Chat-Archiv | „Noch keine vergangenen Chats. Nutze Cmd+N für einen neuen." |
| Suche (keine Treffer) | „Keine Treffer für ‚{query}'. Andere Begriffe versuchen?" |
| Settings (Provider) | „Kein Provider konfiguriert. Onboarding-Wizard starten." |

### Visuelle Konsistenz
Dark Theme mit Indigo-Akzent. Token-System wird **durchgehend** benutzt — keine hartcodierten Hex-Werte.

| CSS-Variable | Zweck |
|---|---|
| `--bg-base` | App-Hintergrund |
| `--bg-surface` | Karten / Sektion-Container |
| `--bg-elevated` | Inputs / Modals / Buttons |
| `--bg-overlay` | Modal-Hintergrund |
| `--accent` | Indigo-Primary |
| `--accent-subtle` | Indigo-Tint für Backgrounds |
| `--danger` / `--danger-subtle` | Fehler |
| `--warning` | Warnung (Low-Confidence, Overdue) |
| `--text-primary` / `--text-secondary` / `--text-muted` | Text-Hierarchie |
| `--border` / `--border-strong` | Linien |

Cards `rounded-lg`. Borders über `--border`/`--border-strong`. [[feedback_visual-consistency-openpm]]

### Verifikation
Vor jedem „Done"-Claim: Playwright oder Browser-Verify [[feedback_verify-ui-in-browser]]. Type-Check + Lint allein reichen nicht.

### SSE-Quirk
Live-Stream geht **direkt zum Backend** über `NEXT_PUBLIC_API_URL`, nicht über Next.js Dev-Proxy (gzip bricht Streaming). [[project_sse-next-dev-gzip]]

### Backend Python
Immer `source backend/.venv/bin/activate` — System-Python 3.14 ist defekt. [[reference_backend-venv-python]]

---

## 4. Roadmap (Priorisierungs-Vorschlag)

Zeitangaben = **ideal fulltime**. Für Jonas (Werkstudent, nicht fulltime) realistisch ~2× ansetzen.

### Phase 1a — Cockpit-Skelett (2-3 Tage, **Hard-Dependency** für alles andere)
Single-Page-Shell ohne Inhalt — vorhandene Sub-Components werden als Sektionen kompositionell wiederverwendet. Ohne diese Basis sind B/D/E/G nicht voll umsetzbar.

1. Cockpit-Page `/projects/[id]/page.tsx` mit Grid-Layout (Status / Docs / Archive / Chat-Input).
2. Sub-Routen entfernen, ProjectTabs.tsx löschen.
3. Anchor-Deep-Link-Logik.

### Phase 1b — UX-Grundbau (2 Wochen)
Auf Cockpit-Skelett aufbauend:
4. Status-Block-Summary + Highlight-Flash (G).
5. Chat-Sessions + Auto-Titel + Archiv-UI (C).
6. Inline-Tool-Pillen + Mutation-Artifact-Cards (B).
7. Slash-Commands + Keyboard-Shortcuts (O, P).
8. Live-Extraction-Feed pro Doc (E).

### Phase 2 — Zuverlässigkeit (1.5 Wochen)
9. Source-Attribution-Schema-Migration + Re-Render (F).
10. Retry-Policy + Error-Klassen + Healthcheck (H).
11. Document-Delete-Re-Komposition + Undo (I).
12. Document-Replace mit Diff-Preview (I).
13. Konflikt-Resolution im Merge (F).

### Phase 3 — Skalierbarkeit (1 Woche)
14. Token-Tracking + Cost-Dashboard (K).
15. Briefing-Token-Cap + Priorisierung + Caching (J).
16. Bulk-Upload-Gruppierung via ChangeSession (S).

### Phase 4 — Format-Expansion (1.5 Wochen)
17. EML-Parser + Image-OCR via Kreuzberg (L).
18. Audio + local-Whisper-Integration (L).

### Phase 5a — UX-Polish (1 Woche)
19. Clipboard-Paste (N).
20. Browser-Notifications (R).
21. Animations-Disziplin (V).

### Phase 5b — Daten-Lifecycle (1 Woche)
22. Export inkl. ZIP-Snapshot (U).
23. Onboarding-Wizard (M).
24. Stale-Detection (T).
25. Backup-Skript + Deployment-Guide (W).

---

## 5. Pflege dieses Dokuments

- Nach jedem PR der ein Sub-Item abhakt → entsprechende Checkbox setzen + Bereich-Score neu berechnen + Gesamt-Score neu summieren.
- Wenn ein neuer Aspekt auftaucht (Bug, Idee, User-Feedback) → neue Sub-Sektion oder Sub-Item.
- Decisions werden nicht gelöscht, sondern ergänzt: `~~Alt~~ → Neu (Grund, Datum)`.
- Score-Update spätestens alle 2 Wochen oder bei größeren Merges.
- Last-update-Stempel ganz oben aktualisieren.

### Score-Helper

Bereich-Score = `(Anzahl [x] + 0.5 × Anzahl [~]) / Total-Items × 100`, gerundet auf 5er-Schritte.

Gesamt-Score = `Σ (Bereich-Score × Gewicht) / 100`.

Quick-Script `scripts/score.py` (TBD):
```bash
python scripts/score.py road_to_perfection.md
# Output:
# A. Cockpit-Layout      10 / 100   (1/10 items)
# B. Chat-Interface      55 / 100   (8/15 items, 2 partial)
# ...
# Gesamt: 40 / 100
```
Parses Markdown-Checklisten + Scorecard-Gewichts-Tabelle, gibt Drift-Warnung wenn Tabellen-Score vom berechneten abweicht > 5 Punkte.
