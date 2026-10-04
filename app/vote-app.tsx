"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock3, Copy, LoaderCircle, LockKeyhole, Radio, RotateCcw, Settings2, ShieldCheck, Square, Users, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type Poll = { roundId: string | null; title: string; maxScore: number; durationSeconds: number; status: "idle" | "open" | "closed"; count: number; average: number | null; startsAt: number | null; endsAt: number | null; serverNow: number; voted: boolean };
const EMPTY: Poll = { roundId: null, title: "ร่วมลงคะแนน", maxScore: 10, durationSeconds: 180, status: "idle", count: 0, average: null, startsAt: null, endsAt: null, serverNow: 0, voted: false };
type BrowserContext = { registerTool(tool: { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }): void | Promise<void> };

function timeString(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function VoteApp({ manage = false }: { manage?: boolean }) {
  const [poll, setPoll] = useState<Poll>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [selected, setSelected] = useState("");
  const [now, setNow] = useState(0);
  const offset = useRef(0);
  const latestServerTime = useRef(0);
  const [title, setTitle] = useState("");
  const [maximum, setMaximum] = useState("10");
  const [minutes, setMinutes] = useState("3");
  const [seconds, setSeconds] = useState("0");
  const [adminKey, setAdminKey] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [checkingKey, setCheckingKey] = useState(manage);
  const [voteUrl, setVoteUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState(false);

  const accept = useCallback((data: Poll) => {
    if (data.serverNow < latestServerTime.current) return;
    latestServerTime.current = data.serverNow;
    offset.current = data.serverNow - Date.now();
    setNow(data.serverNow);
    setPoll(previous => data.serverNow >= previous.serverNow ? data : previous);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await fetch("/api/state", { cache: "no-store" });
      const data = await result.json() as Poll & { error?: string };
      if (!result.ok) throw new Error(data.error || "เชื่อมต่อไม่ได้");
      accept(data); setConnected(true);
    } catch { setConnected(false); }
    finally { setLoading(false); }
  }, [accept]);
  useEffect(() => {
    void refresh();
    const updates = window.setInterval(() => { if (!document.hidden) void refresh(); }, 2000);
    const clock = window.setInterval(() => setNow(Date.now() + offset.current), 250);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    setVoteUrl(window.location.origin + "/");
    return () => { clearInterval(updates); clearInterval(clock); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  useEffect(() => { setSelected(""); setError(""); setNotice(""); }, [poll.roundId]);
  useEffect(() => {
    if (!manage) return;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get("key");
    let saved = "";
    try { saved = sessionStorage.getItem("lv_organizer_key") || ""; } catch { /* Browser can disallow local preferences. */ }
    const candidate = fragment || saved;
    if (fragment) window.history.replaceState(null, "", window.location.pathname);
    if (!candidate) { setCheckingKey(false); return; }
    setAdminKey(candidate);
    void fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${candidate}` }, body: JSON.stringify({ action: "verify" }) })
      .then(async response => { if (!response.ok) throw new Error(); setAuthorized(true); try { sessionStorage.setItem("lv_organizer_key", candidate); } catch {} })
      .catch(() => setError("ลิงก์ผู้จัดไม่ถูกต้อง กรุณาใช้ลิงก์ที่ได้รับ"))
      .finally(() => setCheckingKey(false));
  }, [manage]);

  const remaining = poll.endsAt ? Math.max(0, Math.ceil((poll.endsAt - now) / 1000)) : Number(minutes || 0) * 60 + Number(seconds || 0);
  const status = poll.status === "open" && remaining === 0 ? "closed" : poll.status;
  const isOpen = status === "open";
  const score = Number(selected);
  const validScore = selected !== "" && Number.isInteger(score) && score >= 1 && score <= poll.maxScore;
  const canVote = isOpen && !poll.voted && connected && !loading;
  const maxValid = /^\d+$/.test(maximum) && Number(maximum) >= 1 && Number(maximum) <= 1000000000;
  const duration = Number(minutes) * 60 + Number(seconds);
  const durationValid = /^\d+$/.test(minutes) && /^\d+$/.test(seconds) && Number(seconds) <= 59 && duration >= 1 && duration <= 2592000;

  const post = useCallback(async (path: string, body: unknown, organizer = false) => {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(organizer ? { Authorization: `Bearer ${adminKey}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json() as Poll & { error?: string; authorized?: boolean };
    if (!response.ok) throw new Error(data.error || "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง");
    return data;
  }, [adminKey]);

  const submit = async (chosen = score) => {
    if (busyRef.current) throw new Error("กำลังส่งคะแนน");
    if (!canVote || !Number.isInteger(chosen) || chosen < 1 || chosen > poll.maxScore) throw new Error(`เลือกคะแนนตั้งแต่ 1 ถึง ${poll.maxScore} ในช่วงเปิดรับคะแนน`);
    busyRef.current = true; setBusy(true); setError("");
    try {
      const data = await post("/api/vote", { score: chosen, roundId: poll.roundId });
      accept(data); setSelected(String(chosen)); setNotice("ส่งคะแนนเรียบร้อย ขอบคุณที่ร่วมลงคะแนน");
      return { count: data.count, average: data.average, voted: true };
    } catch (e) { setError(e instanceof Error ? e.message : "ส่งคะแนนไม่ได้"); await refresh(); throw e; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const control = async (action: "start" | "close" | "reset") => {
    if (busyRef.current) return;
    if (action === "start" && (!maxValid || !durationValid || !title.trim())) { setError("ตรวจสอบหัวข้อ คะแนนสูงสุด และระยะเวลาก่อนเริ่ม"); return; }
    busyRef.current = true; setBusy(true); setError("");
    try {
      const data = await post("/api/control", { action, roundId: poll.roundId, title: title.trim(), maxScore: Number(maximum), durationSeconds: duration }, true);
      accept(data);
      setNotice(action === "start" ? "เปิดรับคะแนนแล้ว ส่งลิงก์ลงคะแนนให้ผู้ร่วมได้เลย" : action === "close" ? "ปิดรับคะแนนแล้ว" : "ล้างผลคะแนนแล้ว พร้อมเริ่มรอบใหม่");
    } catch (e) { setError(e instanceof Error ? e.message : "ทำรายการไม่ได้"); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const liveTools = useRef({ poll, submit });
  liveTools.current = { poll, submit };
  useEffect(() => {
    const context = (document as Document & { modelContext?: BrowserContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<BrowserContext["registerTool"]>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    };
    register({ name: "read_vote_results", title: "อ่านผลคะแนน", description: "Read the current voting round, average and participant count without changing any state.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => {
      const p = liveTools.current.poll;
      return { title: p.title, status: p.status, maxScore: p.maxScore, average: p.average, count: p.count };
    } });
    if (!manage) register({ name: "submit_vote", title: "ส่งคะแนน", description: "Submit one integer score for the open round, using the same action as the visible submit button. A browser can vote once per round.", inputSchema: { type: "object", properties: { score: { type: "integer", minimum: 1 } }, required: ["score"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => {
      if (!input || typeof input !== "object" || !("score" in input) || Object.keys(input).some(k => k !== "score")) throw new Error("ระบุคะแนนเป็นจำนวนเต็ม");
      const candidate = (input as { score: number }).score;
      if (!Number.isInteger(candidate)) throw new Error("ระบุคะแนนเป็นจำนวนเต็ม");
      return liveTools.current.submit(candidate);
    } });
    return () => lifecycle.abort();
  }, [manage]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(voteUrl); setCopyStatus(true); window.setTimeout(() => setCopyStatus(false), 2000); }
    catch { setError("คัดลอกอัตโนมัติไม่ได้ เลือกลิงก์ด้านล่างแล้วคัดลอกได้เลย"); }
  }

  return <div className="vote-shell">
    <header className="site-header"><div className="header-inner">
      <a href={manage ? "/manage" : "/"} className="wordmark" aria-label="Live Vote"><span className="brand-icon"><Check size={22} strokeWidth={3} /></span><span>LIVE<span className="brand-slash">/</span>VOTE</span></a>
      <span className="header-label">{manage ? <><Settings2 size={16} /> สำหรับผู้จัด</> : <><Vote size={16} /> พื้นที่ลงคะแนน</>}</span>
    </div></header>
    <main className="main-wrap">
      <div className="page-heading"><div><p className="eyebrow">{manage ? "ORGANIZER" : "YOUR VOICE COUNTS"}</p><h1>{manage ? "จัดการการลงคะแนน" : poll.title}</h1><p className="intro">{manage ? "กำหนดคะแนนและเวลา แล้วเปิดรอบได้เลย" : status === "idle" ? "รอผู้จัดเปิดรับคะแนน หน้านี้จะอัปเดตให้อัตโนมัติ" : `ให้คะแนนตั้งแต่ 1 ถึง ${poll.maxScore.toLocaleString("th-TH")} คะแนน`}</p></div><span className={`status-pill ${status}`}><span />{isOpen ? "เปิดรับคะแนน" : status === "closed" ? "ปิดรับคะแนนแล้ว" : "รอเปิดรับคะแนน"}</span></div>

      {!loading && !connected && <div className="connection-error" role="alert">การเชื่อมต่อขัดข้อง ผลคะแนนอาจยังไม่อัปเดต <Button variant="outline" onClick={() => void refresh()}>ลองเชื่อมต่อใหม่</Button></div>}
      <div className="workspace-grid">
        <section className="action-card" aria-labelledby="action-title">
          <div className="card-top"><span className="section-number">01</span><h2 id="action-title">{manage ? "ตั้งค่ารอบลงคะแนน" : "คะแนนของคุณ"}</h2>{manage ? <Settings2 size={20} /> : <Vote size={20} />}</div>
          {manage ? checkingKey ? <div className="waiting-state"><LoaderCircle className="spin" size={28} /><p>กำลังตรวจสอบสิทธิ์ผู้จัด</p></div> : !authorized ? <form className="setup-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await post("/api/control", { action: "verify" }, true); setAuthorized(true); try { sessionStorage.setItem("lv_organizer_key", adminKey); } catch {} } catch (err) { setError(err instanceof Error ? err.message : "รหัสไม่ถูกต้อง"); } finally { setBusy(false); } }}>
            <div className="privacy-icon"><LockKeyhole size={28} /></div><p>ใช้ลิงก์ผู้จัดที่ได้รับ หรือกรอกรหัสผู้จัดเพื่อเปิดรับคะแนน</p><label htmlFor="organizer-key">รหัสผู้จัด</label><Input id="organizer-key" type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)} autoComplete="off" required /><Button type="submit" className="primary-action" disabled={busy || !adminKey}>เข้าสู่หน้าผู้จัด</Button>
          </form> : <form className="setup-form" onSubmit={e => { e.preventDefault(); void control("start"); }}>
            <div className="field"><label htmlFor="title">หัวข้อที่ต้องการให้คะแนน</label><Input id="title" value={poll.roundId ? poll.title : title} onChange={e => setTitle(e.target.value)} placeholder="เช่น ความพึงพอใจต่อกิจกรรมวันนี้" maxLength={140} required disabled={!!poll.roundId || busy} /></div>
            <div className="field"><label htmlFor="maximum">คะแนนสูงสุด</label><div className="with-unit"><Input id="maximum" type="number" min={1} max={1000000000} step={1} value={poll.roundId ? String(poll.maxScore) : maximum} onChange={e => setMaximum(e.target.value)} required disabled={!!poll.roundId || busy} /><span>คะแนน</span></div><p className="field-note">คะแนนต่ำสุดเริ่มที่ 1 เสมอ</p></div>
            <div className="field"><label htmlFor="minutes">ระยะเวลาเปิดรับคะแนน</label><div className="duration-fields"><div className="with-unit"><Input id="minutes" type="number" min={0} max={43200} step={1} value={poll.roundId ? String(Math.floor(poll.durationSeconds / 60)) : minutes} onChange={e => setMinutes(e.target.value)} disabled={!!poll.roundId || busy} required /><span>นาที</span></div><span className="duration-colon">:</span><div className="with-unit"><Input id="seconds" aria-label="ระยะเวลา วินาที" type="number" min={0} max={59} step={1} value={poll.roundId ? String(poll.durationSeconds % 60) : seconds} onChange={e => setSeconds(e.target.value)} disabled={!!poll.roundId || busy} required /><span>วินาที</span></div></div><div className="presets">{[1, 3, 5, 10].map(n => <Button key={n} type="button" variant="outline" disabled={!!poll.roundId || busy} className={minutes === String(n) && seconds === "0" ? "preset-selected" : ""} onClick={() => { setMinutes(String(n)); setSeconds("0"); }}>{n} นาที</Button>)}</div></div>
            {poll.roundId ? <div className="round-controls"><p className="current-topic">รอบปัจจุบัน: <strong>{poll.title}</strong><br />ช่วงคะแนน 1–{poll.maxScore.toLocaleString("th-TH")}</p>{isOpen && <Button type="button" className="close-action" variant="outline" disabled={busy || !connected} onClick={() => void control("close")}><Square size={16} />ปิดรับคะแนนตอนนี้</Button>}<AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" className="reset-action" disabled={busy || !connected}><RotateCcw size={16} />ล้างคะแนนและตั้งรอบใหม่</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>ล้างคะแนนรอบปัจจุบัน?</AlertDialogTitle><AlertDialogDescription>คะแนนเฉลี่ยและจำนวนผู้ลงคะแนนจะถูกล้างทั้งหมด ไม่มีประวัติให้เรียกคืน หลังจากนั้นคุณสามารถตั้งรอบใหม่ได้</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>ยกเลิก</AlertDialogCancel><AlertDialogAction onClick={() => void control("reset")}>ล้างคะแนน</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div> : <Button type="submit" className="primary-action" disabled={busy || !connected || !title.trim() || !maxValid || !durationValid}>{busy ? <LoaderCircle className="spin" size={20} /> : <Radio size={20} />}เริ่มรับคะแนน</Button>}
          </form> : poll.voted ? <div className="success-state"><div className="success-icon"><CheckCheck size={34} /></div><h3>ลงคะแนนเรียบร้อย</h3><p>ขอบคุณสำหรับคะแนนของคุณ<br />ติดตามผลรวมได้จากหน้านี้</p><span className="received-label">รับคะแนนของคุณแล้ว</span></div> : <div className="voting-form">
            {loading ? <div className="waiting-state"><LoaderCircle className="spin" size={28} /><p>กำลังเชื่อมต่อรอบลงคะแนน</p></div> : <>
              <div className="score-display"><span className="score-label">เลือกคะแนนที่คุณต้องการ</span><div><strong>{selected || "—"}</strong><span>/ {poll.maxScore.toLocaleString("th-TH")}</span></div></div>
              {poll.maxScore <= 10 ? <RadioGroup className="score-grid" value={selected} onValueChange={setSelected} aria-label="เลือกคะแนน" disabled={!canVote || busy}>{Array.from({ length: poll.maxScore }, (_, i) => i + 1).map(n => <label className={`score-option ${selected === String(n) ? "chosen" : ""} ${!canVote ? "unavailable" : ""}`} key={n}><RadioGroupItem value={String(n)} aria-label={`${n} คะแนน`} /><span>{n}</span>{selected === String(n) && <Check className="score-check" size={13} />}</label>)}</RadioGroup> : <div className="custom-score"><label htmlFor="custom-score">กรอกคะแนน 1–{poll.maxScore.toLocaleString("th-TH")}</label><Input id="custom-score" type="number" min={1} max={poll.maxScore} step={1} value={selected} onChange={e => setSelected(e.target.value)} disabled={!canVote || busy} inputMode="numeric" />{poll.maxScore > 1 && <Slider min={1} max={poll.maxScore} step={1} value={[validScore ? score : 1]} onValueChange={([n]: number[]) => setSelected(String(n))} disabled={!canVote || busy} aria-label="เลื่อนเลือกคะแนน" />}{selected && !validScore && <p className="inline-error">คะแนนต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง {poll.maxScore}</p>}</div>}
              <div className="scale-labels"><span>คะแนนต่ำสุด 1</span><span>คะแนนสูงสุด {poll.maxScore.toLocaleString("th-TH")}</span></div>
              <Button className="primary-action" disabled={!canVote || !validScore || busy} onClick={() => void submit().catch(() => {})}>{busy ? <LoaderCircle className="spin" size={20} /> : <Check size={20} />} {busy ? "กำลังส่งคะแนน" : "ยืนยันคะแนน"}</Button>
              <p className="vote-hint">{isOpen ? "เลือกคะแนน แล้วกดยืนยัน · 1 สิทธิ์ต่อเบราว์เซอร์" : status === "closed" ? "รอบนี้สิ้นสุดแล้ว รอผู้จัดเปิดรอบใหม่" : "เมื่อผู้จัดเปิดรอบ คุณจะเลือกคะแนนได้ทันที"}</p>
            </>}
          </div>}
          {error && <p className="message error-message" role="alert">{error}</p>}
          {notice && <p className="message success-message" role="status">{notice}</p>}
        </section>
        <aside className="results-column" aria-label="ผลคะแนน">
          <section className="results-card"><div className="result-head"><span><span className="section-number">02</span> ผลคะแนนรวม</span><span className="live-label"><Radio size={15} />{isOpen ? "LIVE" : status === "closed" ? "FINAL" : "READY"}</span></div><p className="average-label">คะแนนเฉลี่ย</p><div className="average-number" aria-live="polite" aria-atomic="true"><strong>{poll.average === null ? "—" : poll.average.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span>/ {poll.maxScore.toLocaleString("th-TH")}</span></div><div className="average-meter"><div style={{ width: `${poll.average === null ? 0 : poll.average / poll.maxScore * 100}%` }} /></div><p className="result-note">{poll.count === 0 ? "ยังไม่มีผู้ลงคะแนนในรอบนี้" : "ค่าเฉลี่ยจากคะแนนที่ได้รับทั้งหมด"}</p><div className="participant-row"><div><Users size={21} /><span>ผู้ลงคะแนน</span></div><p aria-live="polite" aria-atomic="true"><strong>{poll.count.toLocaleString("th-TH")}</strong><span>คน</span></p></div></section>
          <section className={`timer-card ${remaining <= 10 && isOpen ? "ending" : ""}`}><div className="timer-top"><span><Clock3 size={18} />{status === "idle" ? "ระยะเวลาลงคะแนน" : status === "closed" ? "สิ้นสุดการลงคะแนน" : "เหลือเวลา"}</span><span className="timer-value">{timeString(status === "closed" ? 0 : remaining)}</span></div><Progress value={status === "idle" ? 100 : status === "closed" ? 0 : Math.min(100, remaining / poll.durationSeconds * 100)} aria-label="เวลาเปิดรับคะแนนที่เหลือ" /><p>{status === "idle" ? "เริ่มนับเมื่อผู้จัดเปิดรับคะแนน" : status === "closed" ? "คะแนนรวมของรอบนี้ยังแสดงอยู่" : "ปิดรับคะแนนอัตโนมัติเมื่อหมดเวลา"}</p></section>
          {manage && authorized && <section className="share-card"><div><Copy size={18} /><h3>ลิงก์สำหรับผู้ลงคะแนน</h3></div><Input readOnly value={voteUrl} aria-label="ลิงก์ลงคะแนน" onFocus={e => e.target.select()} /><Button type="button" variant="outline" onClick={() => void copyLink()}>{copyStatus ? <Check size={17} /> : <Copy size={17} />}{copyStatus ? "คัดลอกแล้ว" : "คัดลอกลิงก์ลงคะแนน"}</Button></section>}
        </aside>
      </div>
      <div className="privacy-line"><ShieldCheck size={18} /><p>เก็บเฉพาะยอดรวมรอบปัจจุบัน ไม่เก็บชื่อหรือคะแนนรายคน<span>ล้างผลทั้งหมดได้เมื่อเริ่มรอบใหม่</span></p></div>
    </main>
    <footer className="site-footer"><span>LIVE / VOTE</span><span className={connected ? "connection-ok" : "connection-off"}>{loading ? "กำลังเชื่อมต่อ" : connected ? "อัปเดตผลทุก 2 วินาที" : "รอเชื่อมต่อระบบ"}</span><span>คะแนนเริ่มต้นที่ 1 เสมอ</span></footer>
  </div>;
}
