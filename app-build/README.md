# Voter search app — how to deploy and update

## What gets uploaded
Upload **only** the `voter-search-app/` folder. It contains no passwords and no readable voter data:
`data.enc` is the voter list encrypted with a random key, and that key is stored once per password, each copy
locked by its password. Without one of the passwords, the file is useless.

Never upload or commit anything from `app-build/` (`PASSWORDS.txt`, `voters.json`) or the PDFs/Excel files.

## Deploy to Vercel through git (one time)
The `.gitignore` in the main folder only lets the app folder and the build script into git; PDFs, Excel files,
`voters.json` and `PASSWORDS.txt` stay out. Check with `git status` before the first commit.

1. Push the repo to GitHub (a **private** repository is best).
2. In Vercel: Add New → Project → import the repo.
3. Set **Root Directory** to `voter-search-app`, Framework Preset **Other**, leave Build Command empty.
4. Deploy. You get an `https://….vercel.app` link; every later `git push` redeploys it.
`vercel.json` in the folder tells search engines not to index the site.

No environment variables are needed: the app unlocks on the phone, so it also works with no internet.

## Put it on a phone (Android or iPhone)
1. Open the link once with internet on (Chrome on Android, Safari on iPhone).
2. Enter one of the passwords; keep "इस फ़ोन पर याद रखें" ticked.
3. Android: menu ⋮ → "Add to Home screen" / "Install app". iPhone: Share → "Add to Home Screen".
4. From now on it opens from the home-screen icon and works without internet.

## Passwords
`PASSWORDS.txt` has 10 passwords, one per person. To switch one off, delete its line, run the build, redeploy.
To add one, add a line like `11: some-new-pass`. Phones that already unlocked keep working until the data or
password list changes; then they are asked for a (still valid) password again.

## Updating the voter data or the app
```
node app-build/encrypt.mjs        # re-encrypts only if voters.json or PASSWORDS.txt changed
git add -A && git commit -m "Update voter data" && git push
```
Installed phones pick up the new version the next time they open the app with internet.
