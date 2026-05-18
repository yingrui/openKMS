# Evaluation

Datasets of (query, expected answer) pairs, runs against a **linked knowledge base** and, when configured, a **linked wiki space**. Persisted run history supports comparison across runs. **Experimental**: toggle `evaluationDatasets` defaults off; enable in Console → Feature Toggles.

| Feature | Status | Description |
|---------|--------|-------------|
| Evaluation dataset CRUD | ✅ | Create/edit/delete datasets; each linked to one **knowledge base** and optionally one **wiki space**; **Settings** at `/evaluation-datasets/{id}/settings` (name, description, wiki space selector, linked KB read-only, delete dataset) |
| Evaluation items | ✅ | Add/edit/delete items: query + expected answer; optional **topic**; list API paginated (`offset`/`limit`, default limit 10); dataset detail UI: per-page size, prev/next |
| CSV import | ✅ | Import Data uploads CSV: **topic** (optional), **query**, **answer** or **expected_answer** |
| Run evaluation | ✅ | `POST /api/evaluation-datasets/{id}/run` body `{ evaluation_type }`: **`search_retrieval`** (default) — hybrid KB search + LLM judge on snippets; **`qa_answer`** — KB QA agent `/ask` per item + LLM judge; **`wiki_content_coverage`** — judge **expected_answer** against the top wiki pages matched from each item’s **query** (title/path substring, then semantic index). Requires **`wiki_space_id`** on the dataset. For “find this in search”, index wiki content into the linked KB and use **`search_retrieval`**. Persists **`evaluation_runs`** + **`evaluation_run_items`** (JSONB `detail`); response includes `run_id`, aggregates |
| Run history & compare | ✅ | `GET .../runs`, `GET .../runs/{run_id}`, `DELETE .../runs/{run_id}`, `GET .../runs/compare?run_a=&run_b=`; dataset detail: run controls (type + run + refresh); compare two runs (per-item pass/score deltas) |
| Sidebar | ✅ | "Evaluation" link when `evaluationDatasets` toggle enabled |
| Feature toggle | ✅ | `evaluationDatasets` (default: false); Console → Feature Toggles |

## Dataset maintenance

- **Same dataset, multiple lines**: Use one set of items to run **`wiki_content_coverage`** (whether top wiki hits support the expected statements), **`search_retrieval`** (KB retrieval—include wiki-sourced chunks by linking/indexing wiki into the KB), and/or **`qa_answer`** for side-by-side baselines. Re-run after wiki or KB changes and **compare** runs for regressions.
- **Wiki semantic index**: **`wiki_content_coverage`** uses title/path match first, then semantic page match when needed—rebuild the wiki **semantic index** in that space’s settings after bulk page edits so candidate pages stay accurate.
