# Run the EquityWise app on your phone (Mac, no Android Studio)

A step-by-step guide for a Mac without Android Studio and one Android phone
(Galaxy S24 Ultra). Work through it top to bottom the first time; after that,
the daily loop is just **Part E**.

> **Read Part A first.** The app needs the server changes on this branch
> (bearer sign-in, migration `0026_mobile_sessions`) to be live wherever it
> signs in. Until they are deployed, sign-in from the phone will fail.

---

## Part A — Put the server changes live (once)

The app talks to `https://equitywise.io` (preview/production builds) or to the web
app on your Mac (development build). Your Mac's `.env` points at the **production**
database through the SSH tunnel, so both paths need migration 0026 on the VPS.

1. Open a pull request for the `feat/mobile-app` branch and review it.
2. Before merging, check the VPS deploy script (`/opt/equitywise/scripts/deploy.sh`):
   it runs `pnpm install`, which will now also download the app's React Native
   packages (a few hundred MB, never used on the server). Recommended change on the
   VPS: `pnpm install --frozen-lockfile --filter '!@equitywise/mobile'`.
3. Merge. The deploy pipeline runs `db:migrate` (applies 0026 — additive only) and
   restarts the web app.
4. Check it worked: open `https://equitywise.io/api/app-config` in a browser — you
   should see JSON with `android.minSupportedVersion`, `auth.signupOpen` and
   `termsVersion`.

---

## Part B — Tools on the Mac (once)

```bash
brew install --cask android-platform-tools
```

```bash
adb version
```

Node 24 and pnpm are already installed. You do **not** need Java, Android Studio or
the Android SDK — Expo's cloud service (EAS) builds the app.

Create a free Expo account at <https://expo.dev/signup>, then sign in from the repo:

```bash
npx eas-cli@latest login
```

---

## Part C — Prepare the phone (once)

On the Galaxy S24 Ultra:

1. **Settings → About phone → Software information** → tap **Build number** seven
   times until it says *Developer mode has been turned on*.
2. **Settings → Developer options** → turn on **USB debugging**.
3. Plug the phone into the Mac with a USB-C data cable. On the phone, tap **Allow**
   on *Allow USB debugging?* (tick *Always allow from this computer*).
4. On the Mac:

```bash
adb devices
```

   You should see one line ending in `device`. If it says `unauthorized`, unlock the
   phone and accept the prompt again.

Record the phone's Android version (**Settings → About phone → Software information
→ Android version**) in `01-discovery.md` S4.

---

## Part D — Build the development app (once, and again only when native code changes)

1. Link the project to your Expo account (from `apps/mobile`):

```bash
cd apps/mobile && npx eas-cli@latest init
```

   It prints a **project ID**. Because the config is `app.config.ts`, EAS asks you to
   add it yourself: set `owner` to your Expo username and `extra.eas.projectId` to the
   ID in `app.config.ts` (replace the `process.env.…` values), then commit that change.

2. Start the cloud build of the **development** client:

```bash
npx eas-cli@latest build --profile development --platform android
```

   First time only, answer **Yes** to *Generate a new Android Keystore?* — EAS keeps
   it safe for you. The build takes ~10–20 minutes. When it finishes you get a link
   and a QR code.

3. Open the link on the phone (or scan the QR), download the APK and install it.
   Android asks to allow installs from your browser — allow it for this install.
   The app appears as **EquityWise (Dev)**; it can sit beside the store app later.

You only rebuild this when a native library is added or `app.config.ts` changes.
Everyday code changes do **not** need a rebuild.

---

## Part E — The daily loop

Three terminals, from the repo root:

**Terminal 1** — the SSH tunnel to the VPS database, as you do today for web work.

**Terminal 2** — the web app (the API the phone talks to):

```bash
pnpm dev:web
```

**Terminal 3** — forward the phone's ports to the Mac over USB, then start Metro:

```bash
adb reverse tcp:3000 tcp:3000 && adb reverse tcp:8081 tcp:8081
```

```bash
pnpm dev:mobile
```

Open **EquityWise (Dev)** on the phone. It finds Metro through the USB forward and
loads the app. Every file save reloads the phone in about a second. Shake the phone
(or run `adb shell input keyevent 82`) for the developer menu.

`adb reverse` resets when the cable is unplugged — re-run it after reconnecting.

**No cable?** Put the phone and Mac on the same Wi-Fi, create
`apps/mobile/.env.local` from `.env.example` with
`EXPO_PUBLIC_API_URL=http://<your-mac-ip>:3000`, and pick the server shown in the
dev app's launcher.

### What to check on the first run

- Prices show as `₹1,245.50` and large numbers use lakh/crore grouping
  (`₹1,24,550.00`). If they don't, the app automatically falls back to its
  built-in integer formatter — note it in `01-discovery.md` R1.
- Sign in with email + password → you land on **Markets**.
- On the website, **Profile → Sessions** lists the phone by its device name.
  Revoke it there → the phone returns to sign-in on its next request.
- Airplane mode → the yellow offline bar appears; nothing crashes.
- Rotate the phone to landscape; try **Settings → Display → Font size** at maximum.

---

## Part F — Google sign-in on the phone (once per signing key)

Google only issues sign-in tokens to apps it knows by **package name + signing-key
fingerprint (SHA-1)**. The server side needs nothing new — it checks tokens against
the existing web client ID.

1. Get the SHA-1 of each keystore EAS holds:

```bash
cd apps/mobile && npx eas-cli@latest credentials -p android
```

   Choose the build profile (development / production) → **Keystore** → copy the
   **SHA1 Fingerprint**.

2. In <https://console.cloud.google.com> → the **same project** that holds the
   website's OAuth client → **APIs & Services → Credentials → Create credentials →
   OAuth client ID → Android**:
   - Package name `io.equitywise.app.dev`, SHA-1 of the **development** keystore.
   - Create a second one: package `io.equitywise.app`, SHA-1 of the **production**
     keystore.
   - After the first Play upload (Part G), add a third: package `io.equitywise.app`,
     SHA-1 from **Play Console → Test and release → App integrity → App signing key
     certificate**. Without this one, Google sign-in works in your own builds but
     **fails for everyone who installs from Play** (risk R11).

3. Android clients have no secret. Nothing goes in `.env`. Open the app → **Continue
   with Google** → pick an account.

If Google sign-in shows an error about the developer configuration, the SHA-1 or package
name doesn't match — re-check step 2.

---

## Part G — Builds for testers and for Play

**An installable APK for testers** (talks to production):

```bash
npx eas-cli@latest build --profile preview --platform android
```

Share the link it prints. Testers install it like in Part D.

**The Play Store build** (an `.aab`, version code auto-incremented):

```bash
npx eas-cli@latest build --profile production --platform android
```

Upload it by hand in Play Console the first time (see `07-play-store.md`). Later
uploads can use `npx eas-cli@latest submit -p android` once a Play service account is
set up — **submission is always a separate, explicit step**.

**Forcing old installs to update:** raise `android.minSupportedVersion` in
`config/app.yaml` and deploy the web app; installs below it show *Update required*.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `adb devices` shows nothing | Use a data cable (not charge-only); re-toggle USB debugging. |
| Dev app says it cannot connect to Metro | Re-run both `adb reverse` commands; check Terminal 3 is running. |
| "Could not reach EquityWise" on sign-in | Terminal 2 not running, or `adb reverse tcp:3000` missing. |
| Sign-in returns *Request blocked* | The server is older than this branch — see Part A. |
| Every screen says the app and server disagree | The server is older or newer than the app contract; update whichever is behind. |
| Build fails at EAS | Open the build log link it prints; the first error line is the real one. |
