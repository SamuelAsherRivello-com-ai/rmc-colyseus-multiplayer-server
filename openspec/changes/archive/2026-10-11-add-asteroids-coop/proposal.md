## Why
Asteroids requires a player-hosted cooperative world with four coded seats, hot guest membership, personal lives and spectators. Existing participant-host rooms migrate authority, conflicting with terminal host loss. The consumer change is `create-hosted-asteroids-coop` in the sibling `babylon-lite-asteroids-multiplayer-clone` planning root.

## What Changes
- Add browser-safe deterministic Asteroids rules and an additive client export.
- Add isolated fixed-host coded admission, bounded inputs/snapshots and opaque guest recovery tokens separate from public identities.
- Preserve all existing game protocols and unrelated changes.
- Verify sustained hosting before releasing and consuming the package; no bounded-session substitution or paid hosting.

## Capabilities
### New Capabilities
- `asteroids-coop`: fixed-host cooperative game rules and room protocol.
### Modified Capabilities
None. Shared hosting prerequisites remain tracked explicitly and do not change existing consumer behavior silently.

## Impact
Server registry/admission, new room, browser-safe client modules, integration tests, package exports, game catalog and release/live probes. Production delivery remains gated by ten-minute cross-window continuity evidence.
