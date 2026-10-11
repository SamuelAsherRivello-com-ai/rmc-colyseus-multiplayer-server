# Asteroids Multiplayer Clone

Status: implementation in development; public delivery awaits sustained hosting verification.

`asteroids-coop` has one fixed creator host and up to four connected seats, including spectators. Guests hot join/drop without resetting the wave; host departure ends admission and the session without migration. Only the host executes the browser-safe simulation. Colyseus validates/relays inputs and complete world frames.

Import rules from `@rmc/multiplayer-client/asteroids` and the isolated connection helper from `@rmc/multiplayer-client/asteroids-connection`. These additive exports leave other game clients unchanged.

```js
import { connectAsteroids } from '@rmc/multiplayer-client/asteroids-connection';
const connection = await connectAsteroids({
  endpoint, create: true, code: 'ROCK',
  onPresence: presence => updateRoster(presence),
  onState: frame => receiveHostFrame(frame),
  onInput: input => consumeGuestInput(input), // host only
  onEnded: reason => showLobby(reason),
  onStatus: message => showConnectionStatus(message),
});
```

For a guest, use `create:false` and the shared four-character code. Use `?room=CODE` in the consumer URL; no recovery credential belongs in that URL. The browser helper stores the private bearer in sessionStorage keyed by endpoint/code. Public random player ID is distinct from that bearer. Same-browser returning guests retain lives, score and spectator state for the room session; new browser contexts/cleared storage create a new identity. There are four simultaneous seats and a maximum of 128 retained identities. Recovery cannot displace an occupied seat.

The host applies ordered `presence` membership to its full ledger at a tick boundary, preserving disconnected records. Send `input({runId,seq,turn,thrust,fire})` at 20 Hz, with increasing safe-integer sequence, turn -1/0/1 and boolean thrust/fire. The server overwrites sender attribution and rejects replayed sequences. Inputs expire after 300 ms in the simulation. Local dialogs neutralize local input while the host loop continues.

The host calls `publish(snapshot(world,presence.serial))` at 20 Hz. Complete version-one frames include run/tick, membership serial, phase/time, wave, connected player tuples and bounded asteroid/projectile tuples. The relay rejects guest snapshots, stale run/ticks, mismatched membership, nonfinite data, oversized arrays and frames above 12 KiB; the transport ceiling is 16 KiB. New guests receive a baseline and await a frame matching current membership before controlling their ship. The host is trusted for gameplay fairness.

`TUNING.id` is `asteroids-v1`. The logical arena is 640×360; ships, shots and asteroids wrap. No friendly fire. Wave one has exactly three one-hit parents, each fracturing into two one-hit terminal children: nine successful hits total. Later waves sample connected living players, including respawning players, once at wave start. Health caps at five, depth at two, root count at eight and descendants at 72. Shooting caps at 32 live projectiles. Engineering tuning is separate from confirmed gameplay requirements.

Each participant starts with three lives across all waves. Two-second respawns have two seconds of protection; the third death leaves a spectator. A spectator host continues simulation. Clearing the world starts a three-second intermission. Defeat wins over simultaneous last-asteroid destruction. When all connected players are eliminated, results last five seconds and all connected participants restart together at wave one with three lives.

Current implementation is process-local. Its local integration tests do not establish continuity across Vercel instances or the 300-second connection window. Release is gated on a ten-minute public probe retaining one room/host, wave, health and lives across renewal. No paid provider or bounded-session substitute is accepted for this game. Do not list the consumer as a live demo until its public gameplay is verified.
## Asteroids-only first-party continuity migration

The user requires Vercel Hobby and authorizes implementation and delivery without provider alternatives. The existing bounded hosting release is preserved for existing games. Asteroids adds its own cross-instance path rather than claiming the existing process-local Colyseus reservation is portable.

The shared server's WebSocket transport dispatches `/asteroids` to a JSON message extension; all other paths still use the unchanged Colyseus handshake. The browser-safe Asteroids connection API chooses the advertised transport. Production refuses a process-local fallback when shared storage is absent. Authentication occurs in the first socket message, never a token-bearing URL. Thus HTTP admission and the following WebSocket may reach different Functions.

