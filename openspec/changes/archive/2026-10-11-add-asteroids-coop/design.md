## Context
Consumer contract: sibling `babylon-lite-asteroids-multiplayer-clone/openspec/changes/create-hosted-asteroids-coop/`. Host creator simulates all physics and outcomes; Colyseus validates/relays inputs and complete snapshots. Host elimination does not transfer authority. Actual host departure ends the room.

## Decisions
- Game key `asteroids-coop`, max four connected seats including spectators.
- Immutable `asteroids-v1` tuning and deterministic seeded browser-safe rules in the released client package. Exact wave one: three one-hit parents, two one-hit terminal children each.
- Public random participant ID and separate private bearer recovery token. Only the token authenticates a returning ledger; tokens never appear in snapshots or invite URLs. At most 128 retained identities.
- Host publication requires creator connection, monotonic run/tick and current membership serial. Wire budget 12 KiB beneath transport 16 KiB. Guest input is bounded and sequenced.
- Host retains disconnected personal lives/score ledger; connected participants determine defeat. Five seconds of results then collective wave-one restart with three lives.
- Existing Vercel credentials were verified using workflow run 38079249214, which returns sanitized metadata only. Fluid Compute enabled; no configured datastore or integrations. Existing process-local rooms remain insufficient for long sessions; hosting work is an explicit unreleased prerequisite.

## Risks
Free quotas, cross-instance admission, planned host renewal vs actual loss, background host throttling, anonymous storage clearing. Do not narrow acceptance to four minutes or declare successful health checks as gameplay proof.

## Verification
Run rules and real Colyseus integration tests locally, existing regressions and type/docs checks, then public ten-minute shared-state recovery and browser tests in the consuming game before release claims.
## Asteroids-only first-party continuity migration

The user requires Vercel Hobby and authorizes implementation and delivery without provider alternatives. The existing bounded hosting release is preserved for existing games. Asteroids adds its own cross-instance path rather than claiming the existing process-local Colyseus reservation is portable.

The shared server's WebSocket transport dispatches `/asteroids` to a JSON message extension; all other paths still use the unchanged Colyseus handshake. The browser-safe Asteroids connection API chooses the advertised transport. Production refuses a process-local fallback when shared storage is absent. Authentication occurs in the first socket message, never a token-bearing URL. Thus HTTP admission and the following WebSocket may reach different Functions.

Private Vercel Blob owns code uniqueness, hashed recovery identities, connected seats, creator identity, membership serial, and socket generation. Exclusive creation and ETag conditional writes serialize admission across instances. Consistent uncached reads supply the latest registry. Runtime Cache holds short-lived complete frames, guest input, and immutable registry revisions; it cannot create or elect a host. Host browser memory retains the full simulation, random state and recovery ledger. Cache loss fails closed rather than resetting a run.

Each socket generation has separate frame/input keys, preventing an old socket from overwriting a renewed socket's data. Planned renewal every 210 seconds uses the existing secret identity and current generation to acquire a new generation through CAS, then authenticates a replacement socket before closing the old one. The host browser keeps its world throughout. An old generation's close cannot remove the new generation. Actual host closure ends the room and invalidates invites; guests are never elected. Guest reattachment keeps its public player ID and therefore the host's lives/score ledger.

The preview Runtime Cache probe passed 20 fresh cross-function reads with distinct instance UUIDs. Credentialed setup confirmed Hobby and provisioned a private `iad1` Blob store connected to the existing project; no credentials were logged. Nine injected-store concurrency/lifecycle tests and one real two-socket-server integration test pass. Public multi-renewal evidence is pending; this design alone does not satisfy the sustained-session gate.

Blob writes occur on creation, admission, departure and renewal, never on simulation ticks. A two-player ten-minute session needs approximately sixteen metadata writes including socket claims, one guest recovery, two renewals per participant and final closure, plus membership reads (one per connected socket per fifteen seconds). Frames and input use Runtime Cache at no more than twenty Hz per participant. This remains a quota-limited Hobby demo, not an unlimited service. Blob's published Hobby allowance is 2,000 advanced and 10,000 simple operations monthly; Runtime Cache, Function memory and transfer allowances also apply. No upgrade or paid overage is enabled. Service failures must surface honestly and fail closed.

References: https://vercel.com/docs/vercel-blob/using-blob-sdk; https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage; https://vercel.com/docs/vercel-blob/usage-and-pricing; https://vercel.com/docs/functions/websockets.



## Isolated Hobby production target

The verified Asteroids shared-state relay is deployed from this same repository to a dedicated Vercel Hobby project, `rmc-asteroids-coop`, with `ASTEROIDS_ONLY=1`. Its stable endpoint is intended to be https://rmc-asteroids-coop.vercel.app. The flag restricts registered games and admission; default deployments retain the full existing registry. A focused local integration verifies isolation and successful Asteroids admission. Existing games keep the original shared production URL and their existing release gate. This avoids promoting their unverified process-local room behavior during an Asteroids release; it does not claim their hosting constraints have been solved.

Provisioning run 38086649633 confirmed Hobby, Fluid Compute and private first-party Blob. No paid plan, third-party runtime store, or external provider was enabled. The Release workflow accepts `target=asteroids`, requires full-source regression preparation, and delegates to the dedicated deployment gate: immutable main source, Hobby verification, isolated health/version, four-seat admission and hot drops, 600-second continuity with two renewals per sustained client, promotion, and the stable-endpoint probe before publishing the package. Independent target locks preserve each deployment while immutable versioned assets remain uniquely named. Concurrent shared release v0.9.11 is separate; the planned Asteroids package release is v0.9.12.

## Delivery verification

Released backend v0.9.12 at https://rmc-asteroids-coop.vercel.app on Vercel Hobby. Release run 38087006732 passed 154 final-source tests, the staged 600-second/11,508-frame/four-renewal public gate, and the stable-endpoint probe. Immutable release target: 5da24eb28d2bcf288cd6320624d94511d01d1b22. The client asset is https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/download/v0.9.12/rmc-multiplayer-client-0.9.12.tgz (SHA256 708bb889f1b17ced20e6c1e4573448a9cbce3752a840b3d63e2d1abf5748b178). Game v0.1.1 is published at https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/; public two-client controls/settings and headless independent browser checks passed. Consumer-specific ten-minute gameplay evidence remains in that game's delivery record. Original shared production and legacy hosting limitations are preserved.

