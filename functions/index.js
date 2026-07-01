const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const bcrypt = require("bcryptjs");

initializeApp();
const db = getFirestore();
const auth = getAuth();

function slug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

// ─────────────────────────────────────────────────────────────────────────
// login: verifies name + PIN against the hashed PIN stored in Firestore,
// then mints a Firebase custom auth token with custom claims (group,
// isAdmin) baked in. The client signs in with this token, and Firestore
// security rules read the claims directly from the verified token — never
// from anything the client could fake.
// ─────────────────────────────────────────────────────────────────────────
exports.login = onCall(async (request) => {
  const { name, pin } = request.data || {};
  if (!name || !pin) {
    throw new HttpsError("invalid-argument", "Name and PIN are required.");
  }

  const key = slug(name);

  // Built-in admin bootstrap account (PIN should be changed via Manage tab
  // after first login — see changePin function below).
  if (key === "admin") {
    const adminDoc = await db.collection("members").doc("admin").get();
    let pinHash;
    if (!adminDoc.exists) {
      // First-ever login: create the admin record with the default PIN,
      // hashed. Default PIN is "admin1234" — change it immediately.
      pinHash = bcrypt.hashSync("admin1234", 10);
      await db.collection("members").doc("admin").set({
        name: "Admin",
        group: null,
        isAdmin: true,
        pinHash,
      });
    } else {
      pinHash = adminDoc.data().pinHash;
    }
    if (!bcrypt.compareSync(pin, pinHash)) {
      throw new HttpsError("permission-denied", "Wrong PIN.");
    }
    const token = await auth.createCustomToken("admin", { isAdmin: true, group: null, name: "Admin" });
    return { token, name: "Admin", group: null, isAdmin: true };
  }

  const doc = await db.collection("members").doc(key).get();
  if (!doc.exists) {
    throw new HttpsError("not-found", "Name not found. Ask your admin to add you.");
  }
  const member = doc.data();
  if (!bcrypt.compareSync(pin, member.pinHash)) {
    throw new HttpsError("permission-denied", "Wrong PIN. Try again.");
  }

  const token = await auth.createCustomToken(key, {
    isAdmin: !!member.isAdmin,
    group: member.group || null,
    name: member.name,
  });

  return { token, name: member.name, group: member.group || null, isAdmin: !!member.isAdmin };
});

// ─────────────────────────────────────────────────────────────────────────
// addMember: admin-only. Verified via the caller's auth token claims
// (set during login above) — never trusts anything from the request body
// about who's calling.
// ─────────────────────────────────────────────────────────────────────────
exports.addMember = onCall(async (request) => {
  if (!request.auth || !request.auth.token.isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  const { name, group, pin } = request.data || {};
  if (!name || !group || !pin) {
    throw new HttpsError("invalid-argument", "Name, group, and PIN are required.");
  }
  const key = slug(name);
  const pinHash = bcrypt.hashSync(pin, 10);
  await db.collection("members").doc(key).set({
    name: name.trim(),
    group,
    isAdmin: false,
    pinHash,
  });
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────
// removeMember: admin-only.
// ─────────────────────────────────────────────────────────────────────────
exports.removeMember = onCall(async (request) => {
  if (!request.auth || !request.auth.token.isAdmin) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  const { memberId } = request.data || {};
  if (!memberId) throw new HttpsError("invalid-argument", "memberId is required.");
  if (memberId === "admin") throw new HttpsError("invalid-argument", "Cannot remove the admin account.");
  await db.collection("members").doc(memberId).delete();
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────
// changePin: lets any signed-in user change their own PIN (including admin).
// ─────────────────────────────────────────────────────────────────────────
exports.changePin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const { newPin } = request.data || {};
  if (!newPin || newPin.length < 4) {
    throw new HttpsError("invalid-argument", "PIN must be at least 4 characters.");
  }
  const uidKey = request.auth.uid;
  const pinHash = bcrypt.hashSync(newPin, 10);
  await db.collection("members").doc(uidKey).update({ pinHash });
  return { ok: true };
});
