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
  const d = new Date(new Date(now.getFullYear(), 0, 1).getTime() + (week - 1) * 7 * 86400000);
  return months[d.getMonth()] + " " + d.getFullYear();
}
function parseTxtFile(text) {
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split(/[,\t|]+/).map(x => x.trim());
    return { name: p[0] || "", phone: p[1] || "" };
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

// ── PERSONAL DASHBOARD ────────────────────────────────────────────────────
function PersonalDashboard({ user, lists, pastorLists, currentWeek, members, tasks }) {
  const isPastor = user.isPastor;

  // My assigned visitors
  const myVisitors = isPastor
    ? pastorLists.filter(l => l.status === "active").flatMap(l => (l.visitors || []).filter(v => v.assignedTo === user.name))
    : lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group)
        .flatMap(l => (l.visitors || []).filter(v => v.assignedTo === user.name));

  const myCalled = myVisitors.filter(v => v.status === "called").length;
  const myNotReached = myVisitors.filter(v => v.status === "not_reached").length;
  const myLeft = myVisitors.filter(v => v.status === "left_message").length;
  const myPending = myVisitors.filter(v => !v.status || v.status === "pending").length;

  // Team visitors (same group)
  const teamVisitors = isPastor
    ? pastorLists.filter(l => l.status === "active").flatMap(l => l.visitors || [])
    : lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group)
        .flatMap(l => l.visitors || []);
  const teamCalled = teamVisitors.filter(v => v.status === "called").length;

  // Overall
  const allVisitors = lists.filter(l => l.status === "active").flatMap(l => l.visitors || []);
  const allCalled = allVisitors.filter(v => v.status === "called").length;

  // My status breakdown for bar chart
  const myStatusData = [
    { label: "Pending", value: myPending, color: STATUS_COLORS.pending },
    { label: "Calling", value: myVisitors.filter(v => v.status === "calling").length, color: STATUS_COLORS.calling },
    { label: "Called", value: myCalled, color: STATUS_COLORS.called },
    { label: "No ans.", value: myNotReached, color: STATUS_COLORS.not_reached },
    { label: "Msg left", value: myLeft, color: STATUS_COLORS.left_message },
  ];

  const gm = user.group ? GROUP_META[user.group] : PASTOR_META;

  // My tasks
  const myTasks = tasks.filter(t =>
    t.assignedToType === "all" ||
    (t.assignedToType === "member" && t.assignedTo === user.name) ||
    (t.assignedToType === "group" && t.assignedTo === user.group) ||
    (t.assignedToType === "pastors" && user.isPastor)
  );
  const myOpenTasks = myTasks.filter(t => t.status !== "done");
  const myUrgentTasks = myOpenTasks.filter(t => t.priority === "urgent");

  return (
    <div className="tab-content">
      {/* Personal header */}
      <div style={{ background: gm.bg, border: `1px solid ${gm.border}`, borderRadius: 12, padding: 14, marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
        <DonutChart visitors={myVisitors} size={76} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: gm.color }}>{user.name}</div>
          <div style={{ fontSize: 12, color: gm.color, opacity: 0.8, marginBottom: 6 }}>
            {isPastor ? "Pastor" : `Group ${user.group}`} · Week {currentWeek}
          </div>
          <div style={{ fontSize: 13, color: gm.color }}>
            <b>{myCalled}</b> called · <b>{myNotReached}</b> not reached · <b>{myLeft}</b> msg left · <b>{myPending}</b> pending
          </div>
        </div>
      </div>

      {/* My stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={myVisitors.length} label="Assigned to me" />
        <StatCard value={myCalled} label="Called ✓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={myVisitors.length > 0 ? Math.round(myCalled / myVisitors.length * 100) + "%" : "0%"} />
        <StatCard value={myPending} label="Still pending" bg="#FAEEDA" color="#633806" border="#EF9F27" />
      </div>

      {/* Tasks summary */}
      {myOpenTasks.length > 0 && (
        <div style={{ background: myUrgentTasks.length > 0 ? "#FBEAF0" : "#E6F1FB", border: `1px solid ${myUrgentTasks.length > 0 ? "#ED93B1" : "#85B7EB"}`, borderRadius: 10, padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: myUrgentTasks.length > 0 ? "#72243E" : "#0C447C" }}>
              {myUrgentTasks.length > 0 ? `⚠ ${myUrgentTasks.length} urgent task${myUrgentTasks.length > 1 ? "s" : ""}!` : `✅ ${myOpenTasks.length} open task${myOpenTasks.length > 1 ? "s" : ""}`}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{myTasks.filter(t => t.status === "done").length} completed · tap Tasks tab to view</div>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: myUrgentTasks.length > 0 ? "#72243E" : "#0C447C" }}>{myOpenTasks.length}</div>
        </div>
      )}

      {/* My status breakdown bar */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">My call breakdown</div>
        <BarChart data={myStatusData} height={70} />
        <StatusLegend compact />
      </div>

      {/* My progress vs team */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">My progress vs {isPastor ? "pastoral team" : `Group ${user.group}`}</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>Me — {user.name}</span>
            <span style={{ color: "#888" }}>{myCalled}/{myVisitors.length} ({myVisitors.length > 0 ? Math.round(myCalled / myVisitors.length * 100) : 0}%)</span>
          </div>
          <ProgressBar value={myCalled} max={myVisitors.length} color={gm.bar || "#185FA5"} height={10} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "#888" }}>{isPastor ? "All pastors" : `All Group ${user.group}`}</span>
            <span style={{ color: "#888" }}>{teamCalled}/{teamVisitors.length} ({teamVisitors.length > 0 ? Math.round(teamCalled / teamVisitors.length * 100) : 0}%)</span>
          </div>
          <ProgressBar value={teamCalled} max={teamVisitors.length} color="#D0CFC9" height={10} />
        </div>
      </div>

      {/* Overall church progress */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">Overall church follow-up — Week {currentWeek}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <DonutChart visitors={allVisitors} size={60} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{allCalled}<span style={{ fontSize: 13, fontWeight: 400, color: "#888" }}>/{allVisitors.length} called</span></div>
            <ProgressBar value={allCalled} max={allVisitors.length} color="#97C459" height={8} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
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
      </div>
    </div>
  );
}

