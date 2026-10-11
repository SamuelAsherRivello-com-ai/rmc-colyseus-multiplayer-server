# Combat protocol and rules v1

Combat Clone has four stable slots (0–3), 1–4 connected humans, and server CPU fill. Bots are independent controllers, not human seats. Create/join uses `POST /api/join/combat` with `{create:true,code?}` or `{code}`; four A–Z/0–9 characters, capacity four. The oldest connected human is host. Only the host may send `options: {arena,mode,difficulty}` in lobby/results. Any settings change clears readiness. All connected humans ready with `ready` (`rematch` is an alias); bots never gate the three-second countdown.

## Authority and snapshots

Send `input: {seq,drive,turn,fire}`: increasing safe integer sequence 0..2147483647; drive/turn each -1,0,1; fire boolean. No client positions, scores, damage, hit claims or reset authority. Maximum 90 messages/session/second including control and snapshot requests. Controls expire after 300 ms of simulation time; disconnect clears controls immediately.

Snapshots arrive as `gameState` at 20 Hz and on explicit `snapshot` request as `snapshot.gameState`. Fields: `protocol:1`, `rules:1`, code, hostId, phase, mode, arena, difficulty, tick, serverTime (simulation seconds), match, remaining, countdown, winners, people, tanks, shells, events. Tanks have stable slot, continuous x/y pixels, angle radians, score, dead/protection/cooldown seconds, ack sequence, ackTick and cpu. People include id, slot, connected, ready, waiting, ack. Shells include id, owner slot, input seq, x/y/vx/vy, bounces and remaining life. Events have monotonic id, tick and type; retain last 48 for cosmetic deduplication. Clients predict movement using the identical shared `./combat` rules and acknowledge replay boundaries with ackTick. Outcomes come exclusively from snapshots.

## Tuning (original adaptation)

Bounds 320×240; fixed 60 Hz; tank radius 6 px; forward 47 px/s, reverse 32 px/s, turning 2.7 rad/s. Shell speed 134 px/s, radius 1.5 px, cooldown 0.48 s, cap 3 per owner, lifetime 4 s. Classic shells stop on cover. Ricochet permits 3 reflections then expires at the next contact. Simultaneous corner axes reflect together; contacts and work are bounded. Collision uses swept segments, preventing fast-shell tunneling. Tanks collide with each other and solid rectangles. Open Yard, Crossroads and Switchback are original layouts with four spawn points and a finite clearance-navigation graph.

One hit destroys. Respawn after 0.6 s selects an unoccupied spawn or clearance cell far from living tanks. Protection lasts 1 s, consumes incoming shells, and ends immediately on firing. Destruction clears owned shells AFTER accepted impacts in that tick. Mutual destruction can score both opponents. Multiple hits on one victim attribute earliest impact, then lowest projectile id. Owner immunity ends after first reflection. Opponent destruction +1; reflected self-hit -1 clamped at zero, nobody else credited. Active clock 136 s; final-tick impacts score before results. Unique highest scorer wins, tied leaders draw. Results freeze; all humans ready to reset scores/shots/controls/tanks/timer and admit waiting players.

## CPU decisions and bounds

Every CPU uses the same movement, fire and collision path as humans, with equal stats. Low observes every 0.5 s with larger aim error; Medium every 0.22 s with threat avoidance; High every 0.12 s with earlier threat avoidance and bounded bank-shot evaluation in Ricochet. Each brain has an independent seeded generator. Between observations it steers toward its cached aim using its own current pose. No future inputs or hidden state. Navigation searches at most the 20×15 clearance grid; High tests at most 25 current-state shot paths of 40 segments. Stuck detection reverses and turns. These are decision budgets, not physical upgrades.

## Human lifecycle and hosting limits

Joining during countdown/play reserves an unoccupied human slot but waits until next match. CPU continues that tank. Drop immediately enables CPU for the same slot, preserving state. Only the same SDK session recovers its seat within 15 s; fresh code joins never replace protected reservations. Recovery expiry removes the human reservation. Voluntary leave releases it immediately. Zero connected humans suspend simulation; empty/recovery cleanup disposes after bounded grace. Focus loss/menu must send neutral controls; it does not pause others.

The Vercel backend has temporary process-local rooms. Process replacement, routing and socket-age limits can end games and lose scores. Recovery is best effort on the same owning instance, with no datastore, persistent room ownership or cross-instance promise. Combat code lookups retry a transient 404 up to three times (150/350/700 ms); create, full and invalid requests do not retry. This improves best-effort Hobby routing without promising cross-instance recovery. Socket attachment retries the same reservation up to three times instead of re-admitting a second human seat. Each attempt detects close-before-join, has a three-second handshake deadline, and closes failed sockets; leaving aborts a pending attempt. Exhausted attachment reports an actionable error. A genuinely absent room still returns an error after the bounded attempts.

Source: [shared rules](../packages/client/combat-rules.ts), [authoritative simulation](../src/combat-simulation.ts), [room lifecycle](../src/combat-room.ts), [admission](../src/server.ts).

## Verification

Run Node 24 `node --import tsx --test multiplayer-server/test/combat-rules.ts` and `node --import tsx --test multiplayer-server/test/combat-integration.ts`. Setting `SERVER_URL` runs integration against real public sockets, including protected recovery, control acknowledgement, firing, private-code isolation and fifth-human rejection. These probes are included in staged all-game tests and explicitly repeated on stable deployment.
