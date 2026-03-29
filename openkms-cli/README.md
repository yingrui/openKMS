# openkms-cli

CLI tools for openKMS document parsing and pipeline operations. Designed for backend integration—the openKMS backend can invoke these commands for async document parsing.

## Configuration

Environment variables are mapped explicitly in `openkms_cli/settings.py` (`CliSettings`): each variable name is listed as a `validation_alias` on the field (no hidden prefix). Values load from `openkms-cli/.env` first, then the current working directory `.env` (later wins). CLI flags override env when you pass them.

## Installation

```bash
# Base (typer, rich only - no parsing)
pip install -e .

# With document parsing (PaddleOCR-VL, requires mlx-vlm-server)
pip install -e ".[parse]"

# With pipeline (S3 download/upload)
pip install -e ".[pipeline]"

# Full (parse + pipeline)
pip install -e ".[parse,pipeline,metadata]"

# With PageIndex (markdown structure tree; built-in md_to_tree, no extra deps)
pip install -e ".[pipeline]"
```

## Commands

### `parse run`

Parse document(s) using PaddleOCR-VL (mlx-vlm-server).

```bash
# Single file
openkms-cli parse run document.pdf --output ./parsed

# Directory (batch)
openkms-cli parse run ./inputs/ --output ./parsed

# With config
openkms-cli parse run doc.pdf -c config.json
```

**Options:**

| Option | When omitted, from env | Notes |
|--------|------------------------|-------|
| `--output`, `-o` | - | Default: `<input_dir>/parsed` |
| `--vlm-url` | `OPENKMS_VLM_URL` | Default in settings: `http://localhost:8101/` |
| `--model` | `OPENKMS_VLM_MODEL` | Default: `PaddlePaddle/PaddleOCR-VL-1.5` |
| `--max-concurrency` | `OPENKMS_VLM_MAX_CONCURRENCY` | Default: `3` |
| `--config`, `-c` | - | JSON overrides for `vlm_url`, `model`, `max_concurrency` after env resolution |

**Output structure** (compatible with openKMS backend):

```
parsed/
  {file_hash}/
    original.{ext}
    result.json
    markdown.md
    layout_det_*_input_img_0.png
    block_*.png
    markdown_out/*.md, imgs/*.jpg
```

### `pipeline list`

List supported pipelines that can be run with `pipeline run`:

```bash
openkms-cli pipeline list
```

### `pipeline run`

Run a pipeline. Supported pipelines: `paddleocr-doc-parse` (document parsing), `kb-index` (knowledge base indexing).

**Document parse** (download from S3 → parse → upload to S3):

```bash
# From S3
openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input s3://openkms/da46.../original.pdf --s3-prefix da46...

# From local file (skips download)
openkms-cli pipeline run --pipeline-name paddleocr-doc-parse --input ./document.pdf --s3-prefix da46...
```

**KB index** (chunk documents, generate embeddings, index FAQs):

```bash
openkms-cli pipeline run --pipeline-name kb-index --knowledge-base-id <id> --api-url http://localhost:8102
# Requires: pip install -e ".[kb]" and backend API + PostgreSQL
```

**Pipeline run options:**

| Option | When omitted, from env | Notes |
|--------|------------------------|-------|
| `--pipeline-name` | - | Default: `paddleocr-doc-parse` |
| `--input` | - | Required for doc-parse: S3 URI or local path |
| `--knowledge-base-id` | - | Required for `kb-index` |
| `--s3-prefix` | - | Optional; with S3 input, default prefix is file hash |
| `--vlm-url` | `OPENKMS_VLM_URL` | |
| `--vlm-api-key` | `OPENKMS_VLM_API_KEY` | Optional |
| `--bucket` | `AWS_BUCKET_NAME` | Default: `openkms` |
| `--endpoint-url` | `AWS_ENDPOINT_URL` | MinIO / custom S3 endpoint |
| `--region` | `AWS_REGION` | Default: `us-east-1` |
| - | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Required for S3 input and upload (unless `--skip-upload` with local input) |
| `--api-url` | `OPENKMS_API_URL` | Default: `http://localhost:8102` |
| `--embedding-model-base-url` | `OPENKMS_EMBEDDING_MODEL_BASE_URL` | `kb-index` embedding override |
| `--embedding-model-name` | `OPENKMS_EMBEDDING_MODEL_NAME` | With base URL above; API key: `OPENKMS_EMBEDDING_MODEL_API_KEY` |
| `--extraction-model-base-url` / `--extraction-model-name` | - | With base URL only: `OPENKMS_EXTRACTION_MODEL_API_KEY` (alias `EXTRACTION_MODEL_API_KEY`) |
| `--output-dir`, `-o` | - | `./output` (local temp) |
| `--skip-upload` | - | Parse only, no S3 upload |

## Backend Integration

The openKMS backend can spawn this CLI for async document parsing:

```python
# Example: subprocess call
subprocess.run([
    "openkms-cli", "parse", "run",
    str(input_path),
    "--output", str(output_dir),
    "--vlm-url", vlm_url,
], check=True)
```

Or via `python -m`:

```bash
python -m openkms_cli parse run /tmp/doc.pdf -o /tmp/out
```

## Adding New Commands

Developers can extend the CLI by adding new Typer subapps in `openkms_cli/` and registering them in `app.py`:

```python
# openkms_cli/app.py
from .my_cli import my_app
app.add_typer(my_app, name="mycommand", help="...")
```

## Requirements

- **Base**: Python ≥3.10, typer≥0.9.0, rich≥13.0, pydantic-settings (env → `CliSettings`)
- **Parse**: PaddleOCR-VL, mlx-vlm-server running at VLM URL
- **Pipeline**: boto3 (S3/MinIO credentials)
