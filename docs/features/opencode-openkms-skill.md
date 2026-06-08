# OpenCode skill (`openkms-skill`)

The repository ships **[openkms-skill/](https://github.com/yingrui/openKMS/blob/main/openkms-skill/)** — a portable **OpenCode** skill that calls the openKMS HTTP API with a **personal API key** from **Settings → API keys** (user menu **Settings**, `/settings`).

## Install

```bash
cd openkms-skill
./install.sh
pip install -r ~/.config/opencode/skills/openkms/requirements.txt
```

`install.sh` replaces the skill tree under `~/.config/opencode/skills/openkms/` with the repo copy. If **`config.yml`** already exists there, it is **saved and restored** after the copy so your `api_base_url` / `api_key` are not deleted on reinstall.

## Configure

**External agents (OpenCode / Claude Code):** copy `config.yml.example` to `config.yml` and set:

- `api_base_url` — backend origin (e.g. `http://127.0.0.1:8102`)
- `api_key` — full `okms.{uuid}.{secret}` string from **Settings → API keys**

**In-product Agents (project workspace):** upload **openkms** on **Agents → Skills**, then install it under **Project settings → Agent**. The runner injects environment variables per chat session (no `api_key` in `config.yml` on disk):

- `OPENKMS_API_KEY` — session-scoped key for the conversation creator
- `OPENKMS_API_BASE_URL` — backend origin
- `OPENKMS_SKILL_ROOT` — path to `.openkms/skills/openkms/`

`scripts/openkms/config.py` prefers these env vars over `config.yml`.

## Use

See `SKILL.md` inside the skill folder. The CLI entrypoint is:

```bash
python scripts/cli.py ping
```

**Agents:** use **only** `python scripts/cli.py …` from the installed skill (see `SKILL.md`). Do not hand-roll `curl` or other HTTP clients against `/api/…`; extend the skill in-repo if something is missing.

Subcommands cover document/article channels (**`list`**, optional **`list --tree`** for a human outline, **`create`** / **`update`**), document upload, document lifecycle and relationships, articles (including a simple **from-url** helper and **`articles relationships`** list/create/delete), **`evaluations`** (create; **`update`** for metadata/wiki link; **`items` list/add/update/delete** for rows; KB runs plus **`wiki_content_coverage`** when a wiki space is linked), KB FAQs, **`knowledge-map`** (Knowledge Map tree, nodes, resource links), wiki spaces (**linked channel documents** via `wiki-spaces documents …`), wiki pages (**`wiki pages semantic-matches`** for substring/semantic discovery) and **wiki files** (`wiki files list` / `wiki files delete` — the space **file store**: vault imports including **`.md`**, images, and other uploads, not only “attachments”), and wiki page upsert — each maps to existing `/api/...` routes.

**Mutations** require `-y`/`--yes` or `--dry-run` (on a non-TTY, writes without `--yes` exit 2). Optional `default_document_channel_id` / `default_article_channel_id` in `config.yml` let you omit `--channel-id` on `documents` and `articles` list/upload/create/from-url when you always use the same channels.
