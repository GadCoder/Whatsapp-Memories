## Context

The change addresses cross-cutting reliability issues in both runtime services: `whatsapp-collector` and `message-storage`. Current behavior has failure modes that include duplicate ingestion from overlapping WhatsApp events, hard startup failure when embedding providers are misconfigured, and message loss when Redis publish retries and in-memory queue flushes fail. The system also has inconsistent shutdown behavior and configuration examples that can cause silent filter mismatches.

Constraints:
- Preserve current high-level architecture (WhatsApp client -> Redis pub/sub -> PostgreSQL storage).
- Keep compatibility with current message schema and Redis channels.
- Avoid adding heavy infrastructure dependencies for this reliability pass.

Stakeholders:
- Operators running Docker Compose in production-like environments.
- Developers extending ingestion/search features on top of this pipeline.

## Goals / Non-Goals

**Goals:**
- Guarantee at-most-once processing per message ID in collector runtime behavior.
- Allow `message-storage` to continue storing messages when embeddings are unavailable.
- Make shutdown/fatal paths deterministic and resource-safe in both services.
- Add recoverable durability for publish failures that outlive process restarts.
- Validate and document filter configuration in runtime-accurate format.

**Non-Goals:**
- No redesign of transport layer (stays on Redis pub/sub for this change).
- No full migration framework adoption beyond targeted schema/runtime hardening.
- No semantic search ranking/model quality changes.
- No UI or external API additions.

## Decisions

### 1) Deduplicate ingestion in collector by message ID with TTL cache

Decision:
- Keep both event listeners for compatibility with `whatsapp-web.js` behavior variance.
- Add an in-process deduplication guard keyed by `message.id._serialized` with a short TTL (for example 5-10 minutes).
- Skip processing when a message ID has already been handled recently.

Rationale:
- Using only one event (`message_create` or `message`) can break expected capture of outbound/inbound combinations depending on runtime state.
- A TTL map is simple and does not introduce external dependencies.

Alternatives considered:
- Remove one listener entirely: simpler, but risks message coverage regressions.
- Redis-based distributed deduplication: stronger across replicas, but out of scope for current single-instance deployment pattern.

### 2) Make embeddings optional at runtime with explicit degraded mode

Decision:
- Replace constructor-time hard failure for missing embedding API keys with a runtime mode flag in `EmbeddingService`.
- If provider keys are missing/unusable, service logs degraded mode and returns "embedding unavailable" for generate calls; message persistence still proceeds.
- Keep optional strict mode via env toggle (for environments that require embeddings to be mandatory).

Rationale:
- Current handler logic already intends to continue without embeddings; constructor throw violates that intent.

Alternatives considered:
- Keep fail-fast behavior: safer for embedding-only deployments, but harms ingestion durability.
- Fallback to local embedding model: introduces major new dependency and resource requirements.

### 3) Unify shutdown/error lifecycle and ensure idempotent cleanup

Decision:
- Introduce idempotent shutdown state (`isShuttingDown`) in both services.
- Route `SIGINT`, `SIGTERM`, and fatal paths through the same async shutdown function.
- Add bounded shutdown timeout and best-effort cleanup of Redis/database/interval handles.

Rationale:
- Prevents resource leaks and inconsistent behavior between signal and exception paths.

Alternatives considered:
- Keep direct `process.exit` in fatal handlers: faster exit but non-deterministic cleanup.

### 4) Add file-backed dead-letter persistence for unflushed queue messages

Decision:
- When queue overflows or cannot flush on disconnect, append NDJSON records to a local dead-letter file.
- Include timestamp, channel, message ID (if available), and payload.
- Add startup log for detected dead-letter file and manual recovery instructions.

Rationale:
- Meets minimal recoverability requirement without external broker change.

Alternatives considered:
- Persist failed items in Redis stream/postgres table: stronger queryability, but changes operational model and schema.

### 5) Validate filter inputs and align docs/examples to JID format

Decision:
- Normalize and validate `FILTER_CONTACTS` values at startup.
- Warn (or fail in strict mode) when entries do not look like WhatsApp JIDs (`@c.us`, `@g.us`, `@broadcast`).
- Update compose/docs examples to runtime-correct values.

Rationale:
- Prevents silent operator misconfiguration.

Alternatives considered:
- Keep permissive parsing only: lower friction but higher risk of ineffective filters.

## Risks / Trade-offs

- [Risk] In-process deduplication does not protect across multiple collector replicas.
  → Mitigation: document single-writer assumption; keep extension path for Redis-backed dedupe.

- [Risk] Degraded embedding mode may hide provider misconfiguration if logs are ignored.
  → Mitigation: emit clear startup warning and periodic health counter for skipped embeddings.

- [Risk] Dead-letter files can grow unbounded.
  → Mitigation: configurable file path/size rotation policy and operational alerting guidance.

- [Risk] More validation may reject previously accepted loose configs.
  → Mitigation: start with warnings by default; enforce with optional strict mode.

## Migration Plan

1. Implement code changes behind backward-compatible defaults.
2. Update environment documentation and `docker-compose.yml` examples.
3. Deploy with warnings enabled and strict validation disabled.
4. Observe logs/metrics for duplicate suppression, skipped embeddings, and dead-letter writes.
5. Optionally enable strict modes once configuration is clean.

Rollback strategy:
- Revert collector dedupe and shutdown changes if message throughput regresses unexpectedly.
- Disable strict validation/degraded-mode toggles via env to restore prior tolerance behavior.
- Dead-letter file logic is additive and can be disabled without schema migration.

## Open Questions

- Should deduplication TTL be fixed or configurable via env?
- Should dead-letter persistence default to enabled in all environments, including local dev?
- Do we want hard-fail mode for missing embeddings by default in production profiles?
- Is single-instance collector an explicit guarantee, or do we need distributed dedupe in near term?