Private Vercel Blob owns code uniqueness, hashed recovery identities, connected seats, creator identity, membership serial, and socket generation. Exclusive creation and ETag conditional writes serialize admission across instances. Consistent uncached reads supply the latest registry. Runtime Cache holds short-lived complete frames, guest input, and immutable registry revisions; it cannot create or elect a host. Host browser memory retains the full simulation, random state and recovery ledger. Cache loss fails closed rather than resetting a run.

Each socket generation has separate frame/input keys, preventing an old socket from overwriting a renewed socket's data. Planned renewal every 210 seconds uses the existing secret identity and current generation to acquire a new generation through CAS, then authenticates a replacement socket before closing the old one. The host browser keeps its world throughout. An old generation's close cannot remove the new generation. Actual host closure ends the room and invalidates invites; guests are never elected. Guest reattachment keeps its public player ID and therefore the host's lives/score ledger.

The preview Runtime Cache probe passed 20 fresh cross-function reads with distinct instance UUIDs. Credentialed setup confirmed Hobby and provisioned a private `iad1` Blob store connected to the existing project; no credentials were logged. Nine injected-store concurrency/lifecycle tests and one real two-socket-server integration test pass. Public multi-renewal evidence is pending; this design alone does not satisfy the sustained-session gate.

Blob writes occur on creation, admission, departure and renewal, never on simulation ticks. A two-player ten-minute session needs approximately sixteen metadata writes including socket claims, one guest recovery, two renewals per participant and final closure, plus membership reads (one per connected socket per fifteen seconds). Frames and input use Runtime Cache at no more than twenty Hz per participant. This remains a quota-limited Hobby demo, not an unlimited service. Blob's published Hobby allowance is 2,000 advanced and 10,000 simple operations monthly; Runtime Cache, Function memory and transfer allowances also apply. No upgrade or paid overage is enabled. Service failures must surface honestly and fail closed.

References: https://vercel.com/docs/vercel-blob/using-blob-sdk; https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage; https://vercel.com/docs/vercel-blob/usage-and-pricing; https://vercel.com/docs/functions/websockets.



## Verified free-host continuity

On 2026-10-10, public preview workflow run [38084287501](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/38084287501) passed four-seat admission, fifth-seat rejection, hot drops, and a 600-second two-client session with 11,824 synchronized frames and four planned connection renewals. Wave 3, damaged asteroid health 2, and the eliminated guest's zero lives survived all connection windows. Guest recovery preserved identity; actual creator loss terminated the invitation. Four independent Microsoft Edge contexts separately passed synchronization, recovery, renewal and terminal-host-loss checks. These are backend protocol checks, not a claim that the game client has shipped.

Large private Blob records can return compressed responses with weak ETags. Registry reads explicitly request identity encoding so conditional writes use the strong object ETag. Cross-instance probe [38083589232](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/38083589232) verified exclusive creation, strong-ETag conditional writes, consistent reads and independent Function instances. The full prescribed Node 24 regression suite passed 141/141 tests after the fix. All hosting remains on Vercel Hobby with first-party private Blob and Runtime Cache; no paid plan or third-party service was enabled.

### Dedicated deployment

Asteroids uses an isolated project on the same required Vercel Hobby plan, built from this repository with `ASTEROIDS_ONLY=1`. Its verified production URL is `https://rmc-asteroids-coop.vercel.app` (released v0.9.12). Default/shared deployments retain all existing registrations and their existing endpoint. Run the normal Release workflow with `target=asteroids` for this target; the full source regression suite still runs before the dedicated live gate and artifact publication. The dedicated live gate verifies only its registered game, including four seats, guest recovery, ten-minute continuity, connection renewal, actual host loss and the stable production URL. This deployment does not replace the original shared endpoint used by other games.

### Released contract

Backend v0.9.12 is verified at https://rmc-asteroids-coop.vercel.app. [Release run 38087006732](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/38087006732) passed 154 final-source tests, staged 600-second continuity (11,508 frames, four renewals) and stable-endpoint verification. The [game v0.1.1](https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/) pins the exact released client tarball; its README links the source and browser acceptance evidence. Earlier pending notes above describe implementation checkpoints, superseded by this release verification.

