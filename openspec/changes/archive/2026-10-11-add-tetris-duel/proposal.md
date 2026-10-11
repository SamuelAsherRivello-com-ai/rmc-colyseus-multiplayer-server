# Proposal

## Why

Support the requested hidden-board Tetris duel through the existing RMC relay and free Vercel deployment. Competitive placement and attacks need authoritative rules and recipient-specific state rather than the rabbits relay's full participant-host snapshots.

## What Changes

- Add an isolated two-seat private `tetris-duel` room, deterministic browser-safe rules, sequenced inputs, private projections, and bounded authenticated recovery.
- Export shared rules additively and preserve all other games and client APIs.
- Reuse configured Vercel credentials, staging, probes, promotion and rollback; add a Tetris two-client public test and document process-local expiry without an external store or paid host.
- Register the consumer in both README catalogs and the game registry, replacing in-development entries with its verified public Pages URL after client delivery.

## Capabilities

### New Capabilities

- `tetris-duels`: Private timed aim-and-release duels, authoritative garbage/outcomes, bounded recovery and additive relay delivery.

### Modified Capabilities

None. This is not the unrelated durable cross-instance migration and does not mark that change complete.

## Impact

Implementation in multiplayer-server/src and packages/client; tests in multiplayer-server/test; scoped registry/docs and deployment-probe additions. Existing free Vercel endpoint and release artifact names remain intact. No new dependency or external provider is required.
