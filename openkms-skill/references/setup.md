# Setup — install, config, project vs standalone

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load when configuring auth or choosing how to invoke the CLI.

## Dependencies (`requirements.txt`)

- **Installed into an openKMS project** (Agents → Skills → install): the platform runs `pip install -r requirements.txt` **once** when the skill is copied into `.openkms/skills/openkms/`. **Do not run `pip install` again** on each CLI call. If `python …/scripts/cli.py` fails with `ModuleNotFoundError`, ask the user to **reinstall or update** the skill in project settings — do not patch deps by hand.
- **Standalone copy** (OpenCode, Claude Code, Pi, manual `install.sh`, or dev checkout): run `pip install -r requirements.txt` **once** after copying the skill tree, then use the CLI as usual. Still **not** before every command.
- **Smoke check** — `python …/scripts/cli.py ping` verifies auth and that imports work; that is enough. No separate install step per session.

## openKMS project agents (workspace under `{project_id}/`)

When this skill is installed at `.openkms/skills/openkms/` inside a project workspace:

- Shell **cwd is the project root**. Run one command — **no `cd`**, **no `pip install`**:
  `python .openkms/skills/openkms/scripts/cli.py wiki-spaces list`
- `OPENKMS_API_KEY`, `OPENKMS_API_BASE_URL`, and `OPENKMS_SKILL_ROOT` are injected by the agent runtime; `config.yml` is optional.
- Example: `python .openkms/skills/openkms/scripts/cli.py ping`

## Config (`config.yml`)

The runtime reads `config.yml` in the skill directory (next to `SKILL.md`). It must include:

- `api_base_url` — backend origin only, e.g. `http://127.0.0.1:8102` (no trailing slash).
- `api_key` — personal key from **Settings → API keys** in openKMS (`okms.{uuid}.{secret}`).
- Optional: `default_document_channel_id` / `default_article_channel_id` — when set, `documents list|upload` and `articles list|create|from-url` may omit `--channel-id`.
- Optional: `default_pipeline_id` — e.g. `pipeline_baidu_doc_parse`; used by `document-channels create` unless `--pipeline-id` is passed.

**If either required value is missing** — In a **project agent** session, env vars are usually already set; you do not need `config.yml`. Otherwise ask the user for the backend URL and a new key from **Settings** (shown once). Then **write or update** `config.yml` in this skill directory. Never echo the key back in full unless the user explicitly asks.

The CLI sends `Authorization: Bearer <api_key>` (same permissions as the key owner).

## Invoke

The CLI locates `config.yml` and its imports via `__file__`, so **cwd does not matter** — only the path to `cli.py` must be correct:

```bash
python <skill_dir>/scripts/cli.py ping
```

`<skill_dir>` is the install location: `.openkms/skills/openkms` for an openKMS project agent (cwd = project root), `~/.pi/agent/skills/openkms` (Pi), `~/.claude/skills/openkms` (Claude Code), `~/.config/opencode/skills/openkms` (OpenCode), or a dev checkout. First-time dev/manual checkout needs `pip install -r requirements.txt` once.

## Install (OpenCode / Claude Code / Pi)

From the monorepo `openkms-skill/` tree:

```bash
./install.sh                      # auto: whichever runtimes are present
./install.sh --target opencode    # → ~/.config/opencode/skills/openkms/
./install.sh --target claude-code # → ~/.claude/skills/openkms/
./install.sh --target pi          # → ~/.pi/agent/skills/openkms/
./install.sh --target all         # OpenCode + Claude Code + Pi
./install.sh --dest /custom/path
```

`auto` installs into each of `~/.config/opencode`, `~/.claude`, and `~/.pi` when that directory exists; if none exist, it does nothing (use an explicit `--target` or `--dest`). Existing **`config.yml`** at the destination is **preserved**. Re-run after pulling repo changes.
