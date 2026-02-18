## ADDED Requirements

### Requirement: Services SHALL execute idempotent graceful shutdown on signals and fatal paths
Both `whatsapp-collector` and `message-storage` MUST route signal and fatal shutdown paths through the same cleanup flow and MUST tolerate repeated shutdown triggers without duplicate cleanup failures.

#### Scenario: Repeated shutdown signal
- **WHEN** shutdown is triggered more than once while cleanup is in progress
- **THEN** cleanup MUST run once and subsequent triggers MUST be ignored or safely no-op

### Requirement: Services SHALL release runtime resources before process exit
Services MUST close Redis/database connections and clear long-running timers before exiting.

#### Scenario: SIGTERM cleanup
- **WHEN** the process receives `SIGTERM`
- **THEN** the service MUST perform cleanup and only then exit with the appropriate status code
