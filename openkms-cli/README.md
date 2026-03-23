# openkms-cli

CLI tools for openKMS document parsing and pipeline operations. Designed for backend integration—the openKMS backend can invoke these commands for async document parsing.

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

# With PageIndex (markdown structure tree; used by pipeline --build-page-index)
pip install -e ".[pipeline,pageindex]"
# Also install PageIndex repo for md_to_tree: pip install -e /path/to/PageIndex
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

| Option | Env var | Default |
|--------|---------|---------|
| `--output`, `-o` | - | `<input_dir>/parsed` |
| `--vlm-url` | `OPENKMS_VLM_URL` | `http://localhost:8101/` |
| `--model` | `OPENKMS_VLM_MODEL` | `PaddlePaddle/PaddleOCR-VL-1.5` |
| `--max-concurrency` | `OPENKMS_VLM_MAX_CONCURRENCY` | `3` |
| `--config`, `-c` | - | - |

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

| Option | Env var | Default |
|--------|---------|---------|
| `--pipeline-name` | - | `paddleocr-doc-parse` |
| `--input` | - | (required for doc-parse) S3 URI or local file path |
| `--knowledge-base-id` | - | (required for kb-index) Knowledge base ID to index |
| `--s3-prefix` | - | (optional) Output prefix; when omitted with S3 input, uses file hash |
| `--vlm-url` | `OPENKMS_VLM_URL` | `http://localhost:8101/` |
| `--bucket` | `AWS_BUCKET_NAME` | `openkms` |
| - | `AWS_ACCESS_KEY_ID` | (env only, e.g. `.env`) |
| - | `AWS_SECRET_ACCESS_KEY` | (env only, e.g. `.env`) |
| `--endpoint-url` | `AWS_ENDPOINT_URL` | - (MinIO) |
| `--output-dir`, `-o` | - | `./output` (local temp before upload) |
| `--skip-upload` | - | Parse only, do not upload to S3 |

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

- **Base**: Python ≥3.10, typer≥0.9.0, rich≥13.0
- **Parse**: PaddleOCR-VL, mlx-vlm-server running at VLM URL
- **Pipeline**: boto3 (S3/MinIO credentials)
