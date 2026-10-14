import metadata from "../../package.json" with { type: "json" };
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Room, Server, ServerError, matchMaker, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { BOMBERMAN_ROOM_CODE_LENGTH, generatePrivateRoomCode, normalizePrivateRoomCode, PrivateRoomCodeRateLimiter } from "./private-room-codes.js";
import { CombatRoom } from "./combat-room.js";
import { BombermanRoom } from './bomberman-room.js';
import { GungeonRoom } from "./gungeon-room.js";
import { DrawingRoom } from "./drawing-room.js";
import { SumoRoom } from "./sumo-room.js";
import { Gauntlet2DRoom } from "./gauntlet2d-room.js";
import { GardenRoom } from "./garden-room.js";
import { GauntletRoom } from "./gauntlet-room.js";
import { RacingRoom } from "./racing-room.js";
import { StreetFighterRoom } from "./street-fighter-room.js";
import { NeonBreakerRoom } from "./neon-breaker-room.js";
import { RingRivalsRoom } from "./ring-rivals-room.js";
import { PrivateCodeRoom } from "./private-code-room.js";
import { TetrisDuelRoom } from "./tetris-duel-room.js";
import { JustLikeRabbitsAuthoritativeRoom } from "./just-like-rabbits-authoritative-room.js";

import { SpaceInvadersRoom } from "./space-invaders-room.js";
import { MusicRoom } from './music-room.js';


