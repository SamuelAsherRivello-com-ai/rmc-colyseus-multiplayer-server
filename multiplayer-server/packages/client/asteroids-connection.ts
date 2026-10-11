import type {AsteroidsCallbacks, AsteroidsAdmission, AsteroidsFrame} from './asteroids-types.js';
import type {AsteroidsInput} from './asteroids-rules.js';
export type {AsteroidsCallbacks, AsteroidsAdmission, AsteroidsFrame} from './asteroids-types.js';
import { connectSharedAsteroids } from "./asteroids-shared-connection.js";
import { Client } from "@colyseus/sdk";
/** Isolated API: existing games keep their connection/retry behavior. */
export async function connectAsteroids({
  endpoint,
  create = false,
  code,
  onPresence,
  onState,
  onInput,
  onEnded,
  onStatus,
}: AsteroidsCallbacks & {endpoint: string;create?: boolean;code?: string}) {
  const base = endpoint.replace(/\/$/, "");
  const storageKey = `asteroids:${base}:${code || "new"}`;
  let token = create
    ? undefined
    : sessionStorage.getItem(storageKey) || undefined;
  const response = await fetch(`${base}/api/join/asteroids-coop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ create, code, identityToken: token }),
  });
  const data: AsteroidsAdmission & {transport?: string;error?: string;reservation: Parameters<Client["consumeSeatReservation"]>[0]} = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not join room");
  token = data.token;
  sessionStorage.setItem(`asteroids:${base}:${data.code}`, token);
  if (data.transport === "asteroids-shared-v1")
    return connectSharedAsteroids(base, data, {
      onPresence,
      onState,
      onInput,
      onEnded,
      onStatus,
    });
  const room = await new Client(base).consumeSeatReservation(data.reservation);
  room.reconnection.enabled = false;
  let intentional = false,
    terminal = false;
  room.onMessage("identity", () => {});
  if(onPresence) room.onMessage("presence", onPresence);
  if(onState) room.onMessage("gameState", onState);
  if(onInput) room.onMessage("input", onInput);
  room.onMessage("sessionEnded", (value) => {
    terminal = true;
    onEnded(value.reason);
  });
  room.onError((_code, message) => onStatus?.(message));
  room.onLeave(() => {
    if (!intentional && !terminal)
      onEnded(
        "Connection lost. Guests may rejoin with the room code; host loss ends the session.",
      );
  });
  room.send("snapshot");
  return {
    id: data.id,
    code: data.code,
    host: create,
    input: (value: AsteroidsInput) => room.send("input", value),
    publish: (value: AsteroidsFrame) => room.send("hostSnapshot", value),
    leave: () => {
      intentional = true;
      return room.leave();
    },
  };
}
