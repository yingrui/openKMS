# openkms-cli

Command-line tools for **document parsing** and **pipeline** steps. The openKMS worker runs this as a subprocess.

## Configuration

Set variables in **`.env`** (this package’s `.env`, then the current directory’s `.env`). Names and defaults are defined in **`openkms_cli/settings.py`** — each env var is explicit there. CLI flags override `.env` when you pass them.

Copy **`openkms-cli/.env.example`** and adjust. For auth against the API, match **`OPENKMS_AUTH_MODE`** with the backend (`oidc` vs `local`).

**Embeddings:** Knowledge base indexing reads the KB’s **embedding model** from the backend (**Models** + KB **`embedding_model_id`**). Optional **`OPENKMS_EMBEDDING_MODEL_*`** in this `.env` override the CLI when you need a different endpoint without changing the KB record.

**VLM (document parse / paddleocr pipeline):** When **`OPENKMS_VLM_URL`**, **`OPENKMS_VLM_MODEL`**, or **`OPENKMS_VLM_API_KEY`** are unset (and no key in settings), the CLI calls **`GET {OPENKMS_API_URL}/internal-api/models/document-parse-defaults`** with the same auth as other CLI API calls (**HTTP Basic** in local mode, **client credentials** in OIDC). If **`OPENKMS_VLM_MODEL`** is set in the environment, the request includes **`?model_name=...`** so the backend returns that **`vl`** / **`ocr`** model’s URL and key when it exists, otherwise the default **`vl`** / **`ocr`** row (same as omitting the query). Merge **`base_url`**, **`model_name`**, and **`api_key`** from the JSON response. Override any value with **`OPENKMS_VLM_*`** in `.env` when needed.

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

## Tests

```bash
cd openkms-cli
pip install -e ".[dev]"
pytest tests/
```

Covers **`backend_defaults`** merge / fetch behavior (mocked HTTP) and **`parser`** restructuring plus small layout helpers (no Paddle install required).

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
