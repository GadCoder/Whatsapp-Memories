## ADDED Requirements

### Requirement: Storage service SHALL start in degraded mode when embeddings are unavailable
The message-storage service MUST continue starting and MUST keep persisting messages when embedding providers are unavailable due to missing credentials, provider errors, or temporary outages.

#### Scenario: Missing embedding API key
- **WHEN** the configured embedding provider has no valid API key at startup
- **THEN** the service MUST start in degraded mode and MUST store incoming messages without embeddings

### Requirement: Storage service SHALL expose degraded embedding state in logs
The service MUST log a clear startup warning when embeddings are disabled or unavailable.

#### Scenario: Degraded mode warning emitted
- **WHEN** service startup detects embedding generation cannot be initialized
- **THEN** startup logs MUST include a degraded mode warning and the reason embeddings are unavailable
