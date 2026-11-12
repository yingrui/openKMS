# Authentication and sessions

Canonical implementation: `backend/app/api/auth.py`, `backend/app/api/auth_oidc.py`,
`backend/app/services/identity/auth_session.py`, `backend/app/models/auth_session.py`, and
`frontend/src/contexts/`.

This page describes the **current** implementation. The original rollout plan is no longer a second
supported mode: there is one browser authentication path and one machine/API credential path.

## Two entry points, not two browser modes

| Caller | Credential | Backend path |
|---|---|---|
| Browser | opaque `openkms_session` cookie | `auth_sessions` row → decrypted access token |
| CLI / API client / internal service | `Authorization: Bearer` (OIDC JWT, local JWT, or `okms.*` API key) | stateless verification |
| Local CLI | `Authorization: Basic` (optional) | minted `local-cli` JWT |

The browser never receives an access or refresh token. JWT remains for machines and automation; it is not a
second browser session implementation.

`authenticate_request()` checks credentials in this order:

1. `Authorization: Bearer` → OIDC JWKS or local HS256 verification
2. `okms.*` personal API key
3. local-mode HTTP Basic (CLI)
4. `openkms_session` → `auth_sessions`
5. otherwise `401 AUTHENTICATION_REQUIRED`

`session_only=True` (used by the Chamber proxy) skips the `Authorization` header, because that header belongs
to the hosted app, not to openKMS.

## Server-side browser session

`auth_sessions` stores:

| Column | Meaning |
|---|---|
| `id` | random opaque session id; this is what the signed cookie carries |
| `user_sub`, `idp_sub` | identity |
| `auth_mode` | `oidc` or `local` |
| `access_token_enc` | encrypted access token |
| `refresh_token_enc` | encrypted OIDC refresh token (null in local mode) |
| `access_expires_at` | access-token expiry |
| `idle_expires_at` | sliding inactivity deadline |
| `absolute_expires_at` | hard session deadline |
| `rotated_from`, `replaced_by` | session replacement chain |
| `revoked_at`, `created_at`, `last_seen_at` | lifecycle |

Tokens are encrypted with the existing credential-encryption key (`OPENKMS_DATASOURCE_ENCRYPTION_KEY`, or a
key derived from `OPENKMS_SECRET_KEY`). The cookie is signed by `OPENKMS_SECRET_KEY` and contains only the
opaque id. Changing either key invalidates existing sessions and forces re-login.

### Timeouts

- **Idle:** `OPENKMS_SESSION_IDLE_MINUTES` (default 30). Activity extends it, but the write is throttled to at
  most once per minute.
- **Absolute:** `OPENKMS_SESSION_ABSOLUTE_HOURS` (default 12). Refresh never extends it; reaching it requires
  re-authentication.
- The cookie's `max_age` is 7 days, but the database deadlines are authoritative. A still-present cookie is not
  a still-valid session.

### Refresh and rotation

- Automatic refresh happens when an authenticated request sees `access_expires_at` within 60 seconds.
- `POST /api/auth/refresh` explicitly refreshes, rotates the access token, creates a successor session id,
  revokes the old row, and records `replaced_by` / `rotated_from`.
- The old session id remains usable for 15 seconds after rotation so concurrent in-flight requests do not get
  logged out.
- Refresh takes a row lock; a request that waited behind another refresh re-checks the new expiry instead of
  refreshing again.
- OIDC refresh uses the encrypted refresh token at the IdP `token_endpoint`. Local refresh re-mints a short
  HS256 JWT (`OPENKMS_LOCAL_SESSION_JWT_MINUTES`, default 30).
- Expired/revoked rows older than 30 days are pruned opportunistically when a session is created.

## OIDC flow

Browser:

```text
GET /api/auth/oidc/login?returnTo=...
  -> IdP authorization endpoint (PKCE S256, state, prompt=login)
  -> GET /login/oauth2/code/oidc?code=...&state=...
  -> backend code exchange
  -> auth_sessions + openkms_session cookie
  -> 302 to frontend returnTo
```

Rules:

- `returnTo` must be a same-origin relative path; absolute URLs, `//host`, and backslash variants are rejected.
- The backend uses a confidential client (`OPENKMS_OIDC_CLIENT_ID` / `OPENKMS_OIDC_CLIENT_SECRET`).
- `offline_access` is **not** requested by default. Set `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=true` only when
  the IdP client and user are allowed to use offline tokens. Keycloak otherwise rejects code exchange with
  `CODE_TO_TOKEN_ERROR not_allowed`.
- Without `offline_access`, normal authorization-code refresh tokens are still used while the IdP session
  allows refresh.
- The callback path must exactly match `OPENKMS_OIDC_REDIRECT_URI` and the IdP client's Valid Redirect URI.

Logout:

