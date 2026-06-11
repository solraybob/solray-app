"use client";

/**
 * /admin/training — the Oracle training ground (admin only).
 *
 * A private room where Bob and Gisli converse with the Oracle against a chart
 * they enter, and promote individual replies as expert signal ("strong" /
 * "off" + an optional note). The chart is built ad hoc by the backend and
 * never persisted as an account. Promoted notes land in a labeled corpus
 * (oracle_training_notes), intentionally not yet wired into the live per-user
 * prompt. Gated by the same require_admin email allowlist as the rest of
 * /admin, so adding Gisli is a one-line SOLRAY_ADMIN_EMAILS change, no deploy
 * of code.
 */

import { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";

const FOREST = "var(--bg-deep, #050f08)";
const PEARL = "var(--text-primary, #f2ecd8)";
const WISTERIA = "var(--wisteria, #9b86a0)";
const AMBER = "var(--amber, #f39230)";
const MOSS_DIM = "var(--text-muted, #8a9e8d)";
const BORDER = "var(--border, #1a3020)";
const MOSS = "var(--moss, #8a9e66)";
const EMBER = "var(--ember, #d47a52)";

type Msg = { role: "user" | "assistant"; content: string };
type Note = {
  id: string;
  expert_label: string | null;
  verdict: string;
  note: string | null;
  question: string | null;
  oracle_text: string;
  created_at: string | null;
};

function TrainingGround() {
  const { token } = useAuth();

  // Chart for the session.
  const [birthDate, setBirthDate] = useState("1989-09-05");
  const [birthTime, setBirthTime] = useState("12:00");
  const [birthCity, setBirthCity] = useState("Reykjavik, Iceland");
  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [language, setLanguage] = useState("en");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [promoted, setPromoted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Note[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const birthData = () => ({
    birth_date: birthDate,
    birth_time: birthTime,
    birth_city: birthCity || null,
    name: name || null,
    sex: sex || null,
    language,
  });

  async function loadNotes() {
    if (!token) return;
    try {
      const data = await apiFetch("/admin/training/notes", {}, token);
      setNotes(data.notes || []);
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending || !token) return;
    setError(null);
    const history = messages;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const data = await apiFetch(
        "/admin/training/chat",
        {
          method: "POST",
          body: JSON.stringify({
            birth_date: birthDate,
            birth_time: birthTime || "12:00",
            birth_city: birthCity || null,
            name: name || null,
            sex: sex || null,
            language,
            conversation_history: history,
            message: text,
          }),
        },
        token
      );
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "" }]);
    } catch (e) {
      const msg =
        e instanceof ApiError ? `${e.status}: ${e.message}` : "Could not reach the Oracle.";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `[error] ${msg}` }]);
    } finally {
      setSending(false);
    }
  }

  async function promote(idx: number, verdict: "strong" | "off") {
    if (!token) return;
    const oracleMsg = messages[idx];
    if (!oracleMsg || oracleMsg.role !== "assistant") return;
    // The preceding user turn is the question that produced this reply.
    let question: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        question = messages[i].content;
        break;
      }
    }
    try {
      await apiFetch(
        "/admin/training/promote",
        {
          method: "POST",
          body: JSON.stringify({
            oracle_text: oracleMsg.content,
            verdict,
            note: noteDrafts[idx] || null,
            question,
            birth_data: birthData(),
          }),
        },
        token
      );
      setPromoted((p) => ({ ...p, [idx]: verdict }));
      setNoteDrafts((d) => {
        const next = { ...d };
        delete next[idx];
        return next;
      });
      loadNotes();
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status}: ${e.message}` : "Could not save the note.");
    }
  }

  const field: React.CSSProperties = {
    background: "rgba(10,31,18,.5)",
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 11px",
    color: PEARL,
    fontSize: 13,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: WISTERIA,
    marginBottom: 4,
    display: "block",
  };

  return (
    <div style={{ minHeight: "100vh", background: FOREST, color: PEARL, padding: "28px 20px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div style={{ marginBottom: 6, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: WISTERIA }}>
              Training Ground
            </div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontSize: 30,
                letterSpacing: "0.04em",
                margin: 0,
              }}
            >
              Sit with her. Mark what lands.
            </h1>
            <p style={{ color: MOSS_DIM, fontSize: 13, marginTop: 8, lineHeight: 1.5, maxWidth: 620 }}>
              She reads the chart cold, no memory, no history. Ask as a master would. When a reading is
              strong or off, mark it. Your judgments become the expert corpus we train her on.
            </p>
          </div>
          <div className="flex items-center gap-3" style={{ paddingTop: 4 }}>
            <a href="/admin/akashic-record" className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-moss/40 text-moss hover:border-moss transition-colors">Akashic</a>
            <a href="/admin/consciousness" className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-amber-sun/40 text-amber-sun hover:border-amber-sun transition-colors">Consciousness</a>
          </div>
        </header>

        {/* Chart for the session */}
        <div
          style={{
            marginTop: 22,
            padding: 16,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            background: "rgba(10,31,18,.4)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Birth date</label>
            <input style={{ ...field, width: "100%" }} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <label style={labelStyle}>Birth time</label>
            <input style={{ ...field, width: "100%" }} value={birthTime} onChange={(e) => setBirthTime(e.target.value)} placeholder="HH:MM" />
          </div>
          <div>
            <label style={labelStyle}>Place</label>
            <input style={{ ...field, width: "100%" }} value={birthCity} onChange={(e) => setBirthCity(e.target.value)} placeholder="City, Country" />
          </div>
          <div>
            <label style={labelStyle}>Name (optional)</label>
            <input style={{ ...field, width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Sex (optional)</label>
            <input style={{ ...field, width: "100%" }} value={sex} onChange={(e) => setSex(e.target.value)} placeholder="female / male" />
          </div>
          <div>
            <label style={labelStyle}>Language</label>
            <input style={{ ...field, width: "100%" }} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en / es" />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() => {
                setMessages([]);
                setPromoted({});
                setNoteDrafts({});
                setError(null);
              }}
              style={{
                ...field,
                cursor: "pointer",
                color: WISTERIA,
                width: "100%",
                background: "transparent",
              }}
            >
              Start fresh
            </button>
          </div>
        </div>

        {/* Conversation */}
        <div
          ref={scrollRef}
          style={{
            marginTop: 20,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: 18,
            minHeight: 280,
            maxHeight: "52vh",
            overflowY: "auto",
            background: "radial-gradient(120% 50% at 50% 0%, rgba(243,146,48,0.06), transparent 60%)",
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: MOSS_DIM, fontFamily: "'Cormorant Garamond', Georgia, serif", fontStyle: "italic", fontSize: 17 }}>
              Set a chart above, then speak to her.
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} style={{ marginBottom: 18 }}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 300,
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: "rgb(var(--rgb-text-secondary) / 0.85)",
                  }}
                >
                  {m.content}
                </div>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: WISTERIA, marginTop: 4 }}>You</div>
              </div>
            ) : (
              <div key={i} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontWeight: 300,
                    fontSize: 17,
                    lineHeight: 1.6,
                    color: "rgb(var(--rgb-text-primary) / 0.92)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: WISTERIA }}>Oracle</span>
                  {promoted[i] ? (
                    <span style={{ fontSize: 11, color: promoted[i] === "strong" ? MOSS : EMBER }}>
                      saved as {promoted[i] === "strong" ? "strong" : "off"}
                    </span>
                  ) : (
                    <>
                      <button onClick={() => promote(i, "strong")} style={{ background: "transparent", border: "none", color: MOSS, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>
                        Strong
                      </button>
                      <button onClick={() => promote(i, "off")} style={{ background: "transparent", border: "none", color: EMBER, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>
                        Off
                      </button>
                      <input
                        value={noteDrafts[i] || ""}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [i]: e.target.value }))}
                        placeholder="why? (optional, saved with your mark)"
                        style={{ ...field, flex: 1, minWidth: 180, fontSize: 12, padding: "5px 9px" }}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          )}
          {sending && <div style={{ color: MOSS_DIM, fontStyle: "italic", fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16 }}>reading…</div>}
        </div>

        {error && <div style={{ color: EMBER, fontSize: 12, marginTop: 10 }}>{error}</div>}

        {/* Composer */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Speak to her…"
            style={{ ...field, flex: 1, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{
              border: `1px solid ${sending || !input.trim() ? BORDER : "rgba(243,146,48,0.5)"}`,
              background: sending || !input.trim() ? "rgba(236,231,221,0.05)" : "rgba(243,146,48,0.14)",
              color: sending || !input.trim() ? "var(--text-muted, #8a9e8d)" : AMBER,
              borderRadius: 12,
              padding: "0 22px",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: sending || !input.trim() ? "default" : "pointer",
            }}
          >
            Send
          </button>
        </div>

        {/* Saved notes */}
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: WISTERIA, marginBottom: 12 }}>
            Expert corpus ({notes.length})
          </div>
          {notes.length === 0 && <div style={{ color: MOSS_DIM, fontSize: 13 }}>Nothing marked yet.</div>}
          {notes.map((n) => (
            <div key={n.id} style={{ borderTop: `1px solid ${BORDER}`, padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: n.verdict === "strong" ? MOSS : n.verdict === "off" ? EMBER : MOSS_DIM, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {n.verdict}
                </span>
                <span style={{ fontSize: 11, color: WISTERIA }}>{n.expert_label || "expert"}</span>
                {n.created_at && <span style={{ fontSize: 11, color: MOSS_DIM }}>{n.created_at.slice(0, 16).replace("T", " ")}</span>}
              </div>
              {n.note && <div style={{ fontSize: 13, color: "rgb(var(--rgb-text-secondary) / 1)", marginBottom: 4 }}>“{n.note}”</div>}
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "rgb(var(--rgb-text-muted) / 1)",
                }}
              >
                {n.oracle_text.length > 220 ? n.oracle_text.slice(0, 220) + "…" : n.oracle_text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TrainingGroundPage() {
  return (
    <ProtectedRoute>
      <TrainingGround />
    </ProtectedRoute>
  );
}
