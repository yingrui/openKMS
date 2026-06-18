# Media library

Unified **Media library** for images and videos as first-class research evidence (not attachments on articles). Disabled by default via the **`media`** feature toggle (Console → Feature toggles).

## Concepts

| Artifact | Description |
|----------|-------------|
| **Media channel** | Tree-structured collection (like document/article channels). Settings: metadata schema, default image/video generation models. |
| **Media asset** | One image or video file + title, markdown description, captured time, location, structured metadata. |

Assets use **channel ACL** only (`media_channel` resource type) — same pattern as articles.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/api/media-channels` | Tree list / create |
| PUT/DELETE | `/api/media-channels/{id}` | Update / delete (empty only) |
| GET | `/api/media` | List (`channel_id`, `media_kind`, `search`) |
| POST | `/api/media/upload` | Multipart: `channel_id`, `file`, optional `title`, `description` |
| GET/PATCH/DELETE | `/api/media/{id}` | CRUD |
| GET | `/api/media/{id}/files/{path}` | Presigned redirect (`url_only=true` for JSON) |
| POST | `/api/media/generate` | Queue Zhipu async image/video generation job |

All routes return **404** when the `media` feature toggle is off.

## AI generation

Register provider models with `api_kind`:

- `image-generate` — e.g. Zhipu `glm-image` → `POST .../async/images/generations`
- `video-generate` — e.g. `cogvideox-3` → `POST .../videos/generations`

Worker task `run_media_generation` polls `GET .../async-result/{id}`, downloads the result, stores under `media/{asset_id}/`, and enqueues thumbnail/poster generation.

## Storage

```
media/{asset_id}/original.{ext}
media/{asset_id}/thumb.webp
media/{asset_id}/poster.webp   # video
```

## UI

Routes (when toggle on): `/media`, `/media/channels`, `/media/channels/:id`, `/media/view/:id`.

Permissions: `media:read`, `media:write`.

## Integrations

- **Knowledge Map** — link `resource_type: media_channel`
- **Global search** — `types=media` (respects toggle)
- **Model registry** — test playground submits async generation tasks

## See also

- [Knowledge types — rich media](knowledge-types.md#rich-media-and-3d)
- [Console & authentication — feature toggles](console-and-auth.md)
