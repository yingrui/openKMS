# Evaluation

Datasets of (query, expected answer) pairs, runs against a knowledge base in two modes (search retrieval or QA answer), and persisted run history with comparison. **Experimental**: toggle `evaluationDatasets` defaults off; enable in Console → Feature Toggles.

| Feature | Status | Description |
|---------|--------|-------------|
| Evaluation dataset CRUD | ✅ | Create/edit/delete datasets; each linked to one knowledge base |
| Evaluation items | ✅ | Add/edit/delete items: query + expected answer pairs; optional topic column; list API paginated (`offset`/`limit`, default limit 10); dataset detail UI: per-page size (10/25/50/100), prev/next, range label |
| CSV import | ✅ | Import Data button uploads CSV (columns: topic, query, answer or expected_answer) |
| Run evaluation | ✅ | `POST /api/evaluation-datasets/{id}/run` body `{ evaluation_type }`: **`search_retrieval`** (default) — hybrid search + LLM judge on snippets; **`qa_answer`** — KB QA agent `/ask` per item + LLM judge on generated answer vs expected; persists **`evaluation_runs`** + **`evaluation_run_items`** (JSONB `detail`); response includes `run_id`, aggregates |
| Run history & compare | ✅ | `GET .../runs`, `GET .../runs/{run_id}`, `DELETE .../runs/{run_id}`, `GET .../runs/compare?run_a=&run_b=`; dataset detail: type selector, history table, load/delete run, compare two runs (per-item pass/score deltas) |
| Sidebar | ✅ | "Evaluation" link when `evaluationDatasets` toggle enabled |
| Feature toggle | ✅ | `evaluationDatasets` (default: false); Console → Feature Toggles |
