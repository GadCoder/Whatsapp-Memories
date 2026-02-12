## Why

The current codebase has several reliability and correctness risks that can cause duplicate processing, startup failures, and avoidable data loss under transient failures. Addressing these now improves operational stability before adding new features on top of an unstable ingestion and storage pipeline.

## What Changes

- Define and implement message ingestion safeguards to prevent duplicate handling from overlapping WhatsApp events.
- Define startup and degradation behavior so message storage can continue when embedding providers are misconfigured or temporarily unavailable.
- Define graceful shutdown and fatal error handling requirements to ensure Redis/database resources are consistently released.
- Define minimum durability behavior for publish failures, including recoverable handling when in-memory retry queues cannot be flushed.
- Align filtering configuration examples and validation behavior so runtime behavior matches operator expectations.

## Capabilities

### New Capabilities
- `collector-deduplicated-ingestion`: Ensure each incoming WhatsApp message is processed and published at most once.
- `storage-resilient-startup`: Ensure storage service can start in a degraded mode when embeddings are unavailable, while continuing to persist messages.
- `service-graceful-shutdown`: Ensure both services perform deterministic cleanup on signals and fatal runtime paths.
- `publisher-failure-durability`: Ensure publish failures have a recoverable persistence path beyond in-memory retry queues.
- `filter-config-validation`: Ensure filter configuration values are validated and documented in the exact format required at runtime.

### Modified Capabilities
- None (no existing capability specs are present in `openspec/specs/`).

## Impact

- Affected systems: `whatsapp-collector`, `message-storage`, Redis pub/sub flow, PostgreSQL storage initialization.
- Affected code areas: event listeners, publisher queue/error handling, embedding initialization flow, shutdown/error handlers, and configuration/docs.
- Operational impact: reduced duplicate writes, fewer startup crashes, improved recoverability under Redis/API failures, and clearer deployment configuration.
