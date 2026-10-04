import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handlePoll } from "../lib/poll-service.ts";

const sqlite = new DatabaseSync(":memory:");
// Test fixture matches db/schema.ts. Production migration generation requires the starter dependencies.
sqlite.exec("CREATE TABLE current_round (id INTEGER PRIMARY KEY, round_id TEXT NOT NULL, title TEXT NOT NULL, max_score INTEGER NOT NULL, duration_seconds INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0)");
const DB = { prepare(sql) { const query = sqlite.prepare(sql); let args = []; return {
  bind(...values) { args = values; return this; },
  async first() { return query.get(...args) || null; },
  async run() { return query.run(...args); },
}; } };
const env = { DB, ADMIN_KEY: "organizer-test-key", VOTE_SECRET: "test-only-signing-key" };
async function request(action, payload, { admin = false, cookie, origin } = {}) {
  return handlePoll(new Request(`https://vote.test/api/${action}`, {
    method: action === "state" ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(admin ? { Authorization: `Bearer ${env.ADMIN_KEY}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(action === "state" ? {} : { body: JSON.stringify(payload) }),
  }), env, action);
}
assert.equal((await (await request("state")).json()).average, null);
assert.equal((await request("control", { action: "start" })).status, 403);
for (const invalid of [0, -1, 1.5, "10", null]) assert.equal((await request("control", { action: "start", title: "ทดสอบ", maxScore: invalid, durationSeconds: 120 }, { admin: true })).status, 400);
const start = await request("control", { action: "start", title: "ทดสอบ", maxScore: 10, durationSeconds: 120 }, { admin: true });
assert.equal(start.status, 200);
const round = await start.json();
assert.equal((await request("control", { action: "start", title: "ซ้ำ", maxScore: 10, durationSeconds: 120 }, { admin: true })).status, 409);
for (const invalid of [0, -1, 11, 1.5, "5", null]) assert.equal((await request("vote", { score: invalid, roundId: round.roundId })).status, 400);
assert.equal((await request("vote", { score: 5, roundId: "old-round" })).status, 409);
assert.equal((await request("vote", { score: 5, roundId: round.roundId }, { origin: "https://other.test" })).status, 403);
const first = await request("vote", { score: 1, roundId: round.roundId });
assert.equal(first.status, 200);
const cookie = first.headers.get("Set-Cookie").split(";")[0];
assert.equal((await request("vote", { score: 10, roundId: round.roundId }, { cookie })).status, 409);
const second = await request("vote", { score: 10, roundId: round.roundId });
const totals = await second.json();
assert.equal(totals.count, 2); assert.equal(totals.average, 5.5);
assert.equal((await (await request("state", null, { cookie })).json()).voted, true);
await Promise.all(Array.from({ length: 20 }, () => request("vote", { score: 5, roundId: round.roundId })));
assert.equal((await (await request("state")).json()).count, 22);
assert.equal((await request("control", { action: "close", roundId: round.roundId }, { admin: true })).status, 200);
assert.equal((await request("vote", { score: 5, roundId: round.roundId })).status, 409);
assert.equal((await request("control", { action: "reset", roundId: "stale-round" }, { admin: true })).status, 409);
await request("control", { action: "reset", roundId: round.roundId }, { admin: true });
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM current_round").get().n, 0);
const singleton = await (await request("control", { action: "start", title: "คะแนนเดียว", maxScore: 1, durationSeconds: 5 }, { admin: true })).json();
assert.equal((await request("vote", { score: 1, roundId: singleton.roundId }, { cookie })).status, 200);
assert.equal((await request("vote", { score: 2, roundId: singleton.roundId })).status, 400);
sqlite.prepare("UPDATE current_round SET ends_at = ?").run(Date.now() - 1);
assert.equal((await (await request("state")).json()).status, "closed");
assert.equal((await request("vote", { score: 1, roundId: singleton.roundId })).status, 409);
await request("control", { action: "reset", roundId: singleton.roundId }, { admin: true });
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM current_round").get().n, 0);
sqlite.close();
console.log("PASS: bounds, integers, shared aggregates, cookies, concurrent totals, permissions, round changes, manual close, deadline and full reset.");
