"""API-facing ``sources`` for KB Q&A: Page Index sections, ontology graph, or RAG chunks."""
from __future__ import annotations

import json
import re
from typing import Any

import logging

from langchain_core.messages import AIMessage, ToolMessage
from pydantic import ValidationError

from .evidence_ledger import EvidenceLedger
from .schemas import SourceItem

logger = logging.getLogger(__name__)

PAGE_SECTION_TOOL_NAME = "read_document_section"
ONTOLOGY_SCHEMA_TOOL_NAME = "get_ontology_schema"
RUN_CYPHER_TOOL_NAME = "run_cypher"
QUERY_SEMANTIC_MODEL_TOOL_NAME = "query_semantic_model"
SQL_SEMANTIC_MODEL_TOOL_NAME = "run_sql"
_CATALOG_QUERY_TOOL_NAMES = frozenset(
    {QUERY_SEMANTIC_MODEL_TOOL_NAME, SQL_SEMANTIC_MODEL_TOOL_NAME}
)

_MAX_SECTION_SOURCE_CHARS = 12_000
_MAX_ONTOLOGY_BODY_CHARS = 8_000

# Common Cypher keywords after ":" that are not labels / rel types
_CYPHER_COLON_STOPWORDS = frozenset(
    x.lower()
    for x in (
        "WHERE",
        "MATCH",
        "OPTIONAL",
        "RETURN",
        "WITH",
        "AS",
        "AND",
        "OR",
        "NOT",
        "IN",
        "IS",
        "NULL",
        "DISTINCT",
        "ORDER",
        "BY",
        "LIMIT",
        "SKIP",
        "ASC",
        "DESC",
        "CASE",
        "WHEN",
        "THEN",
        "ELSE",
        "END",
        "TRUE",
        "FALSE",
        "CONTAINS",
        "STARTS",
        "ENDS",
        "EXISTS",
        "ALL",
        "ANY",
        "NONE",
        "SINGLE",
    )
)


def _coerce_tool_output(out: Any) -> str:
    if out is None:
        return ""
    if isinstance(out, str):
        return out
    content = getattr(out, "content", None)
    if isinstance(content, str):
        return content
    return str(out)


def source_from_page_section_tool(inp: Any, out: Any) -> SourceItem | None:
    """Build a citation row from a read_document_section call (input + raw output)."""
    if not isinstance(inp, dict):
        return None
    doc_raw = inp.get("document_id")
    if doc_raw is None or doc_raw == "":
        return None
    doc_id = str(doc_raw)
    try:
        sl = int(inp.get("start_line", 0))
        el = int(inp.get("end_line", 0))
    except (TypeError, ValueError):
        return None
    if sl < 1 or el < 1 or sl > el:
        return None
    text = _coerce_tool_output(out).strip()
    if not text or text.startswith("Error:") or text.startswith("Error "):
        return None
    if len(text) > _MAX_SECTION_SOURCE_CHARS:
        text = text[: _MAX_SECTION_SOURCE_CHARS - 3] + "..."
    sid = f"page-section:{doc_id}:{sl}:{el}"
    return SourceItem(
        id=sid,
        source_type="document_section",
        content=text,
        score=1.0,
        source_name=f"Document lines {sl}–{el}",
        document_id=doc_id,
        wiki_page_id=None,
        wiki_space_id=None,
    )


def _tool_call_meta_by_id(messages: list[Any]) -> dict[str, tuple[str, dict[str, Any]]]:
    out: dict[str, tuple[str, dict[str, Any]]] = {}
    for m in messages:
        if not isinstance(m, AIMessage) or not m.tool_calls:
            continue
        for tc in m.tool_calls:
            if isinstance(tc, dict):
                tid = tc.get("id")
                name = str(tc.get("name") or "")
                args = tc.get("args")
            else:
                tid = getattr(tc, "id", None)
                name = str(getattr(tc, "name", None) or "")
                args = getattr(tc, "args", None)
            if not tid:
                continue
            if not isinstance(args, dict):
                args = {}
            out[str(tid)] = (name, args)
    return out


