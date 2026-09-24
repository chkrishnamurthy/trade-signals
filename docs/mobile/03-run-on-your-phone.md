# Run the EquityWise app from your Mac — complete guide

This guide assumes the machine this repo lives on: an **Apple-silicon Mac (arm64),
macOS 15**, Node 24 and pnpm already installed, Docker Desktop installed,
**no Homebrew, no Android Studio**. It gets the Android app running with live
reload, first on your **Galaxy S24 Ultra** and optionally on an **emulator on the Mac**.

Work through Parts 1–6 once. After that, day-to-day work is **Part 7** (about two
minutes to start).

```
 Your Mac                                                   Your phone (USB)
 ┌──────────────────────────────────────────────┐          ┌──────────────────┐
 │ Docker: Postgres (local)  ◄── web API :3000  │◄─ adb ──►│ EquityWise (Dev) │
 │                               Metro   :8081  │  reverse │ app              │
 └──────────────────────────────────────────────┘          └──────────────────┘
```

The **web API** is the website's server code (`pnpm dev:web:local`). The **Metro**
bundler serves the app's JavaScript (`pnpm dev:mobile`). The phone reaches both
over the USB cable through `adb reverse`, so there are no IP addresses and no Wi-Fi setup.

> **Why not just Expo Go?** The app uses native modules (secure storage, Google
> sign-in, biometrics) that Expo Go doesn't include. You install your own
> **development build** once (Part 5). After that it behaves like Expo Go: save a
> file and the phone reloads.

---

## Part 1 — One-time Mac setup (~15 min)

### 1.1 Homebrew (the Mac package manager)

Homebrew isn't installed on this Mac yet. Open **Terminal** and run the official
installer from <https://brew.sh>:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It asks for your Mac password and may install the Xcode command-line tools. When it
finishes it prints two **"Next steps"** lines — run them. They add
`/opt/homebrew/bin` to your shell. Close and reopen Terminal, then check:

```bash
brew --version
```

### 1.2 Android platform tools (`adb`)

```bash
brew install --cask android-platform-tools
```

```bash
adb version
```

That's all the Android tooling needed on the Mac: builds happen in Expo's cloud.

### 1.3 Repo dependencies

From the repo root (`~/Documents/signal`), on the `feat/mobile-app` branch:

```bash
git switch feat/mobile-app
```

```bash
pnpm install
```

### 1.4 Docker Desktop

Docker Desktop is already installed. Open it from Applications and wait until the whale
icon in the menu bar stops animating. It must be running whenever you use the local
database.

---

## Part 2 — Choose where the app gets its data

| | **A. Local database (start here)** | **B. Production, through the SSH tunnel** |
| --- | --- | --- |
| Command | `pnpm dev:web:local` | tunnel + `pnpm dev:web` |
| Safe before merging the branch? | **Yes** — touches nothing live | **No** — needs migration 0026 on the VPS first |
| Accounts | Fresh test accounts you create | Your real account |
| Prices, indices, charts | **Not available** (no market data locally; screens show "unavailable") | Live |
| Use it for | Sign-in, 2FA, Google, watchlists, account screens, layout | Checking real data after the branch is deployed |

**Option A** runs a separate Postgres + TimescaleDB in Docker (port 5434, data kept
between runs), applies all migrations to it, and starts the web API on
`localhost:3000`. Your `.env` still supplies the auth secrets and the Google client
ID; only the database is swapped. If `.env` has no `AUTH_MFA_ENCRYPTION_KEY`, the
script provides a **dev-only** key so 2FA works locally.

**Option B**: don't use it until the branch has been merged and deployed. The
branch's server code writes the new `client` / `device_name` columns, and they
don't exist in production until migration 0026 runs on the VPS. Also never run
plain `pnpm dev` against production (it starts the worker). See
`docs/operations/deployment.md` §8.

---

## Part 3 — Prepare the phone (once)

On the **Galaxy S24 Ultra**:

1. **Settings → About phone → Software information** → tap **Build number** 7 times
   (enter your PIN) until *Developer mode has been turned on*.
2. **Settings → Developer options** → turn on **USB debugging**.
3. Connect the phone to the Mac with a **USB-C data cable**. On the phone tap
   **Allow** on *Allow USB debugging?* and tick *Always allow from this computer*.
4. On the Mac:

```bash
adb devices
```

   You should see one line ending in `device`. `unauthorized` means you need to unlock the
   phone and accept the prompt. An empty list means you need a different cable (some
   are charge-only).

Note your **Android version** (Software information) and add it to
`01-discovery.md` S4.

---

## Part 4 — Expo account and project link (once)

1. Create a free account at <https://expo.dev/signup>.
2. Sign in from the repo:

```bash
npx eas-cli@latest login
```

3. Link the app to a new Expo project:

```bash
cd apps/mobile && npx eas-cli@latest init
```

   It prints a **project ID** and says it can't write to `app.config.ts`. Open
   `apps/mobile/app.config.ts` and replace the two `process.env` lookups:
   - `owner: process.env.EXPO_OWNER,` → `owner: 'your-expo-username',`
   - `eas: { projectId: process.env.EAS_PROJECT_ID },` → `eas: { projectId: 'the-id-it-printed' },`

   Commit that change. The project ID isn't a secret.

