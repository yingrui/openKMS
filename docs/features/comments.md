# Comments

User comments and 0–5 ratings on shared content. Distinct from **article LLM reviews** (automated rubric) and **evaluation runs** (benchmark datasets).

## Supported resources

| `resource_type` | Target | Read access |
|-----------------|--------|-------------|
| `article` | Article | Article channel ACL (read) |
| `document` | Document | Document channel ACL (read) |
| `knowledge_base` | Knowledge base | KB resource ACL (read) |
| `wiki_space` | Wiki space | Wiki space resource ACL (read) |
| `project` | Agent project | Project owner (`user_sub`) + Agents feature enabled |

## Behavior

- **Top-level comments** require body text and a **rank** (integer 0–5). Multiple top-level comments per user per resource are allowed.
- **Replies** attach to a top-level comment only (one level of threading). Replies have body text only — no rank.
- **Edit / delete**: author only (`created_by` matches JWT `sub`).
- Deleting a top-level comment cascades to its replies.

## API

See [API reference — Comments](api-reference.md#comments).

## UI

Detail pages expose a **right-side Comments rail** (Feishu-style):

- **Utility rail** (far right): `MessageSquare` toggles comments. Wiki workspace also shows **Copilot**; opening one panel closes the other.
- **Comments panel**: summary (average rank, count), composer with 0–5 stars, scrollable thread with inline replies.

Integrated on: Article detail, Document detail, Knowledge base detail (hidden in Q&A full-page mode), Wiki workspace & wiki space settings, Agent project settings.

**Home** (`GET /api/home/hub`): signed-in users see **`recent_comments`** — up to **5** newest comments on resources they own (Sharing **Owner** row, including inherited channel ACL; fallback `created_by`). Includes the owner’s own comments. Each item includes resource title, body preview, rank (top-level), and reply flag; links open the resource detail page.

## Data model

Table **`content_comments`**: polymorphic `resource_type` + `resource_id`, optional `parent_comment_id`, `body`, `rank` (top-level only), `created_by`, `created_by_name`, timestamps. See [Data models — Comments](data-models.md#contentcomment).