def sources_from_page_index_tools(messages: list[Any]) -> list[SourceItem]:
    """Ordered, de-duplicated section sources from successful read_document_section results."""
    meta = _tool_call_meta_by_id(messages)
    found: list[SourceItem] = []
    seen_ids: set[str] = set()
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        tid = str(m.tool_call_id or "")
        name = ""
        args: dict[str, Any] = {}
        if tid and tid in meta:
            name, args = meta[tid]
        else:
            name = str(m.name or "")
        if name.split("/")[-1] != PAGE_SECTION_TOOL_NAME:
            continue
        src = source_from_page_section_tool(args, m.content)
        if src is None or src.id in seen_ids:
            continue
        seen_ids.add(src.id)
        found.append(src)
    return found


def _parse_schema_object_names(text: str) -> list[str]:
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    ots = data.get("object_types")
    if not isinstance(ots, list):
        return []
    names: list[str] = []
    seen: set[str] = set()
    for o in ots:
        if not isinstance(o, dict):
            continue
        n = o.get("name")
        if not n:
            continue
        s = str(n).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        names.append(s)
    return names


def _parse_cypher_result(text: str) -> dict[str, Any] | None:
    if not text or text.startswith("Error:") or text.startswith("Error "):
        return None
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    if "columns" not in data or "rows" not in data:
        return None
    if not isinstance(data.get("columns"), list) or not isinstance(data.get("rows"), list):
        return None
    return data


def tokens_after_colon_in_cypher(cypher: str) -> list[str]:
    """Heuristic tokens (labels / rel types) after ':' in Cypher, excluding common keywords."""
    if not cypher:
        return []
    found: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r":(\w+)", cypher):
        tok = m.group(1)
        if tok.lower() in _CYPHER_COLON_STOPWORDS:
            continue
        if tok not in seen:
            seen.add(tok)
            found.append(tok)
    return found


def build_ontology_display_sources(
    *,
    schema_object_names: list[str],
    cypher_runs: list[tuple[str, dict[str, Any]]],
) -> list[SourceItem]:
    """One row listing ontology object types + one row per successful graph query."""
    out: list[SourceItem] = []
    if schema_object_names:
        body = "\n".join(f"- {n}" for n in schema_object_names)
        if len(body) > _MAX_ONTOLOGY_BODY_CHARS:
            body = body[: _MAX_ONTOLOGY_BODY_CHARS - 3] + "..."
        out.append(
            SourceItem(
                id="ontology:object-types",
                source_type="ontology",
                content=body,
                score=1.0,
                source_name="Object types (ontology)",
                document_id=None,
                wiki_page_id=None,
                wiki_space_id=None,
            )
        )
    for i, (cy, data) in enumerate(cypher_runs):
        rows = data.get("rows") or []
        cols = data.get("columns") or []
        n = len(rows)
        preview = json.dumps(rows[:2], ensure_ascii=False, default=str) if rows else "[]"
        if len(preview) > 2_000:
            preview = preview[:1997] + "..."
        tokens = tokens_after_colon_in_cypher(cy)
        token_line = ", ".join(tokens) if tokens else "(none inferred)"
        cy_short = (cy or "").strip().replace("\n", " ")
        if len(cy_short) > 600:
            cy_short = cy_short[:597] + "..."
        content = (
            f"Cypher: {cy_short}\n\n"
            f"Columns: {', '.join(str(c) for c in cols)}\n"
            f"Rows: {n}\n"
            f"Labels / rel tokens (heuristic): {token_line}\n\n"
            f"Sample rows: {preview}"
        )
        if len(content) > _MAX_ONTOLOGY_BODY_CHARS:
            content = content[: _MAX_ONTOLOGY_BODY_CHARS - 3] + "..."
        out.append(
            SourceItem(
                id=f"ontology:cypher:{i}",
                source_type="ontology",
                content=content,
                score=1.0,
                source_name=f"Graph query {i + 1}",
                document_id=None,
                wiki_page_id=None,
                wiki_space_id=None,
            )
        )
    return out


