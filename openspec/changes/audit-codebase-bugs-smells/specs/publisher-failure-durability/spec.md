## ADDED Requirements

### Requirement: Publisher SHALL persist unflushable messages to recoverable dead-letter storage
If retries fail and queued messages cannot be flushed before shutdown, the collector MUST persist failed publish records to dead-letter storage that survives process restarts.

#### Scenario: Queue flush fails during shutdown
- **WHEN** queued messages remain after final flush attempt on disconnect
- **THEN** the collector MUST write those records to dead-letter storage and log their location

### Requirement: Publisher SHALL include recovery metadata in dead-letter records
Dead-letter records MUST include enough metadata to support replay and traceability.

#### Scenario: Dead-letter record contents
- **WHEN** a publish record is written to dead-letter storage
- **THEN** the record MUST contain timestamp, target channel, and serialized payload
