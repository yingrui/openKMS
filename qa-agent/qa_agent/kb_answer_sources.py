"""API-facing ``sources`` for KB Q&A: Page Index sections, ontology graph, or RAG chunks."""
from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage

from .schemas import SourceItem

PAGE_SECTION_TOOL_NAME = "get_section_content_tool"
ONTOLOGY_SCHEMA_TOOL_NAME = "get_ontology_schema_tool"
RUN_CYPHER_TOOL_NAME = "run_cypher_tool"
QUERY_SEMANTIC_MODEL_TOOL_NAME = "query_semantic_model_tool"
SQL_SEMANTIC_MODEL_TOOL_NAME = "sql_semantic_model_tool"
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
    """Build a citation row from a get_section_content_tool call (input + raw output)."""
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
    """Ordered, de-duplicated section sources from successful get_section_content_tool results."""
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

    data_query: dict[str, Any] = {
        "mode": mode,
        "model_id": str(model_id) if model_id else None,
        "metric": str(metric) if metric else None,
        "expression": str(expression) if expression else None,
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


def select_display_sources(
    retrieve_chunks: list[SourceItem],
    *,
    messages: list[Any] | None = None,
    streamed_sections: list[SourceItem] | None = None,
    streamed_catalog: list[SourceItem] | None = None,
    streamed_ontology_schema_names: list[str] | None = None,
    streamed_ontology_cypher_runs: list[tuple[str, dict[str, Any]]] | None = None,
) -> list[SourceItem]:
    """Prefer Page Index, then Catalog query, then ontology graph, else RAG chunks."""
    if messages:
        page = sources_from_page_index_tools(messages)
        if page:
            return page
        catalog = sources_from_catalog_tools(messages)
        if catalog:
            return catalog
        onto = sources_from_ontology_tools(messages)
        if onto:
            return onto
    if streamed_sections:
        return streamed_sections
    if streamed_catalog:
        return list(streamed_catalog)
    if streamed_ontology_cypher_runs:
        src = ontology_sources_from_stream_parts(
            schema_object_names=list(streamed_ontology_schema_names or []),
            cypher_runs=streamed_ontology_cypher_runs,
        )
        if src:
            return src
    return list(retrieve_chunks)