def _collect_ontology_from_messages(messages: list[Any]) -> tuple[list[str], list[tuple[str, dict[str, Any]]]]:
    """Return (schema object names in order, list of (cypher, result dict)) for successful Cypher runs."""
    meta = _tool_call_meta_by_id(messages)
    schema_names: list[str] = []
    schema_seen: set[str] = set()
    cy_runs: list[tuple[str, dict[str, Any]]] = []
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        tid = str(m.tool_call_id or "")
        name = ""
        args: dict[str, Any] = {}
        if tid and tid in meta:
            name, args = meta[tid]
        else:
            name = str(m.name or "")
        base = name.split("/")[-1]
        text = _coerce_tool_output(m.content)
        if base == ONTOLOGY_SCHEMA_TOOL_NAME:
            for n in _parse_schema_object_names(text):
                if n not in schema_seen:
                    schema_seen.add(n)
                    schema_names.append(n)
        elif base == RUN_CYPHER_TOOL_NAME:
            parsed = _parse_cypher_result(text)
            if parsed is None:
                continue
            cy = ""
            if isinstance(args.get("cypher"), str):
                cy = args["cypher"]
            cy_runs.append((cy, parsed))
    return schema_names, cy_runs


def sources_from_ontology_tools(messages: list[Any]) -> list[SourceItem] | None:
    """If the agent ran read-only Cypher successfully, return ontology-facing sources instead of RAG chunks."""
    schema_names, cy_runs = _collect_ontology_from_messages(messages)
    if not cy_runs:
        return None
    return build_ontology_display_sources(schema_object_names=schema_names, cypher_runs=cy_runs)


def ontology_sources_from_stream_parts(
    *,
    schema_object_names: list[str],
    cypher_runs: list[tuple[str, dict[str, Any]]],
) -> list[SourceItem] | None:
    if not cypher_runs:
        return None
    return build_ontology_display_sources(schema_object_names=schema_object_names, cypher_runs=cypher_runs)


def extract_schema_names_from_tool_output(out: Any) -> list[str]:
    return _parse_schema_object_names(_coerce_tool_output(out))


def extract_cypher_run_from_tool(inp: Any, out: Any) -> tuple[str, dict[str, Any]] | None:
    parsed = _parse_cypher_result(_coerce_tool_output(out))
    if parsed is None:
        return None
    cy = ""
    if isinstance(inp, dict) and isinstance(inp.get("cypher"), str):
        cy = inp["cypher"]
    return (cy, parsed)


def _catalog_preview_rows(rows: Any, *, limit: int = 50) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if isinstance(row, dict):
            out.append({str(k): v for k, v in row.items()})
    return out