- `POST /api/auth/logout` revokes the session and clears the cookie.
- `GET /api/auth/oidc/logout` revokes, then performs RP-initiated logout when the IdP exposes
  `end_session_endpoint`.
- `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` defaults to `openkms-backend`; the client needs
  `OPENKMS_FRONTEND_URL` as its post-logout redirect URI.

## Local flow

```text
POST /api/auth/login
  -> verify password
  -> create auth_sessions (short local JWT)
  -> openkms_session cookie
  -> frontend GET /api/auth/me
```

- Registration (`POST /api/auth/register`) does the same when `OPENKMS_ALLOW_SIGNUP=true`.
- `OPENKMS_LOCAL_JWT_EXP_HOURS` remains for non-browser local credentials (for example personal API keys);
  browser sessions use `OPENKMS_LOCAL_SESSION_JWT_MINUTES`.

## Keycloak: minimal client

Use one confidential client for the browser BFF:

| Setting | Value |
|---|---|
| Client ID | `openkms-backend` |
| Client authentication | on |
| Client secret | matches `OPENKMS_OIDC_CLIENT_SECRET` |
| Standard flow | on |
| Implicit flow | off |
| Direct access grants | off |
| Service accounts | off |
| Valid redirect URI | `${OPENKMS_OIDC_REDIRECT_URI}` (e.g. `http://localhost:8102/login/oauth2/code/oidc`) |
| Valid post logout redirect URI | `OPENKMS_FRONTEND_URL` |
| PKCE | S256 (sent by the backend) |
| `offline_access` | optional; only if `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS=true` |

The old public `openkms-frontend` client is no longer used by the SPA; delete it once no other client depends on it.

`openkms-cli` needs its own confidential client with service accounts enabled and no redirect URI.
`qa-agent` and the worker use their own client credentials as configured.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENKMS_AUTH_MODE` | `oidc` | `oidc` or `local` |
| `OPENKMS_SESSION_IDLE_MINUTES` | `30` | sliding idle timeout |
| `OPENKMS_SESSION_ABSOLUTE_HOURS` | `12` | hard session cap |
| `OPENKMS_LOCAL_SESSION_JWT_MINUTES` | `30` | local browser access JWT |
| `OPENKMS_SESSION_COOKIE_SECURE` | `false` | set `Secure` on the cookie; enable behind HTTPS |
| `OPENKMS_OIDC_REDIRECT_URI` | `http://localhost:8102/login/oauth2/code/oidc` | exact backend callback |
| `OPENKMS_OIDC_REQUEST_OFFLINE_ACCESS` | `false` | request the optional offline scope |
| `OPENKMS_OIDC_POST_LOGOUT_CLIENT_ID` | `openkms-backend` | client id sent to `end_session_endpoint` |
| `OPENKMS_FRONTEND_URL` | `http://localhost:5173` | frontend return and post-logout origin |

Full list: [Configuration](configuration.md).

## Security properties and intentional limits

Implemented:

- opaque cookie; no access/refresh token in browser storage or URLs
- encrypted tokens at rest
- `HttpOnly`, `SameSite=Lax`, optional `Secure`
- Origin/Referer check on cookie-auth mutations (`/api/auth/refresh`, `/api/auth/logout`)
- same-origin-only `returnTo`
- PKCE S256 + `state` + `prompt=login`
- idle + absolute deadlines; refresh cannot extend absolute
- session id rotation on explicit refresh with a short grace window
- login/account switch revokes the previous session
- logout/`auth/refresh` revocation and audit events
- opportunistic cleanup of old rows

Deliberate boundaries:

- The cookie name is `openkms_session`, not `__Host-openkms_session`; a future migration can adopt the prefix.
- Refresh-token reuse detection is delegated to the IdP; openKMS never accepts a client-supplied refresh token.
  IdP rotation/reuse policy is therefore the authority.
- There is no OIDC `nonce` validation because the backend consumes the access token, not the ID token. PKCE and
  `state` cover the browser callback.
- Login/refresh rate limiting is not implemented in this module; put it at the ingress or add a dedicated
  limiter before exposing the backend publicly.
- CSRF uses Origin/Referer rather than a double-submit token; keep `SameSite=Lax` and do not add cross-site
  cookie-auth POSTs.
- Revoking a session does not revoke an already-issued Bearer JWT; Bearer credentials expire by their own
  `exp` (or API-key revocation).

## Removed legacy paths

The following were removed when the single BFF path was adopted:

- `OPENKMS_AUTH_SESSION_V2` and `public-config.session_v2`
- `/sync-session`
- `/clear-session`
- `/login/oauth2/code/keycloak`
- SPA `oidc-client-ts`, `/auth/callback`, `/auth/silent-renew`
- legacy `access_token` cookie fallback

Existing legacy cookies are invalid after this change; users sign in once again.
