# Racing verification

2026-09-30: Node 24.19.0 regression suite passed all 23 tests. TypeScript typecheck passed, and the then-current OpenSpec records validated. Seven racing rule tests cover readiness/capacity, bounded and stale inputs, ordered directional lap gates, safe recovery, contested pickups, full AI race/replay and hard timeout. Racing integration covers independent clients, readiness authority, frozen grid, late arrivals, synchronized motion, forged input, fifth-player rejection, drawing isolation, AI departure substitution, explicit full-room retry and fresh reconnect.

Released backend and shared client: [v0.6.0](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/tag/v0.6.0). [Release run 36695393931](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/36695393931) passed release, deployment, and live regression jobs. The public `/api/health` endpoint returned version 0.6.0 and registered `dust-circuit-rally`. Local checkout was fast-forwarded to release commit `269e6c8`.

Exact client artifact: `https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/download/v0.6.0/rmc-multiplayer-client-0.6.0.tgz`. Browser gameplay and Blender asset checks remain tracked in the consumer project; they are not implied by server verification.