def source_from_catalog_tool(
    tool_name: str,
    tool_input: Any,
    tool_output: Any,
    *,
    index: int = 0,
) -> SourceItem | None:
    """Build one Catalog evidence source from a tool call (stream or graph messages)."""
    base = (tool_name or "").split("/")[-1]
    if base not in _CATALOG_QUERY_TOOL_NAMES:
        return None
    text = _coerce_tool_output(tool_output)
    if not text or text.startswith("Error"):
        return None
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict) or "sql" not in data:
        return None

    args: dict[str, Any] = tool_input if isinstance(tool_input, dict) else {}
    if not args and isinstance(tool_input, str):
        try:
            parsed = json.loads(tool_input)
            if isinstance(parsed, dict):
                args = parsed
        except (json.JSONDecodeError, TypeError):
            args = {}

    metric = args.get("metric")
    expression = args.get("expression")
    model_id = args.get("model_id")
    is_sql_lab = base == SQL_SEMANTIC_MODEL_TOOL_NAME
    sql = str(data.get("sql") or "")
    rows_raw = data.get("rows") or []
    preview_rows = _catalog_preview_rows(rows_raw)
    row_count = int(data.get("row_count") or len(rows_raw) or 0)
    capped = bool(data.get("capped"))
    columns = data.get("columns")
    if not isinstance(columns, list) or not columns:
        columns = list(preview_rows[0].keys()) if preview_rows else []
    else:
        columns = [str(c) for c in columns]

    if is_sql_lab:
        mode = "sql"
        label = "SQL Lab"
        source_type = "semantic_model"
    elif metric:
        mode = "metric"
        label = str(metric)
        source_type = "metric"
    elif expression:
        mode = "expression"
        label = str(expression)
        source_type = "semantic_model"
    else:
        mode = "expression"
        label = "Catalog query"
        source_type = "semantic_model"

    # The arguments the query was made with, not only the SQL it produced: in metric mode the SQL is generated by the
    # backend (values parameterised), so the dimension/filter arguments are the only judgeable record of what was asked.
    data_query: dict[str, Any] = {
        "mode": mode,
        "model_id": str(model_id) if model_id else None,
        "metric": str(metric) if metric else None,
        "expression": str(expression) if expression else None,
        "group_by": args.get("group_by") or [],
        "filters": args.get("filters") or [],
        "base_dataset": args.get("base_dataset"),
        "joins": args.get("joins") or [],
        "resource_id": args.get("resource_id"),
        "sql": sql,
        "columns": columns,
        "rows": preview_rows,
        "row_count": row_count,
        "capped": capped,
    }
    content = f"{label} · {row_count} row{'s' if row_count != 1 else ''}"
    if capped:
        content += " (capped)"
    return SourceItem(
        id=f"catalog:query:{index}",
        source_type=source_type,
        content=content,
        score=1.0,
        source_name=str(label)[:120],
        document_id=str(model_id) if model_id else None,
        wiki_page_id=None,
        wiki_space_id=None,
        data_query=data_query,
    )


def sources_from_catalog_tools(messages: list[Any]) -> list[SourceItem] | None:
    """If the agent ran a successful Catalog query or SQL Lab, cite metric / expression / SQL."""
    meta = _tool_call_meta_by_id(messages)
    out: list[SourceItem] = []
    for m in messages:
        if not isinstance(m, ToolMessage):
            continue
        tid = str(m.tool_call_id or "")
        name = ""
        args: dict[str, Any] = {}
        if tid and tid in meta:
            name, args = meta[tid]
        else:
            name = str(m.name or "")
        src = source_from_catalog_tool(name, args, m.content, index=len(out))
        if src is not None:
            out.append(src)
    return out or None


KB_SEARCH_TOOL_NAME = "search_knowledge_base"


def sources_from_kb_search_payload(text: str) -> list[SourceItem]:
    """Parse one `search_knowledge_base` result (its JSON payload) into sources.

    Two callers need this: the transcript of a finished turn, and the stream, which only ever sees the tool's output as
    text. Sharing the parser is what keeps the chat and `/ask` showing the same sources for the same answer.
    """
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(payload, dict):
        return []
    out: list[SourceItem] = []
    for passage in payload.get("passages") or []:
        if not isinstance(passage, dict):
            continue
        try:
            out.append(SourceItem.model_validate(passage))
        except ValidationError:
            # A passage that no longer matches the model is a contract break worth seeing in the log, not a reason to
            # answer with half its evidence.
            logger.warning("dropped a passage that does not match SourceItem: %s", sorted(passage)[:8])
    return out


    return out


