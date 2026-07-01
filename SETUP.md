# Follow-up Tracker — Setup Guide (Secure Version)

This version uses **real Firebase Authentication** and **Firestore Security
Rules** to properly protect your team's data — not just a login screen, but
server-side enforcement that nobody can bypass even if they're technical.

What changed from the basic version:
- PINs are never stored in plain text — they're hashed (bcrypt) and checked
  inside a secure Cloud Function, never by the browser.
- Firestore rules check a verified authentication token to decide who can
  read/write what — admins only for member management and list creation,
  any signed-in member for call status/notes.
- The member list (containing PIN hashes) can't be read by regular client
  code at all — only the Cloud Functions touch it.

Total setup time: ~30 minutes. This version requires installing one free
tool (Firebase CLI) on your computer for the one-time deployment of rules
and functions.

---

## Part 1 — Create your Firebase project

1. Go to **https://console.firebase.google.com** and sign in with Google.
2. Click **Add project**, name it `church-followup`, skip Google Analytics.
3. Click the **web icon (`</>`)** to register a web app. Copy the
   `firebaseConfig` values shown — you'll need them in Part 4.
4. In the left sidebar: **Build → Authentication → Get started**. Just
   clicking "Get started" is enough — custom token sign-in (which this app
   uses) works automatically once Authentication is turned on.
5. In the left sidebar: **Build → Firestore Database → Create database**.
   Pick a location close to you, start in **Production mode**.
6. **Upgrade to the Blaze (pay-as-you-go) plan.** This is required because
   Cloud Functions (which securely check PINs) don't run on the free Spark
   plan. Blaze still has a generous free tier (2 million function calls a
   month free) — a small church follow-up app will likely never be billed
   a single cent. You can set a budget alert in Google Cloud Console if
   you'd like a safety net.

---

## Part 2 — Install the Firebase CLI (one-time, on your computer)

You'll need [Node.js](https://nodejs.org) installed first (any recent
version). Then open a terminal (Command Prompt / Terminal app) and run:

```bash
npm install -g firebase-tools
firebase login
```

This opens a browser window to sign in with the same Google account.

---

## Part 3 — Deploy the security rules and functions

1. Download and unzip the project folder from this chat.
2. Open a terminal inside that unzipped `church-followup` folder.
3. Run:

```bash
firebase use --add
```

Select your `church-followup` project when prompted, and give it the alias
`default`.

4. Install the Cloud Functions dependencies and deploy everything:

```bash
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,functions
```

This uploads your security rules and the secure functions (`login`,
`addMember`, `removeMember`, `changePin`) to Firebase. It takes a few
minutes the first time.

> If you ever update `firestore.rules` or anything in the `functions/`
> folder later, just re-run that same `firebase deploy` command to push
> the changes live.

---

## Part 4 — Put the code on GitHub

1. Go to **https://github.com**, create a free account if needed.
2. Click **+ → New repository**, name it `church-followup`, keep it Public
   or Private, don't initialize with any files, click **Create repository**.
3. Click **"uploading an existing file"** and drag in everything from your
   unzipped folder (keep the `src/`, `public/`, `functions/` structure).
4. Commit changes.

---

## Part 5 — Deploy the website on Vercel

1. Go to **https://vercel.com**, sign up with your GitHub account.
2. **Add New → Project**, import your `church-followup` repo.
3. Before deploying, expand **Environment Variables** and add these 6,
   using the values from Part 1, step 3:

   | Name | Value |
   |---|---|
   | `REACT_APP_FIREBASE_API_KEY` | from Firebase `apiKey` |
   | `REACT_APP_FIREBASE_AUTH_DOMAIN` | from Firebase `authDomain` |
   | `REACT_APP_FIREBASE_PROJECT_ID` | from Firebase `projectId` |
   | `REACT_APP_FIREBASE_STORAGE_BUCKET` | from Firebase `storageBucket` |
   | `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | from Firebase `messagingSenderId` |
   | `REACT_APP_FIREBASE_APP_ID` | from Firebase `appId` |

4. Click **Deploy**. Wait ~1 minute. You'll get a live link like
   `church-followup.vercel.app`.

From now on, any code change pushed to GitHub auto-redeploys on Vercel
within a minute or two.

---

## First-time use

1. Open your live link.
2. Sign in with:
   - **Name:** `Admin`
   - **PIN:** `admin1234`
3. **Immediately go to Manage tab → "Change your own PIN"** and set a real
   PIN only you know. This matters much more now since this is a properly
   secured account.
4. Add your team members (name, group, PIN) and this week's visitor list.
5. Set the current week number.
6. Share the live link in your WhatsApp group. Each member signs in with
   the name + PIN you set for them.

---

## What's actually protected now

- **Member PINs**: hashed with bcrypt, never sent to or stored in the
  browser, never readable via the Firestore console export or any client
  query.
- **Group/admin assignment**: baked into a signed Firebase auth token at
  login time — a user cannot edit their own browser storage to grant
  themselves admin access or a different group.
- **List creation/deletion**: admin-only, enforced by Firestore rules
  checking the verified token, not just hidden by the UI.
- **Call status & notes**: any signed-in team member can update these
  (so the whole team can pitch in), but they cannot rename lists, delete
  them, or tamper with the week-rotation fields.

## Need help?

If `firebase deploy` shows an error, or the Vercel build fails, or sign-in
doesn't work — copy the exact error message and bring it back to this
conversation.
