---
name: Profile page
status: done
horizon: none
created: 2026-09-07
updated: 2026-09-07
board: EW-036
area: [web]
blocked_by: [authentication-plan]
confidence: 3
summary: The signed-in user's self-service surface at /profile — built.
owner: krishna
---

# Profile page — design & as-built

Status: **built** · Branch `feat/profile-page` (cut from `main`, auth foundation merged in) · Date: 2026-09-07

> The signed-in user's self-service surface at **`/profile`**: edit who they are,
> manage how they sign in, see their active devices, and delete their account.
> It is the "future profile-edit page" reserved by
> [`authentication-plan.md`](./authentication-plan.md) §6 — and it keeps that doc's
> promise that the profile edit path writes **only `user_profiles`**, never
> `auth_users`.

---

## 1. The core principle — two surfaces, two levels of friction

The auth schema already splits **identity/security** (`auth_users`,
`auth_credentials`, `auth_sessions`, `auth_mfa`) from the **editable profile**
(`user_profiles`). The page mirrors that split into two tabs, because changing a
bio should never share a save button with changing a password.

| Surface (tab) | Backing table(s) | Write path | Friction |
|---|---|---|---|
| **Profile** | `user_profiles` only | `PATCH /api/profile`, `POST/DELETE /api/profile/avatar` | Low — inline, dirty-tracked save bar |
| **Account & Security** | `auth_users`, `auth_credentials`, `auth_sessions` | dedicated `/api/account/*` routes | High — re-auth, confirm dialogs, email verification |

The profile `PATCH` accepts an **allow-list only** (`displayName`, `bio`,
`timezone`, `preferences`); it can never set `email`, `role`, `status`, or
`owner_id`. Those are changed — if at all by the user — through their own
re-authenticated routes.

## 2. What the user can edit

**Profile tab** (`user_profiles`)
- **Display name** — required, ≤ 50 chars.
- **Avatar** — upload / remove; served from disk via `/api/avatars/<file>`.
- **Bio** — ≤ 280 chars, live counter; empty clears it.
- **Timezone** — curated IANA list (default `Asia/Kolkata`).
- **Default watchlist** — stored in `preferences.defaultWatchlistId`.
- **Appearance** — theme stays the existing device-local `ThemeToggle`
  (`localStorage`, `@/lib/theme`); it is deliberately **not** duplicated into
  server preferences, to avoid two sources of truth.

**Account & Security tab**
- **Email verification** — status badge + "Resend verification" when unverified.
- **Change email** — verify-then-swap (see §4). Re-auth with current password.
- **Change password** — re-auth with current password; rotates this device's
  session and signs out all others.
- **Two-factor (TOTP)** — **deferred**, shown as "Coming soon" (see §6).
- **Active sessions** — list every device with "this device" marked; revoke one,
  or "sign out other devices".
- **Delete account** — type-to-confirm + password; blocked for the last admin.

**Read-only** (shown, not editable here): role, verified badge, member-since,
email address. Role/status remain admin-only via `/admin`.

## 3. File map (as built)

```
apps/web/src/app/profile/page.tsx                 server component, requireUser gate + data load
apps/web/src/app/account/verify-email/page.tsx    gated landing for the email-change link
apps/web/src/components/profile/
  profile-tabs.tsx        header + Profile / Account & Security tabs, live header state
  avatar-uploader.tsx     upload / remove, immediate
  profile-form.tsx        name, bio, timezone, default watchlist + dirty save bar
  security-tab.tsx        composes the account cards
  change-password.tsx · change-email.tsx · email-verification.tsx
  sessions-list.tsx · danger-zone.tsx · two-factor.tsx (placeholder)
  verify-email-client.tsx · request.ts (fetch helper)
apps/web/src/app/api/profile/route.ts             PATCH  (profile only)
apps/web/src/app/api/profile/avatar/route.ts      POST / DELETE avatar
apps/web/src/app/api/avatars/[file]/route.ts      GET    serve avatar bytes
apps/web/src/app/api/account/password/route.ts    POST
apps/web/src/app/api/account/email/route.ts       POST   (request change)
apps/web/src/app/api/account/email/confirm/route.ts POST (finish change)
apps/web/src/app/api/account/sessions/route.ts    GET / DELETE
apps/web/src/app/api/account/verify/route.ts      POST   (resend verification)
apps/web/src/app/api/account/route.ts             DELETE (delete account)
apps/web/src/server/profile/
  schemas.ts · avatar.ts · email-change-token.ts · current-session.ts
packages/db/src/repositories/profile.ts           updateProfile, updateUserEmail, session revokes, …
apps/web/src/components/ui/textarea.tsx           new UI primitive (kit had none)
```

