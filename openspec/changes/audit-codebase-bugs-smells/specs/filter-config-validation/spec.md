## ADDED Requirements

### Requirement: Collector SHALL validate filter contact identifiers at startup
The collector MUST validate configured `FILTER_CONTACTS` values against accepted WhatsApp identifier formats before processing messages.

#### Scenario: Invalid contact identifier configured
- **WHEN** a `FILTER_CONTACTS` entry is not in a recognized WhatsApp ID format
- **THEN** startup MUST emit a validation warning that identifies the invalid entry

### Requirement: Collector SHALL normalize filter values before matching
The collector MUST normalize configured filter entries and runtime message identifiers consistently so matching behavior is deterministic.

#### Scenario: Equivalent identifiers match after normalization
- **WHEN** configured filter values and runtime message identifiers represent the same contact after normalization
- **THEN** allowlist or blocklist matching MUST apply consistently to that message
