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

In the installed directory (or the repo copy), copy `config.yml.example` to `config.yml` and set:

- `api_base_url` — backend origin (e.g. `http://127.0.0.1:8102`)
- `api_key` — full `okms.{uuid}.{secret}` string

## Use

See `SKILL.md` inside the skill folder. The CLI entrypoint is:

```bash
python scripts/cli.py ping
```

Subcommands cover document/article channels, document upload, articles (including a simple **from-url** helper), evaluation datasets, KB FAQs, and wiki page upsert — each maps to existing `/api/...` routes.
