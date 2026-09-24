# Publishing EquityWise on Google Play — step by step

For a **personal** Play developer account (S2), app id `io.equitywise.app` (S3).
Requirements below were checked against Google's help pages on **2026-09-24**.
They change. Re-read the linked page for each step when you actually do it.

**Timeline:** the account and ID check take a few days. Personal accounts must
then run a **closed test with at least 12 testers, each opted in for 14 days in a
row**, before Google allows a public (production) release. So create the account
now: the clock only starts once the closed test is live.

---

## Step 1 — Create the developer account (do this first)

Source: <https://support.google.com/googleplay/android-developer/answer/6112435>

1. Pick the Google account that will own the app for good. A dedicated one
   (e.g. `equitywise.dev@gmail.com`) is better than your personal Gmail.
2. Go to <https://play.google.com/console/signup> → choose **Yourself** (personal).
3. Pay the **US$25 one-time fee** by card.
4. **Identity verification:** Google may ask for a government ID (Aadhaar/PAN/
   passport) and a card in your **legal name**. Names must match exactly.
5. **Device verification:** new personal accounts must prove they have an Android
   device. Install the **Play Console** app on the S24 Ultra, sign in with the same
   account, and follow the prompt.
6. Contact details: your developer name and an email address are **shown publicly**
   on the store listing. Use a support address you're happy to publish
   (e.g. `support@equitywise.io`).

Verification can take a few days. You can prepare Steps 2–4 while you wait.

## Step 2 — Create the app in Play Console

1. **Home → Create app.**
2. App name **EquityWise**, default language **English (India)**, **App** (not
   game), **Free**.
3. Accept the declarations (Developer Program Policies, US export laws).

The package name gets fixed with the first upload: `io.equitywise.app`, set in
`apps/mobile/app.config.ts`. **It can never change after that.**

## Step 3 — Build and upload the first release

1. Build the Play bundle (see `03-run-on-your-phone.md` Part G):

```bash
cd apps/mobile && npx eas-cli@latest build --profile production --platform android
```

2. Download the `.aab` from the build page.
3. Play Console → **Test and release → Testing → Internal testing → Create new
   release**. Accept **Play App Signing** (Google holds the final signing key; EAS
   keeps your upload key). Upload the `.aab` and add release notes.
4. **Target API level:** since **31 Aug 2026**, new apps and updates must target
   **Android 16 (API 36)**. Expo SDK 57 already does. If Play Console flags it,
   upgrade Expo — don't hand-edit native files.
   (<https://support.google.com/googleplay/android-developer/answer/11926878>)
5. **Straight after this first upload:** copy the **App signing key certificate
   SHA-1** from **Test and release → App integrity** and add it as an Android OAuth
   client in Google Cloud (`03-run-on-your-phone.md` Part F, step 2). Otherwise
   Google sign-in breaks for everyone who installs from Play.

## Step 4 — Fill in "App content" (Policy → App content)

Every item must be complete before any track goes live.

| Item | What to answer for EquityWise |
| --- | --- |
| **Privacy policy** | `https://equitywise.io/privacy` |
| **App access** | Sign-in is required: create a **reviewer test account** (email + password, 2FA **off**) and put its details here. |
| **Ads** | No ads. |
| **Content rating** | Fill the questionnaire honestly: no violence, no gambling, no user-generated content. The category is utility/reference. |
| **Target audience** | 18+ only. Financial information, not for children. |
| **Data safety** | Collected: **email address**, **name** (account), **user IDs**; **app activity** (watchlists you create). Purpose: app functionality and account management. Not shared with third parties. Not sold. Encrypted in transit (HTTPS). Users can request deletion: **yes**. |
| **Account deletion** | In-app: **Account → Delete account**. Web link: `https://equitywise.io/profile` (signed-in deletion) — Google requires a web resource too. (<https://support.google.com/googleplay/android-developer/answer/13327111>) |
| **Financial features** | Declare that the app provides **market information / stock research** only. Answer **no** to trading, brokerage, loans, crypto exchange, payments. EquityWise never places or manages orders. |
| **Government app / News app** | No / No. |

> **Legal check before a public launch** (see `monetization-data-strategy` in the
> project memory): redistributing market data needs a proper data licence, and
> publishing buy/sell *recommendations* to the public needs SEBI Research Analyst
> registration. v1.0 hides signals (S8) and shows data + technical indicators only.
> Confirm with your data provider's terms before production.

## Step 5 — Store listing (Grow → Store presence → Main store listing)

- **Short description** (≤ 80 chars): *Track NSE stocks, watchlists and technical setups. Not a broker.*
- **Full description**: what it does (watchlists, live NSE prices, charts,
  technical snapshot), what it doesn't (no trading, no advice), and the disclaimer.
- **App icon** 512×512 PNG; **feature graphic** 1024×500.
- **Phone screenshots**: at least 2 (take them on the S24 Ultra: power + volume down).
  Include Markets, a watchlist, and a stock screen.
- **Tablet screenshots**: recommended, since the app supports tablets (S18).
- Category **Finance**; contact email and website `https://equitywise.io`.

## Step 6 — Closed test: 12 testers × 14 days (personal accounts only)

Source: <https://support.google.com/googleplay/android-developer/answer/14151465>

1. **Test and release → Testing → Closed testing → Create track** (or use
   *Alpha*). Promote the internal release into it.
2. **Testers:** create a Google Group (e.g. `equitywise-testers@googlegroups.com`)
   or an email list. Add **at least 12 real people**, and invite more (15–20) in
   case some drop out.
3. Share the **opt-in link** from the track's *Testers* tab. Each tester must
   (a) open the link and tap **Become a tester**, then (b) install from Play.
4. Keep them opted in for **14 consecutive days**. Testers who opt out early
   **don't count**, and the 14 days are per tester.
5. Ask testers to actually use the app (sign in, make a watchlist, open stocks).
   Google's production-access form asks what you learned from the test.
6. Ship at least one update during the test. It shows the app is maintained.

## Step 7 — Apply for production access

When the dashboard shows the requirement is met: **Dashboard → Apply for
production**. It's a three-part form (about the closed test, the app, and
production readiness). Review usually takes up to about a week.

## Step 8 — Production release

1. **Production → Create new release** → promote the tested build.
2. Use a **staged rollout** (start at 10–20%) and watch for crashes.
3. Keep `config/app.yaml` → `android.latestVersion` in step with the store, so older
   installs see "Update available".

## Every release after that

```bash
cd apps/mobile && npx eas-cli@latest build --profile production --platform android
```

Upload to **Internal testing** → try it on the S24 Ultra → promote to Production.
Version codes are auto-incremented by EAS. Before each release, re-check the
target-API deadline (Google raises it every August).
