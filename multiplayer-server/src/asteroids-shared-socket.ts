import type { WebSocket } from "ws";
import {
  AsteroidsContinuity,
  RelayError,
  publicPresence,
  roomKey,
  type Registry,
  type Identity,
} from "./asteroids-continuity.js";
import { validFrame, validInput } from "./asteroids-room.js";

/** A logical Asteroids connection may attach to any Vercel Function instance. */
export function attachAsteroidsSocket(
  socket: WebSocket,
  continuity: AsteroidsContinuity,
) {
  let registry: Registry | undefined, identity: Identity | undefined;
  let stopped = false,
    busy = false,
    writing = false,
    lastRegistryCheck = 0,
    lastRevisionCheck = 0,
    lastHeartbeat = 0;
  let lastFrame = "",
    lastInput = new Map<string, number>(),
    inputSeq = -1,
    inputRun = -1;
  let budgetAt = Date.now(),
    budget = 0;
  const send = (type: string, value: unknown) => {
    if (socket.readyState === 1) socket.send(JSON.stringify({ type, value }));
  };
  const terminal = (reason: string) => {
    if (stopped) return;
    stopped = true;
    if (registry && identity)
      void continuity
        .leave(registry.code, identity.id, identity.generation)
        .catch(() => {});
    send("sessionEnded", { reason });
    socket.close(4001, "Session ended");
  };
  const authTimer = setTimeout(() => {
    if (!identity) socket.close(4003, "Authentication required");
  }, 5000);
  const refresh = async () => {
    if (!registry || !identity) return;
    let next: Registry | undefined;
    const now = Date.now();
    if (now - lastRevisionCheck >= 500) {
      lastRevisionCheck = now;
      next = await continuity.store.get(
        roomKey(registry, `registry:${registry.revision + 1}`),
      );
    }
    if (now - lastRegistryCheck >= 15000) {
      lastRegistryCheck = now;
      const record = await continuity.store.read(registry.code);
      if (!record || record.value.epoch !== registry.epoch) {
        terminal("Session expired");
        return;
      }
      if (record.value.revision > (next?.revision ?? registry.revision))
        next = record.value;
    }
    if (next && next.revision > registry.revision) {
      registry = next;
      if (registry.ended) {
        terminal("The host left. Create a new room.");
        return;
      }
      const active = registry.identities.find((p) => p.id === identity!.id);
      if (!active?.connected || active.generation !== identity.generation) {
        stopped = true;
        socket.close(4002, "Connection replaced");
        return;
      }
      identity = active;
      send("presence", publicPresence(registry));
    }
  };
  const interval = setInterval(async () => {
    if (stopped || !registry || !identity || busy) return;
    busy = true;
    try {
      await refresh();
      if (stopped) return;
      if (identity.id === registry.hostId) {
        const inputs = await Promise.all(
          registry.identities
            .filter((p) => p.connected && p.id !== registry!.hostId)
            .map(async (p) => ({
              p,
              input: await continuity.store.get(
                roomKey(registry!, `input:${p.id}:${p.generation}`),
              ),
            })),
        );
        for (const { p, input } of inputs) {
          if (
            input &&
            input.seq > (lastInput.get(p.id + ":" + p.generation) ?? -1)
          ) {
            lastInput.set(p.id + ":" + p.generation, input.seq);
            send("input", { ...input, id: p.id, membership: registry.serial });
          }
        }
      } else {
        const host = registry.identities.find(
          (p) => p.id === registry!.hostId,
        )!;
        const frame = await continuity.store.get(
          roomKey(registry, `frame:${host.generation}`),
        );
        if (frame) {
          const stamp = `${host.generation}:${frame.value.runId}:${frame.value.tick}`;
          if (stamp !== lastFrame) {
            lastFrame = stamp;
            send("gameState", frame.value);
          }
          if (Date.now() - frame.at > 12000)
            terminal("The host connection was lost. Create a new room.");
        } else {
          const heartbeat = await continuity.store.get(
            roomKey(registry, "frame"),
          );
          if (Date.now() - (heartbeat?.at ?? registry.created) > 15000)
            terminal("The host connection was lost. Create a new room.");
        }
      }
    } catch {
      terminal(
        "The free relay is unavailable. Create a new room when service returns.",
      );
    } finally {
      busy = false;
    }
  }, 50);
  socket.on("message", async (raw) => {
    if (stopped) return;
    try {
      if (Date.now() - budgetAt >= 1000) {
        budgetAt = Date.now();
        budget = 0;
      }
      if (++budget > 50) return;
      const { type, value } = JSON.parse(raw.toString());
      if (!identity) {
        if (
          type !== "auth" ||
          !value ||
          typeof value.code !== "string" ||
          !/^[A-Z0-9]{4}$/.test(value.code) ||
          typeof value.token !== "string" ||
          value.token.length > 128 ||
          typeof value.generation !== "string"
        )
          throw new Error("Invalid authentication");
        const result = await continuity.authenticate(
          value.code,
          value.token,
          value.generation,
        );
        if (identity) return;
        registry = result.registry;
        identity = result.identity;
        clearTimeout(authTimer);
        lastRegistryCheck = Date.now();
        send("identity", {
          id: identity.id,
          host: identity.id === registry.hostId,
        });
        send("presence", publicPresence(registry));
        const host = registry.identities.find(
          (p) => p.id === registry!.hostId,
        )!;
        const frame = await continuity.store.get(
          roomKey(registry, `frame:${host.generation}`),
        );
        if (frame) send("gameState", frame.value);
        return;
      }
      if (!registry || writing) return;
      if (type === "leave") {
        stopped = true;
        await continuity.leave(registry.code, identity.id, identity.generation);
        socket.close(1000, "Left room");
        return;
      }
      if (type === "hostSnapshot" && identity.id === registry.hostId) {
        const members = new Map(
          registry.identities
            .filter((p) => p.connected)
            .map((p) => [p.id, { ...p, sessionId: p.id }]),
        );
        if (!validFrame(value, registry.serial, members)) return;
        const stamp = `${value.runId}:${value.tick}`;
        // lastFrame is always written as a run:tick pair.
        const [run = NaN, tick = NaN] = lastFrame.split(":").map(Number);
        if (value.runId < run || (value.runId === run && value.tick <= tick))
          return;
        writing = true;
        try {
          await continuity.store.set(
            roomKey(registry, `frame:${identity.generation}`),
            { at: Date.now(), value },
            30,
          );
          if (Date.now() - lastHeartbeat >= 1000) {
            lastHeartbeat = Date.now();
            await continuity.store.set(
              roomKey(registry, "frame"),
              { at: lastHeartbeat },
              30,
            );
          }
          if (value.runId !== run) lastInput.clear();
          lastFrame = stamp;
          send("gameState", value);
        } finally {
          writing = false;
        }
      } else if (type === "input" && validInput(value)) {
        if (
          value.runId < inputRun ||
          (value.runId === inputRun && value.seq <= inputSeq)
        )
          return;
        inputRun = value.runId;
        inputSeq = value.seq;
        writing = true;
        try {
          await continuity.store.set(
            roomKey(registry, `input:${identity.id}:${identity.generation}`),
            value,
            2,
          );
        } finally {
          writing = false;
        }
      }
    } catch (error) {
      if (!identity) { const reason = error instanceof RelayError ? error.message : (error as Error).name; console.error("Asteroids authentication rejected", reason); socket.close(4003, reason.slice(0,100)); }
      else terminal("Relay request failed");
    }
  });
  socket.on("error", () => {});
  socket.on("close", () => {
    clearTimeout(authTimer);
    clearInterval(interval);
    if (!stopped && registry && identity)
      void continuity
        .leave(registry.code, identity.id, identity.generation)
        .catch(() => {});
    stopped = true;
  });
}


