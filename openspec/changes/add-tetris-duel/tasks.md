# Tasks

## 1. Deterministic rules

- [x] 1.1 Implement browser-safe shapes, bags, aim, deadlines, descent, clears and garbage; verify rule tests covering collision, timing, cancellation, overflow and determinism.
- [x] 1.2 Implement batched outcomes, readiness/rematch and private projection; verify same-tick draw, epoch reset and hidden-state tests; document custom rules.

## 2. Sessions and package

- [x] 2.1 Register private two-seat Tetris admission and authoritative room; verify code, capacity, isolation and malformed-input integration tests.
- [x] 2.2 Add authenticated cumulative-budget recovery and shared-client support; verify token rotation, paused timers, expiry/forfeit and no code takeover.
- [x] 2.3 Export/package rules and align catalogs/API docs; verify docs check, packed imports and existing exports.

- [x] 2.4 Bound private socket handshakes, reject pre-join close, abort on leave and close failed sockets while retaining original reservations; verify lifecycle tests, real staged Bomberman/Combat/Ring Rivals checks, all local regressions and packed helper inclusion.

## 3. Delivery

- [x] 3.1 Extend staged Vercel verification with public Tetris tests; verify Node24 clean install/typecheck/alltests/pack and preserve existing 240s probe/rollback.
- [x] 3.2 Release/deploy on free Vercel with existing secrets; verify tag/package/version/public two-client gameplay and synchronize bot commits.
- [ ] 3.3 After client publication verify its actual Pages demo and update both README live-demo links; verify documentation checks and scoped commit/push.
