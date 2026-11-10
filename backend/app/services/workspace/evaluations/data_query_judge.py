"""Judge a data answer's cited query against ground truth — deterministically where it can be.

The evaluation checks what the answer *claimed*: the ``data_query`` source it cited (``model_id``, ``metric``/
``expression``, ``sql``). It never re-runs the SQL — data changes, the query does not.

Deterministic here means "no model": the model id, the metric and the SQL's *shape* (tables, referenced columns,
GROUP BY, forbidden columns) compare structurally. Semantic equivalence of two differently-shaped SQLs is the caller's
LLM fallback, not this module.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.data.sql_scan import _unquote, mask_quoted, relation_refs

#: A column reference: `name`, `alias.name`, or `schema.table.name`. The last part is the column.
_COLUMN = re.compile(
    r'(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*("[^"]+"|[A-Za-z_][\w$]*)'
    r'|("[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*("[^"]+"|[A-Za-z_][\w$]*)'
)
_IDENT = re.compile(r'"[^"]+"|[A-Za-z_][\w$]*')


def _norm(ident: str) -> str:
    return _unquote(ident).lower()


def _clause(sql: str, keyword: str) -> str | None:
    """The SQL from a clause keyword to the next clause, with quoted text blanked."""
    masked = mask_quoted(sql, identifiers=False)
    match = re.search(rf'\b{keyword}\b', masked, re.IGNORECASE)
    if not match:
        return None
    rest = masked[match.end():]
    stop = re.search(r'\b(?:from|where|group\s+by|having|order\s+by|limit|offset|union|join)\b', rest, re.IGNORECASE)
    return rest[: stop.start()] if stop else rest


def _columns_in(clause: str | None) -> set[str]:
    """Every identifier in the SELECT list — columns, aliases, function names.

    A superset on purpose: the evaluation asks "is the expected column referenced", and a superset answers that correctly
    (extra identifiers like `count` or `sum` never hide a missing column).
    """
    return _words(clause)


def _words(clause: str | None) -> set[str]:
    if not clause:
        return set()
    return {_norm(w) for w in _IDENT.findall(clause)}


def extract_sql_features(sql: str) -> dict[str, set[str]]:
    """The parts of a SQL statement that decide whether it answers a question.

    Best-effort and read-only: this compares shapes for an evaluation, it does not guard a query. ``tables`` are
    ``schema.table`` (or bare ``table``) from the same scanner the engine uses; ``columns`` are SELECT-list references;
    ``group_by`` is the GROUP BY list; ``referenced`` is every identifier anywhere — the superset used to refuse a
    ``forbid`` column.
    """
    tables: set[str] = set()
    for _start, _end, schema, table in relation_refs(sql):
        tables.add(f'{_norm(schema)}.{_norm(table)}' if schema else _norm(table))

    select_clause = _clause(sql, 'select')
    group_clause = _clause(sql, 'group\\s+by')
    return {
        'tables': tables,
        'columns': _columns_in(select_clause),
        'group_by': _words(group_clause),
        'referenced': _columns_in(select_clause) | _words(group_clause),
    }


def _subset_ok(expected: set[str], actual: set[str], where: str) -> bool:
    return expected <= actual


def judge_query_features(
    expected: dict[str, Any],
    actual: dict[str, Any],
) -> dict[str, Any]:
    """Deterministic verdicts for the parts that do not need a model.

    ``expected`` is one entry of ``EvaluationItem.expected_query``; ``actual`` is one ``data_query`` source. Every
    mismatch is a named reason, so the run can say *what* was wrong rather than only *that* it was wrong.
    """
    reasons: list[str] = []
    checks: dict[str, bool] = {}

    # model id is the one fact that has no acceptable variation
    expected_model = str(expected.get('model_id') or '')
    actual_model = str(actual.get('model_id') or '')
    model_ok = bool(expected_model) and expected_model == actual_model
    checks['model_id'] = model_ok
    if not model_ok:
        reasons.append(f'cited model {actual_model or "<none>"}, expected {expected_model}')

    # metric/expression, when the ground truth names one
    expected_metric = str(expected.get('metric') or '')
    if expected_metric:
        metric_ok = str(actual.get('metric') or '') == expected_metric
        checks['metric'] = metric_ok
        if not metric_ok:
            reasons.append(f'cited metric {actual.get("metric") or "<none>"}, expected {expected_metric}')

    # SQL shape, only when the ground truth demands one
    sql = str(actual.get('sql') or '')
    feats = extract_sql_features(sql)
    expected_sql = expected.get('sql') or {}

    for key, label in (('tables', 'tables'), ('columns', 'columns'), ('group_by', 'group by')):
        want = {str(x).lower() for x in (expected_sql.get(key) or [])}
        if want:
            ok = _subset_ok(want, feats[key], label)
            checks[key] = ok
            if not ok:
                missing = sorted(want - feats[key])
                reasons.append(f'{label} missing: {", ".join(missing)}')

    forbid = {str(x).lower() for x in (expected_sql.get('forbid') or [])}
    if forbid:
        used = forbid & feats['referenced']
        checks['forbid'] = not used
        if used:
            reasons.append(f'used a forbidden column: {", ".join(sorted(used))}')

    passed = all(checks.values()) if checks else False
    return {
        'passed': passed,
        'checks': checks,
        'reasons': reasons,
        'features': {k: sorted(v) for k, v in feats.items()},
    }


def match_sources_to_queries(
    expected_queries: list[dict[str, Any]],
    sources: list[dict[str, Any]],
) -> dict[str, Any]:
    """Cover every expected query with one cited source; extras are completeness, not noise.

    The pass/fail line is coverage: **each** expected query must be matched by at least one source. A source that matches
    nothing is an extra query the agent made — possibly a useful supplement, possibly a red herring — and is reported
    separately so the run can score completeness without letting it pass or fail the item.
    """
    matched: list[dict[str, Any]] = []
    uncovered: list[dict[str, Any]] = []

    # A source is not consumed by a match: one subquery SQL can answer two expected queries
    # (stock count *and* calendar days), and both should count as covered.
    for i, expected in enumerate(expected_queries):
        best: dict[str, Any] | None = None
        for j, src in enumerate(sources):
            verdict = judge_query_features(expected, src)
            if verdict['passed']:
                best = {'query_index': i, 'source_index': j, 'verdict': verdict}
                break
        if best is not None:
            matched.append(best)
        else:
            # keep the most informative failure: the source that attempted the most checks, then the fewest reasons
            failing: dict[str, Any] | None = None
            for j, src in enumerate(sources):
                verdict = judge_query_features(expected, src)
                if failing is None or (
                    len(verdict['checks']) > len(failing['verdict']['checks'])
                    or (
                        len(verdict['checks']) == len(failing['verdict']['checks'])
                        and len(verdict['reasons']) < len(failing['verdict']['reasons'])
                    )
                ):
                    failing = {'query_index': i, 'source_index': j, 'verdict': verdict}
            uncovered.append(
                failing
                or {
                    'query_index': i,
                    'source_index': -1,
                    'verdict': {'passed': False, 'reasons': ['no source cited'], 'checks': {}},
                }
            )

    matched_source_ids = {m['source_index'] for m in matched}
    extra_sources = [
        {'source_index': j, 'source': sources[j]}
        for j in range(len(sources))
        if j not in matched_source_ids
    ]

    total = len(expected_queries)
    coverage = len(matched) / total if total else 0.0
    return {
        'matched': matched,
        'uncovered': uncovered,
        'extra_sources': extra_sources,
        'coverage': coverage,
        'passed': coverage == 1.0,
    }
