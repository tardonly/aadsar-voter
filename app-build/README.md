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

**One phone at a time:** each login gets its own session code. If the same password is opened on a second phone,
the first phone is logged out on its next search ("यह पासवर्ड किसी दूसरे फ़ोन पर खोला गया है"). The admin list shows
each person's current phone, IP and login time, and a yellow **एक साथ दो फ़ोन: N बार** count when their password was
opened on another phone while the first was still in use (used in the last 30 minutes): a sign of sharing.
The admin password can be used on several devices.
Changing `ADMIN_PASSWORD` in Vercel (and redeploying) signs out every admin session.

**Status marks:** logged in as admin, each slip has three buttons: **पूरा हुआ** (green), **आ रहे हैं** (yellow),
**उपलब्ध नहीं** (red). Tap the lit one again to remove the mark. Everyone sees the coloured bar on that slip; open
phones pick up new marks within a minute or when the app is opened again. Marks are kept in Redis (`marks`).

## Phones (Android or iPhone)
Open the link, enter the password, keep "इस फ़ोन पर याद रखें" ticked. Optional: add to home screen
(Android ⋮ → Add to Home screen, iPhone Share → Add to Home Screen). Needs internet every time.

**Whole ward:** choose a ward and leave the name boxes empty → every voter of that ward in box order, 10 at a
time (**और दिखाएं** for the next 10).

**Slips:** every slip has **प्रिंट** and **PDF**: an A4 page with that one slip in the top-left corner, at the same
size as on a full sheet, with cut lines. After choosing a ward, **वार्ड N की सभी पर्चियाँ (PDF)** saves every slip of
the ward, 12 per A4 page. Each person can download at most 25 ward PDFs a day; the admin list shows a blue
**वार्ड PDF: N** count per person (the admin has no limit).

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
