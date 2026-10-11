# Tetris duel relay

`tetris-duel` is a private, two-seat server-authoritative room on the existing free Vercel relay. Create with `new MultiplayerClient(endpoint, 'tetris-duel', {create:true, code:suggestRoomCode()})`; join with `{code}`. Share `buildRoomLink(state.code)`. Ready and rematch use `{ready:true}` and both participants must agree. Countdown lasts three seconds.

Import `cells`, `aim`, `landing`, `COLORS` and dimensions from `@rmc/multiplayer-client/tetris-duel` for local presentation/prediction. `state.gameState` contains protocolVersion, epoch, revision, serverTime (simulation milliseconds), phase, paused, startsAt, winner (seat or null), own, opponent. Own includes a 24x10 board (four hidden rows), piece, next-five queue, ack, lines, placements, recoveryRemaining and incoming warnings. Opponent contains only identity, color, connection/readiness, settled height, current aim or null, and out. Never request or render an opponent board or landing ghost.

Send `input` with `{protocolVersion:1,epoch,pieceId,seq,action}`. Actions are left/right/cw/ccw/commit. Sequences are increasing safe integers; epochs and piece IDs must match. The room rejects stale, forged or excessive input (60 messages/second). Deadlines use receipt-time server authority, not a browser timestamp. Aiming lasts at most five seconds; commitment freezes the piece for a 200ms straight fall. The next piece starts independently after resolution. The local client can compute its own ghost from the same first-collision routine; no steering after commit.

Seven-bag streams start identically and are consumed independently. Rotation occurs above the well with horizontal offsets 0,-1,+1,-2,+2; no hold/soft-drop/continuous gravity. One/two/three/four-line clears attack with 0/1/2/4 rows. Each outgoing row cancels one oldest incoming row before remaining attack is sent. Simultaneous attacks cancel each other. Packets mature after 1000ms but insert only at a receiving placement boundary, after that placement's cancellation. Each packet shares one hidden random gap. Hidden occupancy, blocked entry or upward overflow tops out; same-tick double top-out draws.

The shared client enables SDK recovery and stores only its own refresh token in sessionStorage scoped by endpoint/game/code. A code cannot claim a reserved seat. Refresh rotates its credential. Connection loss pauses both clocks for at most 15 seconds cumulative per seat per match. Exhaustion forfeits to a connected opponent; both offline aborts. Explicit leave forfeits immediately. Settings/blur do not pause healthy online play.

Rooms are process-local. Free Vercel may terminate sockets around the Function duration limit or route a new connection elsewhere. This release promises supported same-process recovery, not durable cross-instance restoration. Room loss must show expiry and offer a new lobby; it must never silently invent a restored match. Deployment retains the existing staged verification, 240-second relay probe, promotion and rollback, with Tetris's real two-client integration included before promotion.

Verify from repository root using Node 24:

```sh
node --import tsx --test multiplayer-server/test/tetris-duel-rules.ts
node --import tsx --test multiplayer-server/test/tetris-duel-integration.ts
```

Set `SERVER_URL` for the integration test against a staged/public backend. Tests cover private admission/capacity, readiness, aim/commit, invalid commands, SDK and token recovery, token rotation, paused clocks, reserved-seat protection, top-out/rematch, privacy and recovery-budget forfeit. Local execution additionally tests process replacement. The consumer remains in development until its actual Pages duel is verified and the live-demo catalogs are updated.
