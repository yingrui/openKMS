# Documents

Document channels (folder tree), per-channel pipelines and metadata extraction, and the PaddleOCR-VL parsing pipeline driven by **`openkms-cli`**.

## Document channels and CRUD

| Feature | Status | Description |
|---------|--------|-------------|
| Document overview | ✅ | Dashboard at `/documents` with channel count, document count (from API stats), quick actions |
| Channel management | ✅ | Create channels at `/documents/channels` (tree structure); rename, description, move, merge, delete; settings per channel |
| Document channel view | ✅ | Browse documents by channel at `/documents/channels/:channelId`; list from `GET /api/documents?channel_id=` |
| Channel settings | ✅ | Per-channel pipeline, auto-process, metadata extraction (model + schema, supports object_type/list[object_type]), manual labels config at `/documents/channels/:channelId/settings`; tabbed UI (General, Processing, Metadata extraction, Manual Labels) |
| Document upload | ✅ | Upload to channel via modal (choose files, drag-and-drop); POST `/api/documents/upload` with `channel_id`; stores file to S3. Accepted types: PDF, PNG/JPG/JPEG/WEBP, **DOCX**, **PPTX**, **XLSX**. **XLSX**: preview rows + markdown built at upload (`status=completed` or `failed` if unreadable); no VLM pipeline. **DOCX/PPTX** (and other pipeline types): `status=uploaded` until processed |
| Document processing | ✅ | Process button on list/detail → `POST /api/jobs`. **XLSX** jobs run `run_spreadsheet_preview` (no channel pipeline required). Other extensions use the channel’s Paddle pipeline when configured; auto-process enqueues the same for non-XLSX |
| Document status | ✅ | Status badge (uploaded/pending/running/completed/failed) on document list and detail |
| Document detail | ✅ | View parsed Markdown at `/documents/view/:id`; **Document Information**: 3-column stats (Type, Size, Uploaded \| Status, Markdown, File hash \| Version panel with Versions + conditional Save version when working copy changed since last snapshot); **METADATA** section includes **Lineage & lifecycle** below Extract (collapsed by default; expands for series, relationships, lifecycle, dates, and read-only **Applicable**); right panel: Markdown \| Page Index (refresh parses markdown to tree; **Page Index hidden for XLSX**); **XLSX**: left panel **Workbook** with sheet tabs and scrollable grid from `parsing_result`; explicit versions (`document_versions`) not created on routine save; scrollable layout (min-height 720px) |
| Document markdown edit | ✅ | Edit/View toggle, textarea for markdown, Save (`PUT /markdown`; rebuilds page index), Restore from S3 (`POST /restore-markdown`; rebuilds page index); `POST /rebuild-page-index` for manual rebuild from current markdown |
| Document versions | ✅ | User-triggered checkpoints: `POST /documents/{id}/versions` snapshots current markdown and metadata (optional `tag` in API); list, preview, restore (`POST .../versions/{vid}/restore`); optional save-current before restore; Save as version modal (optional tag) |
| Document metadata extraction | ✅ | Single METADATA section on detail page; Extract button uses channel's LLM; configurable schema per channel (key, label, type: text/date/enum/object_type/list[object_type], description); object_type_extraction_max_instances limits instance count for extraction |
| Document info & metadata edit | ✅ | Edit document name and channel (PUT /api/documents/{id}); Edit metadata fields inline (PUT /metadata); Move document to channel via modal |
| Document metadata (unified) | ✅ | All metadata (extracted + manual) in single `metadata` JSONB; manual labels configure in channel settings Manual Labels tab (type: object_type or list[object_type]); object-instance pickers in METADATA section |
| Channel description | ✅ | Channel description shown on channel page; stored in `document_channels.description` |

## Document parsing (PaddleOCR-VL)

- **PaddleOCR-VL** with mlx-vlm-server as VLM backend
- Supports: PDF, PNG, JPG, JPEG, WEBP; **DOCX** and **PPTX** are converted to PDF with **LibreOffice** (`soffice` / `libreoffice`) in the worker/CLI, then parsed like PDF (Docker worker image installs writer + impress)
- Output: Markdown, layout detection, parsing result JSON
- Configurable: server URL, model, max concurrency
- **Channel metadata extraction** during pipeline: if the extraction LLM errors (e.g. HTTP 502), the CLI logs a warning and **still completes** the parse so the document can reach `completed`; use **Extract** on the document page when the model is healthy

## openkms-cli

- **CLI** at `openkms-cli/` built with Typer (≥0.9.0)
- **Tests:** `openkms-cli/tests/` — `pip install -e ".[dev]" && pytest tests/` (VLM defaults merge / fetch wiring with mocks; parser restructure and bbox/layout helpers; no Paddle install required)
- **Configuration**: `openkms_cli/settings.py` (`CliSettings`, pydantic-settings) lists every supported env var via `validation_alias`; parse/pipeline/auth read through `get_cli_settings()`; Typer no longer duplicates env via `envvar=`
- **Parse**: `openkms-cli parse run <input> [--output dir] [--vlm-url ...]`; inputs: PDF, images, **DOCX**, **PPTX** (LibreOffice conversion); VLM URL/model/key can follow **`GET /internal-api/models/document-parse-defaults`** when `OPENKMS_API_URL` is set, needed `OPENKMS_VLM_*` values are missing, and CLI auth succeeds; when **`OPENKMS_VLM_MODEL`** is set in the environment, the CLI sends **`?model_name=...`** so the backend returns that **`vl`**/**`ocr`** row's URL and key, or the default row if there is no match
- **Pipeline**: `openkms-cli pipeline list` (list supported pipelines); `openkms-cli pipeline run --input s3://.../original.<ext>` – S3 or local input (stored key preserves extension); optional --s3-prefix (defaults to file hash), --skip-upload
- **Metadata extraction**: when channel has extraction_model_id and extraction_schema, worker passes `--extract-metadata --extraction-model-name <model_name>`; CLI fetches model config from `GET /api/models/config-by-name`, extracts via pydantic-ai, PUTs to `PUT /api/documents/{id}/metadata`; **LLM failure does not fail the pipeline** after a successful parse
- Uses PaddleOCR-VL for parsing (optional: `pip install openkms-cli[parse]`); pipeline needs `pip install openkms-cli[pipeline]`; extraction needs `pip install openkms-cli[metadata]`; PageIndex tree built-in (md_to_tree uses # headings)
- Output structure matches backend: `{file_hash}/original.{ext}`, `result.json`, `markdown.md`, `page_index.json` (when pageindex installed), `layout_det_*`, `block_*`, `markdown_out/*`
- **Backend integration**: subprocess-invokable for async jobs
- **Extensible**: developers can add new Typer subapps in app.py
