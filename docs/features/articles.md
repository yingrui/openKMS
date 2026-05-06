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

## Article detail: scroll model

Design goal: the **main column** scrolls like a normal page; the article **information** block does not use its own scroll cage; **Markdown read** and **Markdown edit (no preview)** do **not** use an inner scrollbar on the markdown card (content grows with the page); **Markdown edit with preview** uses **two** vertical scrollbars **inside** the markdown card — one on the **editor** column and one on the **preview** — so source and rendered content can move independently after you scroll the page to position the card.

| Region | Scroll owner | When |
|--------|----------------|------|
| Main column | `app-content` (`overflow-y: auto`) | Always — primary page scroll. |
| Article information, relationships, attachments | Same as page | Always — no `max-height` + inner `overflow: auto` on those sections. |
| Markdown — read | Main column only | Not editing — article overrides `DocumentDetail` so the markdown **panel** is not `max-height`-capped with a scrolling body; long content extends the page (`frontend/src/pages/ArticleDetail.css`). |
| Markdown — edit, preview off | Main column only | Editing, preview hidden — markdown body `overflow-y: visible` so the draft grows with the page (textarea uses `field-sizing: content` where supported). |
| Markdown — edit, preview on | **Two:** editor column (`overflow-y: auto`) **and** `.article-detail-markdown-preview-scroll` (`overflow-y: auto`) | Editing with split preview — **two** scrollbars (markdown source vs preview); the markdown **body** uses `overflow: hidden` so scroll is not duplicated on a third surface. Scroll the **page** first to move the tall markdown **panel** into the viewport, then use each column’s scrollbar to move within long source or long preview. |

**Editing card height:** While editing, the markdown **panel** has a **minimum height** (`article-detail-markdown-panel--editing`). Without preview that floor is moderate (`min(72vh, 780px)`). **With preview**, the panel gets a **fixed height** tied to the viewport (`--article-markdown-split-panel-height`, same formula as before) so the inner flex/grid chain has a definite height — that makes **two** `overflow-y: auto` regions (textarea + preview scroll) actually overflow and show scrollbars when content is longer than the panes.

**Browsers:** Edit without preview uses `field-sizing: content` on the textarea so the draft height follows the text while the **page** scrolls; very old engines without it may fall back to textarea-internal scrolling for long drafts.

**Implementation notes:** Split vs non-split is keyed in CSS with `:has(.article-detail-markdown-edit-layout--split)` on the markdown body. Split layout uses `grid-template-rows: minmax(0, 1fr)` plus the fixed-height panel so grid rows do not grow unbounded with content. Resizable editor/preview columns use `ArticleDetail.tsx` + `ArticleDetail.css` (splitter + `fr` grid).

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
