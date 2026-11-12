# Authentication configuration

openKMS has one browser authentication path and one machine/API credential path:

- **Browser:** opaque `openkms_session` cookie backed by the server-side `auth_sessions` table. The browser never receives OIDC or local JWTs.
- **CLI / API / internal service:** `Authorization: Bearer` with an OIDC JWT, local JWT, or `okms.*` personal API key. Local CLI may also use HTTP Basic.

There is no second browser mode and no feature flag to switch between implementations.

## Choose the mode

| `OPENKMS_AUTH_MODE` | Use when |
|---|---|
| `oidc` | Users authenticate through an OIDC IdP (Keycloak, Entra ID, Okta, …) |
| `local` | Users are stored in openKMS PostgreSQL and sign in with username/email + password |

The frontend reads `auth_mode` from `GET /api/auth/public-config`. `VITE_AUTH_MODE` is only a fallback when that request fails.

## OIDC configuration

### 1. Create the IdP client

Use one **confidential** client for the browser BFF:

| Setting | Value |
|---|---|
| Client ID | `openkms-backend` |
| Client authentication | on |
| Client secret | matches `OPENKMS_OIDC_CLIENT_SECRET` |
| Standard flow | on |
| Implicit flow | off |
| Direct access grants | off |
| Service accounts | off |
| Valid redirect URI | exact value of `OPENKMS_OIDC_REDIRECT_URI` |
| Valid post-logout redirect URI | exact value of `OPENKMS_FRONTEND_URL` |
| PKCE | S256 (sent by the backend) |
| `offline_access` | optional; only when `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=true` |

The browser redirects to the IdP, but the token exchange happens on the backend. The SPA never holds OIDC tokens.

The old public `openkms-frontend` client is no longer used by the SPA. Delete it when no other application depends on it.

`openkms-cli` needs its own confidential client with service accounts enabled and no redirect URI. `qa-agent` and the worker use their own client credentials.

### 2. Configure the backend

```bash
OPENKMS_AUTH_MODE=oidc

OPENKMS_OIDC_ISSUER=http://localhost:8081/realms/openkms
OPENKMS_OIDC_CLIENT_ID=openkms-backend
OPENKMS_OIDC_CLIENT_SECRET=...
OPENKMS_OIDC_REDIRECT_URI=http://localhost:8102/login/oauth2/code/oidc

OPENKMS_FRONTEND_URL=http://localhost:5173
OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID=openkms-backend
```

The backend discovers the IdP endpoints from `${OPENKMS_OIDC_ISSUER}/.well-known/openid-configuration`.

Important:

- `OPENKMS_OIDC_REDIRECT_URI` and the IdP's Valid Redirect URI must match **character for character**.
- Leave `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=false` unless the IdP client and user are allowed to use offline tokens. Keycloak may reject the code exchange with `CODE_TO_TOKEN_ERROR not_allowed` when that scope is not permitted.
- Normal authorization-code refresh tokens are still used while the IdP session allows refresh.
- Use HTTPS and set `OPENKMS_SESSION_COOKIE_SECURE=true` in production.

### 3. Configure the frontend

No OIDC client ID, secret, or redirect URI belongs in the frontend. Only the fallback mode is optional:

```bash
VITE_AUTH_MODE=oidc
```

## Local configuration

```bash
OPENKMS_AUTH_MODE=local
OPENKMS_ALLOW_SIGNUP=true
OPENKMS_LOCAL_SESSION_JWT_MINUTES=30
OPENKMS_LOCAL_JWT_EXP_HOURS=168
```

- `OPENKMS_ALLOW_SIGNUP` exposes `POST /api/auth/register`; the first registered user becomes admin.
- `OPENKMS_LOCAL_SESSION_JWT_MINUTES` controls the short access JWT used by browser sessions.
- `OPENKMS_LOCAL_JWT_EXP_HOURS` remains for non-browser local credentials, such as personal API keys.
- Disable self-signup after creating the first admin if registration should be closed.

## Session behavior

| Setting | Default | Effect |
|---|---|---|
| `OPENKMS_SESSION_IDLE_MINUTES` | `30` | Sliding inactivity timeout; activity extends it |
| `OPENKMS_SESSION_ABSOLUTE_HOURS` | `12` | Hard session limit; refresh cannot extend it |
| `OPENKMS_SESSION_COOKIE_SECURE` | `false` | Sets `Secure` on the session cookie; enable behind HTTPS |

The browser cookie's `max_age` is seven days, but the database idle/absolute deadlines are authoritative. A cookie that is still present may already represent an expired session.

When the access token is close to expiry, openKMS refreshes it server-side. An explicit `POST /api/auth/refresh` also rotates the session id; the old id remains usable for a short grace window for concurrent requests. Logout revokes the session.

## Logout

- `POST /api/auth/logout` revokes the server-side session and clears the cookie.
- `GET /api/auth/oidc/logout` revokes the session and performs RP-initiated logout when the IdP exposes `end_session_endpoint`.
- `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` must identify a client whose post-logout redirect URI includes `OPENKMS_FRONTEND_URL`.

## Security checklist

- Serve the frontend and backend over HTTPS in production.
- Set `OPENKMS_SESSION_COOKIE_SECURE=true` behind HTTPS.
- Register only exact redirect URIs; do not use wildcards for production.
- Do not enable `offline_access` unless the IdP explicitly allows it.
- Keep `OPENKMS_SECRET_KEY` and `OPENKMS_DATASOURCE_ENCRYPTION_KEY` stable and secret. Changing either invalidates existing sessions.
- Revoking a session does not revoke an already-issued Bearer JWT; Bearer credentials expire by their own `exp`, or by API-key revocation.
- Put login/refresh rate limiting at the ingress or a dedicated gateway before exposing the backend publicly.

## Common errors

| Symptom | Check |
|---|---|
| `Invalid parameter: redirect_uri` | `OPENKMS_OIDC_REDIRECT_URI` exactly matches the IdP client's Valid Redirect URI |
| `CODE_TO_TOKEN_ERROR not_allowed` | Stop requesting `offline_access`, or allow it for the client and user |
| Logout uses an old client id | The running backend still has an exported `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID`; unset it and restart so `.env` is read |
| Login succeeds but logout returns an IdP redirect error | The client's post-logout redirect URI must exactly match `OPENKMS_FRONTEND_URL` |

Full environment list: [Configuration](configuration.md).
