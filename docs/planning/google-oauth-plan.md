---
name: Google OAuth Authentication
status: approved
created: 2026-09-20
updated: 2026-09-20
area: [web, db]
summary: Direct Google OAuth 2.0 (OpenID Connect) authentication with PKCE and CSRF protection, retaining first-party users, sessions, and per-user data isolation on self-hosted PostgreSQL.
owner: krishna
---

# Google OAuth 2.0 Authentication — Architecture & Implementation Plan

## 1. Overview

EquityWise uses **direct Google OAuth 2.0 / OpenID Connect (OIDC)** as a fast, frictionless sign-in and registration method.
All user accounts, linked identities, and sessions reside exclusively on EquityWise's self-hosted PostgreSQL database.
There are **no third-party auth platforms** (no Firebase, no Supabase, no Clerk, no Auth0).

### Key Architectural Principles
- **No heavy client SDKs**: Authentication uses standard HTTP redirects and OAuth 2.0 authorization code flow with PKCE (RFC 7636) and cryptographically signed CSRF state.
- **First-party sessions**: Upon successful verification of Google identity and user matching, the existing database-backed, revocable `auth_sessions` system issues an HttpOnly `__Host-session` cookie.
- **Single Source of Truth**: All authorization, user roles (`user` / `admin`), user status (`active` / `disabled`), and per-user data isolation (`owner_id` on watchlists) rely entirely on `auth_users` and `auth_sessions`.
- **Seamless Account Linking**: Because Google accounts possess pre-verified email addresses (`email_verified: true`), signing in with Google automatically links to an existing email/password account matching that email address, providing a frictionless transition for existing users.

---

## 2. Authentication Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Browser User
    participant Web as Next.js Web App
    participant Google as Google OAuth 2.0
    participant DB as Postgres (auth_users, auth_identities, auth_sessions)

    User->>Web: Clicks "Continue with Google" (GET /api/auth/google?next=...)
    Web->>Web: Generate cryptographically random state & PKCE code_verifier / code_challenge
    Web->>User: 302 Redirect to accounts.google.com/o/oauth2/v2/auth with state cookie
    User->>Google: Authenticates and grants basic profile & email access
    Google->>Web: 302 Redirect to /api/auth/google/callback?code=...&state=...
    Web->>Web: Verify state cookie & retrieve code_verifier
    Web->>Google: POST https://oauth2.googleapis.com/token (code, client_id, client_secret, verifier)
    Google-->>Web: Returns id_token & access_token
    Web->>Google: GET https://openidconnect.googleapis.com/v1/userinfo (Bearer access_token)
    Google-->>Web: Returns { sub, email, email_verified, name, picture }
    Web->>DB: Find identity by provider='google' AND provider_subject=sub
    alt Identity exists
        Web->>DB: Check user status (active); touch last_used_at
    else Identity does not exist
        alt User with email exists in auth_users
            Web->>DB: Link identity (provider='google', provider_subject=sub) to existing user
        else New user
            Web->>DB: Transactionally create auth_users, user_profiles, and auth_identities
        end
    end
    Web->>DB: Create session in auth_sessions (authentication_method='google')
    Web->>User: Set __Host-session cookie, clear OAuth state cookie, redirect to target (e.g. /signals)
```

---

## 3. Database Schema

Identity mapping lives in `auth_identities`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY | Primary key |
| `user_id` | integer NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE | Local user |
| `provider_type` | text NOT NULL | `'google'` |
| `provider_subject` | text NOT NULL | Google user ID (`sub` claim) |
| `provider_email` | text | Google email snapshot |
| `provider_email_verified` | boolean DEFAULT true NOT NULL | Verified status |
| `metadata` | jsonb DEFAULT '{}' NOT NULL | Profile metadata (avatar url, name) |
| `created_at` | timestamptz DEFAULT now() NOT NULL | Connected timestamp |
| `updated_at` | timestamptz DEFAULT now() NOT NULL | Last update |
| `last_used_at` | timestamptz | Last sign-in via this identity |

**Constraints & Indexes**:
- UNIQUE index on `("provider_type", "provider_subject")`
- INDEX on `("user_id")`

Session table `auth_sessions`:
- `authentication_method`: text CHECK (`authentication_method in ('password', 'google')`)
- `auth_identity_id`: integer REFERENCES `auth_identities(id) ON DELETE SET NULL`
- `security_version`: integer DEFAULT 0 NOT NULL

---

## 4. Environment Variables & Credentials

Required in `.env`:
```dotenv
# App configuration
AUTH_BASE_URL="https://equitywise.io"
AUTH_TRUSTED_ORIGINS="https://equitywise.io"

# Google OAuth 2.0 (from Google Cloud Console)
GOOGLE_CLIENT_ID="<your-google-client-id>.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="<your-google-client-secret>"
```

### Google Cloud Console Configuration:
- **Authorized JavaScript origins**:
  - Dev: `http://localhost:3000`
  - Prod: `https://equitywise.io`
- **Authorized redirect URIs**:
  - Dev: `http://localhost:3000/api/auth/google/callback`
  - Prod: `https://equitywise.io/api/auth/google/callback`
- **Scopes requested**: `openid`, `email`, `profile`

---

## 5. Security Mitigations

1. **CSRF Protection**: An encrypted/HMAC-signed short-lived HttpOnly cookie (`oauth_state`) binds the request to the client browser. State mismatch immediately aborts the exchange.
2. **PKCE (RFC 7636)**: Uses SHA-256 code challenge and code verifier to prevent authorization code interception and injection attacks.
3. **No External Secrets in Client**: The client browser never receives `GOOGLE_CLIENT_SECRET` or Google access tokens; token exchange happens purely server-to-server.
4. **Account Takeover Prevention**: Account linking by email only occurs when Google reports `email_verified: true`.
5. **No Token Storage**: Google access tokens are used only during the callback to fetch user info and are immediately discarded. EquityWise uses its own server-side revocable session tokens.
