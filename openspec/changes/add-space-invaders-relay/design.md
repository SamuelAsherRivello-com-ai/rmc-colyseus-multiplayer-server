## Context

Reuse the current participant election helper behind an isolated room. Do not
alter Rabbits events or public private-code games. Inspect active planning
artifacts without claiming their work complete as part of this change.

## Goals / Non-Goals

Reliable private admission, stable recovery, exactly one ready epoch, bounded
checkpoint transfer. No gameplay rules, accounts or durable cross-instance world.

## Decisions

Serialize create/reserve with existing admission chain. Keep recovery tokens
private and stable seat IDs public. Spectators and dropped seats within the 15-second grace retain
capacity. Room destruction ends identity. Host readiness fences migration;
checkpoint acknowledgement bounds replay. Reject malformed traffic, guests and
stale hosts. Preserve existing Vercel release staging/probe/promote/rollback.

## Risks / Trade-offs

Anonymous token loss means no identity proof. Vercel rooms are process local;
300-second limit means four-minute verified sessions, not persistent service.
Four-minute game probe is required before promotion.

## Migration Plan

Additive release through the verified workflow (published v0.9.12 after concurrent shared-server fixes); existing clients retain previous events and semantics.
Consumer pins the released tarball after public verification. Add linked Live
Demos entry only after the consumer URL serves a verified playable build.

