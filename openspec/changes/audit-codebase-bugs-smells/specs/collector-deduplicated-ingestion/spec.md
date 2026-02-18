## ADDED Requirements

### Requirement: Collector SHALL process each message ID at most once within the deduplication window
The collector MUST prevent duplicate processing for the same WhatsApp message ID when multiple client events are emitted for one logical message.

#### Scenario: Duplicate event is ignored
- **WHEN** a message is received with a `messageId` that has already been processed within the active deduplication window
- **THEN** the collector MUST skip processing and MUST NOT publish the message again

### Requirement: Collector SHALL preserve message coverage while deduplicating
The collector MUST continue to process inbound and outbound messages even when deduplication is enabled.

#### Scenario: Unique inbound and outbound messages are processed
- **WHEN** inbound and outbound messages are received with distinct `messageId` values
- **THEN** the collector MUST process and publish each message exactly once