def sources_from_kb_search_tools(messages: list[Any]) -> list[SourceItem] | None:
    """Passages a `search_knowledge_base` call returned — in `on_miss` mode, the answer's evidence.

    Read from the transcript rather than from a request-scoped accumulator: LangGraph runs a tool node in a copied context,
    so anything the tool writes to a context variable never comes back to the caller. The transcript does.
    """
    out: list[SourceItem] = []
    for message in messages or []:
        name = str(getattr(message, "name", "") or "")
        if name != KB_SEARCH_TOOL_NAME:
            continue
        text = getattr(message, "content", "")
        if not isinstance(text, str) or not text.strip():
            continue
        out.extend(sources_from_kb_search_payload(text))
    return out or None


WEB_SEARCH_TOOL_NAME = "search_web"


def sources_from_web_search_payload(text: str) -> list[SourceItem]:
    """Parse one `search_web` result into sources.

    Same contract as the corpus parser, one difference: these are **external**. The URL is the citation, so a result
    without one is dropped rather than shown as an unattributable row.
    """
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(payload, dict):
        return []
    out: list[SourceItem] = []
    for result in payload.get("results") or []:
        if not isinstance(result, dict):
            continue
        url = str(result.get("url") or "").strip()
        if not url:
            continue
        published = result.get("published_at")
        publisher = result.get("publisher")
        metadata = {
            key: value
            for key, value in (("publisher", publisher), ("published_at", published))
            if isinstance(value, str) and value.strip()
        }
        out.append(
            SourceItem(
                id=url,
                source_type="web",
                content=str(result.get("content") or ""),
                # No retrieval score: the provider ranked, and inventing a number here would read like a similarity.
                score=0.0,
                source_name=result.get("title") or url,
                url=url,
                doc_metadata=metadata or None,
            )
        )
    return out


def sources_from_web_search_tools(messages: list[Any]) -> list[SourceItem] | None:
    out: list[SourceItem] = []
    for message in messages or []:
        if str(getattr(message, "name", "") or "") != WEB_SEARCH_TOOL_NAME:
            continue
        text = getattr(message, "content", "")
        if isinstance(text, str) and text.strip():
            out.extend(sources_from_web_search_payload(text))
    return out or None


def select_display_sources(
    retrieve_chunks: list[SourceItem],
    *,
    messages: list[Any] | None = None,
    streamed_sections: list[SourceItem] | None = None,
    streamed_catalog: list[SourceItem] | None = None,
    streamed_searched: list[SourceItem] | None = None,
    streamed_web: list[SourceItem] | None = None,
    streamed_ontology_schema_names: list[str] | None = None,
    streamed_ontology_cypher_runs: list[tuple[str, dict[str, Any]]] | None = None,
) -> list[SourceItem]:
    """Every source this turn produced, in family order.

    It used to return the first non-empty family — correct when retrieval ran before generation and a turn could only
    produce one. With tools, one answer quotes a section, a query and a page, and that rule dropped the rest. The ledger
    appends instead; see `evidence_ledger.py`.
    """
    ledger = EvidenceLedger()

    if messages:
        ledger.add("page", sources_from_page_index_tools(messages))
        ledger.add("catalog", sources_from_catalog_tools(messages))
        ledger.add("ontology", sources_from_ontology_tools(messages))
        ledger.add("searched", sources_from_kb_search_tools(messages))
        ledger.add("web", sources_from_web_search_tools(messages))
    ledger.add("page", streamed_sections)
    ledger.add("catalog", streamed_catalog)
    if streamed_ontology_cypher_runs:
        ledger.add(
            "ontology",
            ontology_sources_from_stream_parts(
                schema_object_names=list(streamed_ontology_schema_names or []),
                cypher_runs=streamed_ontology_cypher_runs,
            ),
        )
    ledger.add("searched", streamed_searched)
    ledger.add("web", streamed_web)

    # The legacy slot: chunks from the pre-tool retrieval node, or a caller that has no transcript. Only when nothing
    # else was found — those rows are the same passages `search_knowledge_base` returns, without their provenance.
    if ledger.is_empty():
        ledger.add("searched", retrieve_chunks)
    return ledger.snapshot()