// ── ADMIN DASHBOARD ────────────────────────────────────────────────────────
function AdminDashboard({ lists, pastorLists, currentWeek, members, tasks }) {
  const activeFollowup = lists.filter(l => l.status === "active");
  const activePastor = pastorLists.filter(l => l.status === "active");
  const allFV = activeFollowup.flatMap(l => l.visitors || []);
  const allPV = activePastor.flatMap(l => l.visitors || []);
  const allCalled = allFV.filter(v => v.status === "called").length;
  const pastorCalled = allPV.filter(v => v.status === "called").length;

  const weekData = Array.from({ length: 8 }, (_, i) => {
    const w = currentWeek - 7 + i;
    if (w < 1) return { label: `—`, value: 0 };
    const wvs = lists.filter(l => l.createdWeek === w).flatMap(l => l.visitors || []);
    return { label: `W${w}`, value: wvs.length };
  });

  const monthlyMap = {};
  lists.forEach(l => {
    const m = weekToMonth(l.createdWeek);
    if (!monthlyMap[m]) monthlyMap[m] = 0;
    monthlyMap[m] += (l.visitors?.length || 0);
  });
  const monthData = Object.entries(monthlyMap).slice(-6).map(([label, value]) => ({ label: label.split(" ")[0], value, color: "#7B3FA8" }));

  const teamMembers = members.filter(m => !m.isAdmin && !m.isPastor && m.group);
  const pastors = members.filter(m => m.isPastor);

  return (
    <div className="tab-content">
      {/* Top stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={allFV.length} label="New visitors this cycle" />
        <StatCard value={allCalled} label="Called ✓" bg="#EAF3DE" color="#27500A" border="#97C459" sub={allFV.length > 0 ? Math.round(allCalled / allFV.length * 100) + "%" : ""} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <StatCard value={allPV.length} label="Lapsed members" bg={PASTOR_META.bg} color={PASTOR_META.color} border={PASTOR_META.border} />
        <StatCard value={allFV.length - allCalled} label="Still pending" bg="#FAEEDA" color="#633806" border="#EF9F27" />
      </div>

      {/* Tasks summary */}
      {tasks.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 12 }}>
          <div className="dash-section-title">Tasks overview</div>
          <div style={{ display: "flex", gap: 8 }}>
            <StatCard value={tasks.filter(t => t.status === "open").length} label="To do" />
            <StatCard value={tasks.filter(t => t.status === "in_progress").length} label="In progress" bg="#E6F1FB" color="#0C447C" border="#85B7EB" />
            <StatCard value={tasks.filter(t => t.status === "done").length} label="Done ✓" bg="#EAF3DE" color="#27500A" border="#97C459" />
          </div>
          {tasks.filter(t => t.priority === "urgent" && t.status !== "done").length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#72243E", background: "#FBEAF0", border: "1px solid #ED93B1", borderRadius: 8, padding: "6px 10px" }}>
              ⚠ {tasks.filter(t => t.priority === "urgent" && t.status !== "done").length} urgent task(s) pending — check Tasks tab
            </div>
          )}
        </div>
      )}

      {/* Group progress donuts */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">Group progress — Week {currentWeek}</div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 0 4px" }}>
          {GROUPS.map(g => {
            const gvs = activeFollowup.filter(l => groupForOffset(l.createdWeek, currentWeek) === g).flatMap(l => l.visitors || []);
            const gc = gvs.filter(v => v.status === "called").length;
            return (
              <div key={g} style={{ textAlign: "center" }}>
                <DonutChart visitors={gvs} size={68} />
                <div style={{ fontSize: 12, fontWeight: 600, color: GROUP_META[g].color, marginTop: 4 }}>Group {g}</div>
                <div style={{ fontSize: 10, color: "#aaa" }}>{gc}/{gvs.length}</div>
              </div>
            );
          })}
        </div>
        <StatusLegend compact />
      </div>

      {/* Team member individual progress */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <div className="dash-section-title">Individual team member progress</div>
        {teamMembers.length === 0 ? <p className="empty-note">No team members added yet.</p>
          : teamMembers.map(m => {
            const mine = allFV.filter(v => v.assignedTo === m.name);
            const mCalled = mine.filter(v => v.status === "called").length;
            const pct = mine.length > 0 ? Math.round(mCalled / mine.length * 100) : 0;
            const gm = GROUP_META[m.group] || GROUP_META.A;
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                    <span style={{ fontSize: 10, marginLeft: 6, padding: "1px 6px", borderRadius: 20, background: gm.bg, color: gm.color, border: `1px solid ${gm.border}` }}>Grp {m.group}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#888" }}>{mCalled}/{mine.length} · {pct}%</span>
                </div>
                <ProgressBar value={mCalled} max={mine.length} color={gm.bar} height={8} />
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {Object.entries(STATUS_META).map(([k, meta]) => {
                    const cnt = mine.filter(v => (v.status || "pending") === k).length;
                    if (cnt === 0) return null;
                    return <span key={k} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{cnt} {meta.label}</span>;
                  })}
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Pastor individual progress */}
      {pastors.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 12 }}>
          <div className="dash-section-title">Pastor progress — Lapsed members</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <DonutChart visitors={allPV} size={60} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: PASTOR_META.color }}>{pastorCalled}/{allPV.length}</div>
              <div style={{ fontSize: 12, color: "#888" }}>total lapsed members contacted</div>
              <ProgressBar value={pastorCalled} max={allPV.length} color={PASTOR_META.bar} height={8} />
            </div>
          </div>
          {pastors.map(p => {
            const mine = allPV.filter(v => v.assignedTo === p.name);
            const pCalled = mine.filter(v => v.status === "called").length;
            return (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "#888" }}>{pCalled}/{mine.length} · {mine.length > 0 ? Math.round(pCalled / mine.length * 100) : 0}%</span>
                </div>
                <ProgressBar value={pCalled} max={mine.length} color={PASTOR_META.bar} height={7} />
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly trend */}
      <div className="dash-card" style={{ marginBottom: 12 }}>
        <BarChart data={weekData} title="New visitors per week (last 8 weeks)" height={90} />
      </div>

      {/* Monthly trend */}
      {monthData.length > 0 && (
        <div className="dash-card" style={{ marginBottom: 12 }}>
          <BarChart data={monthData} title="Monthly visitor totals" height={90} />
        </div>
      )}

      {/* Overall summary */}
      <div className="dash-card">
        <div className="dash-section-title">Overall church follow-up</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span>New visitor follow-up (all groups)</span>
            <span style={{ color: "#888" }}>{allCalled}/{allFV.length}</span>
          </div>
          <ProgressBar value={allCalled} max={allFV.length} color="#97C459" height={10} />
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span>Lapsed member follow-up (pastors)</span>
            <span style={{ color: "#888" }}>{pastorCalled}/{allPV.length}</span>
          </div>
          <ProgressBar value={pastorCalled} max={allPV.length} color={PASTOR_META.bar} height={10} />
        </div>
      </div>
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
        <p className="login-sub">Welcome, {user.name}! Before you continue, please set a personal PIN. Your admin set a temporary one — only you will know your new PIN.</p>
        <label className="field-label" style={{ marginTop: 16 }}>New PIN (4+ characters)</label>
        <input className="field-input" type="password" placeholder="Choose a PIN" value={pin}
          onChange={e => setPin(e.target.value)} />
        <label className="field-label" style={{ marginTop: 12 }}>Confirm PIN</label>
        <input className="field-input" type="password" placeholder="Type it again" value={confirm}
          onChange={e => setConfirm(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleChange()} />
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
          await setDoc(doc(db, "members", "admin"), { name: "Admin", group: null, isAdmin: true, isPastor: false, pin: "admin1234", mustChangePIN: false });
          onLogin({ name: "Admin", group: null, isAdmin: true, isPastor: false, key: "admin", mustChangePIN: false });
          return;
        }
        setErr("Name not found. Ask your admin to add you."); setLoading(false); return;
      }
      const m = snap.data();
      if (m.pin !== pin) { setErr("Wrong PIN. Try again."); setLoading(false); return; }
      onLogin({ name: m.name, group: m.group || null, isAdmin: !!m.isAdmin, isPastor: !!m.isPastor, key, mustChangePIN: !!m.mustChangePIN });
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
  const tabs = [{ id: "dashboard", label: "📊 Dashboard" }];
  if (!user.isPastor) tabs.push({ id: "my", label: "My list" });
  tabs.push({ id: "all", label: "All groups" });
  if (user.isPastor || user.isAdmin) tabs.push({ id: "pastor", label: "Lapsed" });
  tabs.push({ id: "tasks", label: "✅ Tasks" });
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
    const snap = await getDoc(doc(db, col, listId));
    if (!snap.exists()) return;
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, status, calledBy: user.name } : v);
    await updateDoc(doc(db, col, listId), { visitors });
    setLv(p => ({ ...p, status, calledBy: user.name }));
  }

  async function postComment() {
    if (!comment.trim()) return;
    setSaving(true);
    const col = listType === "pastor" ? "pastor_lists" : "lists";
    const snap = await getDoc(doc(db, col, listId));
    if (!snap.exists()) { setSaving(false); return; }
    const nc = { id: uid(), text: comment.trim(), author: user.name, ts: Date.now() };
    const visitors = snap.data().visitors.map(v => v.id === lv.id ? { ...v, comments: [...(v.comments || []), nc] } : v);
    await updateDoc(doc(db, col, listId), { visitors });
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
  const gm = GROUP_META[user.group] || GROUP_META.A;
  if (!user.group) return <div className="empty-state">You're an admin — use the Dashboard or Manage tab.</div>;
  return (
    <div className="tab-content">
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
                : gvs.map(v => <VisitorRow key={v.id} visitor={v} listName={v.listName} assignedTo={v.assignedTo}
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
    <div style={{ border: `1.5px dashed ${dragging ? accent : "#D0CFC9"}`, borderRadius: 8, padding: 14, textAlign: "center", background: dragging ? accentBg : "#FAFAF8", cursor: "pointer", marginBottom: 10 }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onClick={() => ref.current.click()}>
      <input ref={ref} type="file" accept=".txt,.csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      <div style={{ fontSize: 22, marginBottom: 4 }}>📂</div>
      <div style={{ fontSize: 13, color: "#888" }}>Drop .txt or .csv here, or <span style={{ color: accent, fontWeight: 500 }}>click to browse</span></div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 3 }}>Format: Name, Phone (one per line)</div>
    </div>
  );
}

