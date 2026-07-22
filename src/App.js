import React, { useState, useEffect, useRef } from "react";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  getDoc, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { db } from "./firebase";
import "./App.css";

const GROUPS = ["A", "B", "C", "D"];
const GROUP_META = {
  A: { bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  B: { bg: "#E1F5EE", color: "#085041", border: "#5DCAA5" },
  C: { bg: "#FAEEDA", color: "#633806", border: "#EF9F27" },
  D: { bg: "#FBEAF0", color: "#72243E", border: "#ED93B1" },
};
const STATUS_META = {
  pending:      { label: "Pending",      bg: "#F1F0EC", color: "#5F5E5A", border: "#C4C2BA" },
  calling:      { label: "Calling now",  bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  called:       { label: "Called ✓",     bg: "#EAF3DE", color: "#27500A", border: "#97C459" },
  not_reached:  { label: "Not reached",  bg: "#FAEEDA", color: "#633806", border: "#EF9F27" },
  left_message: { label: "Left message", bg: "#EEEDFE", color: "#26215C", border: "#AFA9EC" },
};
const PASTOR_META = { bg: "#F0E6FA", color: "#7B3FA8", border: "#C9A0E8" };
const STATUS_COLORS = { pending: "#C4C2BA", calling: "#85B7EB", called: "#97C459", not_reached: "#EF9F27", left_message: "#AFA9EC" };

function uid() { return "v" + Date.now() + "_" + Math.random().toString(36).slice(2, 6); }
function slug(n) { return n.trim().toLowerCase().replace(/\s+/g, "_"); }
function groupForOffset(lw, dw) { const o = dw - lw; return (o < 0 || o > 3) ? null : GROUPS[o]; }
function fmtDT(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function weekToMonth(week) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const d = new Date(startOfYear.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
  return months[d.getMonth()] + " " + d.getFullYear();
}

// Parse txt file: lines like "Name, Phone" or just "Name"
function parseTxtFile(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split(/[,\t|]+/).map(p => p.trim());
    return { name: parts[0] || "", phone: parts[1] || "" };
  }).filter(r => r.name);
}

// ── MINI CHART ────────────────────────────────────────────────────────────
function DonutChart({ visitors, size = 80 }) {
  const total = visitors.length;
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#eee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#aaa" }}>0</div>;
  const counts = Object.fromEntries(Object.keys(STATUS_META).map(k => [k, 0]));
  visitors.forEach(v => { counts[v.status || "pending"]++; });
  let offset = 0;
  const r = size / 2;
  const cx = r; const cy = r;
  const ir = r * 0.55;
  const slices = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => {
    const pct = c / total;
    const angle = pct * 360;
    const start = offset;
    offset += angle;
    return { key: k, c, pct, start, angle };
  });
  function describeArc(cx, cy, r, startAngle, endAngle) {
    const s = (startAngle - 90) * Math.PI / 180;
    const e = (endAngle - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(s); const y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e); const y2 = cy + r * Math.sin(e);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  const called = counts["called"];
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        {slices.map(sl => (
          <path key={sl.key} d={describeArc(cx, cy, r, sl.start, sl.start + sl.angle)}
            fill={STATUS_COLORS[sl.key]} opacity={0.9} />
        ))}
        <circle cx={cx} cy={cy} r={ir} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.18} fontWeight="600" fill="#1A1A1A">{Math.round(called / total * 100)}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size * 0.13} fill="#888">done</text>
      </svg>
    </div>
  );
}

