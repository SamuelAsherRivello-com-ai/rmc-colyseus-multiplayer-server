# Hosting feasibility — 2026-09-28

## Updated free Vercel feasibility — 2026-10-02

The current public Vercel endpoint `https://rmc-colyseus-multiplayer-server.vercel.app/api/health` returned HTTP 200 on 2026-10-02 and reports version `0.9.7`. Its release tag predates the local private-room-flow implementation: `v0.9.7:multiplayer-server/src/server.ts` accepts six-character codes for Gungeon, Bomberman, and Ring Rivals, and the tagged client does not export the four-character room-link helpers. A live Neon Breaker integration check also failed because the v0.9.7 snapshot omits `serverTime`, which the current source and client-side smoothing contract require. Do not publish consumers that use the new four-character flow or claim timestamp-based snapshot verification until a compatible backend release is deployed.

The updated Vercel plan is technically capable of WebSockets, but its limits and the candidate shared-store quota are a material fit risk:

- Vercel's [WebSocket documentation](https://vercel.com/docs/functions/websockets), last updated 2026-08-10, says WebSockets are beta on all plans, each socket is pinned to one Function instance, reconnects are not guaranteed to reach the same instance, and sockets close when the Function reaches its maximum duration. It also says active socket time uses the same Function usage limits and pricing model.
- Vercel's [Hobby included-usage table](https://vercel.com/docs/plans/hobby) lists 4 active CPU-hours, 360 GB-hours provisioned memory, 10 GB fast origin transfer, and 1,000,000 Function invocations per month.
- Upstash's [Redis pricing](https://upstash.com/pricing/redis), checked 2026-10-02, lists 500,000 commands, 10 GB bandwidth, and 256 MB data for Free.
- The existing coded real-time rooms broadcast authoritative game state every 50 ms (20 Hz). One shared-store publish per tick would consume 72,000 commands per active room-hour, leaving at most 6.94 aggregate room-hours per month at the published Free command ceiling. This is an optimistic lower bound: it excludes persistence writes, joins, inputs, leases, reconnect reads, and other games. Two commands per tick halves the ceiling to 3.47 aggregate room-hours. The room broadcast cadence is visible in `multiplayer-server/src/{bomberman,gungeon,neon-breaker,ring-rivals,street-fighter}-room.ts`.

This is a quota projection from the current source cadence, not a live Upstash usage measurement. No Redis commands completed: no-signup scratch database provisioning succeeded, but requests to its generated Upstash REST host timed out from both the local environment and a GitHub-hosted runner. The temporary, unclaimed scratch databases expire automatically after 72 hours. Since the candidate store could not be reached, atomic room admission, ordered pub/sub, reconnect restoration, latency, and actual command/bandwidth use remain unverified. The `standardize-private-room-flow` planning record still lists cross-instance and no-paid-overage criteria as open. It does not start a local OpenSpec workflow. The previous public Vercel endpoint is still serving the old single-instance process-local implementation; endpoint health does not establish cross-instance room continuity or free-tier capacity.

Current local verification on 2026-10-02: `npm run typecheck` passed and `npm test` passed all 74 tests against the process-local implementation. This confirms the current games still pass their local suites; it does not satisfy tasks 4.1 or 4.2 in the `standardize-private-room-flow` record because the shared-state/Vercel migration has not been implemented and the public endpoint remains on the incompatible v0.9.7 release.

### Alternative free relay candidate: Supabase Realtime

