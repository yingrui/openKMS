# openkms-skill — API reference

Paths below are relative to `api_base_url` from `config.yml`. Send header `Authorization: Bearer <api_key>` on every request.

## config.yml

```yaml
api_base_url: "http://127.0.0.1:8102"
api_key: "okms.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.your-secret"
# optional defaults:
# default_document_channel_id: "..."
# default_article_channel_id: "..."
```

Create keys in the openKMS web app: **Settings** (header user menu → **Settings**, `/settings`) → **API keys** section.

## Endpoints used by `scripts/cli.py`

| Area | Method | Path |
|------|--------|------|
| Ping | GET | `/api/auth/me` |
| Document channels | GET, POST | `/api/document-channels`, `/api/document-channels` |
| Article channels | GET, POST | `/api/article-channels` |
| Upload document | POST multipart | `/api/documents/upload` fields `file`, `channel_id` |
| Create article | POST JSON | `/api/articles` body `channel_id`, `name`, `markdown` |
| Article import (optional) | POST multipart | `/api/articles/import` |
| Evaluation datasets | GET, POST | `/api/evaluation-datasets` |
| KB FAQ | GET, POST | `/api/knowledge-bases/{id}/faqs` |
| Wiki spaces | GET, POST | `/api/wiki-spaces` |
| Wiki page upsert | PUT | `/api/wiki-spaces/{id}/pages/by-path/{path}` |

For authoritative tables and extra routes, see the repository file `docs/features/api-reference.md`.