function BarChart({ data, title, color = "#185FA5" }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ marginBottom: 8 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 8 }}>{title}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 10, color: "#888", fontWeight: 500 }}>{d.value}</div>
            <div style={{ width: "100%", height: Math.max((d.value / max) * 60, 2), background: d.color || color, borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} />
            <div style={{ fontSize: 10, color: "#888", textAlign: "center", lineHeight: 1.2 }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {Object.entries(STATUS_META).map(([k, m]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[k] }} />
          <span style={{ color: "#666" }}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function Dashboard({ lists, pastorLists, currentWeek, members }) {
  const activeFollowup = lists.filter(l => l.status === "active");
  const activePastor = pastorLists.filter(l => l.status === "active");
  const allFollowupVisitors = activeFollowup.flatMap(l => l.visitors || []);
  const allPastorVisitors = activePastor.flatMap(l => l.visitors || []);

  // Per-group stats
  const groupStats = GROUPS.map(g => {
    const glists = activeFollowup.filter(l => groupForOffset(l.createdWeek, currentWeek) === g);
    const vs = glists.flatMap(l => l.visitors || []);
    return { group: g, total: vs.length, called: vs.filter(v => v.status === "called").length };
  });

  // Weekly trend (last 8 weeks)
  const weekData = Array.from({ length: 8 }, (_, i) => {
    const w = currentWeek - 7 + i;
    if (w < 1) return { label: `W${w < 1 ? "-" : w}`, value: 0 };
    const wlists = lists.filter(l => l.createdWeek === w);
    return { label: `W${w}`, value: wlists.flatMap(l => l.visitors || []).length };
  });

  // Monthly trend
  const monthlyMap = {};
  lists.forEach(l => {
    const m = weekToMonth(l.createdWeek);
    monthlyMap[m] = (monthlyMap[m] || 0) + (l.visitors?.length || 0);
  });
  const monthData = Object.entries(monthlyMap).slice(-6).map(([label, value]) => ({ label: label.split(" ")[0], value }));

  // Per member stats
  const memberStats = members.filter(m => !m.isAdmin && !m.isPastor && m.group).map(m => {
    const mine = allFollowupVisitors.filter(v => v.assignedTo === m.name);
    return { name: m.name, group: m.group, total: mine.length, called: mine.filter(v => v.status === "called").length };
  });

  const calledTotal = allFollowupVisitors.filter(v => v.status === "called").length;
  const calledPastor = allPastorVisitors.filter(v => v.status === "called").length;

  return (
    <div className="tab-content">
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div className="dash-card">
          <div className="dash-card-val">{allFollowupVisitors.length}</div>
          <div className="dash-card-lbl">New visitors<br/>this cycle</div>
        </div>
        <div className="dash-card" style={{ background: "#EAF3DE", borderColor: "#97C459" }}>
          <div className="dash-card-val" style={{ color: "#27500A" }}>{calledTotal}</div>
          <div className="dash-card-lbl" style={{ color: "#3B6D11" }}>Contacts<br/>called ✓</div>
        </div>
        <div className="dash-card" style={{ background: PASTOR_META.bg, borderColor: PASTOR_META.border }}>
          <div className="dash-card-val" style={{ color: PASTOR_META.color }}>{allPastorVisitors.length}</div>
          <div className="dash-card-lbl" style={{ color: PASTOR_META.color }}>Lapsed<br/>members</div>
        </div>
        <div className="dash-card" style={{ background: "#FAEEDA", borderColor: "#EF9F27" }}>
          <div className="dash-card-val" style={{ color: "#633806" }}>{allFollowupVisitors.length - calledTotal}</div>
          <div className="dash-card-lbl" style={{ color: "#633806" }}>Still<br/>pending</div>
        </div>
      </div>

      {/* Group donuts */}
      <div className="manage-card">
        <div className="manage-card-title">Group progress — Week {currentWeek}</div>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0" }}>
          {groupStats.map(gs => {
            const gm = GROUP_META[gs.group];
            const vs = activeFollowup.filter(l => groupForOffset(l.createdWeek, currentWeek) === gs.group).flatMap(l => l.visitors || []);
            return (
              <div key={gs.group} style={{ textAlign: "center" }}>
                <DonutChart visitors={vs} size={70} />
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: gm.color }}>Group {gs.group}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{gs.called}/{gs.total}</div>
              </div>
            );
          })}
        </div>
        <StatusLegend />
      </div>

      {/* Weekly bar chart */}
      <div className="manage-card">
        <BarChart title="Weekly new visitors (last 8 weeks)" data={weekData} color="#185FA5" />
      </div>

      {/* Monthly bar chart */}
      {monthData.length > 0 && (
        <div className="manage-card">
          <BarChart title="Monthly visitor totals" data={monthData} color="#7B3FA8" />
        </div>
      )}

      {/* Per-member progress */}
      {memberStats.length > 0 && (
        <div className="manage-card">
          <div className="manage-card-title">Team member progress</div>
          {memberStats.map(ms => {
            const pct = ms.total > 0 ? Math.round(ms.called / ms.total * 100) : 0;
            const gm = GROUP_META[ms.group] || GROUP_META.A;
            return (
              <div key={ms.name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{ms.name}</span>
                  <span style={{ fontSize: 12, color: gm.color, background: gm.bg, padding: "1px 7px", borderRadius: 20, border: `1px solid ${gm.border}` }}>Grp {ms.group} · {ms.called}/{ms.total}</span>
                </div>
                <div style={{ height: 7, background: "#F0EFEB", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct + "%", background: "#97C459", borderRadius: 4, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pastor progress */}
      {allPastorVisitors.length > 0 && (
        <div className="manage-card">
          <div className="manage-card-title" style={{ color: PASTOR_META.color }}>Pastors — Lapsed member progress</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <DonutChart visitors={allPastorVisitors} size={80} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: PASTOR_META.color }}>{calledPastor}/{allPastorVisitors.length}</div>
              <div style={{ fontSize: 12, color: "#888" }}>lapsed members contacted</div>
              <StatusLegend />
            </div>
          </div>
        </div>
      )}
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
          await setDoc(doc(db, "members", "admin"), { name: "Admin", group: null, isAdmin: true, isPastor: false, pin: "admin1234" });
          onLogin({ name: "Admin", group: null, isAdmin: true, isPastor: false, key: "admin" });
          return;
        }
        setErr("Name not found. Ask your admin to add you."); setLoading(false); return;
      }
      const m = snap.data();
      if (m.pin !== pin) { setErr("Wrong PIN. Try again."); setLoading(false); return; }
      onLogin({ name: m.name, group: m.group || null, isAdmin: !!m.isAdmin, isPastor: !!m.isPastor, key });
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
        <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 12 }}>
          First time? Ask your admin for your PIN.
        </p>
      </div>
    </div>
  );
}

// ── HEADER ────────────────────────────────────────────────────────────────
function Header({ user, currentWeek, onLogout }) {
  const gm = user.group ? GROUP_META[user.group] : null;
  return (
    <header className="app-header">
      <div>
        <div className="app-title">Follow-up Tracker</div>
        <div className="app-week">Week {currentWeek}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {gm && <span className="role-chip" style={{ background: gm.bg, color: gm.color, border: `1px solid ${gm.border}` }}>Group {user.group}</span>}
        {user.isPastor && <span className="role-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, border: `1px solid ${PASTOR_META.border}` }}>Pastor</span>}
        {user.isAdmin && <span className="role-chip" style={{ background: "#1A1A1A", color: "#fff", border: "none" }}>Admin</span>}
        <button className="btn-ghost" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────
function NavBar({ tab, setTab, user }) {
  const tabs = [];
  if (user.isAdmin) tabs.push({ id: "dashboard", label: "📊 Dashboard" });
  if (!user.isPastor) tabs.push({ id: "my", label: "My list" });
  tabs.push({ id: "all", label: "All groups" });
  if (user.isPastor || user.isAdmin) tabs.push({ id: "pastor", label: "Lapsed" });
  if (user.isAdmin) tabs.push({ id: "manage", label: "Manage" });
  return (
    <nav className="nav-bar" style={{ overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ── VISITOR ROW ───────────────────────────────────────────────────────────
function VisitorRow({ visitor, listName, assignedTo, onClick }) {
  const sm = STATUS_META[visitor.status] || STATUS_META.pending;
  return (
    <div className="visitor-row" onClick={onClick}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="visitor-name">{visitor.name}</div>
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

  async function updateStatus(status) {
    const col = listType === "pastor" ? "pastor_lists" : "lists";
    const ref = doc(db, col, listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, status, calledBy: user.name } : v);
    await updateDoc(ref, { visitors });
    setLv(p => ({ ...p, status, calledBy: user.name }));
  }

  async function postComment() {
    if (!comment.trim()) return;
    setSaving(true);
    const col = listType === "pastor" ? "pastor_lists" : "lists";
    const ref = doc(db, col, listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) { setSaving(false); return; }
    const nc = { id: uid(), text: comment.trim(), author: user.name, ts: Date.now() };
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, comments: [...(v.comments || []), nc] } : v);
    await updateDoc(ref, { visitors });
    setLv(p => ({ ...p, comments: [...(p.comments || []), nc] }));
    setComment(""); setSaving(false);
  }

  const sm = STATUS_META[lv.status] || STATUS_META.pending;
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <div>
            <div className="modal-visitor-name">{lv.name}</div>
            {lv.phone && <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>📞 <a href={`tel:${lv.phone}`} style={{ color: "#185FA5" }}>{lv.phone}</a></div>}
            <div className="modal-list-name">{listName} · {listType === "pastor" ? "Lapsed member" : "New visitor"}</div>
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
          {(!lv.comments || lv.comments.length === 0)
            ? <p className="empty-note">No notes yet.</p>
            : lv.comments.map(c => (
              <div key={c.id} className="comment-card">
                <div className="comment-meta">
                  <span className="comment-author">{c.author}</span>
                  <span className="comment-time">{fmtDT(c.ts)}</span>
                </div>
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

// ── MY LIST TAB ───────────────────────────────────────────────────────────
function MyListTab({ lists, currentWeek, user, onSelectVisitor }) {
  const myLists = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group);
  const myVisitors = myLists.flatMap(l => (l.visitors || []).filter(v => v.assignedTo === user.name).map(v => ({ ...v, listId: l.id, listName: l.name })));
  const called = myVisitors.filter(v => v.status === "called").length;
  const gm = GROUP_META[user.group] || GROUP_META.A;
  if (!user.group) return <div className="empty-state">You're an admin — use the Dashboard or Manage tab.</div>;
  return (
    <div className="tab-content">
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, background: "#fff", border: "0.5px solid #E0DFDB", borderRadius: 12, padding: 14 }}>
        <DonutChart visitors={myVisitors} size={72} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 13, color: "#888" }}>{called} of {myVisitors.length} contacts called</div>
          <div style={{ fontSize: 12, color: gm.color, marginTop: 4, background: gm.bg, display: "inline-block", padding: "2px 8px", borderRadius: 20, border: `1px solid ${gm.border}` }}>Group {user.group}</div>
        </div>
      </div>
      {myVisitors.length === 0
        ? <div className="empty-state">No contacts assigned to you this week.<br />Ask your admin to assign contacts.</div>
        : myLists.map(list => {
          const mine = (list.visitors || []).filter(v => v.assignedTo === user.name);
          if (!mine.length) return null;
          return (
            <div key={list.id} className="list-card" style={{ borderLeft: `3px solid ${gm.border}` }}>
              <div className="list-card-header">
                <div className="list-name">📋 {list.name}</div>
                <div className="list-meta">Week {list.createdWeek} · {mine.length} assigned to you</div>
              </div>
              {mine.map(v => <VisitorRow key={v.id} visitor={v} onClick={() => onSelectVisitor({ visitor: v, listId: list.id, listName: list.name, listType: "followup" })} />)}
            </div>
          );
        })
      }
    </div>
  );
}

// ── ALL GROUPS TAB ────────────────────────────────────────────────────────
function AllGroupsTab({ lists, currentWeek, onSelectVisitor }) {
  return (
    <div className="tab-content">
      {GROUPS.map(g => {
        const gm = GROUP_META[g];
        const glists = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === g);
        const visitors = glists.flatMap(l => (l.visitors || []).map(v => ({ ...v, listId: l.id, listName: l.name })));
        const called = visitors.filter(v => v.status === "called").length;
        return (
          <div key={g} className="list-card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
            <div className="group-card-header" style={{ background: gm.bg, borderBottom: `1px solid ${gm.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <DonutChart visitors={visitors} size={36} />
                <span style={{ fontWeight: 600, color: gm.color }}>Group {g}</span>
              </div>
              <span style={{ fontSize: 12, color: gm.color }}>{called}/{visitors.length} called</span>
            </div>
            <div style={{ padding: "8px 14px 10px" }}>
              {visitors.length === 0 ? <p className="empty-note">No contacts assigned this week.</p>
                : visitors.map(v => <VisitorRow key={v.id} visitor={v} listName={v.listName} assignedTo={v.assignedTo}
                    onClick={() => onSelectVisitor({ visitor: v, listId: v.listId, listName: v.listName, listType: "followup" })} />)
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PASTOR TAB ────────────────────────────────────────────────────────────
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
        </div>
      </div>
      {active.length === 0
        ? <div className="empty-state">No lapsed member lists yet.<br />Admin can add them in the Manage tab.</div>
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

// ── FILE UPLOAD HELPER ────────────────────────────────────────────────────
function FileUploadArea({ onParsed, accent = "#185FA5", accentBg = "#E6F1FB" }) {
  const ref = useRef();
  const [dragging, setDragging] = useState(false);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => onParsed(parseTxtFile(e.target.result));
    reader.readAsText(file);
  }

  return (
    <div
      style={{ border: `1.5px dashed ${dragging ? accent : "#D0CFC9"}`, borderRadius: 8, padding: 16, textAlign: "center", background: dragging ? accentBg : "#FAFAF8", cursor: "pointer", marginBottom: 10, transition: "all 0.15s" }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => ref.current.click()}
    >
      <input ref={ref} type="file" accept=".txt,.csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      <div style={{ fontSize: 24, marginBottom: 4 }}>📂</div>
      <div style={{ fontSize: 13, color: "#888" }}>Drop a .txt or .csv file here, or <span style={{ color: accent, fontWeight: 500 }}>click to browse</span></div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Format: Name, Phone (one per line)</div>
    </div>
  );
}

// ── MANAGE TAB ────────────────────────────────────────────────────────────
function ManageTab({ lists, pastorLists, currentWeek, onWeekChange, user, members }) {
  const [activeSection, setActiveSection] = useState("newvisitors");
  const [nvName, setNvName] = useState(""); const [nvWeek, setNvWeek] = useState(currentWeek);
  const [nvEntries, setNvEntries] = useState([]); const [nvInput, setNvInput] = useState(""); const [nvPhone, setNvPhone] = useState("");
  const [nvMsg, setNvMsg] = useState(""); const [nvSaving, setNvSaving] = useState(false);
  const [lmName, setLmName] = useState("");
  const [lmEntries, setLmEntries] = useState([]); const [lmInput, setLmInput] = useState(""); const [lmPhone, setLmPhone] = useState("");
  const [lmMsg, setLmMsg] = useState(""); const [lmSaving, setLmSaving] = useState(false);
  const [memName, setMemName] = useState(""); const [memRole, setMemRole] = useState("A"); const [memPin, setMemPin] = useState(""); const [memMsg, setMemMsg] = useState("");
  const [newPin, setNewPin] = useState(""); const [pinMsg, setPinMsg] = useState("");
  const [assignMsg, setAssignMsg] = useState("");

  function addNvEntry() { if (nvInput.trim()) { setNvEntries(p => [...p, { name: nvInput.trim(), phone: nvPhone.trim() }]); setNvInput(""); setNvPhone(""); } }
  function addLmEntry() { if (lmInput.trim()) { setLmEntries(p => [...p, { name: lmInput.trim(), phone: lmPhone.trim() }]); setLmInput(""); setLmPhone(""); } }

  async function createNewVisitorList() {
    if (!nvName.trim() || nvEntries.length === 0) { setNvMsg("Add a list name and at least one visitor."); return; }
    setNvSaving(true);
    const id = uid();
    const groupMembers = members.filter(m => !m.isAdmin && !m.isPastor && m.group);
    const shuffled = [...groupMembers].sort(() => Math.random() - 0.5);
    const visitors = nvEntries.map((e, i) => ({ id: uid(), name: e.name, phone: e.phone || "", status: "pending", comments: [], assignedTo: shuffled.length > 0 ? shuffled[i % shuffled.length].name : null }));
    await setDoc(doc(db, "lists", id), { id, name: nvName.trim(), createdWeek: parseInt(nvWeek) || currentWeek, visitors, status: "active", createdAt: serverTimestamp() });
    setNvName(""); setNvEntries([]); setNvInput(""); setNvPhone("");
    setNvMsg("✓ List created and randomly assigned to team!"); setNvSaving(false);
    setTimeout(() => setNvMsg(""), 4000);
  }

  async function createLapsedList() {
    if (!lmName.trim() || lmEntries.length === 0) { setLmMsg("Add a list name and at least one member."); return; }
    setLmSaving(true);
    const id = uid();
    const pastors = members.filter(m => m.isPastor);
    const visitors = lmEntries.map((e, i) => ({ id: uid(), name: e.name, phone: e.phone || "", status: "pending", comments: [], assignedTo: pastors.length > 0 ? pastors[i % pastors.length].name : null }));
    await setDoc(doc(db, "pastor_lists", id), { id, name: lmName.trim(), visitors, status: "active", createdAt: serverTimestamp() });
    setLmName(""); setLmEntries([]); setLmInput(""); setLmPhone("");
    setLmMsg("✓ Lapsed member list created and assigned to pastors!"); setLmSaving(false);
    setTimeout(() => setLmMsg(""), 4000);
  }

  async function addMember() {
    if (!memName.trim() || !memPin.trim()) { setMemMsg("Name and PIN required."); return; }
    const key = slug(memName);
    const isPastor = memRole === "pastor";
    await setDoc(doc(db, "members", key), { name: memName.trim(), group: isPastor ? null : memRole, isAdmin: false, isPastor, pin: memPin.trim() });
    setMemName(""); setMemPin(""); setMemMsg("✓ Member added!"); setTimeout(() => setMemMsg(""), 3000);
  }

  async function deleteMember(id) { if (window.confirm("Remove this member?")) await deleteDoc(doc(db, "members", id)); }

  async function changePin() {
    if (!newPin.trim() || newPin.trim().length < 4) { setPinMsg("PIN must be at least 4 characters."); return; }
    await updateDoc(doc(db, "members", user.key), { pin: newPin.trim() });
    setNewPin(""); setPinMsg("✓ PIN updated!"); setTimeout(() => setPinMsg(""), 3000);
  }

  async function reassignList(listId) {
    const snap = await getDoc(doc(db, "lists", listId));
    if (!snap.exists()) return;
    const groupMembers = members.filter(m => !m.isAdmin && !m.isPastor && m.group);
    if (!groupMembers.length) { setAssignMsg("No team members to assign to."); return; }
    const shuffled = [...groupMembers].sort(() => Math.random() - 0.5);
    const visitors = snap.data().visitors.map((v, i) => ({ ...v, assignedTo: shuffled[i % shuffled.length].name }));
    await updateDoc(doc(db, "lists", listId), { visitors });
    setAssignMsg("✓ Contacts reassigned!"); setTimeout(() => setAssignMsg(""), 3000);
  }

  const sections = [
    { id: "newvisitors", label: "👥 New visitors" },
    { id: "lapsed", label: "🙏 Lapsed members" },
    { id: "members", label: "👤 Team" },
    { id: "week", label: "📅 Week" },
    { id: "pin", label: "🔑 PIN" },
  ];

  return (
    <div className="tab-content">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: "0.5px solid", cursor: "pointer",
              background: activeSection === s.id ? "#185FA5" : "#F7F6F3",
              color: activeSection === s.id ? "#fff" : "#444",
              borderColor: activeSection === s.id ? "#185FA5" : "#D0CFC9" }}>
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === "week" && (
        <div className="manage-card">
          <div className="manage-card-title">Current week</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="number" className="field-input" style={{ width: 80, textAlign: "center" }}
              defaultValue={currentWeek} onChange={e => onWeekChange(parseInt(e.target.value) || 1)} />
            <span style={{ fontSize: 13, color: "#888" }}>Updates for all team members</span>
          </div>
        </div>
      )}

      {activeSection === "newvisitors" && (
        <>
          <div className="manage-card">
            <div className="manage-card-title">Add new Sunday visitor list</div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Upload a .txt file or add names one by one. Contacts are randomly assigned to team members.</p>
            <label className="field-label">List name</label>
            <input className="field-input" placeholder='e.g. "July 20 Sunday"' value={nvName} onChange={e => setNvName(e.target.value)} style={{ marginBottom: 10 }} />
            <label className="field-label">Week number</label>
            <input type="number" className="field-input" style={{ width: 80, marginBottom: 12 }} value={nvWeek} onChange={e => setNvWeek(e.target.value)} />
            <FileUploadArea onParsed={rows => setNvEntries(p => [...p, ...rows])} />
            <label className="field-label">Or add one by one</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="field-input" placeholder="Full name" value={nvInput} onChange={e => setNvInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addNvEntry()} />
              <input className="field-input" placeholder="Phone (optional)" value={nvPhone} onChange={e => setNvPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && addNvEntry()} style={{ maxWidth: 130 }} />
              <button className="btn-outline" onClick={addNvEntry}>Add</button>
            </div>
            {nvEntries.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{nvEntries.length} visitor{nvEntries.length !== 1 ? "s" : ""} ready to add</div>
                <div className="chip-row">
                  {nvEntries.map((e, i) => (
                    <span key={i} className="name-chip">{e.name}{e.phone ? ` · ${e.phone}` : ""}
                      <button className="chip-del" onClick={() => setNvEntries(p => p.filter((_, j) => j !== i))}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {nvMsg && <p className={nvMsg.startsWith("✓") ? "success-text" : "err-text"}>{nvMsg}</p>}
            <button className="btn-primary full" style={{ marginTop: 8 }} onClick={createNewVisitorList} disabled={nvSaving}>
              {nvSaving ? "Saving…" : `Create & assign list (${nvEntries.length} visitors)`}
            </button>
          </div>
          <div className="manage-card">
            <div className="manage-card-title">Active visitor lists</div>
            {assignMsg && <p className="success-text" style={{ marginBottom: 8 }}>{assignMsg}</p>}
            {lists.filter(l => l.status === "active").length === 0
              ? <p className="empty-note">No active lists.</p>
              : lists.filter(l => l.status === "active").sort((a, b) => b.createdWeek - a.createdWeek).map(list => (
                <div key={list.id} className="active-list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>📋 {list.name}</div>
                      <div style={{ fontSize: 11, color: "#888" }}>Week {list.createdWeek} · {list.visitors?.length || 0} visitors</div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => reassignList(list.id)}>↺ Reassign</button>
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => updateDoc(doc(db, "lists", list.id), { status: "archived" })}>Archive</button>
                    </div>
                  </div>
                  {(list.visitors || []).map(v => (
                    <div key={v.id} className="manage-visitor-row">
                      <span>{v.name}{v.phone ? <span style={{ color: "#aaa", fontSize: 11 }}> · {v.phone}</span> : ""}</span>
                      <span style={{ fontSize: 11, color: "#888" }}>{v.assignedTo || "Unassigned"}</span>
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        </>
      )}

      {activeSection === "lapsed" && (
        <>
          <div className="manage-card">
            <div className="manage-card-title" style={{ color: PASTOR_META.color }}>Add lapsed member list</div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Upload a .txt file or add names one by one. Contacts are assigned to pastors.</p>
            <label className="field-label">List name</label>
            <input className="field-input" placeholder='e.g. "July 2026 Lapsed"' value={lmName} onChange={e => setLmName(e.target.value)} style={{ marginBottom: 12 }} />
            <FileUploadArea onParsed={rows => setLmEntries(p => [...p, ...rows])} accent={PASTOR_META.color} accentBg={PASTOR_META.bg} />
            <label className="field-label">Or add one by one</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input className="field-input" placeholder="Full name" value={lmInput} onChange={e => setLmInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addLmEntry()} />
              <input className="field-input" placeholder="Phone (optional)" value={lmPhone} onChange={e => setLmPhone(e.target.value)} onKeyDown={e => e.key === "Enter" && addLmEntry()} style={{ maxWidth: 130 }} />
              <button className="btn-outline" onClick={addLmEntry}>Add</button>
            </div>
            {lmEntries.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{lmEntries.length} member{lmEntries.length !== 1 ? "s" : ""} ready to add</div>
                <div className="chip-row">
                  {lmEntries.map((e, i) => (
                    <span key={i} className="name-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, borderColor: PASTOR_META.border }}>{e.name}{e.phone ? ` · ${e.phone}` : ""}
                      <button className="chip-del" onClick={() => setLmEntries(p => p.filter((_, j) => j !== i))}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {lmMsg && <p className={lmMsg.startsWith("✓") ? "success-text" : "err-text"}>{lmMsg}</p>}
            <button className="btn-primary full" style={{ marginTop: 8, background: PASTOR_META.color }} onClick={createLapsedList} disabled={lmSaving}>
              {lmSaving ? "Saving…" : `Create & assign to pastors (${lmEntries.length} members)`}
            </button>
          </div>
          <div className="manage-card">
            <div className="manage-card-title">Active lapsed member lists</div>
            {pastorLists.filter(l => l.status === "active").length === 0
              ? <p className="empty-note">No active lapsed member lists.</p>
              : pastorLists.filter(l => l.status === "active").map(list => (
                <div key={list.id} className="active-list-item">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div><div style={{ fontWeight: 500, fontSize: 13 }}>📋 {list.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{list.visitors?.length || 0} members</div></div>
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => updateDoc(doc(db, "pastor_lists", list.id), { status: "archived" })}>Archive</button>
                  </div>
                  {(list.visitors || []).map(v => (
                    <div key={v.id} className="manage-visitor-row">
                      <span>{v.name}{v.phone ? <span style={{ color: "#aaa", fontSize: 11 }}> · {v.phone}</span> : ""}</span>
                      <span style={{ fontSize: 11, color: "#888" }}>{v.assignedTo || "Unassigned"}</span>
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        </>
      )}

      {activeSection === "members" && (
        <div className="manage-card">
          <div className="manage-card-title">Team members</div>
          <label className="field-label">Name</label>
          <input className="field-input" placeholder="Member name" value={memName} onChange={e => setMemName(e.target.value)} style={{ marginBottom: 8 }} />
          <label className="field-label">Role</label>
          <select className="field-input" value={memRole} onChange={e => setMemRole(e.target.value)} style={{ marginBottom: 8 }}>
            {GROUPS.map(g => <option key={g} value={g}>Group {g} — Follow-up team</option>)}
            <option value="pastor">Pastor — Lapsed member follow-up</option>
          </select>
          <label className="field-label">PIN</label>
          <input className="field-input" placeholder="Set a PIN (share privately)" value={memPin} onChange={e => setMemPin(e.target.value)} style={{ marginBottom: 10 }} />
          {memMsg && <p className={memMsg.startsWith("✓") ? "success-text" : "err-text"}>{memMsg}</p>}
          <button className="btn-primary full" onClick={addMember}>Add member</button>
          <div style={{ marginTop: 14 }}>
            {members.filter(m => m.id !== "admin").map(m => (
              <div key={m.id} className="member-row">
                <span style={{ fontSize: 13 }}>{m.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.isPastor
                    ? <span className="role-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, border: `1px solid ${PASTOR_META.border}` }}>Pastor</span>
                    : <span className="role-chip" style={{ background: GROUP_META[m.group]?.bg, color: GROUP_META[m.group]?.color, border: `1px solid ${GROUP_META[m.group]?.border}` }}>{m.group}</span>
                  }
                  <button className="btn-del" onClick={() => deleteMember(m.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "pin" && (
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
  const [tab, setTab] = useState("my");
  const [lists, setLists] = useState([]);
  const [pastorLists, setPastorLists] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, "lists"), snap => setLists(snap.docs.map(d => d.data())));
    const u2 = onSnapshot(collection(db, "pastor_lists"), snap => setPastorLists(snap.docs.map(d => d.data())));
    const u3 = onSnapshot(doc(db, "config", "global"), snap => { if (snap.exists()) setCurrentWeek(snap.data().week || 1); });
    const u4 = onSnapshot(collection(db, "members"), snap => setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  useEffect(() => {
    if (user) {
      if (user.isAdmin) setTab("dashboard");
      else if (user.isPastor) setTab("pastor");
      else setTab("my");
    }
  }, [user?.key]);

  function handleLogin(u) { sessionStorage.setItem("fu_user", JSON.stringify(u)); setUser(u); }
  function handleLogout() { sessionStorage.removeItem("fu_user"); setUser(null); }
  async function handleWeekChange(w) {
    setCurrentWeek(w);
    await setDoc(doc(db, "config", "global"), { week: w }, { merge: true });
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const selectedList = selected ? (selected.listType === "pastor" ? pastorLists : lists).find(l => l.id === selected.listId) : null;
  const selectedVisitor = selectedList?.visitors?.find(v => v.id === selected.visitor.id);

  return (
    <div className="app-wrap">
      <Header user={user} currentWeek={currentWeek} onLogout={handleLogout} />
      <NavBar tab={tab} setTab={setTab} user={user} />
      <main>
        {tab === "dashboard" && <Dashboard lists={lists} pastorLists={pastorLists} currentWeek={currentWeek} members={members} />}
        {tab === "my" && <MyListTab lists={lists} currentWeek={currentWeek} user={user} onSelectVisitor={setSelected} />}
        {tab === "all" && <AllGroupsTab lists={lists} currentWeek={currentWeek} onSelectVisitor={setSelected} />}
        {tab === "pastor" && <PastorTab pastorLists={pastorLists} user={user} onSelectVisitor={setSelected} />}
        {tab === "manage" && user.isAdmin && <ManageTab lists={lists} pastorLists={pastorLists} currentWeek={currentWeek} onWeekChange={handleWeekChange} user={user} members={members} />}
      </main>
      {selected && selectedVisitor && (
        <VisitorModal visitor={selectedVisitor} listId={selected.listId} listName={selected.listName}
          listType={selected.listType} user={user} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
