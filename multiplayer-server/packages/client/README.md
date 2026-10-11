# RMC Multiplayer Client

## Coded private room workflow

Multiplayer games with private rooms should use the same entry flow: show **Play Online** on the title screen, then show an editable four-character A–Z/0–9 room code beside **Join Room** and **Create Room**. Pre-fill the code with `suggestRoomCode()` so Create Room works immediately; users may replace it with a code they agreed to share. Creating a room returns its normalized code in `state.code`. Use `buildRoomLink(code)` for a shareable URL and `readRoomCode()` on startup; when a URL contains `?room=CODE`, automatically join that room. Joining a code through a refresh creates a fresh anonymous identity and takes the oldest disconnected seat when one is available. Call `disconnect()` for an intentional in-game leave; let the browser close the connection on refresh so the room can preserve the seat for code-based recovery.

The server generates and validates codes in [`private-room-codes.ts`](../../src/private-room-codes.ts), admits them through [`server.ts`](../../src/server.ts), and applies recovery in [`private-code-room.ts`](../../src/private-code-room.ts). A room and its code remain available while a player is connected or recovering; after the last player leaves, an empty room remains available for 15 seconds so a refresh can rejoin it with a fresh identity. A server process restart ends rooms. See the matching root README [Custom Shared Features row](../../../README.md#custom-shared-features).

## Tetris Multiplayer Clone (0.9.12+)

Use `tetris-duel` for private two-seat play and import browser-safe rules from `@rmc/multiplayer-client/tetris-duel`. This game requires authenticated recovery rather than the generic room-code replacement above. See the [Tetris rules, private projection, input protocol and free Vercel limits](../../documentation/tetris-duel.md).

## Street Fighter II Clone (0.9.4 target)

Create `new MultiplayerClient(endpoint, "street-fighter-ii", { create: true, code: suggestedCode })` to host a private duel, or pass `{ code: "AB12" }` to join. The creator receives the normalized four-character `state.code`; share that code or the page URL with `?room=AB12`. Capacity is exactly two. The server returns each seat a private reconnect token and the shared client retries it automatically for 15 seconds. A successful reconnect keeps the same fighter seat and match state. Tokens and rooms live in memory; a process restart ends the invite.

Send `select` with `{ fighter: "ryu" | "chunLi" | "kaida" }` and `ready` with `{ ready: boolean }` in the lobby. The fight starts after both seats are connected and ready. `gameState` includes `phase`, `stage` (`dojo`, `harbor`, or `snow`), `countdown`, `reconnectRemaining`, `round`, `time`, `wins`, `winner`, `players`, `fighters`, and `event`. The stage is selected deterministically from the private invite code, so every client in a room shows the same authored backdrop. Each fighter snapshot exposes authoritative position, facing, health, current attack, stun, block and animation fields. The server simulates combat at 60 Hz and publishes full snapshots at 20 Hz. Clients can render fighter positions between snapshots with a small interpolation buffer; server values remain authoritative for combat and results. Send `input` at up to 20 Hz with a strictly increasing nonnegative safe integer `seq`, booleans `away`, `toward`, `up`, `down`, `jump`, and `punch`/`kick` as `false`, `light`, `medium`, or `heavy`. Inputs expire after 300 ms. Client positions, health, and results are never accepted. `rematch` with `{ ready: true }` restarts the best-of-three when both players agree. Local pause should send neutral input; it does not pause the shared duel.

The shared combat rules and fighter data are also importable from `@rmc/multiplayer-client/street-fighter` for displays and offline tools; only server snapshots are authoritative online. Existing game keys and the two-argument `MultiplayerClient` API remain compatible.

## Dust Circuit Rally (0.7.0)

Use `new MultiplayerClient(endpoint, 'dust-circuit-rally')`. Read `state.gameState`: `phase`, `round`, `time`, `raceTime`, `remaining`, `countdown`, `people`, `trucks`, `pickups`, `ranking` and `event`.

Send `ready` with a boolean during waiting. `start` is accepted only from the lowest active human seat when all present humans are ready. The grid freezes at countdown. Late arrivals wait until the next race. Results last eight seconds, then everyone readies again.

Send `input` at 20Hz with `{seq, steer, throttle, brake, boost, recover}`. Sequence is a nonnegative increasing safe integer, steering is finite [-1,1], throttle finite [0,1], remaining controls boolean. Inputs expire after 300ms. Truck `ack` acknowledges the accepted sequence. No client positions, lap counts, pickup claims or finish results are authoritative. Send neutral controls on blur, pause menu or pointer cancellation. Shared racing continues during a local online pause.

Trucks expose identity/number/color, AI flag, position x/y/z, angle, planar velocity, vertical velocity, grounded state, nitro seconds, traction seconds, lap count, next gate, checkpoint count, finish time or null, and recovery penalty. Three laps win; a 15-second finishing window follows the first finisher, with a 120-second hard cap. Recovery costs 1.25 seconds and cannot advance checkpoints. Nitro refills add 1.5 seconds up to five; traction lasts five seconds and refreshes; pickup respawn is eight seconds.

Additive imports: `RacingSimulation`, `driveTruck`, `aiInput`, `NEUTRAL` from `@rmc/multiplayer-client/racing`; track metadata and geometry from `@rmc/multiplayer-client/racing-track`. Server and browser use identical core rules and track version 1. Existing root imports remain compatible.

Capacity includes waiting humans. Departure substitutes AI for that race; reconnect is a new participant and cannot reclaim a truck or score. Hosting interruption resets in-memory state; no accounts, private codes or persistence. Target release package is 0.7.0; pin the verified release asset rather than a development checkout.

Install the exact GitHub Release tarball URL and commit the lockfile.

```js
import { MultiplayerClient } from "@rmc/multiplayer-client";
const session = new MultiplayerClient(import.meta.env.VITE_MULTIPLAYER_SERVER, "multiplayer-draw");
const unsubscribe = session.subscribe((state, event) => render(state, event));
session.connect();
// On teardown: unsubscribe(); session.disconnect();
```

State exposes connection status, sessionId, roomId, players, capacity, error, and a Map of strokes.
Messages: cursor ([x,y] or null), stroke ({id, offset, points, complete}), erase (server stroke ID).
Coordinates are normalized in [0,1]. Stroke batches contain at most 64 points.
On disconnect the state clears and automatic retry creates a fresh identity by default. Bomberman and Ring Rivals explicitly enable SDK seat recovery; other games keep their existing behavior. Full rooms require explicit connect() retry.
Do not put credentials in frontend configuration. Persistent-user-rejoins is deferred.

## Live Demos

This package is part of **RMC Colyseus Multiplayer Server**, which has no standalone demo. These consuming projects use the shared service:

- [**Asteroids Multiplayer Clone**](https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/) — fixed-host 1–4-player cooperative asteroid waves, three personal lives, hot joining and spectators.
- [**Bomberman Clone**](https://samuelasherrivello.github.io/babylon-lite-bomberman-clone/) — private competitive bomb arena with optional growing plants that block movement.
- **Combat Clone** — four-tank free-for-all with 1–4 humans, fair CPU fill and Classic/Ricochet shots. (In development.)
- [**Dust Circuit Rally**](https://samuelasherrivello.github.io/babylon-lite-super-offroad-clone/) — race four off-road trucks in a fixed-camera landscape circuit with solo, local and online modes.
- [**Enter the Gungeon Clone**](https://samuelasherrivello.github.io/babylon-lite-enter-the-gungeon-clone/) — survive bullet waves together in private 1–4-player rooms with dodge rolls, upgrades and revives.
- [**Garden Chat**](https://samuelasherrivello.github.io/babylon-lite-garden-chat/) — wander a shared garden and chat with other visitors.
- [**Gauntlet Clone 2D**](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-2d/) — cooperate to battle monsters, revive allies, and escape a tile-based dungeon.
- [**Gauntlet Clone 3D**](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-3d/) — team up to destroy summoning altars and escape a 3D dungeon.
- **Just Like Rabbits** — shared rabbit observation habitat with participant-host migration. (In development.)
- [**Multiplayer Draw**](https://samuelasherrivello.github.io/babylon-lite-multiplayer-draw/) — a shared drawing canvas with hot join and departure cleanup.
- [**Music Maker Multiplayer**](https://samuelasherrivello.github.io/babylon-lite-music-maker-multiplayer/) — four-player host-simulated music sandbox with next-step local and three-second remote sounds.
- [**Neon Breaker Duo**](https://samuelasherrivello.github.io/babylon-lite-arkanoid-clone/) — co-operate to clear a neon brick field together. (In development.)
- [**Ring Rivals**](https://samuelasherrivello.github.io/babylon-lite-ring-rivals/) — fight private online 1v1 boxing bouts from mirrored opponent-focused views. (In development.)
- [**Space Invaders**](https://samuelasherrivello.github.io/babylon-lite-space-invaders-clone/) — Cooperative participant-hosted alien waves for one to four players, with personal lives, spectators and host migration.
- [**Street Fighter II Clone**](https://samuelasherrivello.github.io/babylon-lite-street-fighter-clone/) — private server-authoritative arcade duels with bounded same-seat recovery. (In development.)
- [**Sumo Battle**](https://samuelasherrivello.github.io/babylon-lite-sumo-battle/) — push opponents out of the ring in an online sumo arena.
- [**Tetris Multiplayer Clone**](https://samuelasherrivello.github.io/babylon-lite-tetris-multiplayer-clone/) — hidden-board timed aim-and-release duel with private opponent hints and garbage attacks.

See the [server README](../../../README.md) for setup and the [game registry](../../documentation/games.md) for supported consumers.

## Sumo Battle (shared client 0.2.0)

Create `new MultiplayerClient(endpoint, "sumo-battle")`. Subscribe to `state.gameState` (also present in the initial snapshot) and `gameState` events. Send `input` with `{x, z, dash}` at 20Hz. Axes must be finite in [-1,1]; dash is boolean. The server normalizes movement, applies a 1.5s dash cooldown and expires input after 300ms. Send zero input on blur, local pause and pointer cancellation. Never send positions or scores.

`gameState` contains `match`, simulation `time`, `radius`, `winner` (session ID or null), `restartIn`, `event` ({serial,text}), and `wrestlers`. Wrestlers expose id/number/name/color, bot, x/z, vx/vz, angle, score, cooldown, out (respawn seconds), and shield (spawn grace seconds). The server awards one point to a recent collision opponent when a wrestler exits, and declares the first to three champion. After eight seconds it resets scores for the next match. There is no client reset command. A single human gets a labeled server AI opponent; it is removed when a second human joins. Late joiners receive current state and zero score. Refresh/reconnect loses identity and score. Local pause does not pause opponents. Hosting and deployment can reset matches.

Generic game state clears on connect, connection loss, and disconnect. Existing drawing messages and stroke state remain compatible.

## Just Like Rabbits (next shared-client release)

Use `new MultiplayerClient(endpoint, "just-like-rabbits")`. Capacity is twelve. `state.players` exposes the server-assigned fictional `name`, `number`, `color`, `cursor`, and `host` flag. Cursors are normalized `[x,y]` coordinates in `[0,1]` or `null`; names belong in the roster, not beside cursors. `state.hostId` identifies the elected longest-connected active participant.

Any participant can send `action` with `{type:"cue",payload:[x,y]}`, `{type:"plant"|"water",payload:{x,z}}`, or `{type:"speed",payload:0.5|1|2|4|10}`. The relay orders valid requests as `habitatAction`; only the elected host resolves them. The host sends `{state,random,clock}` as `hostSnapshot`; guests receive `gameState` plus `hostTransfer` and must interpolate presentation rather than run authority. The client sends liveness heartbeats automatically. Local pause does not pause the shared habitat.

The room and identities are in-memory: a process replacement ends the session. Pin the exact client release after its compatible backend deployment and public two-client verification. Existing game consumers do not need changes for an additive game release unless a compatibility check identifies an actual contract change.
## Garden Chat
Use game key `garden-chat`. Send `move` with `{x,z}` normalized axes (refresh within 300ms), or `chat` with a plain string up to 280 characters. State exposes `players` with x/z and `chats` with the latest 100 messages. Events: garden, chat, snapshot, presence, departed. Chat rate: one per 750ms. History is in-memory and resets when the room closes. Local pause must send zero movement.

## Gauntlet 3D (0.5.0)

Use game key `gauntlet-3d`. Send `input` at 20Hz with `{x,z,attack,magic}`: finite axes in [-1,1], boolean actions. Inputs expire after 300ms. `class` accepts `warrior`, `valkyrie`, `wizard`, `elf`; switching preserves health fraction, cooldowns, position and identity. Auto-aim selects the closest visible enemy or altar; without a target shots follow facing. `restart` is accepted only from the lowest active seat after victory/defeat. No client position, health or score authority. Rate limit 60 messages/second.

`state.gameState` contains level rows (# wall, . floor), players, enemies, generators, pickups, shots, blasts, exit, key, phase, time, match and event. x/z are tile coordinates; rows are z. Classes have distinct speed, health, damage and cooldown. Local pause sends zero input; the shared game continues. Full rooms need explicit retry. Reconnect creates a fresh identity. Key belongs to the team. Victory requires four destroyed altars and reaching the exit with the key; all fallen means defeat. Live tests require an otherwise empty Gauntlet room.



## Gauntlet 2D

Use game key `gauntlet-2d` with the released shared client. Send `input` at 20 Hz: `{x,y,ax,ay,attack}`; four axes must be finite within [-1,1], attack boolean. Zero aim uses nearest visible target. Input expires after 300 ms; send zeros on blur/pause/cancel. Send `select` with `warrior`, `valkyrie`, `wizard` or `elf`. Switching never restores health or cooldown. No client positions, damage, keys or reset commands are accepted.

`gameState` includes round, time, map, players (id, number, name, color, hero, x, y, hp, cooldown, shield, revive, facing, kills), enemies, generators, shots, items, keys, treasure, status, restartIn, event and exit. The entire snapshot is current for late join. Capacity is four; a fifth receives full status. All dead means defeat; two keys and all four destroyed generators unlock the exit. Victory or defeat automatically replays after ten seconds. Local pause does not stop the shared world. Stand near a downed ally for 2.5 seconds to revive. Reconnect is a fresh player; no persistent progress. No existing drawing, sumo or garden protocol changes.

## Enter the Gungeon Clone (0.7.0)

Use `new MultiplayerClient(endpoint, "gungeon", {create:true})` to create a private room, or `{code:"AB12"}` to join an existing four-character code. `state.code` holds the assigned code. Retry uses the same code; an expired or invalid code produces `error` status. Capacity four, including the creator. The existing two-argument API is unchanged.

Send `weapon`: `pistol`, `scatter`, `carbine` in the lobby; `ready` toggles readiness and the run starts when all connected lobby players are ready. Hot joins during a run enter with full health and three seconds of protection. Send `input` at 20Hz: `{x,y,ax,ay,shoot,roll}` with finite axes within [-1,1] and boolean actions. Inputs expire after 300ms; local pause/blur must zero input. Server owns position, damage, bullets, enemy AI, loot, revives and progression. Friendly fire is disabled. `upgrade` accepts `damage`, `haste`, `vitality`, `agility` during the ten-second break and spends one personal choice earned by the whole team. Stand within 1.35 units of a downed ally for two seconds to revive. `restart` is accepted only from the lowest connected seat after defeat.

`gameState` exposes code, phase (lobby/combat/break/defeat), wave, round, time, breakIn, width/height, cover, props, players, enemies, shots, loot and event. Player state includes hp/maxHp, weapon, ready, shield, rolling, rollCooldown, revive, damage/haste/speed, credits and kills. Enemy shots are marked `enemy:true`. Boss every fifth wave. Snapshots are full state for hot joins. All-dead ends the run. A dropped player's input is neutralized while its game state remains reserved; a room-code rejoin transfers that state to a fresh identity. The room disposes after its final player leaves or its empty recovery grace expires. Runs are in memory and do not survive a process restart.

## Neon Breaker Duo (shared client 0.9.3+)

Create `new MultiplayerClient(endpoint, "neon-breaker-duo")`. Capacity is two; the first player owns the lower paddle and the second owns the upper paddle. Both can move over the full board width and overlap. Send `input` at 20 Hz with `{x}` where `x` is a finite normalized full-board coordinate in `[0,1]`; send `launch` to launch a waiting ball and `restart` after the shared outcome. The server bounds each paddle at the board edges, validates messages and rate limits clients to 60 messages per second. Send neutral input on blur, local pause and pointer cancellation; local pause never pauses the shared match.

`state.gameState` and `gameState` events expose `{width,height,wave,waves,score,lives,outcome,time,paddles,balls,bricks,drops,effects}`. Each paddle snapshot includes its authoritative `seat`, `x`, `target`, `y`, and `width`; Player 1's y is 490 and Player 2's y is 440 on the 320×576 board. The full snapshot is sent on join. Normal bricks award 10; reinforced bricks award 25. Three shared lives span three waves. Wide paddles last eight seconds; multiball is capped at three. A full room requires explicit retry. Disconnect frees and centers a paddle horizontally while retaining its assigned y; rejoining uses a fresh anonymous identity. Rooms are ephemeral and may reset when empty or during deployment. There are no accounts or durable scores.
`state.gameState` and `gameState` events expose `{width,height,wave,waves,score,lives,outcome,time,paddles,balls,bricks,drops,effects}`. The full snapshot is sent on join. Normal bricks award 10; reinforced bricks award 25. Three shared lives span three waves. Wide paddles last eight seconds; multiball is capped at three. A full room requires explicit retry. Disconnect frees and centers its lane; rejoining uses a fresh anonymous identity. Rooms are ephemeral and may reset when empty or during deployment. There are no accounts or durable scores.
## Bomberman Clone (sessions 0.9.2+, complete match rules 0.9.4+)

Use game key `bomberman` with `{create:true}` or `{code:'AB1234'}`. The server generates six-character Bomberman codes for compatibility with the published client and also accepts four-character codes from recent clients. Capacity is four including reserved recovery seats. Send `ready` to toggle readiness; at least two connected players must ready before the three-second countdown. Send `color` with an unoccupied integer 0–3 in lobby. Late arrivals spectate until the next round.

Send input at 20Hz `{seq,x,y,bomb}`: increasing nonnegative safe integer sequence, finite axes within [-1,1], boolean bomb. Movement expires after 300ms. Server owns collision, bomb fuse/capacity, blasts, chain reactions, block destruction, elimination and outcomes. `gameState` exposes phase, code, round, serverTick, remaining, winner, people, board, bombs, blasts and players; each player includes ack. Additive `@rmc/multiplayer-client/bomberman` export provides identical arena rules for prediction.

Version 0.9.4 adds `match`, `matchWinner`, exposed `powerups`, imminent `warnings` and `closed` sudden-death tiles. Players expose `capacity`, `range`, `speed` and `speedLevel`; unrevealed items and future wall schedules are not sent. Pickups cap capacity at five, range at eight and speed at three 15% upgrades. Hidden items appear after all overlapping blasts clear; later blasts destroy them. Server ticks use fixed 60Hz steps accumulated from monotonic elapsed time, rather than assuming each timer callback arrives on time. Interpolate remote timestamped snapshots; predict only local movement and reconcile acknowledgements.

Phases are `lobby`, `countdown`, `playing`, `results` and `matchResults`. Rounds last at most two minutes; inward walls warn one second before closure during the final thirty seconds. Same-tick final eliminations draw without points. A surviving winner receives one point, with three-second score breaks and three-second next-round countdowns. First to three reaches `matchResults`; send `rematch` to toggle readiness there. All connected players must ready before a fresh match resets scores, arena, upgrades and inputs. Fewer than two connected players return to lobby after the current round resolves. Late arrivals spectate until the next round.

Bomberman and Ring Rivals enable SDK recovery: unconsented drops can recover the same session automatically for 15 seconds. A room-code join creates a fresh identity and may claim the vacant seat for as long as another player keeps the room active on the same instance. A solo room remains available through its 15-second empty-room recovery grace while that instance remains available. Process restarts or routing to another instance can end in-memory rooms. The checked-in release workflow targets the existing Vercel URL; cross-instance room continuity remains a future gate in `standardize-private-room-flow`.

## Ring Rivals (0.9.3 target)

Create a private room with `new MultiplayerClient(endpoint, "ring-rivals", { create: true })`; join with `{ code: "AB12" }`. `state.code` contains the four-character invite code. Capacity is two. Select `rook` or `flash` using `select` with `{ boxer }`, then send `ready`. Both players may select the same boxer.

Send sequenced `input` messages with `{ action, sequence }`; actions are `jab-head`, `cross-head`, `jab-body`, `cross-body`, `guard-high`, `guard-low`, `dodge-left`, `dodge-right`, and `neutral`. Sequence must be a strictly increasing safe integer. The server owns move timing, guard/evasion checks, health, stamina, round clock, score and outcomes. Neutralize input on blur and pointer cancellation; clients never send positions or damage.

`gameState` snapshots include `timestamp`, `tick`, `phase`, `round`, `roundSeconds`, `countdown`, `rounds`, `winner`, `result`, and two seat-ordered fighters with boxer, connection, health, stamina, action, animation frame, evasion offset, and hit flash. Updates run at 20 Hz; the server simulation runs at 30 Hz. Use the timestamped snapshots for smooth remote interpolation and reconcile local movement prediction to authority.

Matches are best of three, with 60-second rounds, knockout and health decisions, drawn exact-health rounds, and a drawn match after three rounds when the score is tied. A dropped player's input stops and the round clock pauses. The same client can recover its identity automatically for 15 seconds; a room-code join can claim the seat with a fresh identity while the room remains active. Rooms are in memory and deployments can interrupt a match.

## Music Maker Multiplayer

Create `new MultiplayerClient(endpoint, "music-maker", {create:true})` or join with `{code:"AB12"}`. Four players; `state.hostId` owns simulation. Subscribe to `musicIntent`, `musicClockRequest`, `musicClockReply`, `musicCommit`, `musicSnapshotRequest`, `musicSnapshot`, `musicRejected`, and `musicEnded`; payload is `state.musicMessage`. Use `send(type,payload)`. A host sends commits `{epoch,sequence,origin,step,sound,deadline}`; sound is kick/snare/hat/tone. Intents contain epoch/sequence/step/sound and receive a relay-stamped origin. Clock requests contain request/sent and receive origin; host replies with target/request/sent/received/hostNow/start/epoch. Snapshots contain target/epoch/start/hostNow/sequence/events, at most 112 pending events and 14 KiB encoded. Guest messages are bounded at 32/s; host output aggregation at 128/s. Heartbeats run every five seconds. Host loss emits musicEnded and ends the session, without retrying into a new room. Origins play at the source deadline, all other listeners at deadline+3000 ms. Browser host is authoritative; relay never creates beats.

Published in v0.9.13. Pass `https://rmc-music-maker.vercel.app` as the endpoint. The creator's reserved identity owns host authority and seat 1 even if another socket arrives first. Music opts into bounded missing-room and same-reservation socket retries; unexpected host loss remains terminal. The browser client coordinates planned transport renewal while retaining epoch and original event deadlines. See the game's README for measured duration and timing evidence.

## Combat Clone

Use `new MultiplayerClient(endpoint, "combat", {create:true,code:suggestRoomCode()})`, or `{code}` to join. Import `ARENAS`, `TUNING` and `moveTank` from `@rmc/multiplayer-client/combat` for browser-safe local prediction. See the [complete protocol](../../documentation/combat.md).

Combat differs from the generic code-rejoin guidance above: only SDK recovery preserves a protected seat for 15 seconds. A fresh room-code join cannot steal a recovering seat and is a new anonymous participant. Midmatch arrivals wait until the next match. Every match retains four slots with CPU fill. The existing Vercel endpoint is best effort and process-local; an expired room requires recreation and scores may be lost.

## Asteroids Multiplayer Clone (v0.9.12+)

Import the additive Asteroids rules and connection APIs. See the [Asteroids authority, recovery, tuning and hosting contract](../../documentation/asteroids.md). Public player IDs are distinct from private recovery tokens; guest hot drop frees a seat while the host retains personal lives. Host loss is terminal. Published in v0.9.12 after 154 source tests and ten-minute public continuity with four planned renewals. Pass `https://rmc-asteroids-coop.vercel.app` to `connectAsteroids`, imported from `@rmc/multiplayer-client/asteroids-connection`; import shared rules from `@rmc/multiplayer-client/asteroids`. The dedicated endpoint uses Vercel Hobby and preserves the original shared endpoint for existing games. The [published game](https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/) pins the verified v0.9.12 tarball.

## Space Invaders (v0.9.12+)

Create `new MultiplayerClient(endpoint, "space-invaders", {create:true})`, or join with `{code:"AB12", reconnectToken}`. Use `subscribe(listener)`, `connect()`, `send(type,value)` and `disconnect()` from the main export. Install the exact release tarball, rather than the source checkout: `npm install https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/download/v<VERSION>/rmc-multiplayer-client-<VERSION>.tgz`, replacing VERSION with the verified published version.

`state.seat` is a stable public gameplay identity; `state.sessionId` is the current socket. Keep the private `state.reconnectToken` separately per room, never in invitation URLs. Returns retain their life record. Departures free occupancy; drops reserve it for fifteen seconds. Four occupied seats include spectators. Room-code lookup retries three transient 404 responses over a bounded 1.05-second backoff before reporting an expired room; it never creates a replacement room.

Subscribe to `gameAction`, `hostTransfer`, `presence`, `snapshot`, `gameState`, `recoveryError` and `status`. Authority state includes `hostId`, `epoch`, `runId`, `ready`, `transfer` and `journal`. Send sequenced `action` messages containing `{epoch,runId,sequence,type,payload}`. Inputs use `{move:-1|0|1,fire:boolean}`; only the host may send `start`. The relay stamps the sender and contiguous global action sequence. Heartbeats run once per second.

A successor restores `transfer.state.state`, replays the unacknowledged `journal`, and sends `hostReady` with `{epoch}`. Only that ready host may publish `hostSnapshot` with `{protocolVersion:1,epoch,runId,tick,lastAppliedRelaySeq,random,state}`. Checkpoints are bounded to 12 KiB and the journal to 256 actions. A stalled journal emits `recoveryError` and pauses authority. The relay does not simulate game rules. See the [complete protocol](../../documentation/space-invaders.md).

Rooms are process-local on the free Vercel Hobby deployment. Participant-host migration preserves committed state; it does not recover a lost backend instance. Missing checkpoints and expired rooms require visible recovery, without silent offline simulation or life resets.

### Bounded private relay admission

Combat, Bomberman, Space Invaders, Ring Rivals, Tetris and Music Maker retry transient missing-room lookups and socket attachment within a bounded budget. Socket retries reuse the original reservation and identity; they do not reserve extra seats or create replacement rooms. Full rooms, malformed codes and invalid private tokens remain terminal. Leaving cancels outstanding retries. These retries do not promise cross-instance durability.

Each opted-in socket handshake is bounded to three seconds. A socket that closes before joining rejects promptly; failure, timeout and cancellation close the attempted socket. This covers a gap in the pinned SDK, whose reservation promise otherwise can remain pending after a pre-join close. Retries keep their existing original-seat budget and do not repeat admission.
