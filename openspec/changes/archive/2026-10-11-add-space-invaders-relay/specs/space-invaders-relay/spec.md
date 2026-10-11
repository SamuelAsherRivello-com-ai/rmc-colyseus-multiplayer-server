## Purpose

Provide isolated four-seat participant-hosted invasion sessions with bounded recovery, ordered input and compatible shared-client delivery.

## ADDED Requirements

### Requirement: Private four-seat recovery
The server SHALL admit isolated four-seat coded rooms and recover a seat only
with its private token, preserving stable gameplay identity.

#### Scenario: Fifth newcomer
- **WHEN** four identities occupy or reserve seats
- **THEN** a fifth newcomer is rejected without creating an overflow room

#### Scenario: Returning participant
- **WHEN** a valid private token is presented after leaving
- **THEN** its existing seat is restored and any old socket is detached

### Requirement: Fenced host state transfer
The relay SHALL order membership and inputs, retain bounded host-only
checkpoints, and fence publication with an epoch and readiness handshake.

#### Scenario: Host departure
- **WHEN** the host disconnects or misses three seconds of heartbeats
- **THEN** the next active participant receives the checkpoint and journal in
  a new epoch and may resume after readiness

#### Scenario: Stale or malicious state
- **WHEN** a guest, stale host, oversized frame or invalid acknowledgement arrives
- **THEN** it cannot replace the committed checkpoint

### Requirement: Compatibility and verified deployment
The release SHALL retain existing games and verify a four-minute game session
on the existing public Vercel route before promotion.

#### Scenario: Staged deployment
- **WHEN** the release is staged
- **THEN** game integrations and the game-specific duration probe pass before
  production promotion
