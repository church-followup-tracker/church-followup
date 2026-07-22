# Church Follow-up Tracker
## Complete User & Technical Manual

---

## SECTION 1 — OVERVIEW

The Church Follow-up Tracker is a real-time web application for managing two
separate pastoral follow-up workflows:

**Workflow 1 — New Visitor Follow-up (Follow-up Team)**
Every Sunday, first-time visitors are uploaded into the system. These contacts
rotate through four follow-up groups (A, B, C, D) over four weeks:

  Week 1 → Group A calls them
  Week 2 → Group B follows up
  Week 3 → Group C follows up
  Week 4 → Group D follows up

Within each group, contacts are randomly assigned to individual team members.
Each member sees only their own assigned contacts.

**Workflow 2 — Lapsed Member Follow-up (Pastors)**
A separate list of members who have stopped attending is uploaded and
automatically assigned to pastors. Pastors track their calls and leave notes
independently of the follow-up team.

---

## SECTION 2 — ROLES

| Role    | What they see & can do |
|---------|------------------------|
| Admin   | Everything. Dashboard, all groups, lapsed members list, manage tab (add lists, add members, change week, reassign contacts). |
| Team member (Group A/B/C/D) | "My list" — their personally assigned new visitor contacts for the current week. "All groups" — read-only view of all groups. Can mark calls and leave notes on their own contacts. |
| Pastor  | "Lapsed members" — their assigned lapsed member contacts. "All groups" — can view and update any follow-up team contact too. Cannot access Manage tab. |

---

## SECTION 3 — SIGNING IN

1. Open the app URL in your browser (works on phone and desktop)
2. Type your **name exactly as it was entered by the admin**
   (e.g. if the admin added you as "Mary Adu", type "Mary Adu")
3. Enter your **PIN** (given to you privately by the admin)
4. Tap **Sign in**

**First-time admin login:**
- Name: Admin
- PIN: admin1234
- ⚠️ Change this PIN immediately in Manage → Change PIN

---

## SECTION 4 — THE DASHBOARD (Admin only)

The dashboard is the first screen admins see. It shows:

**Summary cards (top row):**
- Total new visitors in current cycle
- Total contacts called ✓
- Total lapsed members being tracked
- Contacts still pending

**Group Progress Donuts:**
Four circular charts, one per group (A, B, C, D). Each donut shows the
breakdown of call statuses for that group this week. The percentage in the
middle shows how many contacts have been marked "Called ✓".

Donut colour key:
  ● Grey    = Pending (not yet called)
  ● Blue    = Calling now (in progress)
  ● Green   = Called ✓ (completed)
  ● Orange  = Not reached
  ● Purple  = Left message

**Weekly bar chart:**
Shows how many new visitors were added each week for the last 8 weeks.
Taller bars = more visitors that week.

**Monthly bar chart:**
Shows visitor totals grouped by month. Useful for spotting seasonal trends
(e.g. more visitors after special events or Christmas/Easter).

**Team member progress:**
A horizontal progress bar per team member showing how many of their assigned
contacts they have called. Green fill = proportion called.

**Pastor progress:**
A donut and count showing how many lapsed members the pastors have contacted.

---

## SECTION 5 — ADDING VISITORS (Admin — Manage tab)

### Method A: Upload a text file

Create a .txt or .csv file on your computer with one person per line.
Format options:
  John Mensah, 0244123456
  Abena Asante, 0277654321
  Kweku Boateng

Rules:
- Separate name and phone with a comma, tab, or pipe (|)
- Phone number is optional — the name alone is fine
- One person per line
- Save as .txt or .csv

In the app:
1. Go to Manage → New visitors
2. Fill in the list name (e.g. "July 20 Sunday")
3. Set the week number
4. Click the upload box or drag your file onto it
5. Review the names shown in the chips below
6. Click "Create & assign list"

The app will randomly distribute contacts among all Group A-D members.

### Method B: Add one at a time

1. Go to Manage → New visitors
2. Fill in List name and Week number
3. Under "Or add one by one", type the name and optional phone
4. Press Enter or click Add
5. Repeat for each visitor
6. Click "Create & assign list" when done

### Reassigning contacts

If you need to reshuffle who calls who (e.g. a team member is absent):
1. Go to Manage → New visitors → Active visitor lists
2. Find the list and click "↺ Reassign"
3. Contacts are randomly redistributed among all current team members

---

## SECTION 6 — ADDING LAPSED MEMBERS (Admin — Manage tab)

Same process as new visitors, but under Manage → Lapsed members.
Contacts are automatically assigned to pastors rather than follow-up team
members. The file format is identical.

---

## SECTION 7 — CALLING A CONTACT

1. Sign in and go to "My list" (team members) or "Lapsed members" (pastors)
2. Tap any contact name to open their detail sheet
3. The phone number (if available) appears as a tappable link — tap it to call
4. After the call, tap the appropriate status button:
   - **Called ✓** — you reached them and spoke
   - **Not reached** — called but no answer
   - **Left message** — left a voicemail or WhatsApp message
   - **Calling now** — mark while you're mid-call
5. Add a note in the Notes section if needed (e.g. "Said they'll come Sunday")
6. Tap Post to save the note
7. Tap × or tap outside the sheet to close it