Routing note: account/profile mutations live under `/api/profile/*` and
`/api/account/*` — **not** `/api/auth/*`, which the middleware treats as public.
These sit behind the gate and additionally call `getSessionUser()`. Every
state-changing route runs `isSameOrigin()` (CSRF) and is Zod-validated, per the
`api-boundary` rule.

## 4. Notable design decisions

- **Email change = stateless signed token.** Verification/reset tokens are
  one-shot rows in `auth_tokens`, but an email change must also carry the *target
  address* through the click. Rather than add a column + migration (which would
  collide with auth's `0013`/`0014` on rebase), the target rides in an
  HMAC-signed, 30-minute token (same construction as the session-cookie MAC,
  keyed to a distinct purpose). The confirm route additionally requires an
  authenticated session for the **same** user id, so a leaked link alone does
  nothing. See `server/profile/email-change-token.ts`.
- **Change-password keeps you signed in here, out everywhere else.** Bumping
  `password_changed_at` invalidates *all* sessions (including the current one), so
  the route drops every session and immediately mints a fresh one for the acting
  device.
- **Avatars are dependency-free.** Type is decided by **magic bytes** (not the
  client content-type/filename), size-capped at 2 MB, stored under a random name,
  and served through a path-confined route so it also works in local dev without
  Nginx. Configurable dir via `AVATAR_UPLOAD_DIR`; `/uploads/` is gitignored.
- **Sole-admin guard.** An admin can't delete the last admin account — the
  product can never be left with no operator.

## 5. Security checklist (met)

- Re-authentication (current password) on change-email, change-password, delete.
- Email change is verify-then-swap, never swap-then-verify.
- Avatar: magic-byte validation, size cap, EXIF **not** yet stripped (see §6),
  random filenames, path-traversal-safe reads.
- `PATCH /api/profile` allow-lists profile fields; identity/security columns
  unreachable from it.
- Audit rows on `password_changed`, `email_change_requested`, `email_changed`,
  `session_revoked`, `sessions_revoked_others`, `verification_resent`,
  `account_deleted`.
- Origin-checked CSRF on all mutations; resend-verification is soft-throttled.

## 6. Deliberately deferred (with reasons)

1. **TOTP two-factor.** Real 2FA needs an encrypted seed store (`auth_mfa`),
   recovery codes, and **changes to the sign-in flow** to actually enforce a code
   — plus a migration. Shipping an on/off toggle that didn't gate sign-in would
   be a false sense of security, so the card is a labelled "Coming soon"
   placeholder. Do this once the auth work lands on `main`, alongside the sign-in
   route.
2. **Server-side avatar re-encode.** Normalising to a 256×256 WebP and stripping
   EXIF/GPS metadata needs an image library (`sharp`, a native dep). Skipped in
   this pass to avoid adding a native dependency; until it lands, treat avatars as
   public. Wiring point: `server/profile/avatar.ts` (`saveAvatar`).

## 7. Branch & rebase notes

`feat/profile-page` was cut from `main` and then `feat/auth-system` was merged in
to provide the auth foundation (schema, `requireUser`, sessions, email). When the
auth work lands on `main`, this branch rebases cleanly — the profile work only
**adds** files plus small, additive edits to `api-routes.ts`, `repositories/`
`index.ts`, `email.ts`, and `user-menu.tsx`. No new migration was introduced.
