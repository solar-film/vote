type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
export type VoteEnv = { DB?: { prepare(sql: string): Statement }; ADMIN_KEY?: string; VOTE_SECRET?: string };
type Round = { id: number; round_id: string; title: string; max_score: number; duration_seconds: number; starts_at: number; ends_at: number; status: string; total: number; count: number };
function response(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
function fail(message: string, status = 400) { return response({ error: message }, status); }
function db(env: VoteEnv) { if (!env.DB) throw new Error("DB binding unavailable"); return env.DB; }
async function current(env: VoteEnv) { return db(env).prepare("SELECT * FROM current_round WHERE id = 1").first<Round>(); }
async function key(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signature(value: string, secret: string) {
  const signed = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signed), x => x.toString(16).padStart(2, "0")).join("");
}
async function hasVoted(request: Request, roundId: string, secret: string) {
  const receipt = request.headers.get("Cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("lv_receipt="))?.slice(11);
  if (!receipt) return false;
  const [id, sig] = receipt.split(".");
  if (id !== roundId || !sig || !/^[a-f0-9]{64}$/.test(sig)) return false;
  return crypto.subtle.verify("HMAC", await key(secret), new Uint8Array(sig.match(/.{2}/g)!.map(x => parseInt(x, 16))), new TextEncoder().encode(id));
}
async function isAdmin(request: Request, env: VoteEnv) {
  const candidate = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!candidate || !env.ADMIN_KEY) return false;
  return (await signature(candidate, env.ADMIN_KEY)) === (await signature(env.ADMIN_KEY, env.ADMIN_KEY));
}
async function view(round: Round | null, request: Request, env: VoteEnv) {
  const serverNow = Date.now();
  if (!round) return { roundId: null, title: "ร่วมลงคะแนน", maxScore: 10, durationSeconds: 180, status: "idle", count: 0, average: null, startsAt: null, endsAt: null, serverNow, voted: false };
  return { roundId: round.round_id, title: round.title, maxScore: round.max_score, durationSeconds: round.duration_seconds, startsAt: round.starts_at, endsAt: round.ends_at,
    status: round.status === "open" && round.ends_at <= serverNow ? "closed" : round.status,
    count: round.count, average: round.count ? round.total / round.count : null, serverNow, voted: await hasVoted(request, round.round_id, env.VOTE_SECRET!) };
}
export async function handlePoll(request: Request, env: VoteEnv, action: "state" | "vote" | "control") {
  try {
    if (!env.VOTE_SECRET) throw new Error("Vote secret unavailable");
    if (action === "state") return response(await view(await current(env), request, env));
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return fail("คำขอไม่ถูกต้อง", 403);
    if (!(request.headers.get("Content-Type") || "").includes("application/json")) return fail("รูปแบบคำขอไม่ถูกต้อง", 415);
    const raw = await request.text();
    if (raw.length > 2048) return fail("คำขอมีขนาดใหญ่เกินไป", 413);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { return fail("ข้อมูลไม่ถูกต้อง"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("ข้อมูลไม่ถูกต้อง");
    if (action === "vote") {
      const round = await current(env);
      if (!round || round.status !== "open" || round.ends_at <= Date.now()) return fail("รอบนี้ปิดรับคะแนนแล้ว", 409);
      if (input.roundId !== round.round_id) return fail("เปลี่ยนรอบลงคะแนนแล้ว กรุณาลองอีกครั้ง", 409);
      if (!Number.isInteger(input.score) || (input.score as number) < 1 || (input.score as number) > round.max_score) return fail(`คะแนนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง ${round.max_score}`);
      if (await hasVoted(request, round.round_id, env.VOTE_SECRET)) return fail("คุณลงคะแนนในรอบนี้แล้ว", 409);
      const updated = await db(env).prepare("UPDATE current_round SET total = total + ?, count = count + 1 WHERE id = 1 AND round_id = ? AND status = 'open' AND ends_at > ? AND ? BETWEEN 1 AND max_score RETURNING *")
        .bind(input.score, round.round_id, Date.now(), input.score).first<Round>();
      if (!updated) return fail("รอบนี้ปิดรับคะแนนแล้ว", 409);
      const receipt = `${round.round_id}.${await signature(round.round_id, env.VOTE_SECRET)}`;
      const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
      return response({ ...await view(updated, request, env), voted: true }, 200, { "Set-Cookie": `lv_receipt=${receipt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}` });
    }
    if (!await isAdmin(request, env)) return fail("กรุณาใช้ลิงก์ผู้จัดเพื่อจัดการการลงคะแนน", 403);
    if (input.action === "verify") return response({ authorized: true });
    const round = await current(env);
    if (input.action === "start") {
      if (round) return fail("ล้างรอบปัจจุบันก่อนเริ่มรอบใหม่", 409);
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const max = input.maxScore as number, duration = input.durationSeconds as number;
      if (!title || title.length > 140) return fail("ระบุหัวข้อ 1–140 ตัวอักษร");
      if (!Number.isInteger(max) || max < 1 || max > 1000000000) return fail("คะแนนสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 1,000,000,000");
      if (!Number.isInteger(duration) || duration < 1 || duration > 2592000) return fail("กำหนดเวลาตั้งแต่ 1 วินาทีถึง 30 วัน");
      const now = Date.now();
      const created = await db(env).prepare("INSERT INTO current_round (id, round_id, title, max_score, duration_seconds, starts_at, ends_at, status, total, count) VALUES (1, ?, ?, ?, ?, ?, ?, 'open', 0, 0) ON CONFLICT(id) DO NOTHING RETURNING *")
        .bind(crypto.randomUUID(), title, max, duration, now, now + duration * 1000).first<Round>();
      if (!created) return fail("มีรอบลงคะแนนเปิดอยู่แล้ว", 409);
      return response(await view(created, request, env));
    }
    if (input.action === "close" || input.action === "reset") {
      if (!round || input.roundId !== round.round_id) return fail("รอบลงคะแนนเปลี่ยนแล้ว กรุณาโหลดใหม่", 409);
      if (input.action === "reset") {
        await db(env).prepare("DELETE FROM current_round WHERE id = 1 AND round_id = ?").bind(round.round_id).run();
        return response(await view(null, request, env));
      }
      const closed = await db(env).prepare("UPDATE current_round SET status = 'closed' WHERE id = 1 AND round_id = ? RETURNING *").bind(round.round_id).first<Round>();
      return response(await view(closed, request, env));
    }
    return fail("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    console.error("Vote service unavailable", error instanceof Error ? error.message : "unknown");
    return fail("เชื่อมต่อระบบลงคะแนนไม่ได้ กรุณาลองอีกครั้ง", 503);
  }
}