Notes are timestamped and show your name. Anyone in the team can see them.

---

## SECTION 8 — ADDING TEAM MEMBERS (Admin only)

1. Go to Manage → Team
2. Enter the member's full name (they must sign in with this exact name)
3. Select their role:
   - Group A, B, C, or D — follow-up team member
   - Pastor — lapsed member follow-up
4. Set a PIN (share it with them privately — not in the group chat)
5. Click Add member

To remove a member, tap the × button next to their name.

---

## SECTION 9 — CHANGING THE WEEK (Admin only)

The system uses a week number to calculate which group should call which list.

Go to Manage → Week → change the number → the change takes effect immediately
for all users.

Example: If it's week 5, Group A handles week 5's list, Group B handles
week 4's list, Group C handles week 3's, Group D handles week 2's.

**Important:** Advance the week number every Sunday after uploading the new
visitor list.

---

## SECTION 10 — WEEKLY WORKFLOW (Step by step)

Every Sunday after church:

1. Admin opens the app → Manage → Week → increments the week number
2. Admin goes to Manage → New visitors → uploads or types this week's
   first-timer list → clicks "Create & assign list"
3. Admin shares the app link in the WhatsApp group (already done — no action)
4. Team members sign in, go to "My list", and see their assigned contacts
5. Over the next few days, each member calls their contacts and marks statuses
6. Admin can monitor progress on the Dashboard at any time
7. Repeat next Sunday

For lapsed members (whenever the pastor asks):
1. Admin goes to Manage → Lapsed members → uploads the lapsed member list
2. Pastors sign in, go to "Lapsed members", and see their assigned contacts
3. Pastors call them, update statuses, and leave notes

---

## SECTION 11 — TEXT FILE FORMAT GUIDE

Your .txt file for upload should look like this:

```
John Mensah, 0244123456
Abena Asante Boateng, 0277654321
Kweku Amankwah
Pastor Addo, 0200987654
Adjoa Nyarko, 0555111222
```

Rules:
✓ One person per line
✓ Name comes first
✓ Phone (optional) comes after a comma
✓ No headers needed (don't write "Name, Phone" at the top)
✓ Blank lines are ignored automatically
✓ Works with .txt and .csv files

If you have a spreadsheet (Excel/Google Sheets):
1. Use column A for names, column B for phone numbers
2. File → Download as → CSV
3. Upload the .csv file directly

---

## SECTION 12 — TECHNICAL REFERENCE

### Architecture
- Frontend: React (Create React App), hosted on Vercel (free)
- Database: Google Firebase Firestore (real-time, free tier)
- Authentication: PIN-based (stored in Firestore members collection)
- No backend server required

### Firestore collections

| Collection    | Contents |
|---------------|----------|
| members       | Team member names, groups, roles, PINs |
| lists         | New visitor lists with visitor details, statuses, notes, assignments |
| pastor_lists  | Lapsed member lists with same structure |
| config        | Global settings (current week number) |

### Environment variables (Vercel)
All six Firebase config values must be set in Vercel → Settings →
Environment Variables:
  REACT_APP_FIREBASE_API_KEY
  REACT_APP_FIREBASE_AUTH_DOMAIN
  REACT_APP_FIREBASE_PROJECT_ID
  REACT_APP_FIREBASE_STORAGE_BUCKET
  REACT_APP_FIREBASE_MESSAGING_SENDER_ID
  REACT_APP_FIREBASE_APP_ID

### Updating the app
1. Make changes to the code
2. Upload the changed files to GitHub
3. Vercel auto-deploys within ~1 minute
4. No action needed from team members — they just reload the page

### Firestore security rules (current)
The database currently allows open read/write (Firestore rules: allow read,
write: if true). This means anyone who guesses your app URL and a valid
name/PIN combination can access the data. Appropriate for internal church
use where the URL is not publicly shared.

---

## SECTION 13 — TROUBLESHOOTING

**"Name not found" on login**
The name entered doesn't match what the admin stored. Names are
case-insensitive but must match spelling. Ask admin to check the member list.

**"Wrong PIN"**
PIN entered is incorrect. Ask admin to reset it (Manage → Team → delete and
re-add the member with a new PIN).

**Contacts not showing in My list**
- Check the week number is correct (Manage → Week)
- Check that a list was created for this week
- Check that contacts were assigned to you (they may all be assigned to others)
- Ask admin to run "↺ Reassign" on the list

**App not loading**
- Check internet connection
- Try clearing browser cache (Ctrl+Shift+R on desktop)
- Try opening in a different browser

**Changes not showing in real time**
Firestore updates should appear within a second or two. If not, reload the
page. If still not working, check Firebase console for service issues.

---

## SECTION 14 — PRIVACY NOTES

- Visitor names and phone numbers are stored in Google Firebase (a Google
  Cloud service) in the EU or US depending on the region chosen at setup.
- Only people with the app URL and a valid name+PIN can access the data.
- Do not share PINs in the WhatsApp group — share them privately.
- It is good practice to archive or delete old lists once the follow-up
  cycle is complete (Manage → Active lists → Archive).

---

*Church Follow-up Tracker — Built for Opened Heavens Chapel*
