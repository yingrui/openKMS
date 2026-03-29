# Security

Security considerations for the openKMS project.

## Authentication

- **`OPENKMS_AUTH_MODE=oidc` (default)**: External OpenID Connect IdP (e.g. Keycloak) – OAuth2 Authorization Code + PKCE in the frontend.
- **`OPENKMS_AUTH_MODE=local`**: Users and bcrypt password hashes in PostgreSQL; backend-issued HS256 JWTs (`OPENKMS_SECRET_KEY`); optional HTTP Basic for `openkms-cli` (`OPENKMS_CLI_BASIC_*`). Use TLS in production; Basic over plain HTTP is only for trusted dev networks.
- **`GET /api/auth/public-config`** (unauthenticated): Returns `auth_mode` and `allow_signup` only—no secrets—so clients pick the correct login flow and match the deployed mode (local authenticator vs central IdP).
- Backend accepts:
  - `Authorization: Bearer <JWT>` for API requests
  - Session cookie (from `POST /sync-session` after browser login)
  - In local mode: `Authorization: Basic` for CLI (validated against env; minted service JWT internally)
- OIDC JWTs validated via IdP JWKS; local JWTs validated with shared secret.
- **Route protection**: All frontend routes except `/` (home), and `/login` / `/signup` in local mode, require authentication.
- **Console**: Restricted to `admin` realm role (OIDC) or `is_admin` user (local).

## Credentials and Secrets

### Do Not Expose in CLI

- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **never** CLI parameters.
- They are read only from environment variables (e.g. via `.env` with python-dotenv).
- Avoid passing secrets on the command line; they may appear in process lists and shell history.

### Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `KEYCLOAK_CLIENT_SECRET` | Backend | OAuth2 confidential client (oidc mode) |
| `OPENKMS_SECRET_KEY` | Backend | Session cookie signing and local JWT signing |
| `OPENKMS_CLI_BASIC_PASSWORD` | Backend + CLI | Local mode CLI Basic secret (protect like a password) |
| `AWS_ACCESS_KEY_ID` | Backend, CLI | S3/MinIO access |
| `AWS_SECRET_ACCESS_KEY` | Backend, CLI | S3/MinIO secret |
| `OPENKMS_DATABASE_PASSWORD` | Backend | PostgreSQL |

Keep `.env` out of version control (use `.env.example` as a template).

## Storage

- **S3/MinIO**: Document files are stored under `{file_hash}/` with presigned URLs for access.
- **PostgreSQL**: Metadata, channels, and user-related data.
- Ensure S3 bucket policies and CORS are configured correctly for your deployment.

## API Security

- All `/api/*` endpoints require authentication.
- Document file URLs are validated: backend checks that the requested path belongs to the document before redirecting to storage.
- VLM server URL is internal; avoid exposing it directly to untrusted clients.

## Production Checklist

1. Use strong `OPENKMS_SECRET_KEY` (e.g. 32+ random bytes).
2. Configure the OIDC IdP with proper redirect URIs for production (no wildcards unless intended). For local mode, set `OPENKMS_ALLOW_SIGNUP=false` if you do not want public registration.
3. Use HTTPS for frontend and backend in production.
4. Restrict database and S3 access to trusted networks where possible.
5. Review IdP realm roles and client scopes (oidc mode).
6. Keep dependencies up to date (`pip install -U`, `npm audit`).

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately rather than opening a public issue.
