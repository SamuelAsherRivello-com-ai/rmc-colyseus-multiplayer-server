![Samuel Asher Rivello](multiplayer-server/documentation/samuel-asher-rivello-banner.png)

# RMC Colyseus Multiplayer Server

Rivello Multimedia Consulting (RMC), led by [Samuel Asher Rivello](https://www.samuelasherrivello.com/) created this relay server using Colyseus as a prototype backend for new multiplayer games.

## Live Demos

This repository provides the shared multiplayer service and has no standalone demo. Play the projects that use it:

- [**Asteroids Multiplayer Clone**](https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/) — fixed-host 1–4-player cooperative asteroid waves, three personal lives, hot joining and spectators.
- [**Bomberman Clone**](https://samuelasherrivello.github.io/babylon-lite-bomberman-clone/) — private competitive bomb arena with optional growing plants that block movement.
- **Combat Clone** — four-tank free-for-all with 1–4 humans, fair CPU fill and Classic/Ricochet shots. (In development.)
- [**Dust Circuit Rally**](https://samuelasherrivello.github.io/babylon-lite-super-offroad-clone/) — race four off-road trucks in a fixed-camera landscape circuit with solo, local and online modes.
- [**Enter the Gungeon Clone**](https://samuelasherrivello.github.io/babylon-lite-enter-the-gungeon-clone/) — survive bullet waves together in private 1–4-player rooms with dodge rolls, upgrades and revives.
- [**Garden Chat**](https://samuelasherrivello.github.io/babylon-lite-garden-chat/) — wander a shared garden and chat with other visitors.
- [**Gauntlet Clone 2D**](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-2d/) — cooperate to battle monsters, revive allies, and escape a tile-based dungeon.
- [**Gauntlet Clone 3D**](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-3d/) — team up to destroy summoning altars and escape a 3D dungeon.
- **Just Like Rabbits** — shared rabbit observation habitat with participant-host migration. (In development.)
- [**Multiplayer Draw**](https://samuelasherrivello.github.io/babylon-lite-multiplayer-draw/) — draw together from separate computers or browser tabs.
- [**Music Maker Multiplayer**](https://samuelasherrivello.github.io/babylon-lite-music-maker-multiplayer/) — four-player host-simulated music sandbox with next-step local and three-second remote sounds.
- [**Neon Breaker Duo**](https://samuelasherrivello.github.io/babylon-lite-arkanoid-clone/) — co-operate to clear a neon brick field together. (In development.)
- [**Ring Rivals**](https://samuelasherrivello.github.io/babylon-lite-ring-rivals/) — fight private online 1v1 boxing bouts from mirrored opponent-focused views. (In development.)
- [**Space Invaders**](https://samuelasherrivello.github.io/babylon-lite-space-invaders-clone/) — Cooperative participant-hosted alien waves for one to four players, with personal lives, spectators and host migration.
- [**Street Fighter II Clone**](https://samuelasherrivello.github.io/babylon-lite-street-fighter-clone/) — challenge a friend to an authoritative two-player arcade duel. (In development.)
- [**Sumo Battle**](https://samuelasherrivello.github.io/babylon-lite-sumo-battle/) — push opponents out of the ring in an online sumo arena.
- [**Tetris Multiplayer Clone**](https://samuelasherrivello.github.io/babylon-lite-tetris-multiplayer-clone/) — hidden-board timed aim-and-release duel with private opponent hints and garbage attacks.

Whenever a new game updates this server, add or update its demo bullet here and its entry in the supported game registry, keeping the demo list in alphabetical order by game name.

See the [supported game registry](multiplayer-server/documentation/games.md) for room keys and client versions.

## Table of Contents

1. [Live Demos](#live-demos)
2. [Getting Started](#getting-started)
3. [Project Details](#project-details)
4. [Credits](#credits)

## Getting Started

### 🛠 Build, Verify, and Run Project

Run the following commands from the repository root. TypeScript is checked without emitting a separate build; tsx runs the source locally.

Use Node 24 and npm:

```sh
npm ci
npm run check:docs
npm run typecheck
npm test
npm run dev
```

Local Node execution defaults to port 2567; override `PORT`. The historical Render-compatible Docker image defaults to port 10000. Tests start their own server on 2678.
Set `SERVER_URL` before `npm test` to run the same ownership, late-join, cleanup, fresh-reconnect, seat-reuse, and capacity checks against a live server. Live integration checks need an otherwise empty drawing session.

For Bomberman Clone local development, run `npm run dev` from the sibling `babylon-lite-bomberman-clone` repository. Its launcher prepares an ignored checkout of this server's `v0.9.7` tag and starts two independent local processes: port 2567 for normal play and port 2568 for AI browser tests. It starts the game on Vite port 5173 and stops all three processes together. The game defaults to port 2567; `?server=VITE_LOCAL&serverTest=true` selects port 2568. Its browser scripts should set `BACKEND_URL=http://127.0.0.1:2568`.

The published Bomberman client pinned to `v0.9.7` requires six-character invite codes. This server generates six-character codes for Bomberman and accepts both six-character legacy and four-character recent Bomberman codes. Other coded games use four characters. The local Bomberman launcher still uses its tagged server checkout; its temporary checkout leaves this working tree unchanged. `?server=VERCEL_ONLINE` selects its configured public backend; `serverTest=true` with that preset requires a separately configured Vercel test deployment and must not fall back to production.

### 🛠 Release Version

The root `package.json` is the version source. Run the **Release** workflow with a new semantic version. It checks and commits the root/client versions, stages a production Vercel build without changing the public URL, runs health, all registered-game integration tests, and a four-minute two-client relay against the staged deployment, then promotes that deployment to `https://rmc-colyseus-multiplayer-server.vercel.app`. It verifies the stable URL before publishing one tagged GitHub Release with the client tarball. Existing games configured for that URL automatically reach the new server. Sessions are process-local: Vercel can end or route a connection to another instance, and the four-minute test does not promise continuity across instances or beyond the Function limit. To deploy manually, dispatch **Deploy backend release** with a commit or tag at the current `main` commit.

The deployment workflow uses the configured GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`; it never prints them or commits credentials. The legacy `render.yaml` remains for historical recovery only and is not the active release path.

Music Maker uses the dedicated free Hobby endpoint `https://rmc-music-maker.vercel.app` and the **Release music backend** workflow (`music-release.yml`). Its setup/deploy workflows require Hobby, retain full source regressions, verify public Music room/relay behavior and publish the shared-client tarball only after stable-endpoint verification. This isolated deployment registers only Music and does not replace the shared endpoint used by other games. Browser clients renew the relay before the 300-second connection limit; the browser host retains musical authority.

## Project Details

### 📝 Structure

```text
multiplayer-server/
├── src/                 # Colyseus server and game rooms
├── test/                # Integration checks
├── packages/client/     # Reusable browser client and API README
└── documentation/       # Game registry and hosting evidence
scripts/                 # Release tooling and hosting probes
.github/workflows/       # Verification, release, and deployment
server.ts                # Thin Node/Vercel entry point
package.json             # Root npm commands and release version
```

Run commands from the repository root. The checked-in release workflow targets Vercel through the thin `server.ts` adapter. The Render container and Blueprint remain as historical recovery material; they are not the active release path.

### 📦 AI

[AGENTS.md](AGENTS.md) documents the layout, verification commands, and consumer-link conventions. The README and layout follow the supplied Multiplayer Draw reference, adapted for a shared backend.

### 📦 Packages

- [Colyseus](https://colyseus.io/) — rooms, admission, and realtime messaging.
- [Express](https://expressjs.com/) — HTTP health and join endpoints.
- [Shared multiplayer client](multiplayer-server/packages/client/README.md) — status, identity, occupancy, game messages, and reconnection.
- [TypeScript](https://www.typescriptlang.org/) and tsx — type checking and local execution.

### Custom Shared Features

| # | Name | Comment |
|---:|---|---|
| 1 | Hot join / hot drop | Automatic anonymous admission; remove departed presence and game-owned artwork after disconnect detection. |
| 2 | Player identity | Lowest free ordered seat; fresh session ID, server-generated deterministic name/color; existing seats remain unchanged. Active colors are distinct. |
| 3 | Shared client | `MultiplayerClient` exposes status, session ID, room ID, players, occupancy, retry, game messages, and subscription/teardown. |
| 4 | Admission and capacity | One room per game within the running instance; capacity 12 for drawing; full status with explicit retry and no normal overflow room. Direct drawing matchmaking is blocked. |
| 5 | Fresh reconnect | Exponential retry remains capped at 15 seconds. Automatic SDK recovery keeps its session identity where supported; opening a coded room link creates a fresh identity and restores the vacant seat. |
| 6 | Coded-room recovery | Automatic same-session recovery lasts 15 seconds; a room-code join can reclaim the disconnected seat with a fresh identity while any player remains in the room. |
| 7 | Private Street Fighter duels | Two-seat invite rooms, per-seat reconnect tokens, authoritative 60 Hz combat, and 15-second recovery; rooms and invites are in-memory and can end on process loss. |
| 8 | Drawing relay | Normalized strokes/cursors, active-stroke snapshots for late joiners, whole-stroke ownership enforcement, departure cleanup. |
| 9 | Coded private rooms | Four-character editable room codes, create/join/share links, URL auto-join, room-code seat recovery while anyone remains connected, and a 15-second empty-room refresh grace. See [the workflow guide](multiplayer-server/packages/client/README.md#coded-private-room-workflow), [admission and seat replacement](multiplayer-server/src/server.ts#L39), and [room recovery lifecycle](multiplayer-server/src/private-code-room.ts#L14). |

**Future feature: `persistent-user-rejoins`.** Not implemented. Every reconnect and refresh creates a fresh user, and previous artwork is removed.

New games should review this catalog and [the game registry](multiplayer-server/documentation/games.md). Add broadly useful lifecycle/UI support to the shared client, document it here, and pin its release in each consumer. Use a smaller capacity when gameplay requires it.

### Shared Client API

See [package documentation](multiplayer-server/packages/client/README.md). Build locally with
`npm pack ./multiplayer-server/packages/client --pack-destination artifacts` after creating the artifacts directory.

After release, install the exact asset URL:

```sh
npm install https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/releases/download/v0.1.0/rmc-multiplayer-client-0.1.0.tgz
```

The v0.1.0 asset is published and consumed by Multiplayer Draw. Commit the consumer lockfile. The client needs only the public backend URL, never a server deployment credential.

HTTP: `GET /api/health`; `POST /api/join/multiplayer-draw` returns a Colyseus seat reservation or 409 when full. Unknown games return 404; transient admission failures return 503. WebSocket messages are documented in the package. Drawing is limited to 100 strokes and 10,000 points per player, 2,048 points per stroke, and 64 points per batch. Erase strokes to reclaim space.

### Hosting Limits

The checked-in server keeps its room index, matchmaking, and recovery state in process memory. Those states are not shared across Vercel function instances or restored after process loss. A room link can rejoin a room while that same process still owns it; a fresh process requires a new room. The separate `standardize-private-room-flow` OpenSpec change owns the cross-instance continuity and release gate. The historical Render Blueprint and [recorded hosting evidence](multiplayer-server/documentation/feasibility.md) describe a prior hosting direction, not a completed migration.

### Additive release policy

Games may add isolated room keys and additive shared-client capabilities after the full server regression suite passes. A deployment can interrupt active in-memory rooms, which is an accepted temporary limitation; compatible existing games reconnect using their existing protocol. Update another game only when a targeted compatibility check identifies an actual contract change, not merely because a new game was added.

There is no durable storage, account system, or separate lobby service in the checked-in server. The release workflow deploys a selected tag to Vercel and verifies the resulting public health version and game tests; its presence does not prove that a particular public endpoint currently serves this working tree.

The Vercel Hobby deployment workflow tests a four-minute relay session within its five-minute connection window. Function instances still do not share this server's in-memory room state. Cross-instance private-room ownership, ordered recovery, and socket renewal must pass the separate hosting change's release gate before they are described as supported.

## Credits

### 💡 Contributors

- Samuel Asher Rivello — Rivello Multimedia Consulting.

### 💡 Contact

- [LinkedIn](https://www.linkedin.com/in/SamuelAsherRivello/)
- [GitHub](https://github.com/SamuelAsherRivello/)
- [Portfolio](https://www.samuelasherrivello.com/)

### Sumo Battle

[Sumo Battle](https://samuelasherrivello.github.io/babylon-lite-sumo-battle/) ([source](https://github.com/SamuelAsherRivello/babylon-lite-sumo-battle)) adds a server-authoritative 1–12 player ring-out arena. The `sumo-battle` game uses a separate room with fixed-step movement, collision impulses, bounded inputs, dash cooldowns, ring-out credit, safe respawns, first-to-three victory and automatic replay. Solo sessions have a labeled AI opponent. The shared 0.2.0 client adds generic `gameState` while preserving 0.1.0 drawing behavior. See the [client contract](multiplayer-server/packages/client/README.md#sumo-battle-shared-client-020).

`npm test` runs drawing regressions, deterministic sumo rule tests and sumo integration (sync, authority, late join, bot, 12/13 capacity, departure, reconnect and game isolation). Live tests require otherwise empty drawing and sumo sessions. The checked-in deployment workflow runs the tests against its selected public deployment and fails if they do not pass; it has no automatic rollback step. No persistent scores; hosting interruptions reset in-memory matches.
## Garden Chat
[Garden Chat live demo](https://samuelasherrivello.github.io/babylon-lite-garden-chat/) adds a 12-player social garden with authoritative movement, bumping and bounded session chat history. See the game registry and shared client API. `npm test` also verifies garden synchronization, admission, chat, bounds and isolation locally or against SERVER_URL.

## Gauntlet 3D

[Gauntlet Clone 3D](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-3d/) ([source](https://github.com/SamuelAsherRivello/babylon-lite-gauntlet-clone-3d)) uses `gauntlet-3d`, an isolated four-seat authoritative cooperative dungeon. It adds four switchable classes, four enemy types, destructible generators, pickups, victory/defeat and leader-controlled terminal replay. Existing games retain their contracts. All players may choose the same class; seat colors remain unique. No persistent progress; hosting interruptions reset the level. The dungeon is designed for short runs within the existing hosting duration.

Verification adds deterministic dungeon rules and live-capable synchronization, capacity, late-join, class-switch, departure, retry, reconnect and isolation checks to `npm test`.


## Gauntlet 2D — Embervault

[Live demo](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-2d/) · [Source](https://github.com/SamuelAsherRivello/babylon-lite-gauntlet-clone-2d)

The isolated `gauntlet-2d` room supports 1–4 players with server-authoritative tile movement, four switchable classes, four enemy types, generators, keys, food, treasure, revival, victory/defeat and automatic replay. Player numbers and four unique colors persist through class switches. Snapshot state uses the existing generic shared client contract. Tests cover rules, two-client synchronization, invalid input, capacity, isolation, hot drop and fresh reconnect. Session resets and hosting limits above still apply. The consumer pins the exact release artifact after live verification.

Deployment explicitly assigns the canonical public alias after a tagged checkout: detached tags otherwise only updated the team-scoped domain in observed v0.5.0 deployment. A health/version gate now precedes live tests. Recover with Deploy backend release using the existing tag; do not create another version merely to retry routing.

## Enter the Gungeon Clone

[Live demo](https://samuelasherrivello.github.io/babylon-lite-enter-the-gungeon-clone/) — [Source](https://github.com/SamuelAsherRivello/babylon-lite-enter-the-gungeon-clone). `gungeon` adds private four-character rooms for 1–4 players, readiness, authoritative arena movement/combat, dodge invulnerability, three weapon patterns, shared upgrade rewards, revival and wave/boss progression. Existing shared-client callers remain compatible; optional admission options support create/join. Two-client integration and deterministic rule tests are included in local and live deployment checks. Fresh reconnect and in-memory hosting limits above apply.
