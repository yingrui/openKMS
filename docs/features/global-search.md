# Global search

The app exposes **`/search?q=…`** (main layout) and **`GET /api/search`** for a single metadata search across **documents**, **articles**, **wiki spaces**, and **knowledge bases** (not semantic / chunk search inside a KB).

## Who can use it

- **API:** Strict pattern mode lists `GET /api/search` and `HEAD /api/search` under **`documents:read`**, **`articles:read`**, **`wikis:read`**, and **`knowledge_bases:read`**; the user needs **at least one** of those keys to call the endpoint.
- **SPA:** `/search` is included in the same four keys’ `frontend_route_patterns` so the route gate matches list permissions for those areas.
- **Results:** Each section is scoped like the corresponding list API (document/article predicates, wiki space ids, KB visibility). Types the user cannot read appear as **empty** sections when using `types=all` (or a comma list that includes them). If **none** of the requested types are allowed, the API returns **403**.

## Query parameters (`GET /api/search`)

| Parameter | Description |
|-----------|-------------|
| `q` | Optional substring on **name** (documents, wiki spaces, KBs) or **article title** (`Article.name`), case-insensitive |
| `types` | Default `all`. Comma-separated: `documents`, `articles`, `wiki_spaces`, `knowledge_bases` |
| `document_channel_id` | Optional; subtree filter like `GET /api/documents?channel_id=` |
| `article_channel_id` | Optional; subtree filter like `GET /api/articles?channel_id=` |
| `updated_after`, `updated_before` | Optional ISO 8601; applied to each entity’s **`updated_at`** |
| `limit` | Per-section cap (default 30, max 100) |

## Response

JSON with `query`, `types_requested`, and four objects `{ "items": [...], "total": n }`. Each item includes `id`, `name`, optional `title`, `kind`, SPA `url_path`, optional `channel_id` / `channel_name`, and `updated_at`. Documents are ordered by **`updated_at`** descending on this endpoint.

## Frontend

- **Header** search submits to **`/search`** (Enter); **⌘K** / **Ctrl+K** focuses the field. Keywords live only in the header (no second keyword field on the page).
- **Tabs:** **`tab`** query string (optional): `all` (default), `documents`, `articles`, `wiki_spaces`, `knowledge_bases`. Each tab shows a **result count** from the latest search (All = sum across enabled types). Tabs for disabled features are omitted; an invalid or disabled **`tab`** is removed from the URL.
- **Filters** panel for channels and dates; **Apply filters** updates the URL. The SPA maps **All** to the same enabled-type set as the API’s `types=all`; a single tab sets **`types`** to that resource only.

See [API reference](api-reference.md) for the canonical route table.