// ── MANAGE TAB ────────────────────────────────────────────────────────────
function ManageTab({ lists, pastorLists, currentWeek, onWeekChange, user, members }) {
  const [sec, setSec] = useState("newvisitors");
  const [nvName, setNvName] = useState(""); const [nvWeek, setNvWeek] = useState(currentWeek);
  const [nvEntries, setNvEntries] = useState([]); const [nvInput, setNvInput] = useState(""); const [nvPhone, setNvPhone] = useState("");
  const [nvMsg, setNvMsg] = useState(""); const [nvSaving, setNvSaving] = useState(false);
  const [lmName, setLmName] = useState("");
  const [lmEntries, setLmEntries] = useState([]); const [lmInput, setLmInput] = useState(""); const [lmPhone, setLmPhone] = useState("");
  const [lmMsg, setLmMsg] = useState(""); const [lmSaving, setLmSaving] = useState(false);
  const [memName, setMemName] = useState(""); const [memRole, setMemRole] = useState("A");
  const [memPin, setMemPin] = useState(""); const [memMsg, setMemMsg] = useState("");
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
    if (memPin.trim().length < 4) { setMemMsg("PIN must be at least 4 characters."); return; }
    const key = slug(memName);
    const isPastor = memRole === "pastor";
    await setDoc(doc(db, "members", key), { name: memName.trim(), group: isPastor ? null : memRole, isAdmin: false, isPastor, pin: memPin.trim(), mustChangePIN: true });
    setMemName(""); setMemPin("");
    setMemMsg(`✓ ${memName.trim()} added. They will be prompted to set their own PIN on first login.`);
    setTimeout(() => setMemMsg(""), 5000);
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
    { id: "lapsed", label: "🙏 Lapsed" },
    { id: "members", label: "👤 Team" },
    { id: "week", label: "📅 Week" },
    { id: "pin", label: "🔑 My PIN" },
  ];

  return (
    <div className="tab-content">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSec(s.id)}
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 20, border: "0.5px solid", cursor: "pointer",
              background: sec === s.id ? "#185FA5" : "#F7F6F3",
              color: sec === s.id ? "#fff" : "#444",
              borderColor: sec === s.id ? "#185FA5" : "#D0CFC9" }}>
            {s.label}
          </button>
        ))}
      </div>

      {sec === "week" && (
        <div className="manage-card">
          <div className="manage-card-title">Current week</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="number" className="field-input" style={{ width: 80, textAlign: "center" }}
              defaultValue={currentWeek} onChange={e => onWeekChange(parseInt(e.target.value) || 1)} />
            <span style={{ fontSize: 13, color: "#888" }}>Updates for all team members</span>
          </div>
        </div>
      )}

      {sec === "newvisitors" && (<>
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
            <input className="field-input" placeholder="Phone" value={nvPhone} onChange={e => setNvPhone(e.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn-outline" onClick={addNvEntry}>Add</button>
          </div>
          {nvEntries.length > 0 && (
            <div className="chip-row">
              {nvEntries.map((e, i) => (
                <span key={i} className="name-chip">{e.name}{e.phone ? ` · ${e.phone}` : ""}
                  <button className="chip-del" onClick={() => setNvEntries(p => p.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          {nvMsg && <p className={nvMsg.startsWith("✓") ? "success-text" : "err-text"}>{nvMsg}</p>}
          <button className="btn-primary full" style={{ marginTop: 8 }} onClick={createNewVisitorList} disabled={nvSaving}>
            {nvSaving ? "Saving…" : `Create & assign (${nvEntries.length} visitors)`}
          </button>
        </div>
        <div className="manage-card">
          <div className="manage-card-title">Active visitor lists</div>
          {assignMsg && <p className="success-text" style={{ marginBottom: 8 }}>{assignMsg}</p>}
          {lists.filter(l => l.status === "active").length === 0 ? <p className="empty-note">No active lists.</p>
            : lists.filter(l => l.status === "active").sort((a, b) => b.createdWeek - a.createdWeek).map(list => (
              <div key={list.id} className="active-list-item">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
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
      </>)}

      {sec === "lapsed" && (<>
        <div className="manage-card">
          <div className="manage-card-title" style={{ color: PASTOR_META.color }}>Add lapsed member list</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Upload a .txt file or add names one by one. Contacts are assigned to pastors.</p>
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
                <span key={i} className="name-chip" style={{ background: PASTOR_META.bg, color: PASTOR_META.color, borderColor: PASTOR_META.border }}>
                  {e.name}{e.phone ? ` · ${e.phone}` : ""}
                  <button className="chip-del" onClick={() => setLmEntries(p => p.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          {lmMsg && <p className={lmMsg.startsWith("✓") ? "success-text" : "err-text"}>{lmMsg}</p>}
          <button className="btn-primary full" style={{ marginTop: 8, background: PASTOR_META.color }} onClick={createLapsedList} disabled={lmSaving}>
            {lmSaving ? "Saving…" : `Create & assign to pastors (${lmEntries.length} members)`}
          </button>
        </div>
        <div className="manage-card">
          <div className="manage-card-title">Active lapsed member lists</div>
          {pastorLists.filter(l => l.status === "active").length === 0 ? <p className="empty-note">No active lapsed member lists.</p>
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
      </>)}

      {sec === "members" && (
        <div className="manage-card">
          <div className="manage-card-title">Team members</div>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Each new member will be prompted to set their own personal PIN on first login.</p>
          <label className="field-label">Name</label>
          <input className="field-input" placeholder="Member name" value={memName} onChange={e => setMemName(e.target.value)} style={{ marginBottom: 8 }} />
          <label className="field-label">Role</label>
          <select className="field-input" value={memRole} onChange={e => setMemRole(e.target.value)} style={{ marginBottom: 8 }}>
            {GROUPS.map(g => <option key={g} value={g}>Group {g} — Follow-up team</option>)}
            <option value="pastor">Pastor — Lapsed member follow-up</option>
          </select>
          <label className="field-label">Temporary PIN (they will change this on first login)</label>
          <input className="field-input" placeholder="Set a temporary PIN" value={memPin} onChange={e => setMemPin(e.target.value)} style={{ marginBottom: 10 }} />
          {memMsg && <p className={memMsg.startsWith("✓") ? "success-text" : "err-text"}>{memMsg}</p>}
          <button className="btn-primary full" onClick={addMember}>Add member</button>
          <div style={{ marginTop: 14 }}>
            {members.filter(m => m.id !== "admin").map(m => (
              <div key={m.id} className="member-row">
                <div>
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                  {m.mustChangePIN && <span style={{ fontSize: 10, marginLeft: 6, color: "#BA7517", background: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: 10, padding: "1px 6px" }}>PIN not yet set</span>}
                </div>
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

// ── TASKS TAB ──────────────────────────────────────────────────────────────
// Tasks are one-off assignments outside routine calls.
// Admin can assign to any individual or group.
// Each task has: title, description, assignedTo (name or group or "all"),
// assignedToType ("member"|"group"|"pastors"|"all"), priority, dueDate, status

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
    task.assignedToType === "group" && task.assignedTo === user.group ||
    task.assignedToType === "pastors" && user.isPastor ||
    task.assignedToType === "all";

  async function changeStatus(status) {
    await updateDoc(doc(db, "tasks", task.id), { status, updatedBy: user.name, updatedAt: Date.now() });
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
            {task.assignedToType === "all" && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#F7F6F3", color: "#444", border: "1px solid #E0DFDB" }}>Everyone</span>}
            {task.dueDate && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: overdue ? "#FBEAF0" : "#F7F6F3", color: overdue ? "#72243E" : "#888", border: `1px solid ${overdue ? "#ED93B1" : "#E0DFDB"}` }}>{overdue ? "⚠ Overdue · " : "📅 "}{task.dueDate}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {user.isAdmin && <button className="btn-del" onClick={() => onDelete(task.id)} style={{ fontSize: 14 }}>×</button>}
          <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setOpen(o => !o)}>
            {task.comments?.length > 0 ? `💬 ${task.comments.length}` : "💬"} {open ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {canEdit && task.status !== "done" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {task.status === "open" && <button style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 6, border: "1px solid #85B7EB", background: "#E6F1FB", color: "#0C447C", cursor: "pointer" }} onClick={() => changeStatus("in_progress")}>▶ Start</button>}
          {task.status === "in_progress" && <button style={{ flex: 1, fontSize: 11, padding: "5px 0", borderRadius: 6, border: "1px solid #97C459", background: "#EAF3DE", color: "#27500A", cursor: "pointer" }} onClick={() => changeStatus("done")}>✓ Mark done</button>}
          {task.status !== "open" && <button style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #D0CFC9", background: "#F7F6F3", color: "#888", cursor: "pointer" }} onClick={() => changeStatus("open")}>↩ Reopen</button>}
        </div>
      )}
      {canEdit && task.status === "done" && (
        <button style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #D0CFC9", background: "#F7F6F3", color: "#888", cursor: "pointer", marginTop: 6 }} onClick={() => changeStatus("open")}>↩ Reopen task</button>
      )}

      {open && (
        <div style={{ marginTop: 10, borderTop: "0.5px solid #F0EFEB", paddingTop: 10 }}>
          {(!task.comments || task.comments.length === 0) && <p className="empty-note">No notes yet.</p>}
          {(task.comments || []).map(c => (
            <div key={c.id} className="comment-card">
              <div className="comment-meta"><span className="comment-author">{c.author}</span><span className="comment-time">{fmtDT(c.ts)}</span></div>
              <p className="comment-text">{c.text}</p>
            </div>
          ))}
          <div className="comment-compose">
            <input className="field-input" placeholder="Add a note…" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === "Enter" && postNote()} />
            <button className="btn-primary" onClick={postNote} disabled={saving}>{saving ? "…" : "Post"}</button>
          </div>
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

  // Determine what tasks this user sees
  const myTasks = tasks.filter(t => {
    if (t.assignedToType === "all") return true;
    if (t.assignedToType === "member" && t.assignedTo === user.name) return true;
    if (t.assignedToType === "group" && t.assignedTo === user.group) return true;
    if (t.assignedToType === "pastors" && user.isPastor) return true;
    return false;
  });
  const openTasks = myTasks.filter(t => t.status !== "done");
  const doneTasks = myTasks.filter(t => t.status === "done");
  const shownTasks = filter === "mine" ? myTasks : filter === "open" ? openTasks : doneTasks;

  async function createTask() {
    if (!title.trim()) { setMsg("Task title is required."); return; }
    if (assignType === "member" && !assignTo) { setMsg("Select who to assign this task to."); return; }
    if (assignType === "group" && !assignTo) { setMsg("Select a group."); return; }
    setSaving(true);
    const id = "t_" + uid();
    await setDoc(doc(db, "tasks", id), {
      id, title: title.trim(), description: desc.trim(),
      assignedToType: assignType,
      assignedTo: assignType === "member" || assignType === "group" ? assignTo : assignType,
      priority, dueDate: dueDate || null,
      status: "open", comments: [],
      createdBy: user.name, createdAt: Date.now(),
    });
    setTitle(""); setDesc(""); setAssignTo(""); setDueDate(""); setPriority("normal");
    setMsg("✓ Task created!"); setSaving(false); setShowCreate(false);
    onRefresh(); setTimeout(() => setMsg(""), 3000);
  }

  async function deleteTask(id) {
    if (!window.confirm("Delete this task?")) return;
    await deleteDoc(doc(db, "tasks", id));
    onRefresh();
  }

  const nonAdminMembers = members.filter(m => !m.isAdmin);

  return (
    <div className="tab-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Tasks <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>({openTasks.length} open)</span></div>
        {user.isAdmin && (
          <button className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => setShowCreate(s => !s)}>
            {showCreate ? "Cancel" : "+ New task"}
          </button>
        )}
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
            <option value="all">Everyone</option>
          </select>
          {assignType === "member" && (
            <select className="field-input" value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">-- Select person --</option>
              {nonAdminMembers.map(m => <option key={m.id} value={m.name}>{m.name} ({m.isPastor ? "Pastor" : `Group ${m.group}`})</option>)}
            </select>
          )}
          {assignType === "group" && (
            <select className="field-input" value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ marginBottom: 8 }}>
              <option value="">-- Select group --</option>
              {GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">Priority</label>
              <select className="field-input" value={priority} onChange={e => setPriority(e.target.value)}>
                {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">Due date (optional)</label>
              <input type="date" className="field-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary full" onClick={createTask} disabled={saving}>{saving ? "Saving…" : "Create task"}</button>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["mine", `All (${myTasks.length})`], ["open", `Open (${openTasks.length})`], ["done", `Done (${doneTasks.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, border: "0.5px solid", cursor: "pointer", background: filter === k ? "#185FA5" : "#F7F6F3", color: filter === k ? "#fff" : "#444", borderColor: filter === k ? "#185FA5" : "#D0CFC9" }}>{l}</button>
        ))}
      </div>

      {shownTasks.length === 0
        ? <div className="empty-state">{filter === "done" ? "No completed tasks yet." : "No tasks assigned to you."}</div>
        : shownTasks.sort((a, b) => {
          const po = { urgent: 0, normal: 1, low: 2 };
          return (po[a.priority] || 1) - (po[b.priority] || 1);
        }).map(t => <TaskCard key={t.id} task={t} user={user} onUpdate={onRefresh} onDelete={deleteTask} />)
      }
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("fu_user")); } catch { return null; } });
  const [tab, setTab] = useState("dashboard");
  const [lists, setLists] = useState([]);
  const [pastorLists, setPastorLists] = useState([]);
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
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  function handleLogin(u) {
    sessionStorage.setItem("fu_user", JSON.stringify(u));
    setUser(u);
    setTab("dashboard");
  }

  function handlePinChanged(newPin) {
    const updated = { ...user, mustChangePIN: false };
    sessionStorage.setItem("fu_user", JSON.stringify(updated));
    setUser(updated);
  }

  function handleLogout() { sessionStorage.removeItem("fu_user"); setUser(null); }

  async function handleWeekChange(w) {
    setCurrentWeek(w);
    await setDoc(doc(db, "config", "global"), { week: w }, { merge: true });
  }

  if (!user) return <LoginScreen onLogin={handleLogin} />;
  if (user.mustChangePIN) return <ForcePinChange user={user} onDone={handlePinChanged} />;

  const selectedList = selected ? (selected.listType === "pastor" ? pastorLists : lists).find(l => l.id === selected.listId) : null;
  const selectedVisitor = selectedList?.visitors?.find(v => v.id === selected.visitor.id);

  return (
    <div className="app-wrap">
      <Header user={user} currentWeek={currentWeek} onLogout={handleLogout} />
      <NavBar tab={tab} setTab={setTab} user={user} />
      <main>
        {tab === "dashboard" && (
          user.isAdmin
            ? <AdminDashboard lists={lists} pastorLists={pastorLists} currentWeek={currentWeek} members={members} tasks={tasks} />
            : <PersonalDashboard user={user} lists={lists} pastorLists={pastorLists} currentWeek={currentWeek} members={members} tasks={tasks} />
        )}
        {tab === "my" && <MyListTab lists={lists} currentWeek={currentWeek} user={user} onSelectVisitor={setSelected} />}
        {tab === "all" && <AllGroupsTab lists={lists} currentWeek={currentWeek} onSelectVisitor={setSelected} />}
        {tab === "pastor" && <PastorTab pastorLists={pastorLists} user={user} onSelectVisitor={setSelected} />}
        {tab === "tasks" && <TasksTab tasks={tasks} user={user} members={members} onRefresh={() => {}} />}
        {tab === "manage" && user.isAdmin && <ManageTab lists={lists} pastorLists={pastorLists} currentWeek={currentWeek} onWeekChange={handleWeekChange} user={user} members={members} />}
      </main>
      {selected && selectedVisitor && (
        <VisitorModal visitor={selectedVisitor} listId={selected.listId} listName={selected.listName}
          listType={selected.listType} user={user} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

