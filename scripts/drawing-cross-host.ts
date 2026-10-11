import { MultiplayerClient } from "../multiplayer-server/packages/client/index.js";
import { setTimeout as delay } from "node:timers/promises";
const run = process.env.PROBE_RUN, host = process.env.PROBE_HOST;
if (!run || !host) throw new Error("PROBE_RUN and PROBE_HOST required");
const session = new MultiplayerClient(process.env.SERVER_URL ?? "http://127.0.0.1:2567");
const started = Date.now(), duration = Number(process.env.PROBE_SECONDS || 75) * 1000;
let lastPeer = 0, samples = 0, ownId: string | null | undefined;
session.subscribe(state => {
  if (state.status === "connected" && ownId !== state.sessionId) {
    ownId = state.sessionId;
    session.send("stroke", { id: run + "__" + host, offset: 0, points: [[0.2, 0.3], [0.8, 0.6]], complete: true });
    console.log(JSON.stringify({ event: "joined", host, room: state.roomId, player: state.players.find(p => p.id === ownId)?.number }));
  }
});
void session.connect();
try {
  while (Date.now() - started < duration) {
    session.send("cursor", [0.5, 0.5]);
    const peer = [...session.state.strokes.values()].find(stroke => stroke.owner !== session.state.sessionId && stroke.id.includes(":" + run + "__"));
    if (peer && peer.points.length === 2 && peer.complete) { lastPeer = Date.now(); samples++; }
    if (Date.now() - (lastPeer || started) > 45000) throw new Error("No drawing from independent peer for 45 seconds");
    await delay(500);
  }
  if (!samples || Date.now() - lastPeer > 15000) throw new Error("Final cross-host drawing check failed");
  console.log(JSON.stringify({ result: "PASS", host, samples, room: session.state.roomId, seconds: (Date.now() - started) / 1000 }));
} finally { session.disconnect(); }

