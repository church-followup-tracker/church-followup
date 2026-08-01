import React, { useState, useEffect, useRef } from "react";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  getDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";
import "./App.css";

const GROUPS = ["A", "B", "C", "D"];
const GROUP_META = {
  A: { bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB", bar: "#185FA5" },
  B: { bg: "#E1F5EE", color: "#085041", border: "#5DCAA5", bar: "#1D9E75" },
  C: { bg: "#FAEEDA", color: "#633806", border: "#EF9F27", bar: "#BA7517" },
  D: { bg: "#FBEAF0", color: "#72243E", border: "#ED93B1", bar: "#D4537E" },
};
const STATUS_META = {
  pending:      { label: "Pending",      bg: "#F1F0EC", color: "#5F5E5A", border: "#C4C2BA" },
  calling:      { label: "Calling now",  bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  called:       { label: "Called ✓",     bg: "#EAF3DE", color: "#27500A", border: "#97C459" },
  not_reached:  { label: "Not reached",  bg: "#FAEEDA", color: "#633806", border: "#EF9F27" },
  left_message: { label: "Left message", bg: "#EEEDFE", color: "#26215C", border: "#AFA9EC" },
};
const STATUS_COLORS = {
  pending: "#C4C2BA", calling: "#85B7EB", called: "#97C459",
  not_reached: "#EF9F27", left_message: "#AFA9EC"
};
const PASTOR_META = { bg: "#F0E6FA", color: "#7B3FA8", border: "#C9A0E8", bar: "#7B3FA8" };

// Category (man/woman/youth) meta - used both for new visitors and leader routing
const CATEGORY_META = {
  man:   { label: "Man",   bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB", icon: "👨" },
  woman: { label: "Woman", bg: "#FBEAF0", color: "#72243E", border: "#ED93B1", icon: "👩" },
  youth: { label: "Youth", bg: "#FFF6DE", color: "#7A5B00", border: "#F0CC5C", icon: "🧑" },
};
// Leader roles map 1:1 to categories
const LEADER_META = {
  man:   { ...CATEGORY_META.man,   roleLabel: "Men's Leader" },
  woman: { ...CATEGORY_META.woman, roleLabel: "Women's Leader" },
  youth: { ...CATEGORY_META.youth, roleLabel: "Youth Leader" },
};

function uid() { return "v" + Date.now() + "_" + Math.random().toString(36).slice(2, 6); }
function slug(n) { return n.trim().toLowerCase().replace(/\s+/g, "_"); }
function groupForOffset(lw, dw) { const o = dw - lw; return (o < 0 || o > 3) ? null : GROUPS[o]; }
function fmtDT(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function weekToMonth(week) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const d = new Date(new Date(now.getFullYear(), 0, 1).getTime() + (week - 1) * 7 * 86400000);
  return months[d.getMonth()] + " " + d.getFullYear();
}
function parseTxtFile(text) {
  // Format: Name, Phone, Category(man/woman/youth - optional)
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split(/[,\t|]+/).map(x => x.trim());
    let category = "";
    if (p[2]) {
      const c = p[2].toLowerCase();
      if (c.startsWith("m")) category = "man";
      else if (c.startsWith("w")) category = "woman";
      else if (c.startsWith("y")) category = "youth";
    }
    return { name: p[0] || "", phone: p[1] || "", category };
  }).filter(r => r.name);
}

// ── CHARTS ────────────────────────────────────────────────────────────────
function DonutChart({ visitors, size = 80, label }) {
  const total = visitors.length;
  if (total === 0) return (
    <div style={{ width: size, height: size, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: "#F0EFEB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.15, color: "#aaa" }}>0%</div>
      {label && <div style={{ fontSize: 11, color: "#888", marginTop: 4, textAlign: "center" }}>{label}</div>}
    </div>
  );
  const counts = Object.fromEntries(Object.keys(STATUS_META).map(k => [k, 0]));
  visitors.forEach(v => { counts[v.status || "pending"]++; });
  let offset = 0;
  const r = size / 2, cx = r, cy = r, ir = r * 0.58;
  const slices = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => {
    const angle = (c / total) * 360;
    const s = offset; offset += angle;
    return { k, c, s, angle };
  });
  function arc(cx, cy, r, s, e) {
    const a1 = (s - 90) * Math.PI / 180, a2 = (e - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  const called = counts["called"];
  const pct = Math.round(called / total * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={size} height={size}>
        {slices.map(sl => <path key={sl.k} d={arc(cx, cy, r, sl.s, sl.s + sl.angle)} fill={STATUS_COLORS[sl.k]} opacity={0.92} />)}
        <circle cx={cx} cy={cy} r={ir} fill="white" />
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={size * 0.17} fontWeight="700" fill="#1A1A1A">{pct}%</text>
        <text x={cx} y={cy + size * 0.14} textAnchor="middle" fontSize={size * 0.12} fill="#888">called</text>
      </svg>
      {label && <div style={{ fontSize: 11, color: "#888", marginTop: 3, textAlign: "center" }}>{label}</div>}
    </div>
  );
}
function ProgressBar({ value, max, color = "#97C459", height = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height, background: "#F0EFEB", borderRadius: height / 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: height / 2, transition: "width 0.4s" }} />
    </div>
  );
}
function BarChart({ data, title, height = 80 }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {title && <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 8 }}>{title}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            {d.value > 0 && <div style={{ fontSize: 9, color: "#888" }}>{d.value}</div>}
            <div style={{ width: "100%", height: Math.max((d.value / max) * (height - 20), d.value > 0 ? 3 : 0), background: d.color || "#185FA5", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} />
            <div style={{ fontSize: 9, color: "#888", textAlign: "center", lineHeight: 1.1 }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function StatusLegend({ compact }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 8, marginTop: 6 }}>
      {Object.entries(STATUS_META).map(([k, m]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: compact ? 10 : 11 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[k], flexShrink: 0 }} />
          <span style={{ color: "#666" }}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}
function StatCard({ value, label, bg = "#F7F6F3", color = "#1A1A1A", border = "#E0DFDB", sub }) {
  return (
    <div style={{ flex: 1, background: bg, border: `0.5px solid ${border}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#888", lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── FORCE PIN CHANGE ──────────────────────────────────────────────────────
function ForcePinChange({ user, onDone }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChange() {
    if (pin.length < 4) { setErr("PIN must be at least 4 characters."); return; }
    if (pin !== confirm) { setErr("PINs don't match."); return; }
    setSaving(true); setErr("");
    try {
      await updateDoc(doc(db, "members", user.key), { pin, mustChangePIN: false });
      onDone(pin);
    } catch { setErr("Error saving PIN. Try again."); setSaving(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 8 }}>🔑</div>
        <h1 className="login-title">Set your PIN</h1>
        <p className="login-sub">Welcome, {user.name}! Your admin set a temporary PIN. Please choose your own personal PIN now — only you will know it.</p>
        <label className="field-label" style={{ marginTop: 16 }}>New PIN (4+ characters)</label>
        <input className="field-input" type="password" placeholder="Choose a PIN" value={pin} onChange={e => setPin(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Confirm PIN</label>
        <input className="field-input" type="password" placeholder="Type it again" value={confirm}
          onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && handleChange()} />
        {err && <p className="err-text">{err}</p>}
        <button className="btn-primary full" style={{ marginTop: 18 }} onClick={handleChange} disabled={saving}>
          {saving ? "Saving…" : "Set my PIN & continue"}
        </button>
      </div>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!name.trim() || !pin.trim()) { setErr("Enter your name and PIN."); return; }
    setLoading(true); setErr("");
    try {
      const key = slug(name);
      const snap = await getDoc(doc(db, "members", key));
      if (!snap.exists()) {
        if (key === "admin" && pin === "admin1234") {
          await setDoc(doc(db, "members", "admin"), { name: "Admin", group: null, isAdmin: true, isPastor: false, isLeader: false, leaderCategory: null, pin: "admin1234", mustChangePIN: false });
          onLogin({ name: "Admin", group: null, isAdmin: true, isPastor: false, isLeader: false, leaderCategory: null, key: "admin", mustChangePIN: false });
          return;
        }
        setErr("Name not found. Ask your admin to add you."); setLoading(false); return;
      }
      const m = snap.data();
      if (m.pin !== pin) { setErr("Wrong PIN. Try again."); setLoading(false); return; }
      onLogin({
        name: m.name, group: m.group || null, isAdmin: !!m.isAdmin, isPastor: !!m.isPastor,
        isLeader: !!m.isLeader, leaderCategory: m.leaderCategory || null,
        key, mustChangePIN: !!m.mustChangePIN
      });
    } catch { setErr("Connection error. Check your internet."); setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-logo">✝</div>
        <h1 className="login-title">Follow-up Tracker</h1>
        <p className="login-sub">Sign in with your name and PIN</p>
        <label className="field-label">Your name</label>
        <input className="field-input" placeholder="e.g. Mary Adu" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        <label className="field-label" style={{ marginTop: 12 }}>PIN</label>
        <input className="field-input" type="password" placeholder="••••" value={pin}
          onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        {err && <p className="err-text">{err}</p>}
        <button className="btn-primary full" style={{ marginTop: 18 }} onClick={handleLogin} disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 12 }}>First time? Ask your admin for your temporary PIN.</p>
      </div>
    </div>
  );
}

// ── HEADER ────────────────────────────────────────────────────────────────
function Header({ user, currentWeek, onLogout }) {
  const gm = user.group ? GROUP_META[user.group] : null;
  const lm = user.leaderCategory ? LEADER_META[user.leaderCategory] : null;
  return (
    <header className="app-header">
      <div>
        <div className="app-title">Follow-up Tracker</div>
        <div className="app-week">Week {currentWeek}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {gm && <span className="role-chip" style={{ background: gm.bg, color: gm.color, border: `1px solid ${gm.border}` }}>Group {user.group}</span>}
        {user.isPastor && <span className="role-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, border: `1px solid ${PASTOR_META.border}` }}>Pastor</span>}
        {lm && <span className="role-chip" style={{ background: lm.bg, color: lm.color, border: `1px solid ${lm.border}` }}>{lm.icon} {lm.roleLabel}</span>}
        {user.isAdmin && <span className="role-chip" style={{ background: "#1A1A1A", color: "#fff", border: "none" }}>Admin</span>}
        <button className="btn-ghost" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────
function NavBar({ tab, setTab, user }) {
  const tabs = [{ id: "dashboard", label: "📊 Dashboard" }];
  if (user.group) tabs.push({ id: "my", label: "My list" });
  tabs.push({ id: "all", label: "New visitors" });
  tabs.push({ id: "leaders", label: "Established" });
  if (user.isPastor || user.isAdmin) tabs.push({ id: "pastor", label: "Lapsed" });
  tabs.push({ id: "tasks", label: "✅ Tasks" });
  if (user.isAdmin) tabs.push({ id: "query", label: "🔍 Query" });
  if (user.isAdmin) tabs.push({ id: "manage", label: "Manage" });
  return (
    <nav className="nav-bar" style={{ overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </nav>
  );
}

// ── VISITOR ROW ───────────────────────────────────────────────────────────
function VisitorRow({ visitor, listName, assignedTo, showCategory, onClick }) {
  const sm = STATUS_META[visitor.status] || STATUS_META.pending;
  const cm = visitor.category ? CATEGORY_META[visitor.category] : null;
  return (
    <div className="visitor-row" onClick={onClick}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="visitor-name">
          {visitor.name}
          {showCategory && cm && <span style={{ marginLeft: 6, fontSize: 11 }}>{cm.icon}</span>}
        </div>
        {visitor.phone && <div className="visitor-sub">📞 {visitor.phone}</div>}
        {assignedTo && <div className="visitor-sub">👤 {assignedTo}</div>}
        {listName && !assignedTo && <div className="visitor-sub">{listName}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {visitor.comments?.length > 0 && <span className="note-chip">{visitor.comments.length} note{visitor.comments.length !== 1 ? "s" : ""}</span>}
        <span className="status-chip" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>{sm.label}</span>
      </div>
    </div>
  );
}

// ── VISITOR MODAL ─────────────────────────────────────────────────────────
function VisitorModal({ visitor, listId, listName, listType, user, onClose }) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [lv, setLv] = useState(visitor);

  const isLeaderDoc = listType === "leader";
  const col = isLeaderDoc ? "leader_members" : (listType === "pastor" ? "pastor_lists" : "lists");

  async function updateStatus(status) {
    if (isLeaderDoc) {
      await updateDoc(doc(db, "leader_members", lv.id), { status, calledBy: user.name });
      setLv(p => ({ ...p, status, calledBy: user.name }));
      return;
    }
    const snap = await getDoc(doc(db, col, listId));
    if (!snap.exists()) return;
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, status, calledBy: user.name } : v);
    await updateDoc(doc(db, col, listId), { visitors });
    setLv(p => ({ ...p, status, calledBy: user.name }));
  }

  async function postComment() {
    if (!comment.trim()) return;
    setSaving(true);
    const nc = { id: uid(), text: comment.trim(), author: user.name, ts: Date.now() };
    if (isLeaderDoc) {
      const updatedComments = [...(lv.comments || []), nc];
      await updateDoc(doc(db, "leader_members", lv.id), { comments: updatedComments });
      setLv(p => ({ ...p, comments: updatedComments }));
      setComment(""); setSaving(false);
      return;
    }
    const snap = await getDoc(doc(db, col, listId));
    if (!snap.exists()) { setSaving(false); return; }
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, comments: [...(v.comments || []), nc] } : v);
    await updateDoc(doc(db, col, listId), { visitors });
    setLv(p => ({ ...p, comments: [...(p.comments || []), nc] }));
    setComment(""); setSaving(false);
  }

  const cm = lv.category ? CATEGORY_META[lv.category] : null;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <div>
            <div className="modal-visitor-name">{lv.name} {cm && <span style={{ fontSize: 14 }}>{cm.icon}</span>}</div>
            {lv.phone && <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>📞 <a href={`tel:${lv.phone}`} style={{ color: "#185FA5" }}>{lv.phone}</a></div>}
            <div className="modal-list-name">{listName} · {listType === "pastor" ? "Lapsed member" : listType === "leader" ? "Established member" : "New visitor"}</div>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="section-label">Call status</div>
          <div className="status-grid">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button key={key} className={`status-opt${lv.status === key ? " active" : ""}`}
                style={lv.status === key ? { background: meta.bg, color: meta.color, border: `1.5px solid ${meta.border}` } : {}}
                onClick={() => updateStatus(key)}>{meta.label}</button>
            ))}
          </div>
          {lv.calledBy && <p className="called-by-note">Last updated by {lv.calledBy}</p>}
          <div className="section-label" style={{ marginTop: 20 }}>Notes</div>
          {(!lv.comments || lv.comments.length === 0) ? <p className="empty-note">No notes yet.</p>
            : lv.comments.map(c => (
              <div key={c.id} className="comment-card">
                <div className="comment-meta"><span className="comment-author">{c.author}</span><span className="comment-time">{fmtDT(c.ts)}</span></div>
                <p className="comment-text">{c.text}</p>
              </div>
            ))
          }
          <div className="comment-compose">
            <input className="field-input" placeholder="Add a note…" value={comment}
              onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === "Enter" && postComment()} />
            <button className="btn-primary" onClick={postComment} disabled={saving}>{saving ? "…" : "Post"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MY LIST TAB (follow-up team members) ─────────────────────────────────
function MyListTab({ lists, currentWeek, user, onSelectVisitor }) {
  const myLists = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group);
  const gm = GROUP_META[user.group] || GROUP_META.A;
  if (!user.group) return <div className="empty-state">Use the Dashboard or other tabs.</div>;

  return (
    <div className="tab-content">
      {myLists.length === 0
        ? <div className="empty-state">No contacts assigned to Group {user.group} this week.<br />Admin needs to add this week's visitor list.</div>
        : myLists.map(list => {
          const mine = (list.visitors || []).filter(v => v.assignedTo === user.name);
          const allVs = list.visitors || [];
          const groupCalled = allVs.filter(v => v.status === "called").length;
          return (
            <div key={list.id} className="list-card" style={{ borderLeft: `3px solid ${gm.border}` }}>
              <div className="list-card-header">
                <div className="list-name">📋 {list.name}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: gm.color, background: gm.bg, padding: "2px 8px", borderRadius: 20, border: `1px solid ${gm.border}` }}>
                    You: {mine.filter(v => v.status === "called").length}/{mine.length} called
                  </span>
                  <span style={{ fontSize: 11, color: "#888" }}>Group {user.group} total: {groupCalled}/{allVs.length}</span>
                </div>
              </div>
              {mine.length === 0 ? <p className="empty-note">No contacts assigned to you from this list yet.</p>
                : mine.map(v => <VisitorRow key={v.id} visitor={v} showCategory
                    onClick={() => onSelectVisitor({ visitor: v, listId: list.id, listName: list.name, listType: "followup" })} />)
              }
            </div>
          );
        })
      }
    </div>
  );
}

// ── ALL GROUPS (NEW VISITORS) TAB — visible to everyone for transparency ──
function AllGroupsTab({ lists, currentWeek, onSelectVisitor }) {
  return (
    <div className="tab-content">
      {GROUPS.map(g => {
        const gm = GROUP_META[g];
        const gvs = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === g).flatMap(l => (l.visitors || []).map(v => ({ ...v, listId: l.id, listName: l.name })));
        const called = gvs.filter(v => v.status === "called").length;
        return (
          <div key={g} className="list-card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
            <div className="group-card-header" style={{ background: gm.bg, borderBottom: `1px solid ${gm.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DonutChart visitors={gvs} size={34} />
                <span style={{ fontWeight: 600, color: gm.color }}>Group {g}</span>
              </div>
              <span style={{ fontSize: 12, color: gm.color }}>{called}/{gvs.length} called</span>
            </div>
            <div style={{ padding: "8px 14px 10px" }}>
              {gvs.length === 0 ? <p className="empty-note">No contacts assigned this week.</p>
                : gvs.map(v => <VisitorRow key={v.id} visitor={v} listName={v.listName} assignedTo={v.assignedTo} showCategory
                    onClick={() => onSelectVisitor({ visitor: v, listId: v.listId, listName: v.listName, listType: "followup" })} />)
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── LEADERS TAB (Established members — visible to everyone, editable by relevant leader/admin)
function LeadersTab({ leaderMembers, user, onSelectVisitor, members }) {
  const CATS = ["man", "woman", "youth"];
  return (
    <div className="tab-content">
      <div style={{ background: "#F7F6F3", border: "1px solid #E0DFDB", borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "#666" }}>
          🎓 Members who have completed the 4-week new visitor cycle and been passed on to their Church Group Leader for continued discipleship.
        </p>
      </div>
      {CATS.map(cat => {
        const cm = LEADER_META[cat];
        const catMembers = leaderMembers.filter(m => m.category === cat);
        const called = catMembers.filter(m => m.status === "called").length;
        const leader = members.find(m => m.isLeader && m.leaderCategory === cat);
        return (
          <div key={cat} className="list-card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
            <div className="group-card-header" style={{ background: cm.bg, borderBottom: `1px solid ${cm.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DonutChart visitors={catMembers} size={34} />
                <div>
                  <span style={{ fontWeight: 600, color: cm.color }}>{cm.icon} {cm.roleLabel}</span>
                  {leader && <div style={{ fontSize: 10, color: cm.color, opacity: 0.8 }}>{leader.name}</div>}
                </div>
              </div>
              <span style={{ fontSize: 12, color: cm.color }}>{called}/{catMembers.length}</span>
            </div>
            <div style={{ padding: "8px 14px 10px" }}>
              {catMembers.length === 0 ? <p className="empty-note">No established members yet in this category.</p>
                : catMembers.map(v => <VisitorRow key={v.id} visitor={v}
                    onClick={() => onSelectVisitor({ visitor: v, listId: v.id, listName: v.sourceListName || "Established member", listType: "leader" })} />)
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PASTOR TAB (private — pastors & admin only) ──────────────────────────
function PastorTab({ pastorLists, user, onSelectVisitor }) {
  const active = pastorLists.filter(l => l.status === "active");
  const allVs = active.flatMap(l => (l.visitors || []).filter(v => user.isAdmin || !v.assignedTo || v.assignedTo === user.name).map(v => ({ ...v, listId: l.id, listName: l.name })));
  const called = allVs.filter(v => v.status === "called").length;
  return (
    <div className="tab-content">
      <div style={{ background: PASTOR_META.bg, border: `1px solid ${PASTOR_META.border}`, borderRadius: 10, padding: 14, marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
        <DonutChart visitors={allVs} size={60} />
        <div>
          <p style={{ fontSize: 14, color: PASTOR_META.color, fontWeight: 600 }}>🙏 Lapsed member follow-up</p>
          <p style={{ fontSize: 12, color: PASTOR_META.color, marginTop: 2 }}>{called} of {allVs.length} members contacted</p>
          <p style={{ fontSize: 10, color: PASTOR_META.color, opacity: 0.7, marginTop: 2 }}>Private to pastors & admin only</p>
        </div>
      </div>
      {active.length === 0 ? <div className="empty-state">No lapsed member lists yet.</div>
        : active.map(list => {
          const vs = (list.visitors || []).filter(v => user.isAdmin || !v.assignedTo || v.assignedTo === user.name);
          if (!vs.length) return null;
          return (
            <div key={list.id} className="list-card" style={{ borderLeft: `3px solid ${PASTOR_META.border}` }}>
              <div className="list-card-header">
                <div className="list-name">📋 {list.name}</div>
                <div className="list-meta">{vs.length} member{vs.length !== 1 ? "s" : ""}</div>
              </div>
              {vs.map(v => <VisitorRow key={v.id} visitor={v} assignedTo={user.isAdmin ? v.assignedTo : null}
                onClick={() => onSelectVisitor({ visitor: v, listId: list.id, listName: list.name, listType: "pastor" })} />)}
            </div>
          );
        })
      }
    </div>
  );
}

// ── FILE UPLOAD ───────────────────────────────────────────────────────────
function FileUploadArea({ onParsed, accent = "#185FA5", accentBg = "#E6F1FB", showCategory }) {
  const ref = useRef();
  const [dragging, setDragging] = useState(false);
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onParsed(parseTxtFile(e.target.result));
    reader.readAsText(file);
  }
  return (
    <div style={{ border: `1.5px dashed ${dragging ? accent : "#D0CFC9"}`, borderRadius: 8, padding: 14, textAlign: "center", background: dragging ? accentBg : "#FAFAF8", cursor: "pointer", marginBottom: 10 }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => ref.current.click()}>
      <input ref={ref} type="file" accept=".txt,.csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      <div style={{ fontSize: 22, marginBottom: 4 }}>📂</div>
      <div style={{ fontSize: 13, color: "#888" }}>Drop .txt or .csv here, or <span style={{ color: accent, fontWeight: 500 }}>click to browse</span></div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>Format: Name, Phone{showCategory ? ", Category (man/woman/youth)" : ""}</div>
    </div>
  );
}

// ── PERSONAL DASHBOARD ────────────────────────────────────────────────────
function PersonalDashboard({ user, lists, pastorLists, leaderMembers, currentWeek, members }) {
  const isPastor = user.isPastor;
  const isLeader = user.isLeader;

  let myVisitors = [];
  let teamVisitors = [];
  let scopeLabel = "";

  if (isPastor) {
    myVisitors = pastorLists.filter(l => l.status === "active").flatMap(l => (l.visitors||[]).filter(v => v.assignedTo === user.name));
    teamVisitors = pastorLists.filter(l => l.status === "active").flatMap(l => l.visitors||[]);
    scopeLabel = "pastoral team";
  } else if (isLeader) {
    myVisitors = leaderMembers.filter(m => m.category === user.leaderCategory);
    teamVisitors = myVisitors; // one leader per category typically
    scopeLabel = LEADER_META[user.leaderCategory]?.roleLabel || "leaders";
  } else if (user.group) {
    myVisitors = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group)
      .flatMap(l => (l.visitors||[]).filter(v => v.assignedTo === user.name));
    teamVisitors = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group)
      .flatMap(l => l.visitors||[]);
    scopeLabel = `Group ${user.group}`;
  }

  const myCalled = myVisitors.filter(v => v.status === "called").length;
  const myNotReached = myVisitors.filter(v => v.status === "not_reached").length;
  const myLeft = myVisitors.filter(v => v.status === "left_message").length;
  const myPending = myVisitors.filter(v => !v.status || v.status === "pending").length;
  const teamCalled = teamVisitors.filter(v => v.status === "called").length;

  const myStatusData = [
    { label: "Pending", value: myPending, color: STATUS_COLORS.pending },
    { label: "Calling", value: myVisitors.filter(v => v.status === "calling").length, color: STATUS_COLORS.calling },
    { label: "Called", value: myCalled, color: STATUS_COLORS.called },
    { label: "No ans.", value: myNotReached, color: STATUS_COLORS.not_reached },
    { label: "Msg left", value: myLeft, color: STATUS_COLORS.left_message },
  ];

  const allFV = lists.filter(l => l.status === "active").flatMap(l => l.visitors || []);
  const allCalled = allFV.filter(v => v.status === "called").length;
  const allEstablished = leaderMembers.length;

  const gm = user.group ? GROUP_META[user.group] : (isLeader ? LEADER_META[user.leaderCategory] : PASTOR_META);

  return (
    <div className="tab-content">
      <div style={{ background: gm.bg, border: `1px solid ${gm.border}`, borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
        <DonutChart visitors={myVisitors} size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: gm.color }}>{user.name}</div>
          <div style={{ fontSize: 12, color: gm.color, opacity: 0.8, marginBottom: 6 }}>{scopeLabel} · Week {currentWeek}</div>
          <div style={{ fontSize: 13, color: gm.color }}>
            <b>{myCalled}</b> called · <b>{myNotReached}</b> not reached · <b>{myLeft}</b> msg left · <b>{myPending}</b> pending
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={myVisitors.length} label="Assigned to me" />
        <StatCard value={myCalled} label="Called ✓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={myVisitors.length > 0 ? Math.round(myCalled / myVisitors.length * 100) + "%" : "0%"} />
        <StatCard value={myPending} label="Still pending" bg="#FAEEDA" color="#633806" border="#EF9F27" />
      </div>
      {!isPastor && (
        <div style={{ fontSize: 12, color: "#888", marginBottom: 12, padding: "6px 10px", background: "#F7F6F3", borderRadius: 8 }}>
          {scopeLabel} total: <b style={{ color: "#1A1A1A" }}>{teamVisitors.length}</b> contacts · <b style={{ color: "#27500A" }}>{teamCalled}</b> called
        </div>
      )}

      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">My call breakdown</div>
        <BarChart data={myStatusData} height={70} />
        <StatusLegend compact />
      </div>

      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">My progress vs {scopeLabel}</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>Me — {user.name}</span>
            <span style={{ color: "#888" }}>{myCalled}/{myVisitors.length} ({myVisitors.length > 0 ? Math.round(myCalled / myVisitors.length * 100) : 0}%)</span>
          </div>
          <ProgressBar value={myCalled} max={myVisitors.length} color={gm.bar || "#185FA5"} height={10} />
        </div>
        {!isPastor && !isLeader && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "#888" }}>All of {scopeLabel}</span>
              <span style={{ color: "#888" }}>{teamCalled}/{teamVisitors.length} ({teamVisitors.length > 0 ? Math.round(teamCalled / teamVisitors.length * 100) : 0}%)</span>
            </div>
            <ProgressBar value={teamCalled} max={teamVisitors.length} color="#D0CFC9" height={10} />
          </div>
        )}
      </div>

      <div className="dash-card">
        <div className="dash-section-title">Overall church follow-up — Week {currentWeek}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <DonutChart visitors={allFV} size={60} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{allCalled}<span style={{ fontSize: 13, fontWeight: 400, color: "#888" }}>/{allFV.length} called</span></div>
            <ProgressBar value={allCalled} max={allFV.length} color="#97C459" height={8} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {GROUPS.map(g => {
            const gvs = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === g).flatMap(l => l.visitors || []);
            const gc = gvs.filter(v => v.status === "called").length;
            const gm2 = GROUP_META[g];
            return (
              <div key={g} style={{ flex: 1, textAlign: "center", background: gm2.bg, border: `1px solid ${gm2.border}`, borderRadius: 8, padding: "6px 4px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: gm2.color }}>{gvs.length > 0 ? Math.round(gc / gvs.length * 100) : 0}%</div>
                <div style={{ fontSize: 10, color: gm2.color }}>Grp {g}</div>
                <div style={{ fontSize: 9, color: "#aaa" }}>{gc}/{gvs.length}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: "#888", background: "#F7F6F3", borderRadius: 8, padding: "6px 10px" }}>
          🎓 <b style={{ color: "#1A1A1A" }}>{allEstablished}</b> members have completed the cycle and become established members with Group Leaders
        </div>
      </div>
    </div>
  );
}

// ── ADMIN DASHBOARD ────────────────────────────────────────────────────────
function AdminDashboard({ lists, pastorLists, leaderMembers, currentWeek, members, tasks }) {
  const activeFollowup = lists.filter(l => l.status === "active");
  const activePastor = pastorLists.filter(l => l.status === "active");
  const allFV = activeFollowup.flatMap(l => l.visitors || []);
  const allPV = activePastor.flatMap(l => l.visitors || []);
  const allCalled = allFV.filter(v => v.status === "called").length;
  const pastorCalled = allPV.filter(v => v.status === "called").length;
  const establishedCalled = leaderMembers.filter(v => v.status === "called").length;

  const weekData = Array.from({ length: 8 }, (_, i) => {
    const w = currentWeek - 7 + i;
    if (w < 1) return { label: `—`, value: 0 };
    const wvs = lists.filter(l => l.createdWeek === w).flatMap(l => l.visitors || []);
    return { label: `W${w}`, value: wvs.length };
  });
  const monthlyMap = {};
  lists.forEach(l => { const m = weekToMonth(l.createdWeek); monthlyMap[m] = (monthlyMap[m] || 0) + (l.visitors?.length || 0); });
  const monthData = Object.entries(monthlyMap).slice(-6).map(([label, value]) => ({ label: label.split(" ")[0], value, color: "#7B3FA8" }));

  const teamMembers = members.filter(m => !m.isAdmin && !m.isPastor && !m.isLeader && m.group);
  const pastors = members.filter(m => m.isPastor);
  const leaders = members.filter(m => m.isLeader);

  const totalEverAdded = lists.flatMap(l => l.visitors || []).length; // includes archived
  const conversionRate = totalEverAdded > 0 ? Math.round(leaderMembers.length / totalEverAdded * 100) : 0;

  return (
    <div className="tab-content">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={allFV.length} label="Active new visitors" />
        <StatCard value={allCalled} label="Called ✓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={allFV.length > 0 ? Math.round(allCalled / allFV.length * 100) + "%" : ""} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={leaderMembers.length} label="Established members 🎓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={conversionRate + "% conversion"} />
        <StatCard value={allPV.length} label="Lapsed members" bg={PASTOR_META.bg} color={PASTOR_META.color} border={PASTOR_META.border} />
      </div>

      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">Group progress — Week {currentWeek}</div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 4px" }}>
          {GROUPS.map(g => {
            const gvs = activeFollowup.filter(l => groupForOffset(l.createdWeek, currentWeek) === g).flatMap(l => l.visitors || []);
            const gc = gvs.filter(v => v.status === "called").length;
            return (
              <div key={g} style={{ textAlign: "center" }}>
                <DonutChart visitors={gvs} size={64} />
                <div style={{ fontSize: 12, fontWeight: 600, color: GROUP_META[g].color, marginTop: 4 }}>Group {g}</div>
                <div style={{ fontSize: 10, color: "#aaa" }}>{gc}/{gvs.length}</div>
              </div>
            );
          })}
        </div>
        <StatusLegend compact />
      </div>

      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">Individual team member progress</div>
        {teamMembers.length === 0 ? <p className="empty-note">No team members added yet.</p>
          : teamMembers.map(m => {
            const mine = allFV.filter(v => v.assignedTo === m.name);
            const mCalled = mine.filter(v => v.status === "called").length;
            const pct = mine.length > 0 ? Math.round(mCalled / mine.length * 100) : 0;
            const gmx = GROUP_META[m.group] || GROUP_META.A;
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div><span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                    <span style={{ fontSize: 10, marginLeft: 6, padding: "1px 6px", borderRadius: 20, background: gmx.bg, color: gmx.color, border: `1px solid ${gmx.border}` }}>Grp {m.group}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#888" }}>{mCalled}/{mine.length} · {pct}%</span>
                </div>
                <ProgressBar value={mCalled} max={mine.length} color={gmx.bar} height={8} />
              </div>
            );
          })
        }
      </div>

      {leaders.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 12 }}>
          <div className="dash-section-title">Church Group Leaders — Established members</div>
          {["man","woman","youth"].map(cat => {
            const leader = leaders.find(l => l.leaderCategory === cat);
            const cm = LEADER_META[cat];
            const catMembers = leaderMembers.filter(m => m.category === cat);
            const cCalled = catMembers.filter(m => m.status === "called").length;
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{cm.icon} {cm.roleLabel} {leader ? `— ${leader.name}` : "(unassigned)"}</span>
                  <span style={{ fontSize: 12, color: "#888" }}>{cCalled}/{catMembers.length}</span>
                </div>
                <ProgressBar value={cCalled} max={catMembers.length} color={cm.color} height={8} />
              </div>
            );
          })}
        </div>
      )}

      {pastors.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 12 }}>
          <div className="dash-section-title">Pastor progress — Lapsed members (private)</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <DonutChart visitors={allPV} size={60} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: PASTOR_META.color }}>{pastorCalled}/{allPV.length}</div>
              <ProgressBar value={pastorCalled} max={allPV.length} color={PASTOR_META.bar} height={8} />
            </div>
          </div>
        </div>
      )}

      <div className="dash-card" style={{ marginBottom: 12 }}>
        <BarChart data={weekData} title="New visitors per week (last 8 weeks)" height={90} />
      </div>
      {monthData.length > 0 && (
        <div className="dash-card">
          <BarChart data={monthData} title="Monthly visitor totals" height={90} />
        </div>
      )}
    </div>
  );
}

// ── TASKS ──────────────────────────────────────────────────────────────────
const TASK_PRIORITY = {
  low:    { label: "Low",    bg: "#F7F6F3", color: "#5F5E5A", border: "#C4C2BA" },
  normal: { label: "Normal", bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  urgent: { label: "Urgent", bg: "#FBEAF0", color: "#72243E", border: "#ED93B1" },
};
const TASK_STATUS = {
  open:        { label: "To do",       bg: "#F1F0EC", color: "#5F5E5A", border: "#C4C2BA" },
  in_progress: { label: "In progress", bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  done:        { label: "Done ✓",      bg: "#EAF3DE", color: "#27500A", border: "#97C459" },
};

function TaskCard({ task, user, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const ps = TASK_PRIORITY[task.priority] || TASK_PRIORITY.normal;
  const ts = TASK_STATUS[task.status] || TASK_STATUS.open;
  const canEdit = user.isAdmin || task.assignedTo === user.name ||
    (task.assignedToType === "group" && task.assignedTo === user.group) ||
    (task.assignedToType === "pastors" && user.isPastor) ||
    (task.assignedToType === "leaders" && user.isLeader) ||
    task.assignedToType === "all";

  async function changeStatus(status) {
    await updateDoc(doc(db, "tasks", task.id), { status, updatedBy: user.name, updatedAt: Date.now() });
    if (status === "done") setOpen(true);
    onUpdate();
  }
  async function postNote() {
    if (!note.trim()) return;
    setSaving(true);
    const nc = { id: uid(), text: note.trim(), author: user.name, ts: Date.now() };
    await updateDoc(doc(db, "tasks", task.id), { comments: [...(task.comments || []), nc] });
    setNote(""); setSaving(false); onUpdate();
  }
  const overdue = task.dueDate && task.status !== "done" && new Date(task.dueDate) < new Date();

  return (
    <div style={{ background: "#fff", border: `0.5px solid ${overdue ? "#ED93B1" : "#E0DFDB"}`, borderLeft: `3px solid ${ps.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{task.title}</div>
          {task.description && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{task.description}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>{ps.label}</span>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: ts.bg, color: ts.color, border: `1px solid ${ts.border}` }}>{ts.label}</span>
            {task.assignedToType === "member" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#F7F6F3", color: "#444", border: "1px solid #E0DFDB" }}>👤 {task.assignedTo}</span>}
            {task.assignedToType === "group" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: GROUP_META[task.assignedTo]?.bg, color: GROUP_META[task.assignedTo]?.color, border: `1px solid ${GROUP_META[task.assignedTo]?.border}` }}>Group {task.assignedTo}</span>}
            {task.assignedToType === "pastors" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: PASTOR_META.bg, color: PASTOR_META.color, border: `1px solid ${PASTOR_META.border}` }}>All Pastors</span>}
            {task.assignedToType === "leaders" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#FFF6DE", color: "#7A5B00", border: "1px solid #F0CC5C" }}>All Leaders</span>}
            {task.assignedToType === "all" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#F7F6F3", color: "#444", border: "1px solid #E0DFDB" }}>Everyone</span>}
            {task.dueDate && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: overdue ? "#FBEAF0" : "#F7F6F3", color: overdue ? "#72243E" : "#888", border: `1px solid ${overdue ? "#ED93B1" : "#E0DFDB"}` }}>{overdue ? "⚠ Overdue · " : "📅 "}{task.dueDate}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {user.isAdmin && <button className="btn-del" onClick={() => onDelete(task.id)} style={{ fontSize: 14 }}>×</button>}
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setOpen(o => !o)}>{task.comments?.length > 0 ? `💬 ${task.comments.length}` : "💬"} {open ? "▲" : "▼"}</button>
        </div>
      </div>
      {canEdit && task.status !== "done" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {task.status === "open" && <button style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 6, border: "1px solid #85B7EB", background: "#E6F1FB", color: "#0C447C", cursor: "pointer" }} onClick={() => changeStatus("in_progress")}>▶ Start</button>}
          {task.status === "in_progress" && <button style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 6, border: "1px solid #97C459", background: "#EAF3DE", color: "#27500A", cursor: "pointer" }} onClick={() => changeStatus("done")}>✓ Mark done</button>}
          {task.status !== "open" && <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #D0CFC9", background: "#F7F6F3", color: "#888", cursor: "pointer" }} onClick={() => changeStatus("open")}>↩ Reopen</button>}
        </div>
      )}
      {task.status === "done" && !open && (
        <div style={{ marginTop: 10, background: "#EAF3DE", border: "1px solid #97C459", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#27500A" }}>✓ Completed by {task.updatedBy || "team"}{task.comments?.length > 0 && <span style={{ marginLeft: 6 }}>· {task.comments.length} note{task.comments.length !== 1 ? "s" : ""}</span>}</div>
          <button className="btn-ghost" style={{ fontSize: 11, color: "#27500A" }} onClick={() => setOpen(true)}>{task.comments?.length > 0 ? "View notes" : "Add note"} ▼</button>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10, borderTop: "0.5px solid #F0EFEB", paddingTop: 10 }}>
          {task.status === "done" && <div style={{ fontSize: 12, color: "#27500A", background: "#EAF3DE", border: "1px solid #97C459", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>✓ Completed by <b>{task.updatedBy || "team"}</b> — leave a note about how it went</div>}
          {(!task.comments || task.comments.length === 0) && <p className="empty-note">No notes yet — add one below.</p>}
          {(task.comments || []).map(c => (
            <div key={c.id} className="comment-card"><div className="comment-meta"><span className="comment-author">{c.author}</span><span className="comment-time">{fmtDT(c.ts)}</span></div><p className="comment-text">{c.text}</p></div>
          ))}
          <div className="comment-compose">
            <input className="field-input" placeholder={task.status === "done" ? "How did it go?" : "Add a note…"} value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && postNote()} />
            <button className="btn-primary" onClick={postNote} disabled={saving}>{saving ? "…" : "Post"}</button>
          </div>
          <button className="btn-ghost" style={{ fontSize: 11, marginTop: 6 }} onClick={() => setOpen(false)}>▲ Collapse</button>
        </div>
      )}
    </div>
  );
}

function TasksTab({ tasks, user, members, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignType, setAssignType] = useState("member");
  const [assignTo, setAssignTo] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("mine");

  const myTasks = tasks.filter(t => {
    if (t.assignedToType === "all") return true;
    if (t.assignedToType === "member" && t.assignedTo === user.name) return true;
    if (t.assignedToType === "group" && t.assignedTo === user.group) return true;
    if (t.assignedToType === "pastors" && user.isPastor) return true;
    if (t.assignedToType === "leaders" && user.isLeader) return true;
    return false;
  });
  const openTasks = myTasks.filter(t => t.status !== "done");
  const doneTasks = myTasks.filter(t => t.status === "done");
  const shownTasks = filter === "mine" ? myTasks : filter === "open" ? openTasks : doneTasks;

  async function createTask() {
    if (!title.trim()) { setMsg("Task title is required."); return; }
    if ((assignType === "member" || assignType === "group") && !assignTo) { setMsg("Select who to assign this task to."); return; }
    setSaving(true);
    const id = "t_" + uid();
    await setDoc(doc(db, "tasks", id), {
      id, title: title.trim(), description: desc.trim(),
      assignedToType: assignType,
      assignedTo: (assignType === "member" || assignType === "group") ? assignTo : assignType,
      priority, dueDate: dueDate || null, status: "open", comments: [],
      createdBy: user.name, createdAt: Date.now(),
    });
    setTitle(""); setDesc(""); setAssignTo(""); setDueDate(""); setPriority("normal");
    setMsg("✓ Task created!"); setSaving(false); setShowCreate(false);
    onRefresh(); setTimeout(() => setMsg(""), 3000);
  }
  async function deleteTask(id) { if (window.confirm("Delete this task?")) { await deleteDoc(doc(db, "tasks", id)); onRefresh(); } }

  const nonAdminMembers = members.filter(m => !m.isAdmin);

  return (
    <div className="tab-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Tasks <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>({openTasks.length} open)</span></div>
        {user.isAdmin && <button className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setShowCreate(s => !s)}>{showCreate ? "Cancel" : "+ New task"}</button>}
      </div>
      {msg && <p className={msg.startsWith("✓") ? "success-text" : "err-text"} style={{ marginBottom: 8 }}>{msg}</p>}
      {showCreate && (
        <div className="manage-card" style={{ marginBottom: 14 }}>
          <div className="manage-card-title">Create new task</div>
          <label className="field-label">Title *</label>
          <input className="field-input" placeholder="Task title" value={title} onChange={e => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <label className="field-label">Description (optional)</label>
          <textarea className="field-input" placeholder="More details…" value={desc} onChange={e => setDesc(e.target.value)} style={{ marginBottom: 8, minHeight: 60, resize: "vertical" }} />
          <label className="field-label">Assign to</label>
          <select className="field-input" value={assignType} onChange={e => { setAssignType(e.target.value); setAssignTo(""); }} style={{ marginBottom: 6 }}>
            <option value="member">A specific person</option>
            <option value="group">A follow-up group (A/B/C/D)</option>
            <option value="pastors">All pastors</option>
            <option value="leaders">All group leaders</option>
            <option value="all">Everyone</option>
          </select>
          {assignType === "member" && (
            <select className="field-input" value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">-- Select person --</option>
              {nonAdminMembers.map(m => <option key={m.id} value={m.name}>{m.name} ({m.isPastor ? "Pastor" : m.isLeader ? LEADER_META[m.leaderCategory]?.roleLabel : `Group ${m.group}`})</option>)}
            </select>
          )}
          {assignType === "group" && (
            <select className="field-input" value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">-- Select group --</option>
              {GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}><label className="field-label">Priority</label>
              <select className="field-input" value={priority} onChange={e => setPriority(e.target.value)}>
                {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}><label className="field-label">Due date (optional)</label>
              <input type="date" className="field-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary full" onClick={createTask} disabled={saving}>{saving ? "Saving…" : "Create task"}</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["mine", `All (${myTasks.length})`], ["open", `Open (${openTasks.length})`], ["done", `Done (${doneTasks.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, border: "0.5px solid", cursor: "pointer", background: filter === k ? "#185FA5" : "#F7F6F3", color: filter === k ? "#fff" : "#444", borderColor: filter === k ? "#185FA5" : "#D0CFC9" }}>{l}</button>
        ))}
      </div>
      {shownTasks.length === 0 ? <div className="empty-state">{filter === "done" ? "No completed tasks yet." : "No tasks assigned to you."}</div>
        : shownTasks.sort((a, b) => ({ urgent: 0, normal: 1, low: 2 }[a.priority] || 1) - ({ urgent: 0, normal: 1, low: 2 }[b.priority] || 1))
          .map(t => <TaskCard key={t.id} task={t} user={user} onUpdate={onRefresh} onDelete={deleteTask} />)
      }
    </div>
  );
}

// ── QUERY / REPORTS TAB (Admin only) ──────────────────────────────────────
function QueryTab({ lists, pastorLists, leaderMembers, members }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [weekFrom, setWeekFrom] = useState("");
  const [weekTo, setWeekTo] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [nameSearch, setNameSearch] = useState("");
  const [dataset, setDataset] = useState("new_visitors"); // new_visitors | established | lapsed

  // Flatten all visitors from the selected dataset with metadata for filtering
  function getFlattened() {
    if (dataset === "established") {
      return leaderMembers.map(v => ({ ...v, sourceWeek: null, sourceDate: v.graduatedAt }));
    }
    if (dataset === "lapsed") {
      return pastorLists.flatMap(l => (l.visitors || []).map(v => ({ ...v, listName: l.name, sourceDate: l.createdAt?.toMillis ? l.createdAt.toMillis() : null })));
    }
    // new_visitors (includes active + archived, i.e. full history)
    return lists.flatMap(l => (l.visitors || []).map(v => ({
      ...v, listName: l.name, sourceWeek: l.createdWeek, assignedGroupOfList: l.assignedGroup,
      sourceDate: l.createdAt?.toMillis ? l.createdAt.toMillis() : null
    })));
  }

  let results = getFlattened();

  if (nameSearch.trim()) {
    const q = nameSearch.trim().toLowerCase();
    results = results.filter(v => v.name.toLowerCase().includes(q));
  }
  if (statusFilter !== "all") results = results.filter(v => (v.status || "pending") === statusFilter);
  if (dataset === "new_visitors" && groupFilter !== "all") results = results.filter(v => v.assignedGroupOfList === groupFilter || v.assignedGroup === groupFilter);
  if (dataset === "established" && categoryFilter !== "all") results = results.filter(v => v.category === categoryFilter);
  if (dataset === "new_visitors" && (weekFrom || weekTo)) {
    results = results.filter(v => {
      const w = v.sourceWeek;
      if (w == null) return false;
      if (weekFrom && w < parseInt(weekFrom)) return false;
      if (weekTo && w > parseInt(weekTo)) return false;
      return true;
    });
  }
  if (dateFrom || dateTo) {
    results = results.filter(v => {
      if (!v.sourceDate) return false;
      const d = new Date(v.sourceDate);
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }

  // Aggregate stats across ALL history (not filtered) for the summary section
  const allNewVisitorsEver = lists.flatMap(l => l.visitors || []);
  const totalEverAdded = allNewVisitorsEver.length;
  const totalEverCalled = allNewVisitorsEver.filter(v => v.status === "called").length;
  const totalEstablished = leaderMembers.length;
  const conversionRate = totalEverAdded > 0 ? Math.round(totalEstablished / totalEverAdded * 100) : 0;
  const byCategory = ["man", "woman", "youth"].map(cat => ({
    cat, count: leaderMembers.filter(m => m.category === cat).length
  }));
  const byGroupEver = GROUPS.map(g => ({
    g, count: lists.filter(l => l.assignedGroup === g).flatMap(l => l.visitors || []).length
  }));

  function exportResults() {
    const rows = results.map(v => [v.name, v.phone || "", v.status || "pending", v.assignedTo || "", v.listName || "", v.category || ""].join(","));
    const csv = "Name,Phone,Status,AssignedTo,List,Category\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `query_results_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tab-content">
      {/* Summary stats — always visible, all-time */}
      <div className="manage-card">
        <div className="manage-card-title">📈 All-time summary</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <StatCard value={totalEverAdded} label="Total visitors ever added" />
          <StatCard value={totalEverCalled} label="Total ever called" bg="#EAF3DE" color="#27500A" border="#97C459" />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <StatCard value={totalEstablished} label="Became established 🎓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={conversionRate + "% conversion rate"} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 6 }}>Established members by category</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {byCategory.map(c => (
            <div key={c.cat} style={{ flex: 1, textAlign: "center", background: CATEGORY_META[c.cat].bg, border: `1px solid ${CATEGORY_META[c.cat].border}`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: CATEGORY_META[c.cat].color }}>{c.count}</div>
              <div style={{ fontSize: 10, color: CATEGORY_META[c.cat].color }}>{CATEGORY_META[c.cat].icon} {CATEGORY_META[c.cat].label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 6 }}>Visitors ever assigned by group</div>
        <div style={{ display: "flex", gap: 6 }}>
          {byGroupEver.map(g => (
            <div key={g.g} style={{ flex: 1, textAlign: "center", background: GROUP_META[g.g].bg, border: `1px solid ${GROUP_META[g.g].border}`, borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: GROUP_META[g.g].color }}>{g.count}</div>
              <div style={{ fontSize: 10, color: GROUP_META[g.g].color }}>Group {g.g}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Query filters */}
      <div className="manage-card">
        <div className="manage-card-title">🔍 Search historical records</div>
        <label className="field-label">Dataset</label>
        <select className="field-input" value={dataset} onChange={e => setDataset(e.target.value)} style={{ marginBottom: 10 }}>
          <option value="new_visitors">New visitors (all history, active + archived)</option>
          <option value="established">Established members (graduated to leaders)</option>
          <option value="lapsed">Lapsed members (pastor records)</option>
        </select>

        <label className="field-label">Search by name</label>
        <input className="field-input" placeholder="Type a name…" value={nameSearch} onChange={e => setNameSearch(e.target.value)} style={{ marginBottom: 10 }} />

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="field-label">Date from</label>
            <input type="date" className="field-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Date to</label>
            <input type="date" className="field-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        {dataset === "new_visitors" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}><label className="field-label">Week from</label>
                <input type="number" className="field-input" value={weekFrom} onChange={e => setWeekFrom(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}><label className="field-label">Week to</label>
                <input type="number" className="field-input" value={weekTo} onChange={e => setWeekTo(e.target.value)} />
              </div>
            </div>
            <label className="field-label">Group</label>
            <select className="field-input" value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{ marginBottom: 10 }}>
              <option value="all">All groups</option>
              {GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}
            </select>
          </>
        )}

        {dataset === "established" && (
          <>
            <label className="field-label">Category</label>
            <select className="field-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ marginBottom: 10 }}>
              <option value="all">All categories</option>
              <option value="man">Men</option>
              <option value="woman">Women</option>
              <option value="youth">Youth</option>
            </select>
          </>
        )}

        <label className="field-label">Call status</label>
        <select className="field-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{results.length} result{results.length !== 1 ? "s" : ""}</span>
          {results.length > 0 && <button className="btn-outline" style={{ fontSize: 12 }} onClick={exportResults}>⬇ Export CSV</button>}
        </div>

        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {results.length === 0 ? <p className="empty-note">No matching records.</p>
            : results.map((v, i) => {
              const sm = STATUS_META[v.status || "pending"];
              return (
                <div key={v.id + i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #F0EFEB" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v.name}{v.category && <span style={{ marginLeft: 4, fontSize: 11 }}>{CATEGORY_META[v.category]?.icon}</span>}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      {v.listName || ""} {v.sourceWeek ? `· Week ${v.sourceWeek}` : ""} {v.assignedTo ? `· ${v.assignedTo}` : ""}
                    </div>
                  </div>
                  <span className="status-chip" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}`, flexShrink: 0 }}>{sm.label}</span>
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}

// ── MANAGE TAB ────────────────────────────────────────────────────────────
function ManageTab({ lists, pastorLists, leaderMembers, currentWeek, onWeekChange, user, members }) {
  const [sec, setSec] = useState("newvisitors");
  const [nvName, setNvName] = useState(""); const [nvWeek, setNvWeek] = useState(currentWeek);
  const [nvEntries, setNvEntries] = useState([]); const [nvInput, setNvInput] = useState(""); const [nvPhone, setNvPhone] = useState(""); const [nvCategory, setNvCategory] = useState("");
  const [nvMsg, setNvMsg] = useState(""); const [nvSaving, setNvSaving] = useState(false);
  const [lmName, setLmName] = useState("");
  const [lmEntries, setLmEntries] = useState([]); const [lmInput, setLmInput] = useState(""); const [lmPhone, setLmPhone] = useState("");
  const [lmMsg, setLmMsg] = useState(""); const [lmSaving, setLmSaving] = useState(false);
  const [memName, setMemName] = useState(""); const [memRole, setMemRole] = useState("A");
  const [memPin, setMemPin] = useState(""); const [memMsg, setMemMsg] = useState("");
  const [newPin, setNewPin] = useState(""); const [pinMsg, setPinMsg] = useState("");
  const [assignMsg, setAssignMsg] = useState("");

  function addNvEntry() { if (nvInput.trim()) { setNvEntries(p => [...p, { name: nvInput.trim(), phone: nvPhone.trim(), category: nvCategory }]); setNvInput(""); setNvPhone(""); setNvCategory(""); } }
  function addLmEntry() { if (lmInput.trim()) { setLmEntries(p => [...p, { name: lmInput.trim(), phone: lmPhone.trim() }]); setLmInput(""); setLmPhone(""); } }

  async function createNewVisitorList() {
    if (!nvName.trim() || nvEntries.length === 0) { setNvMsg("Add a list name and at least one visitor."); return; }
    setNvSaving(true);
    const week = parseInt(nvWeek) || currentWeek;
    const groupIndex = (week - 1) % 4;
    const targetGroup = GROUPS[groupIndex];
    const groupMembers = members.filter(m => !m.isAdmin && !m.isPastor && !m.isLeader && m.group === targetGroup).sort((a, b) => a.name.localeCompare(b.name));
    if (groupMembers.length === 0) { setNvMsg(`⚠ No members in Group ${targetGroup} yet. Add members first.`); setNvSaving(false); return; }
    const rotationRef = doc(db, "config", `rotation_${targetGroup}`);
    const rotationSnap = await getDoc(rotationRef);
    const startIndex = rotationSnap.exists() ? (rotationSnap.data().nextIndex || 0) : 0;
    const visitors = nvEntries.map((e, i) => {
      const memberIndex = (startIndex + i) % groupMembers.length;
      return { id: uid(), name: e.name, phone: e.phone || "", category: e.category || "", status: "pending", comments: [], assignedTo: groupMembers[memberIndex].name, assignedGroup: targetGroup };
    });
    const nextIndex = (startIndex + nvEntries.length) % groupMembers.length;
    await setDoc(rotationRef, { nextIndex, lastUpdated: Date.now() });
    const id = uid();
    await setDoc(doc(db, "lists", id), { id, name: nvName.trim(), createdWeek: week, assignedGroup: targetGroup, visitors, status: "active", createdAt: serverTimestamp() });
    setNvName(""); setNvEntries([]); setNvInput(""); setNvPhone(""); setNvCategory("");
    const summary = groupMembers.map(m => `${m.name}: ${visitors.filter(v => v.assignedTo === m.name).length}`).join(", ");
    setNvMsg(`✓ List created for Group ${targetGroup} (Week ${week}). Assignment: ${summary}. Next week starts from ${groupMembers[nextIndex].name}.`);
    setNvSaving(false);
    setTimeout(() => setNvMsg(""), 8000);
  }

  async function createLapsedList() {
    if (!lmName.trim() || lmEntries.length === 0) { setLmMsg("Add a list name and at least one member."); return; }
    setLmSaving(true);
    const id = uid();
    const pastors = members.filter(m => m.isPastor).sort((a, b) => a.name.localeCompare(b.name));
    const visitors = lmEntries.map((e, i) => ({ id: uid(), name: e.name, phone: e.phone || "", status: "pending", comments: [], assignedTo: pastors.length > 0 ? pastors[i % pastors.length].name : null }));
    await setDoc(doc(db, "pastor_lists", id), { id, name: lmName.trim(), visitors, status: "active", createdAt: serverTimestamp() });
    setLmName(""); setLmEntries([]); setLmInput(""); setLmPhone("");
    setLmMsg("✓ Lapsed member list created and assigned to pastors!"); setLmSaving(false);
    setTimeout(() => setLmMsg(""), 4000);
  }

  async function addMember() {
    if (!memName.trim() || !memPin.trim()) { setMemMsg("Name and PIN required."); return; }
    if (memPin.trim().length < 4) { setMemMsg("PIN must be at least 4 characters."); return; }
    const key = slug(memName);
    const isPastor = memRole === "pastor";
    const isLeader = ["leader_man", "leader_woman", "leader_youth"].includes(memRole);
    const leaderCategory = isLeader ? memRole.replace("leader_", "") : null;
    const group = (!isPastor && !isLeader) ? memRole : null;
    await setDoc(doc(db, "members", key), { name: memName.trim(), group, isAdmin: false, isPastor, isLeader, leaderCategory, pin: memPin.trim(), mustChangePIN: true });
    setMemName(""); setMemPin("");
    setMemMsg(`✓ ${memName.trim()} added. They'll set their own PIN on first login.`);
    setTimeout(() => setMemMsg(""), 5000);
  }
  async function deleteMember(id) { if (window.confirm("Remove this member?")) await deleteDoc(doc(db, "members", id)); }
  async function changePin() {
    if (!newPin.trim() || newPin.trim().length < 4) { setPinMsg("PIN must be at least 4 characters."); return; }
    await updateDoc(doc(db, "members", user.key), { pin: newPin.trim() });
    setNewPin(""); setPinMsg("✓ PIN updated!"); setTimeout(() => setPinMsg(""), 3000);
  }
  async function reassignList(listId, targetGroup) {
    const snap = await getDoc(doc(db, "lists", listId));
    if (!snap.exists()) return;
    const groupMembers = members.filter(m => !m.isAdmin && !m.isPastor && !m.isLeader && m.group === targetGroup).sort((a, b) => a.name.localeCompare(b.name));
    if (!groupMembers.length) { setAssignMsg(`No members in Group ${targetGroup}.`); return; }
    const rotationRef = doc(db, "config", `rotation_${targetGroup}`);
    const rotationSnap = await getDoc(rotationRef);
    const startIndex = rotationSnap.exists() ? (rotationSnap.data().nextIndex || 0) : 0;
    const existing = snap.data().visitors;
    const visitors = existing.map((v, i) => ({ ...v, assignedTo: groupMembers[(startIndex + i) % groupMembers.length].name, assignedGroup: targetGroup }));
    const nextIndex = (startIndex + existing.length) % groupMembers.length;
    await setDoc(rotationRef, { nextIndex, lastUpdated: Date.now() });
    await updateDoc(doc(db, "lists", listId), { visitors });
    setAssignMsg(`✓ Reassigned within Group ${targetGroup}.`); setTimeout(() => setAssignMsg(""), 4000);
  }

  // Graduate a list: move every visitor to their category leader's established member roster
  async function graduateList(list) {
    const missingCategory = (list.visitors || []).filter(v => !v.category);
    if (missingCategory.length > 0) {
      if (!window.confirm(`${missingCategory.length} visitor(s) have no category set (man/woman/youth) and will be skipped. Continue graduating the rest?`)) return;
    }
    const toGraduate = (list.visitors || []).filter(v => v.category);
    if (toGraduate.length === 0) { setAssignMsg("No visitors with a category set to graduate."); return; }

    const leaders = members.filter(m => m.isLeader);
    for (const v of toGraduate) {
      const leader = leaders.find(l => l.leaderCategory === v.category);
      const entry = {
        id: uid(),
        name: v.name, phone: v.phone || "", category: v.category,
        status: "pending", comments: v.comments || [],
        assignedTo: leader ? leader.name : null,
        sourceListId: list.id, sourceListName: list.name,
        graduatedAt: Date.now(), graduatedFromGroup: list.assignedGroup || null,
      };
      await setDoc(doc(db, "leader_members", entry.id), entry);
    }
    await updateDoc(doc(db, "lists", list.id), { status: "graduated" });
    setAssignMsg(`✓ ${toGraduate.length} member(s) passed on to Group Leaders!`);
    setTimeout(() => setAssignMsg(""), 5000);
  }

  const sections = [
    { id: "newvisitors", label: "👥 New visitors" },
    { id: "lapsed", label: "🙏 Lapsed" },
    { id: "members", label: "👤 Team" },
    { id: "week", label: "📅 Week" },
    { id: "pin", label: "🔑 My PIN" },
  ];

  return (
    <div className="tab-content">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSec(s.id)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: "0.5px solid", cursor: "pointer", background: sec === s.id ? "#185FA5" : "#F7F6F3", color: sec === s.id ? "#fff" : "#444", borderColor: sec === s.id ? "#185FA5" : "#D0CFC9" }}>{s.label}</button>
        ))}
      </div>

      {sec === "week" && (
        <div className="manage-card">
          <div className="manage-card-title">Current week</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="number" className="field-input" style={{ width: 80, textAlign: "center" }} defaultValue={currentWeek} onChange={e => onWeekChange(parseInt(e.target.value) || 1)} />
            <span style={{ fontSize: 13, color: "#888" }}>Updates for all team members</span>
          </div>
        </div>
      )}

      {sec === "newvisitors" && (<>
        <div className="manage-card">
          <div className="manage-card-title">Add new Sunday visitor list</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Add each visitor's category (man/woman/youth) so they can be passed to the right Group Leader after 4 weeks.</p>
          <label className="field-label">List name</label>
          <input className="field-input" placeholder='e.g. "July 20 Sunday"' value={nvName} onChange={e => setNvName(e.target.value)} style={{ marginBottom: 10 }} />
          <label className="field-label">Week number</label>
          <input type="number" className="field-input" style={{ width: 80, marginBottom: 12 }} value={nvWeek} onChange={e => setNvWeek(e.target.value)} />
          <FileUploadArea onParsed={rows => setNvEntries(p => [...p, ...rows])} showCategory />
          <label className="field-label">Or add one by one</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            <input className="field-input" placeholder="Full name" value={nvInput} onChange={e => setNvInput(e.target.value)} style={{ flex: "1 1 140px" }} />
            <input className="field-input" placeholder="Phone" value={nvPhone} onChange={e => setNvPhone(e.target.value)} style={{ maxWidth: 110 }} />
            <select className="field-input" value={nvCategory} onChange={e => setNvCategory(e.target.value)} style={{ maxWidth: 110 }}>
              <option value="">Category</option>
              <option value="man">👨 Man</option>
              <option value="woman">👩 Woman</option>
              <option value="youth">🧑 Youth</option>
            </select>
            <button className="btn-outline" onClick={addNvEntry}>Add</button>
          </div>
          {nvEntries.length > 0 && (
            <div className="chip-row">
              {nvEntries.map((e, i) => (
                <span key={i} className="name-chip">{e.name}{e.phone ? ` · ${e.phone}` : ""}{e.category ? ` ${CATEGORY_META[e.category].icon}` : " ⚠"}
                  <button className="chip-del" onClick={() => setNvEntries(p => p.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          {nvMsg && <p className={nvMsg.startsWith("✓") ? "success-text" : "err-text"}>{nvMsg}</p>}
          <button className="btn-primary full" style={{ marginTop: 8 }} onClick={createNewVisitorList} disabled={nvSaving}>{nvSaving ? "Saving…" : `Create & assign (${nvEntries.length} visitors)`}</button>
        </div>

        <div className="manage-card">
          <div className="manage-card-title">Active visitor lists</div>
          {assignMsg && <p className="success-text" style={{ marginBottom: 8 }}>{assignMsg}</p>}
          {lists.filter(l => l.status === "active").length === 0 ? <p className="empty-note">No active lists.</p>
            : lists.filter(l => l.status === "active").sort((a, b) => b.createdWeek - a.createdWeek).map(list => {
              const cyclesDone = currentWeek - list.createdWeek;
              const eligibleToGraduate = cyclesDone >= 3; // week 4 of the cycle (D)
              return (
                <div key={list.id} className="active-list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>📋 {list.name}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Week {list.createdWeek} · Group {list.assignedGroup} · {list.visitors?.length || 0} visitors</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => reassignList(list.id, list.assignedGroup)}>↺ Reassign</button>
                      {eligibleToGraduate && <button style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #97C459", background: "#EAF3DE", color: "#27500A", cursor: "pointer" }} onClick={() => graduateList(list)}>🎓 Graduate to Leaders</button>}
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => updateDoc(doc(db, "lists", list.id), { status: "archived" })}>Archive</button>
                    </div>
                  </div>
                  {(list.visitors || []).map(v => (
                    <div key={v.id} className="manage-visitor-row">
                      <span>{v.name}{v.category ? ` ${CATEGORY_META[v.category].icon}` : ""}{v.phone ? <span style={{ color: "#aaa", fontSize: 11 }}> · {v.phone}</span> : ""}</span>
                      <span style={{ fontSize: 11, color: "#888" }}>{v.assignedTo || "Unassigned"}</span>
                    </div>
                  ))}
                </div>
              );
            })
          }
        </div>
      </>)}

      {sec === "lapsed" && (<>
        <div className="manage-card">
          <div className="manage-card-title" style={{ color: PASTOR_META.color }}>Add lapsed member list</div>
          <label className="field-label">List name</label>
          <input className="field-input" placeholder='e.g. "July 2026 Lapsed"' value={lmName} onChange={e => setLmName(e.target.value)} style={{ marginBottom: 12 }} />
          <FileUploadArea onParsed={rows => setLmEntries(p => [...p, ...rows])} accent={PASTOR_META.color} accentBg={PASTOR_META.bg} />
          <label className="field-label">Or add one by one</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input className="field-input" placeholder="Full name" value={lmInput} onChange={e => setLmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addLmEntry()} />
            <input className="field-input" placeholder="Phone" value={lmPhone} onChange={e => setLmPhone(e.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn-outline" onClick={addLmEntry}>Add</button>
          </div>
          {lmEntries.length > 0 && (
            <div className="chip-row">
              {lmEntries.map((e, i) => (
                <span key={i} className="name-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, borderColor: PASTOR_META.border }}>{e.name}{e.phone ? ` · ${e.phone}` : ""}
                  <button className="chip-del" onClick={() => setLmEntries(p => p.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          {lmMsg && <p className={lmMsg.startsWith("✓") ? "success-text" : "err-text"}>{lmMsg}</p>}
          <button className="btn-primary full" style={{ marginTop: 8, background: PASTOR_META.color }} onClick={createLapsedList} disabled={lmSaving}>{lmSaving ? "Saving…" : `Create & assign to pastors (${lmEntries.length} members)`}</button>
        </div>
        <div className="manage-card">
          <div className="manage-card-title">Active lapsed member lists</div>
          {pastorLists.filter(l => l.status === "active").length === 0 ? <p className="empty-note">No active lapsed member lists.</p>
            : pastorLists.filter(l => l.status === "active").map(list => (
              <div key={list.id} className="active-list-item">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div><div style={{ fontWeight: 500, fontSize: 13 }}>📋 {list.name}</div><div style={{ fontSize: 11, color: "#888" }}>{list.visitors?.length || 0} members</div></div>
                  <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => updateDoc(doc(db, "pastor_lists", list.id), { status: "archived" })}>Archive</button>
                </div>
                {(list.visitors || []).map(v => (
                  <div key={v.id} className="manage-visitor-row"><span>{v.name}{v.phone ? <span style={{ color: "#aaa", fontSize: 11 }}> · {v.phone}</span> : ""}</span><span style={{ fontSize: 11, color: "#888" }}>{v.assignedTo || "Unassigned"}</span></div>
                ))}
              </div>
            ))
          }
        </div>
      </>)}

      {sec === "members" && (
        <div className="manage-card">
          <div className="manage-card-title">Team members</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Each new member sets their own personal PIN on first login.</p>
          <label className="field-label">Name</label>
          <input className="field-input" placeholder="Member name" value={memName} onChange={e => setMemName(e.target.value)} style={{ marginBottom: 8 }} />
          <label className="field-label">Role</label>
          <select className="field-input" value={memRole} onChange={e => setMemRole(e.target.value)} style={{ marginBottom: 8 }}>
            {GROUPS.map(g => <option key={g} value={g}>Group {g} — Follow-up team</option>)}
            <option value="pastor">Pastor — Lapsed member follow-up</option>
            <option value="leader_man">👨 Men's Leader — Established members</option>
            <option value="leader_woman">👩 Women's Leader — Established members</option>
            <option value="leader_youth">🧑 Youth Leader — Established members</option>
          </select>
          <label className="field-label">Temporary PIN</label>
          <input className="field-input" placeholder="Set a temporary PIN" value={memPin} onChange={e => setMemPin(e.target.value)} style={{ marginBottom: 10 }} />
          {memMsg && <p className={memMsg.startsWith("✓") ? "success-text" : "err-text"}>{memMsg}</p>}
          <button className="btn-primary full" onClick={addMember}>Add member</button>
          <div style={{ marginTop: 14 }}>
            {members.filter(m => m.id !== "admin").map(m => (
              <div key={m.id} className="member-row">
                <div><span style={{ fontSize: 13 }}>{m.name}</span>{m.mustChangePIN && <span style={{ fontSize: 10, marginLeft: 6, color: "#BA7517", background: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: 10, padding: "1px 6px" }}>PIN not set</span>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.isPastor && <span className="role-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, border: `1px solid ${PASTOR_META.border}` }}>Pastor</span>}
                  {m.isLeader && <span className="role-chip" style={{ background: LEADER_META[m.leaderCategory]?.bg, color: LEADER_META[m.leaderCategory]?.color, border: `1px solid ${LEADER_META[m.leaderCategory]?.border}` }}>{LEADER_META[m.leaderCategory]?.icon} {LEADER_META[m.leaderCategory]?.roleLabel}</span>}
                  {!m.isPastor && !m.isLeader && <span className="role-chip" style={{ background: GROUP_META[m.group]?.bg, color: GROUP_META[m.group]?.color, border: `1px solid ${GROUP_META[m.group]?.border}` }}>{m.group}</span>}
                  <button className="btn-del" onClick={() => deleteMember(m.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sec === "pin" && (
        <div className="manage-card">
          <div className="manage-card-title">Change your PIN</div>
          <input className="field-input" type="password" placeholder="New PIN (4+ characters)" value={newPin} onChange={e => setNewPin(e.target.value)} style={{ marginBottom: 10 }} />
          {pinMsg && <p className={pinMsg.startsWith("✓") ? "success-text" : "err-text"}>{pinMsg}</p>}
          <button className="btn-outline full" onClick={changePin}>Update PIN</button>
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("fu_user")); } catch { return null; } });
  const [tab, setTab] = useState("dashboard");
  const [lists, setLists] = useState([]);
  const [pastorLists, setPastorLists] = useState([]);
  const [leaderMembers, setLeaderMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "lists"), s => setLists(s.docs.map(d => d.data())));
    const u2 = onSnapshot(collection(db, "pastor_lists"), s => setPastorLists(s.docs.map(d => d.data())));
    const u3 = onSnapshot(doc(db, "config", "global"), s => { if (s.exists()) setCurrentWeek(s.data().week || 1); });
    const u4 = onSnapshot(collection(db, "members"), s => setMembers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u5 = onSnapshot(collection(db, "tasks"), s => setTasks(s.docs.map(d => d.data())));
    const u6 = onSnapshot(collection(db, "leader_members"), s => setLeaderMembers(s.docs.map(d => d.data())));
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  function handleLogin(u) { sessionStorage.setItem("fu_user", JSON.stringify(u)); setUser(u); setTab("dashboard"); }
  function handlePinChanged() { const updated = { ...user, mustChangePIN: false }; sessionStorage.setItem("fu_user", JSON.stringify(updated)); setUser(updated); }
  function handleLogout() { sessionStorage.removeItem("fu_user"); setUser(null); }
  async function handleWeekChange(w) { setCurrentWeek(w); await setDoc(doc(db, "config", "global"), { week: w }, { merge: true }); }

  if (!user) return <LoginScreen onLogin={handleLogin} />;
  if (user.mustChangePIN) return <ForcePinChange user={user} onDone={handlePinChanged} />;

  const colMap = { pastor: pastorLists, leader: null, followup: lists };
  let selectedList = null;
  let selectedVisitor = null;
  if (selected) {
    if (selected.listType === "leader") {
      selectedVisitor = leaderMembers.find(v => v.id === selected.visitor.id);
    } else {
      selectedList = (selected.listType === "pastor" ? pastorLists : lists).find(l => l.id === selected.listId);
      selectedVisitor = selectedList?.visitors?.find(v => v.id === selected.visitor.id);
    }
  }

  return (
    <div className="app-wrap">
      <Header user={user} currentWeek={currentWeek} onLogout={handleLogout} />
      <NavBar tab={tab} setTab={setTab} user={user} />
      <main>
        {tab === "dashboard" && (
          user.isAdmin
            ? <AdminDashboard lists={lists} pastorLists={pastorLists} leaderMembers={leaderMembers} currentWeek={currentWeek} members={members} tasks={tasks} />
            : <PersonalDashboard user={user} lists={lists} pastorLists={pastorLists} leaderMembers={leaderMembers} currentWeek={currentWeek} members={members} />
        )}
        {tab === "my" && user.group && <MyListTab lists={lists} currentWeek={currentWeek} user={user} onSelectVisitor={setSelected} />}
        {tab === "all" && <AllGroupsTab lists={lists} currentWeek={currentWeek} onSelectVisitor={setSelected} />}
        {tab === "leaders" && <LeadersTab leaderMembers={leaderMembers} user={user} onSelectVisitor={setSelected} members={members} />}
        {tab === "pastor" && (user.isPastor || user.isAdmin) && <PastorTab pastorLists={pastorLists} user={user} onSelectVisitor={setSelected} />}
        {tab === "tasks" && <TasksTab tasks={tasks} user={user} members={members} onRefresh={() => {}} />}
        {tab === "query" && user.isAdmin && <QueryTab lists={lists} pastorLists={pastorLists} leaderMembers={leaderMembers} members={members} />}
        {tab === "manage" && user.isAdmin && <ManageTab lists={lists} pastorLists={pastorLists} leaderMembers={leaderMembers} currentWeek={currentWeek} onWeekChange={handleWeekChange} user={user} members={members} />}
      </main>
      {selected && selectedVisitor && (
        <VisitorModal visitor={selectedVisitor} listId={selected.listId || selectedVisitor.id} listName={selected.listName || selectedVisitor.sourceListName}
          listType={selected.listType} user={user} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
