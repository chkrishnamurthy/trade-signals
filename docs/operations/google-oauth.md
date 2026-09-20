# Google OAuth 2.0 Operations Guide

EquityWise uses direct Google OAuth 2.0 (OpenID Connect) for authentication.
This document outlines how to configure Google Cloud Console credentials for local development and production.

---

## 1. Google Cloud Console Setup

### Step 1: Create or Select a Google Cloud Project
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project (e.g., `equitywise-auth` or `equitywise-prod`).

### Step 2: Configure the OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**.
2. Select **User Type**: **External**.
3. Fill in:
   - **App name**: `EquityWise`
   - **User support email**: `support@equitywise.io` (or your admin email)
   - **Developer contact information**: your contact email
   - **App domain**:
     - Application home page: `https://equitywise.io`
     - Application privacy policy: `https://equitywise.io/privacy`
     - Application terms of service: `https://equitywise.io/terms`
4. In **Scopes**, add:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
5. Save and continue. For production, submit for verification or publish the app when ready.

### Step 3: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `EquityWise Web`.
5. **Authorized JavaScript origins**:
   - For local development: `http://localhost:3000`
   - For production: `https://equitywise.io`
6. **Authorized redirect URIs**:
   - For local development: `http://localhost:3000/api/auth/google/callback`
   - For production: `https://equitywise.io/api/auth/google/callback`
7. Click **Create**. Copy the **Client ID** and **Client Secret**.

---

## 2. Environment Configuration

Add the credentials to your `.env` (or production environment configuration):

```dotenv
AUTH_BASE_URL="https://equitywise.io"
AUTH_TRUSTED_ORIGINS="https://equitywise.io"

GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

For local testing in `.env`:
```dotenv
AUTH_BASE_URL="http://localhost:3000"
AUTH_TRUSTED_ORIGINS="http://localhost:3000"

GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

---

## 3. Verifying the Flow
1. Start the web app: `pnpm dev:web`.
2. Visit `http://localhost:3000/login`.
3. Click **Continue with Google**.
4. Complete Google authentication and verify:
   - You are redirected back to `/api/auth/google/callback`.
   - A session is established (`__Host-session` cookie).
   - Your name and email appear in your Profile.