---

## Part 5 — Build and install the development app (once; again only when native code changes)

From `apps/mobile`:

```bash
npx eas-cli@latest build --profile development --platform android
```

- First time: answer **Yes** to *Generate a new Android Keystore?*. EAS stores it
  for you. **Never** delete it: Google sign-in and Play updates depend on it.
- The build runs in Expo's cloud (~10–20 min, free tier). You can close the terminal.
  Progress is also at <https://expo.dev> → your project → Builds.

When it finishes you get a link and a QR code. On the phone:

1. Open the link (or scan the QR with the camera) → **Install**.
2. Android asks to allow installing apps from your browser → allow it for this one
   install → **Install** again.
3. The app appears as **EquityWise (Dev)** (package `io.equitywise.app.dev`). It can sit
   beside the real store app later.

Rebuild only when `app.config.ts`, `eas.json` or the list of native libraries
changes. Ordinary code changes never need a rebuild.

---

## Part 6 — Google sign-in on the dev app (once)

Google only hands sign-in tokens to apps it knows by **package name + signing-key
fingerprint (SHA-1)**. Until you do this, *Continue with Google* shows an error, and
everything else still works.

1. Get the development keystore's SHA-1 (from `apps/mobile`):

```bash
npx eas-cli@latest credentials -p android
```

   Pick **development** → **Keystore** → copy **SHA1 Fingerprint**.
2. Go to <https://console.cloud.google.com> and open the **same project** that holds
   the website's OAuth client, then **APIs & Services → Credentials → Create
   credentials → OAuth client ID → Android**. Enter package name
   `io.equitywise.app.dev` and paste the SHA-1 → **Create**.
3. Nothing goes into `.env`: Android clients have no secret. The server already
   checks tokens against the web client ID it has.

Do the same later for `io.equitywise.app` with the **production** keystore SHA-1, and
again with Play's **App signing key** SHA-1 after the first Play upload
(`07-play-store.md` Step 3). Without Play's SHA-1, Google sign-in fails for everyone
who installs from Play.

---

## Part 7 — Daily loop (every time you work on the app)

Open **Docker Desktop** first. Then use two Terminal windows at the repo root.

**Terminal 1 — the web API (local database):**

```bash
pnpm dev:web:local
```

Wait for `✓ Ready`. The first start builds the shared packages and applies
migrations (~1 min).

**Terminal 2 — connect the phone and start Metro:**

```bash
adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081
```

```bash
pnpm dev:mobile
```

Now open **EquityWise (Dev)** on the phone. It connects to Metro and loads the app.

- **Save any file** under `apps/mobile/src` and the phone updates in about a second.
- **Developer menu:** shake the phone, or run `adb shell input keyevent 82`. From
  there: *Reload*, *Toggle performance monitor*, *Open JS debugger*.
- **After unplugging** the cable, run the `adb reverse` line again.
- **Changed a shared package** (`packages/api-client`, `api-contracts`,
  `design-tokens`, `shared`)? Stop Terminal 2 and run `pnpm dev:mobile` again. It
  rebuilds them first.

**First sign-in on the local database:** there are no accounts yet. Tap **New here?
Create an account**, use any email (it doesn't need to be real, but verification
mail goes through Resend if your `.env` has a key), accept the terms popup, and
you're in. To try the Admin tab, promote your test account in the local database:

```bash
docker exec -it $(docker ps -qf publish=5434) psql -U equitywise -d nse_signals_dev -c "update auth_users set role='admin' where email='YOUR-TEST-EMAIL';"
```

Then sign out and in again.

**Stopping:** `Ctrl+C` in both terminals. The database container keeps running. To stop it:

```bash
pnpm dev:db:down
```

Your local accounts and watchlists are kept. To wipe them, add `-v` by hand:
`docker compose --env-file /dev/null -f docker-compose.dev.yml down -v`.

### No cable? Use Wi-Fi instead

Put the Mac and phone on the same Wi-Fi. Find the Mac's address (**System Settings
→ Wi-Fi → Details → IP address**, e.g. `192.168.1.12`), then:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
```

Set `EXPO_PUBLIC_API_URL=http://192.168.1.12:3000` in that file, restart
`pnpm dev:mobile`, and in the dev app pick the server Metro shows (or scan the QR
code it prints).

---

## Part 8 — What to check on the phone (first run)

Work down this list. It's also the first-milestone acceptance list.

**Money and time**
- [ ] A price shows as `₹1,245.50`, and large values use lakh/crore grouping
      (`₹1,24,550.00`). (On the local database, open a stock screen after
      switching to Option B later. On Option A, prices show `—`.)
- [ ] Times say `IST` even if you set the phone to another timezone.

