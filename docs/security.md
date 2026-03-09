# Security

Security considerations for the openKMS project.

## Authentication

- **Keycloak** handles authentication via OAuth2 (Authorization Code + PKCE in the frontend).
- Backend accepts either:
  - `Authorization: Bearer <JWT>` for API requests
  - Session cookie (from `POST /sync-session` after frontend login)
- JWT is validated via Keycloak JWKS.
- **Route protection**: All frontend routes except `/` (home) require authentication.
- **Console**: Restricted to users with realm role `admin`; others are redirected.

## Credentials and Secrets

### Do Not Expose in CLI

- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are **never** CLI parameters.
- They are read only from environment variables (e.g. via `.env` with python-dotenv).
- Avoid passing secrets on the command line; they may appear in process lists and shell history.

### Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `KEYCLOAK_CLIENT_SECRET` | Backend | OAuth2 confidential client |
| `OPENKMS_SECRET_KEY` | Backend | Session cookie signing |
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
2. Configure Keycloak with proper redirect URIs for production (no wildcards unless intended).
3. Use HTTPS for frontend and backend in production.
4. Restrict database and S3 access to trusted networks where possible.
5. Review Keycloak realm roles and client scopes.
6. Keep dependencies up to date (`pip install -U`, `npm audit`).

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately rather than opening a public issue.
