import type {AsteroidsAdmission, AsteroidsCallbacks, AsteroidsFrame} from './asteroids-types.js';
import type {AsteroidsInput} from './asteroids-rules.js';
/** Native socket extension on the shared Colyseus server; no instance-local reservation. */
export async function connectSharedAsteroids(base: string, admission: AsteroidsAdmission, callbacks: AsteroidsCallbacks) {
  let data = admission,
    socket: WebSocket,
    renewalTimer: ReturnType<typeof setTimeout> | undefined,
    renewing = false,
    intentional = false,
    terminal = false;
  const ended = (reason: string) => {
    if (terminal || intentional) return;
    terminal = true;
    clearTimeout(renewalTimer);
    callbacks.onEnded(reason);
  };
  async function open(next: AsteroidsAdmission) {
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/asteroids");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Relay connection timed out"));
      }, 12000);
      ws.onopen = () =>
        ws.send(
          JSON.stringify({
            type: "auth",
            value: {
              code: next.code,
              token: next.token,
              generation: next.generation,
            },
          }),
        );
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        const { type, value } = message;
        if (type === "identity") {
          clearTimeout(timer);
          resolve();
        } else if (type === "presence") callbacks.onPresence?.(value);
        else if (type === "gameState") callbacks.onState?.(value);
        else if (type === "input") callbacks.onInput?.(value);
        else if (type === "sessionEnded") ended(value.reason);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to the shared relay"));
      };
      ws.onclose = (event) => {
        clearTimeout(timer);
        reject(new Error(`Relay closed before authentication (${event.code}: ${event.reason || "no reason"})`));
        if (ws === socket && !renewing && !intentional)
          ended(
            "Connection lost. Guests can rejoin with the code; host loss ends the session.",
          );
      };
    });
    return ws;
  }
  const schedule = () => {
    clearTimeout(renewalTimer);
    renewalTimer = setTimeout(renew, data.renewAfterMs);
  };
  async function renew() {
    if (intentional || terminal || renewing) return;
    renewing = true;
    callbacks.onStatus?.("Refreshing relay connection…");
    const previous = socket;
    try {
      const response = await fetch(base + "/api/join/asteroids-coop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: data.code,
          identityToken: data.token,
          generation: data.generation,
          renew: true,
        }),
      });
      const next = await response.json();
      if (!response.ok)
        throw new Error(next.error || "Connection renewal failed");
      const replacement = await open(next);
      data = next;
      socket = replacement;
      previous.close(1000, "Planned renewal");
      callbacks.onStatus?.("Connected");
      schedule();
    } catch (error) {
      ended(error instanceof Error ? error.message : String(error));
      previous.close();
    } finally {
      renewing = false;
    }
  }
  socket = await open(data);
  schedule();
  callbacks.onStatus?.("Connected");
  const send = (type: string, value?: unknown) => {
    if (!terminal && !intentional && socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type, value }));
  };
  return {
    id: data.id,
    code: data.code,
    host: data.host,
    input: (value: AsteroidsInput) => send("input", value),
    publish: (value: AsteroidsFrame) => send("hostSnapshot", value),
    leave: () => {
      intentional = true;
      clearTimeout(renewalTimer);
      send("leave");
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "leave" }));
      setTimeout(() => socket?.close(1000, "Left room"), 100);
    },
    renew,
  };
}

