# Articles

Markdown-first CMS organised in **article channels** (separate tree from documents — no parsing pipeline). Inline images and arbitrary attachments live in MinIO under `articles/{article_id}/`.

Toggle visibility via Console → Feature Toggles.

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Article channels | ✅ | Tree CRUD **`GET/POST/PUT/DELETE /api/article-channels`** (merge, reorder); no document-style parsing pipeline on channels |
| Articles CRUD | ✅ | **`GET/POST/PATCH/DELETE /api/articles`**; list by `channel_id` includes subtree channels; `GET /api/articles/stats`; hybrid markdown: DB column + **`articles/{id}/content.md`** in MinIO when storage is enabled |
| Bulk import | ✅ | **`POST /api/articles/import`** (multipart): JSON `payload` field + zero-or-more `images` and `attachments` files; supports `image_urls` for remote fetches, `upsert=true` to match existing by `origin_article_id`, and `rewrite_links=true` (default) to rewrite bare-filename markdown references to stored relative paths in one request |
| Article relationships | ✅ | **`GET/POST/DELETE /api/articles/{id}/relationships`** (same relation types as documents: `supersedes`, `amends`, `implements`, `see_also`); `article_relationships` table |
| Lifecycle | ✅ | **`PATCH /api/articles/{id}/lifecycle`** — `series_id`, `effective_from` / `effective_to`, `lifecycle_status`; API exposes **`is_current_for_rag`** (same rules as documents); `series_id` remains internal/RAG grouping, not primary UX |
| Source / origin | ✅ | **`origin_article_id`** on `articles` — arbitrary external **ID or URI** (UI label "Source"); **`last_synced_at`** for sync workflows |
| Files & images | ✅ | **`GET /api/articles/{id}/files/{path}`** — allowlisted paths (`images/`, `attachments/`, root `content.md`, `origin.html`); presigned redirect |
| Inline images | ✅ | **`POST /api/articles/{id}/images`** — uploads under `articles/{id}/images/<uuid>-<name>` and returns markdown-friendly relative path; SPA editor supports clipboard paste, drag-drop, and a toolbar **Image** button (auto-inserts `![alt](images/…)`) |
| Attachments | ✅ | **`GET/POST/DELETE /api/articles/{id}/attachments`** — registry + objects under `articles/{id}/attachments/`; SPA editor exposes **Add file**, **Insert link**, and **Remove**, plus drag-drop of non-image files |
| Versions | ✅ | **`POST/GET /api/articles/{id}/versions`** and **`POST .../versions/{vid}/restore`** (snapshots of markdown + metadata) |
| Knowledge Map | ✅ | **`article_channel`** resource links validated against **`article_channels`** |
| Group scopes | ✅ | **`access_group_article_channels`**; Console group scopes include **Article channels** |
| Permissions | ✅ | Catalog keys **`articles:read`** / **`articles:write`** (strict route/API patterns when enforced) |
| SPA | ✅ | **`ArticleChannelsContext`** + sidebar tree; hub **`/articles`**; **`/articles/channels`** manage tree; **`/articles/channels/:id`** list (**New article** modal: title required, optional source ID/URL + body); **`/articles/channels/:id/settings`**; **`ArticleDetail`** **Article information** card holds title + source **Edit** + Save/Cancel (**`PATCH /api/articles/:id`**), channel/lifecycle/applicable/updated, collapsible **Relationships** (outgoing/incoming + add edge), and collapsible **Attachments** (count badge, **Add file**, **Insert link**, **Remove**); markdown editor below has **Image** / **Attachment** toolbar buttons + paste/drag-drop upload + Save (**`PUT …/markdown`**); **Delete article** at the bottom of the info card; legacy **`/articles?channel=`** → channel route |

## Bulk import API

`POST /api/articles/import` is a multipart endpoint that does a single round-trip create-or-upsert of an article with all of its assets.

| Field | Type | Notes |
|---|---|---|
| `payload` | string (JSON `ArticleImportPayload`) | required: `channel_id`, `name`; optional: `markdown`, `metadata`, `lifecycle_status`, `effective_from`, `effective_to`, `origin_article_id`, `series_id`, `last_synced_at`, `image_urls`, `upsert` (default `false`), `rewrite_links` (default `true`) |
| `images` | file × N | stored under `articles/{id}/images/<unique>-<safe-name>` |
| `attachments` | file × N | stored under `articles/{id}/attachments/<safe-name>` and registered as `ArticleAttachment` rows |

When `rewrite_links=true`, markdown references whose basename matches an uploaded file (e.g. `![logo](logo.png)`) are rewritten to the stored relative path (`![logo](images/<unique>-logo.png)`). Absolute URLs and anchors are left untouched.

When `upsert=true` and `payload.origin_article_id` matches an existing row, that article is updated in place (no duplicate). Any newly uploaded files are still registered.

`$API` is your backend base URL (e.g. `http://localhost:8102`); for `$TOKEN` see [Obtaining an API token](../security.md#obtaining-an-api-token).

```bash
curl -X POST "$API/api/articles/import" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'payload={"channel_id":"ch_news","name":"Q1 Recap","markdown":"# Q1\n\n![chart](chart.png)\n\n[Full report](report.pdf)","origin_article_id":"https://example.com/q1","upsert":true};type=application/json' \
  -F 'images=@./chart.png' \
  -F 'attachments=@./report.pdf'
```

Response: `{ "article": ArticleResponse, "created": true|false, "images": [...], "attachments": [...] }`.