Supabase Free currently lists 2 million Realtime messages/month, 100 messages/second, 200 peak connections, and 5 GB egress; free projects pause after one week of inactivity ([pricing](https://supabase.com/pricing), [Realtime limits](https://supabase.com/docs/guides/realtime/limits)). Broadcast usage counts one message sent plus one per receiving subscriber ([message accounting](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)). For a two-seat room split across two Vercel instances, relaying one remote player's 20 Hz input and the owner's 20 Hz snapshot to the other instance is approximately 80 counted messages/second (two per broadcast), or 288,000 messages per active room-hour. The Free monthly message quota would therefore cover at most 6.94 aggregate room-hours at 20 Hz; at 10 Hz the estimate is 13.89 hours, below the 100-message/second limit. These are architecture-based projections, not measurements. This candidate has not been provisioned or tested, and no Supabase credentials are configured in the server repository or its GitHub Actions secrets; it is not yet a viable deployment path without project access and cross-instance tests.

Deployment dpl_CQGsysdik4aLRxSh67ETibeSkw9L at https://rmc-colyseus-multiplayer-server.vercel.app.

- TypeScript check: pass.
- Two local clients: pass.
- Two clients against fresh live deployment: pass.
- Independent hosts: this Windows computer and GitHub Ubuntu runner in Azure eastus.
- Duration: 660 seconds each; three joins each (initial plus two timeout recoveries).
- Shared room sequence on both hosts: uHebGVriS, LPG3Vvb0-, bdjo2weQ1.
- Messages received: local 601; GitHub runner 597.
- CI evidence: https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/36427675103

This is bounded experimental evidence, not a guarantee of singleton routing or production reliability. Vercel ended sockets around five minutes. The SDK first attempted session restoration before the probe joined fresh rooms; the final shared client will explicitly disable automatic session restoration.

The later drawing and capacity results below supersede the initial probe. CLI deployment works; automated release access remains a separate gate.

## Drawing implementation verification

The final drawing protocol passed between independent local Windows and GitHub Ubuntu hosts in room A8WYHUWlL. Local: 145 observations in 90 seconds; runner: 148 observations in 75 seconds. Evidence: https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/36431402375.

Final deployment dpl_4aTorGu62edPVTcv5iTSJbFhH8GR passed the full integration suite with 12 clients, rejection of client 13, ownership, late-join, departure cleanup, seat reuse, matchmaking restriction, and fresh automatic reconnect. The test body completed in 27.5 seconds. Browser/UI verification is recorded in the frontend repository.

The replacement VERCEL_TOKEN passed direct project authorization, CLI account verification, production deployment and the two-client live probe in [run 36445269245](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/36445269245). All required deployment credentials are configured. The Release workflow will publish the first client tarball and deploy its tagged source.

## Released deployment

Backend/client v0.1.0 was published and deployed by [Release run 36445588819](https://github.com/SamuelAsherRivello/rmc-colyseus-multiplayer-server/actions/runs/36445588819). The tagged deployment is dpl_BjHj2FL88CD6aT5aji7VZkPvDn1u. Its automated live drawing suite passed, including 12 clients and rejection of a thirteenth. The public tarball was installed with a clean npm ci in the frontend.

Rollback was exercised: production moved back to dpl_6phkByJyyWPGcmFf8X6XxcEbzATW, then the released dpl_BjHj2FL88CD6aT5aji7VZkPvDn1u was promoted again. Both CLI operations completed successfully. The frontend's public gameplay verification runs against the restored release.

## Vercel-only room-state feasibility — 2026-10-02

The current provider constraint allows only GitHub and Vercel Hobby. Vercel's first-party shared-storage candidates do not meet the coded games' authoritative 20 Hz room-state requirement within published Hobby limits:

- [Vercel Blob pricing and limits](https://vercel.com/docs/vercel-blob/usage-and-pricing) lists 2,000 advanced operations/month and 900 advanced operations/minute for Hobby, with 1 GB storage and 10 GB Blob Data Transfer. A single `put()` for each 20 Hz room snapshot would require 72,000 advanced operations per room-hour and 1,200/minute. It would exceed the monthly included operation count in 100 seconds and the per-minute limit immediately. Blob also has no realtime room-message subscription; overwrites may remain cached for up to 60 seconds unless reads bypass cache.
- [Vercel Edge Config](https://vercel.com/docs/plans/hobby) includes 100 writes/month and is documented for read-often, rarely changed configuration. A 20 Hz snapshot stream would require 1.44 million writes/month for one continuously active room.
- Vercel's [storage overview](https://vercel.com/docs/storage) places Postgres and KV in the Marketplace integrations. Those use third-party providers and are excluded by the user's GitHub/Vercel-only constraint.
- GitHub is the source and release path, not a realtime room store. Repository writes do not provide the ordered, low-latency room message path needed to keep multiple Vercel instances in one live session.

These are projections from the existing 50 ms room broadcast cadence in `multiplayer-server/src/{bomberman,gungeon,neon-breaker,ring-rivals,street-fighter}-room.ts` and published Vercel quotas, not live Blob or Edge Config measurements. No first-party Vercel state store was provisioned for this check. The first-party service quota alone rules out writing each authoritative snapshot through Blob, and neither Blob nor Edge Config provides the required realtime room bus. The cross-instance release criteria in the historical planning record remain unmet; do not ship a process-local substitute as if it preserved room continuity.
