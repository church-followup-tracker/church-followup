# Church Follow-up Tracker

A real-time shared web app for tracking first-timer follow-up calls,
rotating through four teams (A, B, C, D) week by week — with proper
authentication and server-enforced access control.

**👉 Start with `SETUP.md` for full step-by-step deployment instructions.**

## How the rotation works

Each Sunday's new visitor list is followed up by Group A in week 1, then
automatically passed to Group B in week 2, Group C in week 3, and Group D
in week 4. Every week, a fresh list also starts with Group A. The app
calculates these rotations automatically based on the current week number
and each list's starting week — no manual reassignment needed.

## Features

- Secure name + PIN sign-in, backed by real Firebase Authentication
- PINs are hashed server-side (bcrypt) — never stored or checked in the browser
- Firestore Security Rules enforce who can read/write what, independent of
  the app's UI — admins manage members/lists, any signed-in member can
  update call status and notes
- "My list" — see only your group's assigned contacts this week
- "All groups" — full team visibility across all four groups
- Tap any visitor to update call status (Pending, Calling now, Called, Not
  reached, Left message) and leave timestamped notes
- Real-time sync — everyone sees updates instantly, no refresh needed
- Admin panel to add weekly visitor lists, manage team members, and set
  the current week

## Tech stack

- React (Create React App)
- Firebase Authentication (custom token sign-in)
- Firebase Cloud Functions (secure PIN verification, admin actions)
- Firestore (real-time database, protected by security rules)
- Hosted free on Vercel

## Local development

```bash
npm install
cp .env.example .env   # then fill in your Firebase config values
npm start
```

To work on Cloud Functions locally:

```bash
cd functions
npm install
firebase emulators:start
```

