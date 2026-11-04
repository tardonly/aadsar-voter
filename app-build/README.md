# Voter search app — setup, admin and updates

Online-only app. The voter list stays on the server (encrypted in `voter-search-app/api/_voters.enc`); phones only
receive the cards that match a search. Every search checks that the user's password is still active.

## What is in git
The `.gitignore` lets only `voter-search-app/` and three files from `app-build/` into git. These never go in git:
`app-build/DATA_KEY.txt` (unlocks the voter data), `app-build/voters.json` (plain voter data), PDFs, Excel files.

## One-time Vercel setup
1. **Import the repo** in Vercel: Add New → Project → pick the repo.
   Root Directory: `voter-search-app` · Framework Preset: **Other** · Build Command: empty.
2. **Add a database:** Project → Storage → Create Database → **Upstash for Redis** (free plan) → Connect to the project.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. **Add two environment variables** (Project → Settings → Environment Variables):
   - `DATA_KEY` = the text in `app-build/DATA_KEY.txt`
   - `ADMIN_PASSWORD` = an admin password you choose (long, not shared with anyone)
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.

## Admin
Open the app, log in with the **admin password** → an **एडमिन** button appears (or open `/admin.html`).
- **नया व्यक्ति जोड़ें:** type the person's name → you get their password once → Copy or send by WhatsApp.
- **बंद करें:** that password stops working; the person is logged out on their next search.
- **नया पासवर्ड:** new password for the same person (e.g. they forgot it); the old one stops working.
- **लॉग आउट करें:** ends the person's current session; they can log in again with the same password.
- **Permissions** (tick boxes under each person; they take effect on that person's next search, or within a minute):
  **निशान लगा सकते हैं** (set status marks) · **पूरा वार्ड देख सकते हैं** (choose a ward with no name and see the whole
  ward) · **वार्ड की PDF** (whole-ward slip PDF) · **पर्ची प्रिंट** (the प्रिंट / PDF button on a slip; this only hides the
  button, a screenshot is still possible). New people, and people added before permissions existed, start with only
  पर्ची प्रिंट. Without पूरा वार्ड देख सकते हैं a person can still search by name, father's name, box number or Voter ID.
- Each person shows **आज N खोज** (searches today) and how many slips carry a mark they set. 500 or more searches in a
  day gets a yellow badge: a sign the list is being copied.

**वार्ड अनुसार प्रगति** (top of the admin page): per ward, how many voters there are and how many slips are marked
पूरा / आ रहे / नहीं, with what is left (बाकी) and a coloured bar. It refreshes itself every minute.

**One phone at a time:** each login gets its own session code. If the same password is opened on a second phone,
the first phone is logged out on its next search ("यह पासवर्ड किसी दूसरे फ़ोन पर खोला गया है"). The admin list shows
each person's current phone, IP and login time, and a yellow **एक साथ दो फ़ोन: N बार** count when their password was
opened on another phone while the first was still in use (used in the last 30 minutes): a sign of sharing.
The admin password can be used on several devices.
Changing `ADMIN_PASSWORD` in Vercel (and redeploying) signs out every admin session.

**Status marks:** logged in as admin, or as a person allowed निशान लगा सकते हैं, each slip has three buttons: **पूरा हुआ** (green), **आ रहे हैं** (yellow),
**उपलब्ध नहीं** (red). Tap the lit one again to remove the mark. Everyone sees the coloured bar on that slip, with who set it and when; open
phones pick up new marks within a minute or when the app is opened again. Marks are kept in Redis (`marks`).
The admin page's **पर्चियों के निशान हटाएं** card shows how many slips carry each mark; tap a colour to remove all
marks of that colour, or **सभी निशान हटाएं** to remove every mark (it asks first). The marks removed by the last
clear are kept: **↺ … निशान वापस लाएं** puts them back (marks set after the clear stay too).

## Phones (Android or iPhone)
Open the link, enter the password, keep "इस फ़ोन पर याद रखें" ticked. Optional: add to home screen
(Android ⋮ → Add to Home screen, iPhone Share → Add to Home Screen). Needs internet every time.

**Whole ward:** choose a ward and leave the name boxes empty → every voter of that ward in box order, 10 at a
time (**और दिखाएं** for the next 10). Only for the admin and people allowed पूरा वार्ड देख सकते हैं.
Choosing a ward also shows a filter: सभी / **सिर्फ़ बिना निशान वाले** / पूरा हुआ / आ रहे हैं / उपलब्ध नहीं. Going
through the unmarked list and marking slips doesn't skip anyone on the next page.

**Box number:** type `25` with a ward chosen, or `3/25` for ward 3 box 25 from any ward.
**परिवार:** the button on a slip opens everyone else at the same house number in that ward, as full slips.
**अ+** (top right) makes the slips and search boxes bigger; the phone remembers it.

**Slips:** every slip has a **प्रिंट / PDF** button (top-left) that opens the phone's print screen, where it can be
printed or saved as PDF (an iPhone home-screen app saves the PDF straight away): an A4 page with that one slip in the top-left corner, at the same
size as on a full sheet, with cut lines. Logged in as admin (or allowed वार्ड की PDF), choosing a ward also shows **वार्ड N की सभी पर्चियाँ (PDF)**, which saves
every slip of the ward, 12 per A4 page (not for everyone, so the whole list can't be copied with a shared password).

## Updating the voter data
```
node app-build/encrypt.mjs        # re-encrypts voters.json with the same DATA_KEY
git add -A && git commit -m "Update voter data" && git push
```
If you ever create a new `DATA_KEY.txt`, update the `DATA_KEY` variable in Vercel too. Changing the key makes
all existing user passwords stop working (they are tied to it), so add the people again in admin.

## Testing on this Mac
```
ADMIN_PASSWORD=admin-test node app-build/dev-server.mjs     # then open http://127.0.0.1:8765
```
It imitates Vercel and the database in memory (everything added there is lost when it stops).
