import test from "node:test";
import assert from "node:assert/strict";
import { StreetFighterSimulation } from "../packages/client/street-fighter-simulation.js";

const frame = (seq: number, patch = {}) => ({ seq, away: false, toward: false, up: false, down: false, jump: false, punch: false, kick: false, ...patch });
function readyDuel(fighters = ["ryu", "ryu"]) {
  const game = new StreetFighterSimulation();
  game.add("a", "secret-a"); game.add("b", "secret-b");
  game.select("a", fighters[0]); game.select("b", fighters[1]);
  game.ready("a", true); game.ready("b", true);
  for (let i = 0; i < 190; i++) game.step(1 / 60);
  assert.equal(game.phase, "fight");
  return game;
}

test("fighter roster, two-seat admission, and private token-safe snapshots", () => {
  const game = new StreetFighterSimulation();
  game.setStageFromCode("AB1234");
  assert.ok(["dojo", "harbor", "snow"].includes(game.snapshot().stage));
  const sameInvite = new StreetFighterSimulation(); sameInvite.setStageFromCode("AB1234");
  assert.equal(sameInvite.snapshot().stage, game.snapshot().stage, "invite code picks a stable shared stage");
  assert.ok(game.add("a", "secret-a")); assert.ok(game.add("b", "secret-b"));
  assert.equal(game.add("c", "secret-c"), null);
  assert.equal(JSON.stringify(game.snapshot()).includes("secret-a"), false);
  assert.equal(game.select("a", "unknown"), false);
});

test("bounded sequence inputs reject forged fields and stale frames", () => {
  const game = readyDuel();
  assert.equal(game.input("a", frame(1, { toward: true })), true);
  assert.equal(game.input("a", frame(1, { toward: false })), false);
  assert.equal(game.input("a", frame(2, { toward: 1 })), false);
  assert.equal(game.input("a", { ...frame(3), health: 0 }), false);
  assert.equal(game.input("unknown", frame(1)), false);
});

test("authoritative combat supports blocks and simultaneous knockout trades", () => {
  const block = readyDuel();
  block.match.players[0].x = 400; block.match.players[1].x = 480;
  block.input("a", frame(1, { kick: "light" })); block.input("b", frame(1, { away: true }));
  for (let i = 0; i < 8; i++) block.step(1 / 60);
  assert.equal(block.match.players[1].health, 99);
  assert.ok(block.match.players[1].blockStun > 0);

  const trade = readyDuel();
  trade.match.players[0].x = 400; trade.match.players[1].x = 480;
  trade.match.players[0].health = 13; trade.match.players[1].health = 13;
  trade.input("a", frame(1, { kick: "heavy" })); trade.input("b", frame(1, { kick: "heavy" }));
  for (let i = 0; i < 12 && trade.phase === "fight"; i++) trade.step(1 / 60);
  assert.equal(trade.phase, "round-over"); assert.equal(trade.match.roundWinner, "draw");
});

test("timer, round transition, match winner, rematch, and same-seat recovery", () => {
  const game = readyDuel(); game.match.time = 0.01;
  game.step(1 / 60);
  assert.equal(game.phase, "round-over"); assert.equal(game.match.roundWinner, "draw");

  const recovery = readyDuel(["chunLi", "kaida"]);
  const seat = recovery.sessionSeats.get("a");
  recovery.disconnect("a"); assert.equal(recovery.phase, "reconnecting");
  assert.equal(recovery.reconnect("a-new", "secret-a"), seat);
  assert.equal(recovery.phase, "fight"); assert.equal(recovery.seats[0]!.fighter, "chunLi");
  recovery.disconnect("a-new"); recovery.reconnectRemaining = 0.01; recovery.step(0.02);
  assert.equal(recovery.phase, "match-over"); assert.equal(recovery.match.winner, "p2");
});
