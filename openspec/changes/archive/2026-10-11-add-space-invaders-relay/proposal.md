## Why

The cooperative Space Invaders consumer needs a private four-seat relay while
the elected browser simulates its world. Existing Rabbits and private-game
contracts must remain compatible.

## What Changes

- Add an isolated private-code room with private token recovery, host epochs,
  readiness, ordered inputs/membership and bounded checkpoint/action journal.
- Extend the shared client additively with opt-in heartbeat and relay events.
- Test local and deployed admission, migration, packaging and four-minute sessions.

## Capabilities

### New Capabilities
- `space-invaders-relay`: Private participant-hosted four-seat sessions.

### Modified Capabilities

None. Active Rabbits and private hosting changes retain their original contracts.

## Impact

Server registry/admission, new room, shared client, protocol documentation,
integration tests and existing release/deploy workflows. No gameplay simulation
or new hosting provider runs on the backend.