const instance = randomUUID();
const defaultMatchmaking = matchMaker.controller.invokeMethod.bind(matchMaker.controller);
matchMaker.controller.invokeMethod = async (method, room, options, auth) => {
  if (room !== "feasibility") throw new ServerError(403, "Use the game's join endpoint");
  return defaultMatchmaking(method, room, options, auth);
};
import { AsteroidsRoom } from './asteroids-room.js';
import { AsteroidsContinuity, RelayError } from "./asteroids-continuity.js";
import { VercelAsteroidsStore } from "./asteroids-vercel-store.js";
import { attachAsteroidsSocket } from "./asteroids-shared-socket.js";
const asteroidsContinuity = process.env.BLOB_READ_WRITE_TOKEN ? new AsteroidsContinuity(new VercelAsteroidsStore()) : undefined;
class GameWebSocketTransport extends WebSocketTransport {
  override async onConnection(socket: any, request: any) {
    if (request.url?.split("?")[0] === "/asteroids") {
      if (!asteroidsContinuity) { socket.close(1013, "Shared relay unavailable"); return; }
      socket.pingCount = 0; socket.on("pong", () => { socket.pingCount = 0; });
      attachAsteroidsSocket(socket, asteroidsContinuity); return;
    }
    return super.onConnection(socket, request);
  }
}
type GameRoom = typeof AsteroidsRoom | typeof CombatRoom | typeof SpaceInvadersRoom | typeof MusicRoom | typeof BombermanRoom | typeof GungeonRoom | typeof DrawingRoom | typeof SumoRoom | typeof GardenRoom | typeof Gauntlet2DRoom | typeof GauntletRoom | typeof RacingRoom | typeof NeonBreakerRoom | typeof RingRivalsRoom | typeof StreetFighterRoom | typeof JustLikeRabbitsAuthoritativeRoom | typeof TetrisDuelRoom;
const games = new Map<string, GameRoom>([
  ["asteroids-coop", AsteroidsRoom], ["music-maker", MusicRoom], ["space-invaders", SpaceInvadersRoom], ["combat", CombatRoom], ["bomberman", BombermanRoom], ["gungeon", GungeonRoom], ["multiplayer-draw", DrawingRoom],

  ["sumo-battle", SumoRoom], ["garden-chat", GardenRoom], ["gauntlet-2d", Gauntlet2DRoom],
  ["gauntlet-3d", GauntletRoom], ["dust-circuit-rally", RacingRoom],
  ["neon-breaker-duo", NeonBreakerRoom], ["ring-rivals", RingRivalsRoom],
  ["tetris-duel", TetrisDuelRoom], ["street-fighter-ii", StreetFighterRoom], ["just-like-rabbits", JustLikeRabbitsAuthoritativeRoom],
]);
// A dedicated free deployment isolates Asteroids from legacy process-local rooms.
if (process.env.ASTEROIDS_ONLY === '1') {
  for (const name of games.keys()) if (name !== 'asteroids-coop') games.delete(name);
}
if (process.env.MUSIC_ONLY === '1') {
  for (const name of games.keys()) if (name !== 'music-maker') games.delete(name);
}
let joining: Promise<unknown> = Promise.resolve();
const streetFighterInvites = new Map<string, { roomId: string; tokens: Set<string> }>();
const privateRoomCodeAttempts = new PrivateRoomCodeRateLimiter();
class FullRoomError extends Error {}
class AdmissionError extends Error { constructor(public status:number,message:string,public errorCode?:string){super(message);} }
async function prepareRoomCodeRejoin(room: PrivateCodeRoom): Promise<string | undefined> {
  // A browser refresh can send its new room-code request before Colyseus has
  // handled the old socket's close event. Give that lifecycle event a short
  // window to create a recoverable seat or release room capacity.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sessionId = await room.prepareRoomCodeRejoin();
    if (sessionId) return sessionId;
    if (!room.locked && room.clients.length < room.maxClients) return undefined;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return undefined;
}
async function reserveDungeon(body:unknown, game = 'gungeon') {
  const data=body as {create?:boolean;code?:string};
  if(!data||typeof data!=='object')throw new AdmissionError(400,'Choose create or a room code');
  const legacyBomberman = game === 'bomberman';
  const acceptedLengths = legacyBomberman ? [4, BOMBERMAN_ROOM_CODE_LENGTH] : [4];
  const codeError = legacyBomberman ? 'Enter a four- or six-character room code' : 'Enter a four-character room code';
  const pending=joining.catch(()=>undefined).then(async()=>{
    const rooms=await matchMaker.query({name:game});
    if(data.create===true){
      if(rooms.length>=50)throw new AdmissionError(503,'Too many rooms - try again later');
      const requested = data.code === undefined ? undefined : normalizePrivateRoomCode(data.code, acceptedLengths);
      if (data.code !== undefined && !requested) throw new AdmissionError(400,codeError);
      const isTaken = (code: string) => rooms.some(room => room.metadata?.code === code);
      if (requested && isTaken(requested)) throw new AdmissionError(409,'That room code is already in use. Choose another.', 'code_in_use');
      let code: string;
      try { code = requested ?? generatePrivateRoomCode(isTaken, legacyBomberman ? BOMBERMAN_ROOM_CODE_LENGTH : 4); }
      catch { throw new AdmissionError(503,'Room codes are temporarily unavailable. Try again.'); }
      const room=await matchMaker.createRoom(game,{code});
      const reservation=await matchMaker.joinById(room.roomId);
      const local=matchMaker.getLocalRoomById(room.roomId);
      if(local instanceof MusicRoom)local.reserveHost(reservation.sessionId);
      return {reservation,code};
    }
    const code = normalizePrivateRoomCode(data.code, acceptedLengths);
    if(!code)throw new AdmissionError(400,codeError);
    const room=rooms.find(r=>r.metadata?.code===code);
    if(!room)throw new AdmissionError(404,'Room expired or code not found. Create a new room.');
    const privateRoom = matchMaker.getLocalRoomById(room.roomId);
    const codeRoom = privateRoom instanceof BombermanRoom || privateRoom instanceof GungeonRoom || privateRoom instanceof RingRivalsRoom
      ? privateRoom : undefined;
    const roomCodeRejoinSessionId = codeRoom ? await prepareRoomCodeRejoin(codeRoom) : undefined;
    const full = codeRoom ? codeRoom.locked || codeRoom.clients.length >= codeRoom.maxClients : room.locked || room.clients >= room.maxClients;
    if(full && !roomCodeRejoinSessionId) throw new FullRoomError();
    if (roomCodeRejoinSessionId && codeRoom) await codeRoom.unlock();
    try { return {reservation:await matchMaker.joinById(room.roomId, roomCodeRejoinSessionId ? { roomCodeRejoinSessionId } : {}),code}; }
    catch (error) {
      if (roomCodeRejoinSessionId && codeRoom) await codeRoom.cancelRoomCodeRejoin(roomCodeRejoinSessionId);
      throw error;
    }
  });joining=pending;return pending;
}
async function reserveStreetFighter(body: unknown) {
  const data = body as { create?: boolean; code?: string; reconnectToken?: string };
  if (!data || typeof data !== "object") throw new AdmissionError(400, "Choose create or enter an invite code");
  const pending = joining.catch(() => undefined).then(async () => {
    const rooms = await matchMaker.query({ name: "street-fighter-ii" });
    for (const [code, value] of streetFighterInvites) if (!rooms.some((room) => room.roomId === value.roomId)) streetFighterInvites.delete(code);
    if (data.create === true) {
      if (rooms.length >= 50) throw new AdmissionError(503, "Too many active duels; try again later");
      const requested = data.code === undefined ? undefined : normalizePrivateRoomCode(data.code);
      if (data.code !== undefined && !requested) throw new AdmissionError(400, "Enter a four-character room code");
      if (requested && streetFighterInvites.has(requested)) throw new AdmissionError(409, "That room code is already in use. Choose another.", "code_in_use");
      let code: string;
      try { code = requested ?? generatePrivateRoomCode(candidate => streetFighterInvites.has(candidate)); }
      catch { throw new AdmissionError(503, "Room codes are temporarily unavailable. Try again."); }
      const token = randomUUID();
      const room = await matchMaker.createRoom("street-fighter-ii", { code });
      streetFighterInvites.set(code, { roomId: room.roomId, tokens: new Set([token]) });
      try { return { reservation: await matchMaker.joinById(room.roomId, { reconnectToken: token }), code, token }; }
      catch (error) { streetFighterInvites.delete(code); throw error; }
    }
    const code = normalizePrivateRoomCode(data.code);
    if (!code) throw new AdmissionError(400, "Enter a four-character room code");
    const invite = streetFighterInvites.get(code);
    if (!invite || !rooms.some((room) => room.roomId === invite.roomId)) throw new AdmissionError(404, "Room expired or code not found");
    if (data.reconnectToken) {
      if (!invite.tokens.has(data.reconnectToken)) throw new AdmissionError(403, "Reconnect token is invalid or expired");
      const room = rooms.find((entry) => entry.roomId === invite.roomId)!;
      if (room.locked || room.clients >= 2) throw new FullRoomError();
      return { reservation: await matchMaker.joinById(invite.roomId, { reconnectToken: data.reconnectToken }), code, token: data.reconnectToken };
    }
    const room = rooms.find((entry) => entry.roomId === invite.roomId)!;
    const privateRoom = matchMaker.getLocalRoomById(invite.roomId);
    if (privateRoom instanceof StreetFighterRoom) {
      const liveTokens = new Set(privateRoom.activeTokens());
      for (const token of invite.tokens) if (!liveTokens.has(token)) invite.tokens.delete(token);
    }
    const roomCodeRejoinSessionId = privateRoom instanceof StreetFighterRoom ? await prepareRoomCodeRejoin(privateRoom) : undefined;
    const full = privateRoom instanceof StreetFighterRoom ? privateRoom.locked || privateRoom.clients.length >= privateRoom.maxClients : room.locked || room.clients >= 2;
    if (full && !roomCodeRejoinSessionId) throw new FullRoomError();
    if (roomCodeRejoinSessionId && privateRoom instanceof StreetFighterRoom) await privateRoom.unlock();
    const token = randomUUID(); invite.tokens.add(token);
    try { return { reservation: await matchMaker.joinById(invite.roomId, { reconnectToken: token, ...(roomCodeRejoinSessionId ? { roomCodeRejoinSessionId } : {}) }), code, token }; }
    catch (error) { invite.tokens.delete(token); if (roomCodeRejoinSessionId && privateRoom instanceof StreetFighterRoom) await privateRoom.cancelRoomCodeRejoin(roomCodeRejoinSessionId); throw error; }
  });
  joining = pending; return pending;
}
async function reserveAsteroids(body: unknown) {
  if (asteroidsContinuity) return asteroidsContinuity.admit(body as Parameters<AsteroidsContinuity["admit"]>[0]);
  if (process.env.VERCEL) throw new AdmissionError(503, "Shared Asteroids relay is not configured");
  const data = body as {create?:boolean;code?:string;identityToken?:string};
  if(!data || typeof data!=='object')throw new AdmissionError(400,'Choose create or enter a room code');
  const pending=joining.catch(()=>undefined).then(async()=>{
    const rooms=await matchMaker.query({name:'asteroids-coop'});
    const requested=data.code===undefined?undefined:normalizePrivateRoomCode(data.code);
    if(data.code!==undefined&&!requested)throw new AdmissionError(400,'Enter a four-character room code');
    if(data.create===true){
      if(rooms.length>=50)throw new AdmissionError(503,'Too many rooms');
      const taken=(code:string)=>rooms.some(r=>r.metadata?.code===code);
      if(requested&&taken(requested))throw new AdmissionError(409,'That room code is already in use','code_in_use');
      const code=requested??generatePrivateRoomCode(taken),token=randomUUID();
      const listing=await matchMaker.createRoom('asteroids-coop',{code,creatorToken:token});
      const room=matchMaker.getLocalRoomById(listing.roomId) as AsteroidsRoom;room.registerCreator();
      return {code,token,id:room.identityFor(token),reservation:await matchMaker.joinById(listing.roomId,{identityToken:token})};
    }
    if(!requested)throw new AdmissionError(400,'Enter a room code');
    const listing=rooms.find(r=>r.metadata?.code===requested);
    if(!listing)throw new AdmissionError(404,'Room expired or code not found');
    const room=matchMaker.getLocalRoomById(listing.roomId);
    if(!(room instanceof AsteroidsRoom))throw new AdmissionError(503,'Room is unavailable on this instance');
    if(room.clients.length>=4||room.locked)throw new FullRoomError();
    let token:string;try{token=room.issueIdentity(data.identityToken);}catch{throw new AdmissionError(403,'Recovery identity is invalid or unavailable');}
    return {code:requested,token,id:room.identityFor(token),reservation:await matchMaker.joinById(listing.roomId,{identityToken:token})};
  });joining=pending;return pending;
}
async function reserveTetris(body: unknown) {
  const data = body as {create?:boolean;code?:string;reconnectToken?:string};
  if (!data || typeof data !== "object") throw new AdmissionError(400,"Choose create or enter a room code");
  const pending=joining.catch(()=>undefined).then(async()=>{
    const rooms=await matchMaker.query({name:"tetris-duel"});
    if(data.create===true){
      if(rooms.length>=50)throw new AdmissionError(503,"Too many active duels");
      const requested=data.code===undefined?undefined:normalizePrivateRoomCode(data.code);
      if(data.code!==undefined&&!requested)throw new AdmissionError(400,"Enter a four-character room code");
      const taken=(code:string)=>rooms.some(room=>room.metadata?.code===code);
      if(requested&&taken(requested))throw new AdmissionError(409,"That room code is already in use","code_in_use");
      const code=requested??generatePrivateRoomCode(taken),token=randomUUID();
      const room=await matchMaker.createRoom("tetris-duel",{code});
      return {reservation:await matchMaker.joinById(room.roomId,{reconnectToken:token}),code,token};
    }
    const code=normalizePrivateRoomCode(data.code);
    if(!code)throw new AdmissionError(400,"Enter a four-character room code");
    const entry=rooms.find(room=>room.metadata?.code===code);
    if(!entry)throw new AdmissionError(404,"Room expired or code not found. Create a new room.");
    const room=matchMaker.getLocalRoomById(entry.roomId);
    if(!(room instanceof TetrisDuelRoom))throw new AdmissionError(404,"Room expired on this relay instance");
    let replaced:string|undefined;
    if(data.reconnectToken){
      if(typeof data.reconnectToken!=="string"||!room.tokenSeat(data.reconnectToken))throw new AdmissionError(403,"Recovery token invalid or expired","expired");
      replaced=await room.prepareTokenRecovery(data.reconnectToken);
      if(!replaced)throw new FullRoomError();
      await room.unlock();
    }else if(!room.canAdmit()||room.locked||entry.clients>=2)throw new FullRoomError();
    const token=randomUUID();
    try{return {reservation:await matchMaker.joinById(entry.roomId,{reconnectToken:token,...(replaced?{roomCodeRejoinSessionId:replaced}:{})}),code,token};}
    catch(error){if(replaced)await room.cancelRoomCodeRejoin(replaced);throw error;}
  });
  joining=pending;return pending;
}
async function reserveInvaders(body: unknown) {
  const data = body as { create?: boolean; code?: string; reconnectToken?: string };
  if (!data || typeof data !== "object") throw new AdmissionError(400, "Create or join a room");
  const pending = joining.catch(() => undefined).then(async () => {
    const rooms = await matchMaker.query({ name: "space-invaders" });
    let roomId: string;
    let code = normalizePrivateRoomCode(data.code);
    if (data.create === true) {
      if (rooms.length >= 50) throw new AdmissionError(503, "Too many active rooms");
      if (data.code !== undefined && !code) throw new AdmissionError(400, "Enter a four-character code");
      if (code && rooms.some(r => r.metadata?.code === code)) throw new AdmissionError(409, "Code already in use", "code_in_use");
      code ??= generatePrivateRoomCode(c => rooms.some(r => r.metadata?.code === c));
      roomId = (await matchMaker.createRoom("space-invaders", { code })).roomId;
    } else {
      if (!code) throw new AdmissionError(400, "Enter a four-character code");
      const found = rooms.find(r => r.metadata?.code === code);
      if (!found) throw new AdmissionError(404, "Room expired or code not found");
      roomId = found.roomId;
    }
    const room = matchMaker.getLocalRoomById(roomId);
    if (!(room instanceof SpaceInvadersRoom)) throw new AdmissionError(503, "Room unavailable on this instance");
    try {
      const token = await room.admit(data.reconnectToken);
      return { reservation: await matchMaker.joinById(roomId, { reconnectToken: token }), code, token };
    } catch (error) {
      if (error instanceof ServerError) throw new AdmissionError(error.code, error.message);
      throw error;
    }
  });
  joining = pending;
  return pending;
}
async function reserve(game: string) {
  // Serialize local creation/reservation so simultaneous arrivals do not create overflow rooms.
  const pending = joining.catch(() => undefined).then(async () => {
    const existing = (await matchMaker.query({ name: game }))[0];
    const room = existing || await matchMaker.createRoom(game, {});
    if (room.locked || room.clients >= room.maxClients) throw new FullRoomError();
    return matchMaker.joinById(room.roomId);
  });
  joining = pending;
  return pending;
}
class ProbeRoom extends Room {
  override maxClients = 12;
  override onCreate() {
    this.onMessage("probe", (client: Client, message: unknown) => {
      if (typeof message !== "string" || message.length > 100) return;
      this.broadcast("probe", { nonce: message, sender: client.sessionId, room: this.roomId, instance });
    });
  }
}
const httpServer = createServer();
const gameServer = new Server({
  transport: new GameWebSocketTransport({ server: httpServer, maxPayload: 16384, pingInterval: 3000, pingMaxRetries: 2 }),
  express: (app) => {
    app.set("trust proxy", 1);

    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") { res.sendStatus(204); return; }
      next();
    });
    app.get("/api/health", (_req, res) => res.json({ status: "ok", version: metadata.version, instance, games: [...games.keys()] }));
    app.post("/api/join/:game", async (req, res) => {
      if (!games.has(req.params.game)) { res.status(404).json({ error: "Unknown game" }); return; }
      try {
        const game = req.params.game;
        if (["asteroids-coop", "combat", "space-invaders", "music-maker", "gungeon", "bomberman", "ring-rivals", "street-fighter-ii", "tetris-duel"].includes(game) && (req.body as { create?: boolean })?.create !== true) {
          if (!privateRoomCodeAttempts.take(req.ip || req.socket.remoteAddress || "unknown")) {
            res.setHeader("Retry-After", "60");
            res.status(429).json({ error: "Too many room-code attempts. Try again shortly.", errorCode: "rate_limited" });
            return;
          }
        }
        const reservation = game === "asteroids-coop" ? await reserveAsteroids(req.body) : game === "space-invaders" ? await reserveInvaders(req.body) : game === "tetris-duel" ? await reserveTetris(req.body) : game === "street-fighter-ii"
          ? await reserveStreetFighter(req.body)
          : ["combat", "music-maker", "gungeon", "bomberman", "ring-rivals"].includes(game)
            ? await reserveDungeon(req.body, game)
            : await reserve(game);
        res.json(reservation);
      }
      catch (error) {
        if (error instanceof RelayError) res.status(error.status).json({ error: error.message });
        else if (error instanceof AdmissionError) res.status(error.status).json({ error: error.message, ...(error.errorCode ? { errorCode: error.errorCode } : {}) });
        else if (error instanceof FullRoomError) res.status(409).json({ error: "Room full" });
        else { console.error("Join failed", (error as Error).message); res.status(503).json({ error: "Room temporarily unavailable" }); }
      }
    });
    app.use("/matchmake", (req, res, next) => {
      if (req.path.endsWith("/feasibility")) next();
      else res.status(403).json({ error: "Use the game's join endpoint" });
    });
  },
});
for (const [name, room] of games) gameServer.define(name, room);
gameServer.define("feasibility", ProbeRoom);
const server = await gameServer.serverless();
if (!process.env.VERCEL) server.listen(Number(process.env.PORT) || 2567, "0.0.0.0");
export default server;
