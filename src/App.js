import React, { useState, useEffect } from "react";
import {
  collection, doc, onSnapshot, setDoc, updateDoc,
  serverTimestamp, getDoc,
} from "firebase/firestore";
import { signInWithCustomToken, onAuthStateChanged, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "./firebase";
import { GROUPS, GROUP_META, STATUS_META, groupForOffset, uid, fmtDateTime } from "./utils";
import "./App.css";

const loginFn = httpsCallable(functions, "login");
const addMemberFn = httpsCallable(functions, "addMember");
const removeMemberFn = httpsCallable(functions, "removeMember");
const changePinFn = httpsCallable(functions, "changePin");

// ─── AUTH ─────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!name.trim() || !pin.trim()) { setErr("Enter your name and PIN."); return; }
    setLoading(true); setErr("");
    try {
      const result = await loginFn({ name: name.trim(), pin: pin.trim() });
      const { token, name: fullName, group, isAdmin } = result.data;
      await signInWithCustomToken(auth, token);
      onLogin({ name: fullName, group, isAdmin });
    } catch (e) {
      setErr(e.message?.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim() || "Couldn't sign in. Try again.");
      setLoading(false);
    }
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
        <input className="field-input" type="password" placeholder="••••••" value={pin}
          onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
        {err && <p className="err-text">{err}</p>}
        <button className="btn-primary full" style={{ marginTop: 18 }} onClick={handleLogin} disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

// ─── HEADER ───────────────────────────────────────────────────────────────
function Header({ user, currentWeek, onLogout }) {
  const gm = user.group ? GROUP_META[user.group] : null;
  return (
    <header className="app-header">
      <div>
        <div className="app-title">Follow-up Tracker</div>
        <div className="app-week">Week {currentWeek}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {gm && (
          <span className="group-chip" style={{ background: gm.bg, color: gm.color, border: `1px solid ${gm.border}` }}>
            Group {user.group}
          </span>
        )}
        {user.isAdmin && <span className="admin-chip">Admin</span>}
        <button className="btn-ghost" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────
function NavBar({ tab, setTab, isAdmin }) {
  const tabs = [
    { id: "my", label: "My list" },
    { id: "all", label: "All groups" },
    ...(isAdmin ? [{ id: "manage", label: "Manage" }] : []),
  ];
  return (
    <nav className="nav-bar">
      {tabs.map(t => (
        <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ─── VISITOR ROW ──────────────────────────────────────────────────────────
function VisitorRow({ visitor, listName, onClick }) {
  const sm = STATUS_META[visitor.status] || STATUS_META.pending;
  return (
    <div className="visitor-row" onClick={onClick}>
      <div>
        <div className="visitor-name">{visitor.name}</div>
        {listName && <div className="visitor-sub">{listName}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {visitor.comments?.length > 0 && (
          <span className="note-chip">{visitor.comments.length} note{visitor.comments.length !== 1 ? "s" : ""}</span>
        )}
        <span className="status-chip" style={{ background: sm.bg, color: sm.color, border: `1px solid ${sm.border}` }}>
          {sm.label}
        </span>
      </div>
    </div>
  );
}

// ─── VISITOR MODAL ────────────────────────────────────────────────────────
function VisitorModal({ visitor, listId, listName, user, onClose, onStatusChange }) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function updateStatus(status) {
    const listRef = doc(db, "lists", listId);
    const snap = await getDoc(listRef);
    if (!snap.exists()) return;
    const visitors = snap.data().visitors.map(v =>
      v.id === visitor.id ? { ...v, status, calledBy: user.name, calledAt: new Date().toISOString() } : v
    );
    await updateDoc(listRef, { visitors });
    onStatusChange();
  }

  async function postComment() {
    if (!comment.trim()) return;
    setSaving(true);
    const listRef = doc(db, "lists", listId);
    const snap = await getDoc(listRef);
    if (!snap.exists()) { setSaving(false); return; }
    const newComment = { id: uid(), text: comment.trim(), author: user.name, ts: new Date().toISOString() };
    const visitors = snap.data().visitors.map(v =>
      v.id === visitor.id ? { ...v, comments: [...(v.comments || []), newComment] } : v
    );
    await updateDoc(listRef, { visitors });
    setComment("");
    setSaving(false);
  }

  const sm = STATUS_META[visitor.status] || STATUS_META.pending;

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-header">
          <div>
            <div className="modal-visitor-name">{visitor.name}</div>
            <div className="modal-list-name">{listName}</div>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="section-label">Call status</div>
          <div className="status-grid">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button key={key} className={`status-opt${visitor.status === key ? " active" : ""}`}
                style={visitor.status === key ? { background: meta.bg, color: meta.color, border: `1.5px solid ${meta.border}` } : {}}
                onClick={() => updateStatus(key)}>
                {meta.label}
              </button>
            ))}
          </div>
          {visitor.calledBy && (
            <p className="called-by-note">Last updated by {visitor.calledBy}</p>
          )}

          <div className="section-label" style={{ marginTop: 20 }}>Notes</div>
          {(!visitor.comments || visitor.comments.length === 0)
            ? <p className="empty-note">No notes yet — be the first to add one.</p>
            : visitor.comments.map(c => (
              <div key={c.id} className="comment-card">
                <div className="comment-meta">
                  <span className="comment-author">{c.author}</span>
                  <span className="comment-time">{fmtDateTime(c.ts)}</span>
                </div>
                <p className="comment-text">{c.text}</p>
              </div>
            ))
          }
          <div className="comment-compose">
            <input className="field-input" placeholder="Add a note…" value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => e.key === "Enter" && postComment()} />
            <button className="btn-primary" onClick={postComment} disabled={saving}>
              {saving ? "…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MY LIST TAB ──────────────────────────────────────────────────────────
function MyListTab({ lists, currentWeek, user, onSelectVisitor }) {
  const myLists = lists.filter(l =>
    l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === user.group
  );
  const allVisitors = myLists.flatMap(l => l.visitors.map(v => ({ ...v, listId: l.id, listName: l.name })));
  const called = allVisitors.filter(v => v.status === "called").length;
  const gm = GROUP_META[user.group] || GROUP_META.A;

  if (!user.group) return <div className="empty-state">You're an admin — use the All Groups or Manage tab.</div>;

  return (
    <div className="tab-content">
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-val">{allVisitors.length}</div>
          <div className="stat-lbl">To contact</div>
        </div>
        <div className="stat-card success">
          <div className="stat-val">{called}</div>
          <div className="stat-lbl">Called ✓</div>
        </div>
        <div className="stat-card warn">
          <div className="stat-val">{allVisitors.length - called}</div>
          <div className="stat-lbl">Remaining</div>
        </div>
      </div>

      {myLists.length === 0
        ? <div className="empty-state">No contacts assigned to Group {user.group} this week.<br />Check back after the admin adds the Sunday list.</div>
        : myLists.map(list => (
          <div key={list.id} className="list-card" style={{ borderLeft: `3px solid ${gm.border}` }}>
            <div className="list-card-header">
              <div>
                <div className="list-name">📋 {list.name}</div>
                <div className="list-meta">Week {list.createdWeek} · {list.visitors.length} visitor{list.visitors.length !== 1 ? "s" : ""}</div>
              </div>
            </div>
            {list.visitors.length === 0
              ? <p className="empty-note">No visitors in this list.</p>
              : list.visitors.map(v => (
                <VisitorRow key={v.id} visitor={v}
                  onClick={() => onSelectVisitor({ visitor: v, listId: list.id, listName: list.name })} />
              ))
            }
          </div>
        ))
      }
    </div>
  );
}

// ─── ALL GROUPS TAB ───────────────────────────────────────────────────────
function AllGroupsTab({ lists, currentWeek, onSelectVisitor }) {
  return (
    <div className="tab-content">
      {GROUPS.map(g => {
        const gm = GROUP_META[g];
        const glists = lists.filter(l => l.status === "active" && groupForOffset(l.createdWeek, currentWeek) === g);
        const visitors = glists.flatMap(l => l.visitors.map(v => ({ ...v, listId: l.id, listName: l.name })));
        return (
          <div key={g} className="list-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="group-card-header" style={{ background: gm.bg, borderBottom: `1px solid ${gm.border}` }}>
              <span style={{ fontWeight: 500, color: gm.color }}>Group {g}</span>
              <span style={{ fontSize: 12, color: gm.color }}>{visitors.length} contact{visitors.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ padding: "8px 14px 10px" }}>
              {visitors.length === 0
                ? <p className="empty-note">No contacts assigned this week.</p>
                : visitors.map(v => (
                  <VisitorRow key={v.id} visitor={v} listName={v.listName}
                    onClick={() => onSelectVisitor({ visitor: v, listId: v.listId, listName: v.listName })} />
                ))
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MANAGE TAB ───────────────────────────────────────────────────────────
function ManageTab({ lists, currentWeek, onWeekChange }) {
  const [newListName, setNewListName] = useState("");
  const [newListWeek, setNewListWeek] = useState(currentWeek);
  const [names, setNames] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Member management
  const [memName, setMemName] = useState("");
  const [memGroup, setMemGroup] = useState("A");
  const [memPin, setMemPin] = useState("");
  const [members, setMembers] = useState([]);
  const [memMsg, setMemMsg] = useState("");
  const [memSaving, setMemSaving] = useState(false);

  // Own PIN change
  const [newOwnPin, setNewOwnPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "members"), snap => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => { /* not admin, or rules deny — ignore */ });
    return unsub;
  }, []);

  function addName() {
    if (!nameInput.trim()) return;
    setNames(p => [...p, nameInput.trim()]);
    setNameInput("");
  }

  async function createList() {
    if (!newListName.trim() || names.length === 0) { setMsg("Add a list name and at least one visitor."); return; }
    setSaving(true); setMsg("");
    const id = uid();
    const visitors = names.map(n => ({ id: uid(), name: n, status: "pending", comments: [] }));
    await setDoc(doc(db, "lists", id), {
      id, name: newListName.trim(), createdWeek: parseInt(newListWeek) || currentWeek,
      visitors, status: "active", createdAt: serverTimestamp(),
    });
    setNewListName(""); setNames([]); setNameInput("");
    setMsg("✓ List created!"); setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  async function archiveList(id) {
    await updateDoc(doc(db, "lists", id), { status: "archived" });
  }

  async function deleteVisitorFromList(listId, visitorId) {
    const snap = await getDoc(doc(db, "lists", listId));
    if (!snap.exists()) return;
    const visitors = snap.data().visitors.filter(v => v.id !== visitorId);
    await updateDoc(doc(db, "lists", listId), { visitors });
  }

  async function addMember() {
    if (!memName.trim() || !memPin.trim()) { setMemMsg("Name and PIN required."); return; }
    if (memPin.trim().length < 4) { setMemMsg("PIN must be at least 4 characters."); return; }
    setMemSaving(true); setMemMsg("");
    try {
      await addMemberFn({ name: memName.trim(), group: memGroup, pin: memPin.trim() });
      setMemName(""); setMemPin("");
      setMemMsg("✓ Member added!");
      setTimeout(() => setMemMsg(""), 3000);
    } catch (e) {
      setMemMsg(e.message?.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim() || "Couldn't add member.");
    }
    setMemSaving(false);
  }

  async function deleteMember(id) {
    try {
      await removeMemberFn({ memberId: id });
      setMemMsg("✓ Member removed.");
      setTimeout(() => setMemMsg(""), 3000);
    } catch (e) {
      setMemMsg(e.message?.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim() || "Couldn't remove member.");
    }
  }

  async function changeOwnPin() {
    if (!newOwnPin.trim() || newOwnPin.trim().length < 4) { setPinMsg("PIN must be at least 4 characters."); return; }
    try {
      await changePinFn({ newPin: newOwnPin.trim() });
      setNewOwnPin("");
      setPinMsg("✓ PIN updated!");
      setTimeout(() => setPinMsg(""), 3000);
    } catch (e) {
      setPinMsg(e.message?.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim() || "Couldn't update PIN.");
    }
  }

  return (
    <div className="tab-content">
      {/* Week control */}
      <div className="manage-card">
        <div className="manage-card-title">Current week</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="number" className="field-input" style={{ width: 80, textAlign: "center" }}
            defaultValue={currentWeek} onChange={e => onWeekChange(parseInt(e.target.value) || 1)} />
          <span style={{ fontSize: 13, color: "#888" }}>Team-wide — all members will see this week</span>
        </div>
      </div>

      {/* Add list */}
      <div className="manage-card">
        <div className="manage-card-title">Add Sunday visitor list</div>
        <label className="field-label">List name</label>
        <input className="field-input" placeholder='e.g. "June 29 Sunday"' value={newListName}
          onChange={e => setNewListName(e.target.value)} style={{ marginBottom: 10 }} />
        <label className="field-label">Week number</label>
        <input type="number" className="field-input" style={{ width: 80, marginBottom: 10 }}
          value={newListWeek} onChange={e => setNewListWeek(e.target.value)} />
        <label className="field-label">Visitor names</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input className="field-input" placeholder="Visitor full name" value={nameInput}
            onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addName()} />
          <button className="btn-outline" onClick={addName}>Add</button>
        </div>
        {names.length > 0 && (
          <div className="chip-row">
            {names.map((n, i) => (
              <span key={i} className="name-chip">
                {n}
                <button className="chip-del" onClick={() => setNames(p => p.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        {msg && <p className={msg.startsWith("✓") ? "success-text" : "err-text"}>{msg}</p>}
        <button className="btn-primary full" style={{ marginTop: 12 }} onClick={createList} disabled={saving}>
          {saving ? "Saving…" : "Create list"}
        </button>
      </div>

      {/* Active lists */}
      {lists.filter(l => l.status === "active").length > 0 && (
        <div className="manage-card">
          <div className="manage-card-title">Active lists</div>
          {lists.filter(l => l.status === "active").sort((a, b) => b.createdWeek - a.createdWeek).map(list => (
            <div key={list.id} className="active-list-item">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>📋 {list.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Week {list.createdWeek} · {list.visitors.length} visitors</div>
                </div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => archiveList(list.id)}>Archive</button>
              </div>
              {list.visitors.map(v => (
                <div key={v.id} className="manage-visitor-row">
                  <span>{v.name}</span>
                  <button className="btn-del" onClick={() => deleteVisitorFromList(list.id, v.id)}>×</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Members */}
      <div className="manage-card">
        <div className="manage-card-title">Team members</div>
        <label className="field-label">Name</label>
        <input className="field-input" placeholder="Member name" value={memName}
          onChange={e => setMemName(e.target.value)} style={{ marginBottom: 8 }} />
        <label className="field-label">Group</label>
        <select className="field-input" value={memGroup} onChange={e => setMemGroup(e.target.value)} style={{ marginBottom: 8 }}>
          {GROUPS.map(g => <option key={g} value={g}>Group {g}</option>)}
        </select>
        <label className="field-label">PIN</label>
        <input className="field-input" placeholder="Set a PIN for them (4+ characters)" value={memPin}
          onChange={e => setMemPin(e.target.value)} style={{ marginBottom: 10 }} />
        {memMsg && <p className={memMsg.startsWith("✓") ? "success-text" : "err-text"}>{memMsg}</p>}
        <button className="btn-primary full" onClick={addMember} disabled={memSaving}>
          {memSaving ? "Adding…" : "Add member"}
        </button>
        <div style={{ marginTop: 14 }}>
          {members.filter(m => m.id !== "admin").map(m => (
            <div key={m.id} className="member-row">
              <span style={{ fontSize: 13 }}>{m.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="group-chip" style={{ background: GROUP_META[m.group]?.bg, color: GROUP_META[m.group]?.color, border: `1px solid ${GROUP_META[m.group]?.border}` }}>
                  {m.group}
                </span>
                <button className="btn-del" onClick={() => deleteMember(m.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Change own PIN */}
      <div className="manage-card">
        <div className="manage-card-title">Change your own PIN</div>
        <label className="field-label">New PIN (4+ characters)</label>
        <input className="field-input" type="password" placeholder="New PIN" value={newOwnPin}
          onChange={e => setNewOwnPin(e.target.value)} style={{ marginBottom: 10 }}
          onKeyDown={e => e.key === "Enter" && changeOwnPin()} />
        {pinMsg && <p className={pinMsg.startsWith("✓") ? "success-text" : "err-text"}>{pinMsg}</p>}
        <button className="btn-outline full" onClick={changeOwnPin}>Update PIN</button>
        <p style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>
          If you're using the default admin account, change this PIN now.
        </p>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("fu_profile")); } catch { return null; }
  });
  const [tab, setTab] = useState("my");
  const [lists, setLists] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [selected, setSelected] = useState(null);

  // Track real Firebase Auth session. This is the source of truth for
  // whether requests to Firestore will be accepted by the security rules.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, fbUser => {
      setFirebaseUser(fbUser);
      setAuthReady(true);
      if (!fbUser) {
        setProfile(null);
        sessionStorage.removeItem("fu_profile");
      }
    });
    return unsub;
  }, []);

  // Only subscribe to Firestore once there's a real authenticated session —
  // subscribing earlier would just be rejected by the rules anyway.
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(collection(db, "lists"), snap => {
      setLists(snap.docs.map(d => d.data()));
    });
    const unsub2 = onSnapshot(doc(db, "config", "global"), snap => {
      if (snap.exists()) setCurrentWeek(snap.data().week || 1);
    });
    return () => { unsub(); unsub2(); };
  }, [firebaseUser]);

  function handleLogin(u) {
    sessionStorage.setItem("fu_profile", JSON.stringify(u));
    setProfile(u);
  }
  async function handleLogout() {
    await signOut(auth);
    sessionStorage.removeItem("fu_profile");
    setProfile(null);
  }

  async function handleWeekChange(w) {
    setCurrentWeek(w);
    await setDoc(doc(db, "config", "global"), { week: w }, { merge: true });
  }

  if (!authReady) return null; // brief flash, avoids login-screen flicker
  if (!firebaseUser || !profile) return <LoginScreen onLogin={handleLogin} />;

  const user = profile;
  const selectedList = selected ? lists.find(l => l.id === selected.listId) : null;
  const selectedVisitor = selectedList?.visitors.find(v => v.id === selected.visitorId);

  return (
    <div className="app-wrap">
      <Header user={user} currentWeek={currentWeek} onLogout={handleLogout} />
      <NavBar tab={tab} setTab={setTab} isAdmin={user.isAdmin} />
      <main>
        {tab === "my" && <MyListTab lists={lists} currentWeek={currentWeek} user={user} onSelectVisitor={setSelected} />}
        {tab === "all" && <AllGroupsTab lists={lists} currentWeek={currentWeek} onSelectVisitor={setSelected} />}
        {tab === "manage" && user.isAdmin && <ManageTab lists={lists} currentWeek={currentWeek} onWeekChange={handleWeekChange} />}
      </main>
      {selected && selectedVisitor && (
        <VisitorModal
          visitor={selectedVisitor}
          listId={selected.listId}
          listName={selected.listName}
          user={user}
          onClose={() => setSelected(null)}
          onStatusChange={() => setSelected(s => ({ ...s }))}
        />
      )}
    </div>
  );
}
