# openkms-cli

Command-line tools for **document parsing** and **pipeline** steps. The openKMS worker runs this as a subprocess.

## Configuration

Set variables in **`.env`** (this package’s `.env`, then the current directory’s `.env`). Names and defaults are defined in **`openkms_cli/settings.py`** — each env var is explicit there. CLI flags override `.env` when you pass them.

Copy **`openkms-cli/.env.example`** and adjust. For auth against the API, match **`OPENKMS_AUTH_MODE`** with the backend (`oidc` vs `local`).

## Install

```bash
cd openkms-cli
pip install -e .                    # CLI only
pip install -e ".[parse]"           # + PaddleOCR-VL parsing (needs mlx-vlm-server)
pip install -e ".[pipeline]"        # + S3 upload/download
pip install -e ".[parse,pipeline,metadata]"   # + metadata extraction
pip install -e ".[kb]"              # + knowledge-base indexing
```

Python **≥ 3.10**.

## Usage

**Parse** (local files → `parsed/{file_hash}/…`):

```bash
openkms-cli parse run document.pdf -o ./parsed
openkms-cli parse run ./inputs/ -o ./parsed
```

**Pipeline** — list names, then run:

```bash
openkms-cli pipeline list
openkms-cli pipeline run --input ./doc.pdf --s3-prefix <prefix>
openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id>
```

**Wiki** — upsert markdown pages and upload assets (requires API auth: OIDC client credentials or local HTTP Basic, same as pipeline metadata sync):

```bash
openkms-cli wiki put --space-id <uuid> --path guides/onboarding --file ./page.md
openkms-cli wiki sync --space-id <uuid> --dir ./my-wiki-root
openkms-cli wiki upload-file --space-id <uuid> --file ./diagram.png
```

Doc-parse pipelines need S3 credentials in `.env` unless you use **`--skip-upload`** with a local **`--input`** file.

**Module entry:**

```bash
python -m openkms_cli parse run /tmp/doc.pdf -o /tmp/out
```

## Backend integration

Pass paths and overrides as CLI args (or rely on `.env`). Example:

```python
subprocess.run(
    ["openkms-cli", "parse", "run", str(input_path), "--output", str(output_dir)],
    check=True,
)
```

## Extending the CLI

Add a Typer subapp under `openkms_cli/` and register it in **`app.py`**.