**Sign-in**
- [ ] Create an account → the terms popup appears → **I agree** → Markets tab.
- [ ] Sign out → sign in again with the same email and password.
- [ ] Wrong password shows *Invalid email or password*.
- [ ] Account → Signed-in devices lists **Galaxy S24 Ultra · This device**.
- [ ] **2FA:** turn it on for the test account on the local website
      (<http://localhost:3000/profile> in the Mac's browser, same account), then
      sign in on the phone → the code screen appears → the code from your
      authenticator app works; a recovery code works once.
- [ ] **Google** (after Part 6): *Continue with Google* → pick an account → first
      time: terms popup → in.
- [ ] Revoke the phone's session from the website's Profile → Sessions → the phone
      returns to sign-in on its next action.

**Screens**
- [ ] Watchlists: create, open, rename, **Make default**, add stocks from Search,
      remove in Edit mode, delete.
- [ ] Starter lists (e.g. NIFTY 50) create a filled list.
- [ ] Airplane mode → yellow *No internet connection* bar, no crash; retry works
      after turning it off.
- [ ] Account → App lock on → close and reopen the app → fingerprint prompt.

**Every screen size (S18)**
- [ ] Rotate to landscape on each screen.
- [ ] **Settings → Display → Font size and style** → largest → nothing overlaps or is cut
      off.
- [ ] **Settings → Display → Dark mode** on and off.
- [ ] Optional: test a tablet size in the emulator (Part 9).

---

## Part 9 (optional) — Run the app on an emulator on the Mac

Useful for trying tablet and small-phone sizes without owning those devices. It
needs Android Studio (~10 GB). Skip it until you need it.

1. Install Android Studio:

```bash
brew install --cask android-studio
```

2. Open **Android Studio** → finish the setup wizard (Standard install: it downloads
   the SDK and emulator).
3. **More Actions → Virtual Device Manager → Create device**:
   - Phone: **Pixel 9** (or **Medium Tablet** for tablet testing).
   - System image: **API 36, Google Play, arm64-v8a** (the *Google Play* image is
     needed for Google sign-in). → **Finish**, then press ▶ to boot it.
4. With the emulator running, `adb devices` lists `emulator-5554`.
5. Install the same development build from Part 5: download the `.apk` from the
   build page on the Mac and **drag it onto the emulator window**.
6. Run Part 7 as usual. `adb reverse` works for the emulator too (with both the phone
   and the emulator connected, add `-s emulator-5554` to each `adb` command).
7. For Google sign-in in the emulator, sign in to a Google account in the emulator's
   **Settings → Google**.

With Android Studio installed you can also build locally instead of in the cloud
(`cd apps/mobile && npx expo run:android`). It's slower the first time and needs
JDK 17, which Android Studio bundles.

---

## Part 10 — After the branch is merged and deployed (Option B, real data)

Once the PR is merged, the deploy has run migration 0026, and
`https://equitywise.io/api/app-config` returns JSON:

**Terminal 1 — tunnel to the VPS database:**

```bash
ssh -N -L 15432:localhost:5432 krishna@187.127.171.118
```

**Terminal 2 — the web API on production data** (reads, and for your own account,
writes — as the website does):

```bash
pnpm dev:web
```

**Terminal 3** — same as Part 7 (`adb reverse …` then `pnpm dev:mobile`).

Sign in with your real account. Prices, indices and charts are live.

**Builds for other people** (no Mac or cable needed on their side):

```bash
cd apps/mobile && npx eas-cli@latest build --profile preview --platform android
```

It prints an install link for an APK that talks to `https://equitywise.io`. For
the Play Store build and the closed test, see `07-play-store.md`.

---

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| `brew: command not found` | Homebrew's *Next steps* lines weren't run, or Terminal wasn't reopened (Part 1.1). |
| `adb devices` empty | Charge-only cable, or USB debugging is off. Try another cable and re-toggle debugging. |
| `pnpm dev:web:local` fails with *Cannot connect to the Docker daemon* | Open Docker Desktop and wait for it to finish starting. |
| `docker compose` complains about `.env` line 45 | Your `.env` has a `//` comment. The scripts pass `--env-file /dev/null` to avoid it. Change `//` to `#` to fix it for good. |
| Dev app: *Could not connect to development server* | Run both `adb reverse` commands again and check Terminal 2 is running. |
| App: *Could not reach EquityWise* | Terminal 1 not running, or `adb reverse tcp:3000` missing. |
| App: *Request blocked* on sign-in | The server running is older than this branch. Use `pnpm dev:web:local`, or deploy first. |
| App: *The app and server disagree about a response* | App and server come from different versions. Pull the branch and restart both terminals. |
| Google: developer-configuration error | Package name or SHA-1 doesn't match an Android OAuth client (Part 6). |
| Google: *Google sign-in is not available* | `AUTH_GOOGLE_ENABLED`, `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing from `.env`. |
| 2FA: *temporarily unavailable* on Option B | `AUTH_MFA_ENCRYPTION_KEY` is not set in `.env`. |
| Markets / charts show *Could not load* on Option A | Expected: the local database has no market data and no provider token. |
| EAS build failed | Open the build page link. The first red line in the log is the real error. |
| Phone keeps the old UI after a change | Developer menu → **Reload**. If that fails, stop and restart `pnpm dev:mobile`. |
