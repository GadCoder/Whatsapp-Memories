## 1. Collector Deduplication and Filter Validation

- [x] 1.1 Add message ID deduplication cache with TTL to collector message handling path.
- [x] 1.2 Ensure both WhatsApp event listeners route through dedupe gate before processing/publishing.
- [x] 1.3 Add startup normalization and validation for `FILTER_CONTACTS` values.
- [x] 1.4 Emit validation warnings for malformed filter identifiers and document strict-mode behavior.
- [x] 1.5 Add tests for duplicate-event suppression and normalized filter matching.

## 2. Storage Startup Resilience

- [x] 2.1 Refactor `EmbeddingService` initialization to support degraded mode without constructor hard-fail.
- [x] 2.2 Add explicit runtime state for embedding availability and integrate it in message handler flow.
- [x] 2.3 Add startup and operational logs indicating degraded embedding mode and reason.
- [x] 2.4 Add tests for missing API key startup behavior and no-embedding persistence path.

## 3. Graceful Shutdown Hardening

- [x] 3.1 Implement idempotent shutdown guards in both services to prevent duplicate cleanup races.
- [x] 3.2 Route signal and fatal error handlers through unified async shutdown functions.
- [x] 3.3 Track and clear interval/timer resources during shutdown.
- [x] 3.4 Add integration/smoke tests for `SIGTERM` cleanup behavior and exit path correctness.

## 4. Publish Failure Durability

- [x] 4.1 Implement dead-letter persistence for dropped/unflushed publish records (NDJSON or equivalent).
- [x] 4.2 Include required recovery metadata (timestamp, channel, payload) in each dead-letter record.
- [x] 4.3 Add startup/shutdown logs indicating dead-letter writes and recovery file path.
- [x] 4.4 Add tests for queue overflow and shutdown flush failure persistence behavior.

## 5. Documentation and Operational Verification

- [x] 5.1 Update `docker-compose.yml` and README examples to use runtime-correct filter identifier formats.
- [x] 5.2 Document degraded embedding mode, dead-letter recovery workflow, and validation warnings.
- [x] 5.3 Run build/test checks for both services and capture verification notes in change PR.
