# Supported games

| Game | Room key | Capacity | Client package | Frontend | Private-room workflow |
|---|---|---|---|---|---|
| Asteroids Multiplayer Clone | asteroids-coop | 4 | 0.9.12+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-asteroids-multiplayer-clone/) | [Rules/API](asteroids.md) · fixed host, session-scoped private guest recovery |
| Bomberman Clone | bomberman | 4 | 0.9.2+ | [Multiplayer preview](https://samuelasherrivello.github.io/babylon-lite-bomberman-clone/?mode=online) | Optional growing plants block movement without damage. [Guide](../packages/client/README.md#coded-private-room-workflow) · [Admission](../src/server.ts#L39) · [Lifecycle](../src/private-code-room.ts#L14) |
| Cat Hangout | cat-hangout | 12 humans; bots fill to 4 cats | next release | In development | Public automatic room; server validates movement and interaction. |
| Combat Clone | combat | 4 humans / 4 tanks | next release | In development | [Protocol](combat.md) · [Room](../src/combat-room.ts) |
| Dust Circuit Rally | dust-circuit-rally | 4 | 0.6.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-super-offroad-clone/) | — |
| Enter the Gungeon Clone | gungeon | 4 | 0.9.7+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-enter-the-gungeon-clone/) | [Guide](../packages/client/README.md#coded-private-room-workflow) · [Admission](../src/server.ts#L39) · [Lifecycle](../src/private-code-room.ts#L14) |
| Garden Chat | garden-chat | 12 | 0.3.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-garden-chat/) | — |
| Gauntlet Clone 2D | gauntlet-2d | 4 | 0.4.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-2d/) | — |
| Gauntlet Clone 3D | gauntlet-3d | 4 | 0.5.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-gauntlet-clone-3d/) | — |
| Just Like Rabbits | just-like-rabbits | 12 | 0.9.15 | [Live demo](https://samuelasherrivello-com-ai.github.io/just-like-rabbits/) | Server-authoritative fixed-step habitat with capacity-adaptive bot rabbits and one-minute carrots. |
| Multiplayer Draw | multiplayer-draw | 12 | 0.1.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-multiplayer-draw/) | — |
| Music Maker Multiplayer | music-maker | 4 | 0.9.13 | [Live demo](https://samuelasherrivello.github.io/babylon-lite-music-maker-multiplayer/) | Four-character private rooms; host loss ends session |
| Neon Breaker Duo | neon-breaker-duo | 2 | 0.9.3+ | [Live playtest](https://samuelasherrivello.github.io/babylon-lite-arkanoid-clone/) | — |
| Ring Rivals | ring-rivals | 2 | 0.9.3+ | [In development](https://samuelasherrivello.github.io/babylon-lite-ring-rivals/) | [Guide](../packages/client/README.md#coded-private-room-workflow) · [Admission](../src/server.ts#L39) · [Lifecycle](../src/private-code-room.ts#L14) |
| Space Invaders | `space-invaders` | 1–4 | 0.9.12+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-space-invaders-clone/) | [Protocol](space-invaders.md) · participant-hosted simulation, ordered inputs and checkpoint migration |
| Street Fighter II Clone | street-fighter-ii | 2 | 0.9.4+ | [In development](https://samuelasherrivello.github.io/babylon-lite-street-fighter-clone/) | [Guide](../packages/client/README.md#coded-private-room-workflow) · [Admission](../src/server.ts#L72) · [Lifecycle](../src/private-code-room.ts#L14) |
| Sumo Battle | sumo-battle | 12 | 0.2.0+ | [Live demo](https://samuelasherrivello.github.io/babylon-lite-sumo-battle/) | — |
| Tetris Multiplayer Clone | tetris-duel | 2 | 0.9.12 | [Play](https://samuelasherrivello.github.io/babylon-lite-tetris-multiplayer-clone/) | Four-character private rooms; authenticated 15-second cumulative recovery; [Rules/API](tetris-duel.md) |

All packages are @rmc/multiplayer-client. Before changing a shared protocol, review each game, update affected consumers and test public URLs. Short downtime and session loss are acceptable; leaving existing demos broken is not.

## Cat Hangout

`cat-hangout` is one automatic public social room for up to twelve human visitors. When fewer than four humans are present, the server adds enough labelled bot cats to reach four total cats, up to three bots. The room owns movement bounds, input validation, interaction state, generated roster identities, and bot activity. It intentionally has no combat, score, win, or loss state. Rooms are process-local: a server replacement ends the session and visitors reconnect into a fresh room.

## Just Like Rabbits

`just-like-rabbits` is a twelve-seat server-authoritative habitat. The room owns seeded fixed-step one-minute carrot growth, rabbit behavior, and time scale. It maintains Hazel and Poppy plus one to three deterministic bot rabbits that do not consume human seats. Participants send validated planting or speed intent and render complete snapshots. A thirteenth admission receives a full-room result. Departure frees a seat; a deployment or expiry ends the in-memory habitat and requires a fresh retry. The consumer pins the 0.9.15 shared-client package after a public capacity verification. Existing games retain their documented protocols unless a regression test proves otherwise.

## Enter the Gungeon Clone

`gungeon` — 1–4 players per private room code — shared client 0.9.7+ — [Live demo](https://samuelasherrivello.github.io/babylon-lite-enter-the-gungeon-clone/) — [Source](https://github.com/SamuelAsherRivello/babylon-lite-enter-the-gungeon-clone). Server-authoritative wave arena, three weapons, upgrades, dodge, revive, coded rooms and hot join/drop. See the [coded-room workflow](../packages/client/README.md#coded-private-room-workflow), [admission](../src/server.ts#L39), and [room lifecycle](../src/private-code-room.ts#L14).

## Bomberman Clone

bomberman — 2–4 players, private codes, authoritative bomb arena, 15-second identity recovery. Version 0.9.4 adds capped bomb/range/speed pickups, telegraphed sudden death, automatic rounds, first-to-three matches and ready-gated rematches. A monotonic elapsed-time accumulator keeps fixed 60Hz simulation ticks consistent despite timer jitter; snapshots remain 20Hz. The published client pins 0.9.7 and requires six-character invites; this server generates six characters for Bomberman and also accepts recent four-character callers. Two public browsers verified a full first-to-three match and fresh rematch on 2026-10-01. Expired process-local rooms require recreation and host resets do not retain identity or scores. [Multiplayer preview](https://samuelasherrivello.github.io/babylon-lite-bomberman-clone/?mode=online).

## Street Fighter II Clone

`street-fighter-ii` supports private two-player invite rooms, server-authoritative 60 Hz combat, and per-seat 15-second recovery tokens. The client synchronizes game snapshots at 20 Hz and uses the shared combat rules from the versioned client package. Rooms and invites are in-memory and can be interrupted by process loss or serverless routing. [Demo in development](https://samuelasherrivello.github.io/babylon-lite-street-fighter-clone/).


## Music Maker Multiplayer

`music-maker` uses private four-seat codes and a host-browser event ledger. The server assigns fictional names, numbers and colors, stamps input origins, bounds messages and accepts publications only from the creator. It does not simulate musical time. Host disconnect ends the room without migration or grace. Guest reconnect creates a fresh identity while the host remains active. Existing game contracts are unchanged.


## Tetris Multiplayer Clone

The existing free Vercel relay owns private timed placement, garbage, outcomes and bounded same-seat recovery. Only own-board state and permitted opponent hints leave the authority. See [Tetris rules and protocol](tetris-duel.md). Process replacement can expire a room; no cross-instance durability is claimed.
