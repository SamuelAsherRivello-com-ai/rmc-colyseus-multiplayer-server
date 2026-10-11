# Design

## Context

See proposal.md. Baseline d01a2d6c uses core 0.17.44, SDK 0.17.43, Node24 and process-local rooms. server.ts serializes admission and has explicit game lists. PrivateCodeRoom provides bounded reconnect and lifecycle helpers but its room-code replacement cannot authorize reserved Tetris seats. Street Fighter broadcasts full snapshots; Tetris must project separately. The rabbits host relay broadcasts transferable full state and is unsuitable for private competitive boards.

## Goals / Non-Goals

Goals: one pure deterministic rules module, server authority, private views, additive client support, tested free Vercel relay.
Non-goals: modifying other games, participant-host authority, cross-instance persistence, paid hosting, external datastore, or completing unrelated migration changes.

## Decisions

Use packages/client/tetris-duel-rules.js for the engine and additive ./tetris-duel package export. Ten columns, 20 visible plus four hidden rows; seven integer-oriented shapes; horizontal kicks 0,-1,1,-2,2; independent identical seven-bags. Five-second deadlines auto-commit; manual commit freezes aim for 200ms straight first-collision descent. Lock/clear, FIFO cancel, batch simultaneous attacks, enqueue remaining 0/1/2/4 rows, insert mature incoming rows only at resolution after >=1000ms warning, then check overflow/hidden occupancy. Three-second ready countdown, top-out win/same-tick draw, both-ready rematch resets epoch. Pure projection sends only own board/queue/piece and opponent identity/readiness/connection/settled height/aim while aiming/outcome. Never expose seeds, other-seat credentials or opponent landing/fall/cells.

Implement TetrisRoom under src and register its private admission branch. Reuse PrivateCodeRoom lifecycle additively with token-scoped replacement, cumulative recovery budgets, and no room-code takeover. Token rotation on refresh invalidates prior token; SDK recovery retains seat. Pause clocks on detected loss, at most 15s cumulative per seat per match; explicit leave forfeits, both-offline expiry aborts. Validate protocol, epoch, piece, sequence, enum and 60 actions/s. Tick20ms using monotonic elapsed time; projected20Hz plus immediate transitions. The browser predicts local aim/commit only and reconciles acknowledgments.

Reuse MultiplayerClient for connection/status/resubscribe/teardown and opt Tetris into SDK recovery. Persist only its own admission token in sessionStorage scoped by endpoint/game/code, never URL. Terminal full/expired/invalid-token states are actionable. Preserve all existing exports.

User expressly requires existing server relay and free Vercel; this overrides create-game alternative-host/shared-store defaults. Extend the checked-in staged deploy workflow with Tetris integration before promotion. Retain 240s long-session probe and rollback. Function expiry/instance routing may lose rooms: report expiry, offer explicit new lobby, no fake seamless restore or imposed match-duration cap. Other games and unrelated hosting migration stay unchanged.

## Risks / Trade-offs

- Private state leak -> use one projection for every outbound state path and payload-capture tests.
- Timer/callback ordering -> deterministic batch resolution, monotonic accumulator, receipt-time deadline validation.
- Recovery abuse -> cumulative budget, token validation/rotation, no code-only takeover.
- Vercel room loss -> explicit expiry tests and documented limits; actual WSS/public gameplay probes required.

## Migration Plan

Run Node24 clean install/typecheck/alltests/docs/pack. Commit scoped files on main and invoke checked-in release/deploy workflows with existing secrets. Stage checks must pass before promotion; rollback on failed public validation. Verify exact package asset and endpoint before client creation. After public game verification update both live-demo catalogs with its actual URL. Preserve unrelated changes and release-generated commits.

## Public admission regression repair

Staged release 38084815998 passed Tetris but exposed existing Bomberman/Combat/Ring Rivals admission failures. The pinned SDK reservation promise has no close-before-join rejection or handshake timeout. Use its protected room factory in an isolated subclass to attach close/abort/deadline handling, close failed sockets, and retain the exact reservation across bounded retries. Apply this only to existing private retry games plus Bomberman, preserving unrelated game lifecycles. Full/invalid-token responses remain terminal; no new room or extra seat is allocated. Verify focused lifecycle tests, real staged regressions, all local tests and package inclusion before retrying publication.

## Tetris release verification scope

The existing shared release workflow also verifies unrelated Asteroids ten-minute continuity and all older games publicly. Repeated legacy admission failures prevented package publication after Tetris repeatedly passed. Add an explicit `tetris` release target on the existing shared Vercel project: retain all registered-game local regressions, verify the five private games affected by the shared SDK repair publicly, run the existing 240-second two-client probe, promote the same stable URL, then verify stable Tetris gameplay with rollback. Keep the shared and isolated Asteroids targets unchanged. No provider, project, datastore, paid feature or production room registration is substituted. Package publication remains gated on successful deployment; client creation remains behind the verified release.
