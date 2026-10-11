import { Client, type Room } from "@colyseus/sdk";
import { hostname } from "node:os";

const endpoint = process.env.SERVER_URL;
const run = process.env.PROBE_RUN;
const host = process.env.PROBE_HOST || hostname();
const duration = Number(process.env.PROBE_SECONDS || 660) * 1000;
if (!endpoint || !run) throw new Error("SERVER_URL and PROBE_RUN are required");
const connection: {room?: Room<unknown, unknown> | undefined} = {};
let lastPeer = 0, joins = 0, received = 0, stop = false, firstPeer = 0;
const started = Date.now();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  let backoff = 1000;
  while (!stop && !connection.room) {
    try {
      const next = await new Client(endpoint!).joinOrCreate("feasibility");
      if (stop) { await next.leave(); return; }
      connection.room = next; joins++;
      next.onMessage("probe", event => {
        const parts = event.nonce.split("|");
        if (parts[0] === run && parts[1] !== host) {
          lastPeer = Date.now(); received++;
          firstPeer ||= lastPeer;
        }
      });
      next.onLeave(code => {
        if (connection.room === next) connection.room = undefined;
        if (!stop) {
          console.log(JSON.stringify({ event: "disconnected", host, code }));
          void connect();
        }
      });
      console.log(JSON.stringify({ event: "joined", host, room: next.roomId, joins }));
    } catch (error) {
      console.error("join retry:", (error instanceof Error ? error.message : String(error)));
      await delay(backoff);
      backoff = Math.min(backoff * 2, 10000);
    }
  }
}
void connect();
try {
  while (Date.now() - started < duration) {
    connection.room?.send("probe", run + "|" + host + "|" + Date.now());
    if (Date.now() - (lastPeer || started) > 60000) throw new Error("No cross-host shared state for 60 seconds");
    await delay(1000);
  }
  if (!firstPeer) throw new Error("Never observed a peer on another host");
  console.log(JSON.stringify({ result: "PASS", host, joins, received, seconds: (Date.now() - started) / 1000 }));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", host, joins, received, reason: (error instanceof Error ? error.message : String(error)) }));
  process.exitCode = 1;
} finally {
  stop = true;
  await connection.room?.leave();
}

