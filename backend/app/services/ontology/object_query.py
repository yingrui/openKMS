"""Object-set queries: filters with operators, sorting, and per-property aggregation.

An **object set** is one object type plus conditions. The conditions come from the URL (`f=…`), so the set is
addressable and shareable, and everything the UI renders — charts, table, facets — is a rendering of it.

Two things this module is careful about:

* **One vocabulary.** `f=<prop>:<op>:<value>` and the legacy `prop.<name>=<value>` produce the same filter object,
  so there is one implementation of "match this property", not two.
* **Comparisons need a type.** Properties in the graph keep their native type, but a value that arrives in a URL
  is a string. Equality compares `toString(…)` (a `2026-W46` text property and an integer id both work), while
  `gt`/`ge`/`lt`/`le` compare as numbers *only when the value parses as a number* — otherwise a numeric-looking
  string would sort before `2`.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Comparison operators an object-set filter may use.
OPS = ("eq", "ne", "gt", "ge", "lt", "le", "in", "contains", "is_null", "is_not_null")


class QueryError(ValueError):
    """The filter/sort expression is not valid; surfaced as HTTP 400, never silently ignored."""


@dataclass(frozen=True)
class PropertyFilter:
    """One condition. `via` is a link type's api_name: the condition applies to the object on the other side."""

    prop: str
    op: str
    value: object
    via: str | None = None


@dataclass(frozen=True)
class SortKey:
    prop: str
    descending: bool = False


def parse_value(op: str, raw: str) -> object:
    if op in ("is_null", "is_not_null"):
        return None
    """`in` becomes a list; a bare number stays a string so equality still compares text-to-text."""
    if op == "in":
        items = [part.strip() for part in raw.split(",") if part.strip()]
        if not items:
            raise QueryError("`in` needs at least one value")
        return items
    return raw


def parse_filter(raw: str) -> PropertyFilter:
    """`[<link>/]<prop>:<op>:<value>` → a filter; the link prefix makes it a one-hop condition."""
    text = raw.strip()
    if not text:
        raise QueryError("empty filter")
    via: str | None = None
    if text.startswith("@"):
        text = text[1:]
        if "/" not in text:
            raise QueryError("a link filter looks like `@<link>/<prop>:<op>:<value>`")
        via, text = text.split("/", 1)
        via = via.strip()
        if not via:
            raise QueryError("a link filter needs a link type name")
    parts = text.split(":")
    if len(parts) == 2 and parts[1].strip().lower() in ("is_null", "is_not_null"):
        # `prop:is_null` carries no value, and demanding a trailing colon would be noise.
        return PropertyFilter(prop=parts[0].strip(), op=parts[1].strip().lower(), value=None)
    if len(parts) < 3:
        raise QueryError(f"`{raw}` is not `<prop>:<op>:<value>`")
    prop, op, *rest = parts
    prop = prop.strip()
    op = op.strip().lower()
    value = ":".join(rest)  # values may contain a colon (timestamps, URNs)
    if not prop:
        raise QueryError(f"`{raw}` has no property name")
    if op not in OPS:
        raise QueryError(f"`{op}` is not one of: {', '.join(OPS)}")
    return PropertyFilter(prop=prop, op=op, value=parse_value(op, value), via=via)


def parse_filters(raws: list[str], legacy: dict[str, str] | None = None) -> list[PropertyFilter]:
    """Both spellings of a condition end up here: `f=…` and the older `prop.<name>=<value>`."""
    out = [parse_filter(raw) for raw in raws]
    for name, value in (legacy or {}).items():
        out.append(PropertyFilter(prop=name, op="eq", value=value))
    return out


def parse_sort(raw: str | None) -> list[SortKey]:
    """`-exposure,name` → descending on exposure, then ascending on name."""
    if not raw or not raw.strip():
        return []
    out: list[SortKey] = []
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        out.append(SortKey(prop=token.lstrip("-"), descending=token.startswith("-")))
    return out


# --- Cypher -------------------------------------------------------------------------------------


def _is_number(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        try:
            float(value)
            return True
        except ValueError:
            return False
    return False


def _comparison(expr: str, op: str, param: str, value: object = None) -> str:
    if op == "eq":
        return f"toString({expr}) = ${param}"
    if op == "ne":
        return f"toString({expr}) <> ${param}"
    if op == "contains":
        return f"toLower(toString({expr})) CONTAINS toLower(${param})"
    if op == "in":
        return f"toString({expr}) IN ${param}"
    if op == "is_null":
        return f"{expr} IS NULL"
    if op == "is_not_null":
        return f"{expr} IS NOT NULL"
    # Numbers compare as numbers (a text compare puts "100" before "20"); dates and other strings compare as
    # text, which is what an ISO date wants.
    if _is_number(value):
        return f"toFloat(toString({expr})) {_NUMERIC[op]} toFloat(${param})"
    return f"toString({expr}) {_NUMERIC[op]} toString(${param})"


_NUMERIC = {"gt": ">", "ge": ">=", "lt": "<", "le": "<="}


def where_clause(
    filters: list[PropertyFilter],
    *,
    link_info: dict[str, tuple[str, str]],
    prefix: str = "n",
    param_prefix: str = "f",
) -> tuple[str, dict]:
    """`(WHERE … , params)` for a node variable.

    `link_info` maps a link api_name to `(rel_type, direction)`, where direction is `out` when the queried type is
    the link's source. A link filter becomes an `EXISTS { … }` subquery so the result stays *objects of the queried
    type* — which is what makes it also the mechanism behind a pivot.
    """
    parts: list[str] = []
    params: dict = {}
    for index, flt in enumerate(filters):
        key = f"{param_prefix}_{index}"
        if flt.via is None:
            parts.append(_comparison(f"{prefix}.`{flt.prop}`", flt.op, key, flt.value))
            params[key] = flt.value
            continue
        if flt.via not in link_info:
            raise QueryError(f"`{flt.via}` is not a link type of this object type")
        rel, direction = link_info[flt.via]
        arrow = f"-[:{rel}]->" if direction == "out" else f"<-[:{rel}]-"
        inner = _comparison("m.`%s`" % flt.prop, flt.op, key, flt.value)
        parts.append(f"EXISTS {{ MATCH ({prefix}){arrow}(m) WHERE {inner} }}")
        params[key] = flt.value
    if not parts:
        return "", params
    return "WHERE " + " AND ".join(parts), params


def order_clause(sort: list[SortKey], *, key_properties: list[str], prefix: str = "n") -> str:
    """`ORDER BY …`, with the declared key appended so paging is stable when values tie."""
    terms = [
        f"{prefix}.`{key.prop}` {'DESC' if key.descending else 'ASC'}" for key in sort
    ]
    if not terms:
        return ""
    for name in key_properties:
        terms.append(f"{prefix}.`{name}` ASC")
    return "ORDER BY " + ", ".join(terms)


def count_query(label: str, where: str) -> str:
    return f"MATCH (n:{label}) {where} RETURN count(n) AS c"


def page_query(label: str, where: str, order: str) -> str:
    tail = f"{order} SKIP $offset LIMIT $limit" if order else "SKIP $offset LIMIT $limit"
    return f"MATCH (n:{label}) {where} RETURN n {tail}"


def split_link_property(prop: str) -> tuple[str, str] | None:
    """`@linkName/someProp` → `("linkName", "someProp")`; a plain property returns None."""
    if not prop.startswith("@"):
        return None
    link, _, name = prop[1:].partition("/")
    if not link or not name:
        raise QueryError(f"`{prop}` is not `@link/property`")
    return link, name


METRICS = ("count", "sum", "avg", "min", "max", "p50", "p90", "linked")

#: Metrics that can be compared against a second set. A percentile of two sets cannot be combined into one, and
#: neither can a min or a max, so those are asked one set at a time.
COMPARABLE_METRICS = ("count", "sum", "avg")


def _link_step(
    prop: str,
    alias: str,
    link_info: dict[str, tuple[str, str]] | None,
) -> tuple[str, str, str, bool]:
    """`(MATCH step, node variable, property name, crosses a link)` for one charted expression."""
    linked = split_link_property(prop)
    if linked is None:
        return "", "n", prop, False
    link, name = linked
    if not link_info or link not in link_info:
        raise QueryError(f"`{link}` is not a link type of this object type")
    rel, direction = link_info[link]
    arrow = f"-[:{rel}]->" if direction == "out" else f"<-[:{rel}]-"
    return f" MATCH (n){arrow}({alias})", alias, name, True


def _aggregate_branch(
    label: str,
    where: str,
    prop: str,
    *,
    limit: int,
    link_info: dict[str, tuple[str, str]] | None,
    metric: str,
    measure: str | None,
    split: str | None,
) -> tuple[str, str, dict]:
    """One `MATCH … WITH … RETURN` block: `(match, projection, columns)` for a single set."""
    match = f"MATCH (n:{label}) {where}"
    step, dim_var, dim_name, _ = _link_step(prop, "m", link_info)
    match += step
    split_part = ""
    if split:
        step2, split_var, split_name, _ = _link_step(split, "m2", link_info)
        match += step2
        split_part = f", toString({split_var}.`{split_name}`) AS split"

    measure_expr = ""
    if metric not in ("count", "linked"):
        assert measure is not None
        step3, measure_var, measure_name, _ = _link_step(measure, "m3", link_info)
        match += step3
        measure_expr = f", toFloat({measure_var}.`{measure_name}`) AS measure"

    null_filters = ["value IS NOT NULL"] + (["split IS NOT NULL"] if split else [])
    projection = (
        f"WITH toString({dim_var}.`{dim_name}`) AS value{split_part}, n AS n{measure_expr} "
        f"WHERE {' AND '.join(null_filters)}"
    )
    # `linked` answers "how many of them" for an m2m: a plan covering 180 distributors is 180, not 1 plan.
    counted = "count(DISTINCT m)" if metric == "linked" else "count(DISTINCT n)"
    columns = f"{counted} AS c"
    if metric in ("count", "linked"):
        pass
    elif metric in ("p50", "p90"):
        # `percentileCont(value, percentile)` — the value comes first, which reads backwards until it does not.
        columns += f", percentileCont(measure, {0.5 if metric == 'p50' else 0.9}) AS v"
    elif metric == "avg":
        # A mean of one set cannot be averaged with a mean of another; carry the sum and the count.
        columns += ", sum(measure) AS v, count(measure) AS nv"
    else:
        columns += f", {metric}(measure) AS v"
    return match, projection, {"columns": columns}


def aggregate_query(
    label: str,
    where: str,
    prop: str,
    *,
    limit: int,
    link_info: dict[str, tuple[str, str]] | None = None,
    metric: str = "count",
    measure: str | None = None,
    split: str | None = None,
    compare_where: str | None = None,
    chronological: bool = False,
) -> str:
    """The data behind one chart: values of `prop`, optionally split, optionally against a second set.

    A chart may read the queried type or a neighbour (Palantir's charts do both: "these distributors, by the cycle of
    the plans they are in"). Counting is always `count(DISTINCT n)` — one object reachable twice through a
    relationship is still one object, and with a split the count has to stay a count of objects too.

    `metric` turns the chart from "how many" into "how much": `sum`/`avg`/`min`/`max` of `measure` within each value,
    or `p50`/`p90` for the spread a mean hides.

    `chronological` keeps the values' own order instead of ranking them by size: a period axis has one reading, and
    "the three biggest weeks" is not it.

    `compare_where` aggregates **the same property** over a second set (last week, another scenario, everyone) and
    returns both numbers per value. The two sets are computed separately and unioned, because an object may belong to
    both and a single pass with a `CASE` would count it once.
    """
    if metric not in METRICS:
        raise QueryError(f"unknown metric `{metric}`; one of {', '.join(METRICS)}")
    if metric == "linked" and split_link_property(prop) is None:
        raise QueryError("`linked` counts the objects on the other side of a link; chart `@link/property`")
    if metric not in ("count", "linked") and not measure:
        raise QueryError(f"`{metric}` needs a `measure` property")
    if compare_where is not None and metric not in COMPARABLE_METRICS:
        raise QueryError(
            f"`{metric}` cannot be compared with another set; use one of {', '.join(COMPARABLE_METRICS)}"
        )
    if split and metric not in ("count", "linked"):
        # A cell shows how many objects it holds; a measured cross-tab has no place to put the measure, and silently
        # dropping it left an `ORDER BY` naming a variable the query never selected.
        raise QueryError("a cross-tab counts objects; drop the metric to split")
    if compare_where is not None and split and metric != "count":
        # A measured cross-tab compared with another set needs four numbers per cell; the cells are counts.
        raise QueryError("a compared cross-tab counts objects; drop the metric")

    if compare_where is not None:
        return _compare_aggregate_query(
            label,
            where,
            compare_where,
            prop,
            limit=limit,
            link_info=link_info,
            metric=metric,
            measure=measure,
            split=split,
        )

    match, projection, columns = _aggregate_branch(
        label, where, prop, limit=limit, link_info=link_info, metric=metric, measure=measure, split=split
    )
    # A metric chart is a ranking of its measure ("which industry earned most"), not of how many objects it holds.
    # `v IS NULL` first because descending order puts nulls on top, and a value with nothing to measure is not the
    # largest one.
    order = "value ASC" if chronological else "c DESC"
    if metric == "avg" and not chronological:
        # Ordering a mean by its sum would rank a big group above a large mean.
        order = "v IS NULL, (v / nv) DESC"
    elif metric not in ("count", "linked") and not chronological:
        order = "v IS NULL, v DESC"
    if split:
        # A cell is a count; `linked` changes what is counted, not the shape of the answer.
        counted = "count(DISTINCT m)" if metric == "linked" else "count(DISTINCT n)"
        return (
            f"{match} {projection} "
            f"RETURN value, split, {counted} AS c ORDER BY {order} LIMIT {int(limit)}"
        )
    return (
        f"{match} {projection} "
        f"RETURN value, {columns['columns']} ORDER BY {order} LIMIT {int(limit)}"
    )


def _compare_aggregate_query(
    label: str,
    where: str,
    compare_where: str,
    prop: str,
    *,
    limit: int,
    link_info: dict[str, tuple[str, str]] | None,
    metric: str,
    measure: str | None,
    split: str | None = None,
) -> str:
    """Both sets, one answer per value: current, baseline, and the delta the reader actually wants.

    With a `split` the answer is per cell instead — a matrix, compared cell by cell.
    """
    current = _aggregate_branch(
        label, where, prop, limit=limit, link_info=link_info, metric=metric, measure=measure, split=split
    )
    baseline = _aggregate_branch(
        label, compare_where, prop, limit=limit, link_info=link_info, metric=metric, measure=measure, split=split
    )
    if split:
        keys = "value, split"
        return (
            f"CALL {{ {current[0]} {current[1]} RETURN {keys}, {current[2]['columns']}, 'cur' AS side "
            f"UNION ALL "
            f"{baseline[0]} {baseline[1]} RETURN {keys}, {baseline[2]['columns']}, 'cmp' AS side }} "
            f"RETURN {keys}, "
            "sum(CASE WHEN side = 'cur' THEN c ELSE 0 END) AS c, "
            "sum(CASE WHEN side = 'cmp' THEN c ELSE 0 END) AS base "
            f"ORDER BY c DESC LIMIT {int(limit)}"
        )
    columns = [
        "value",
        "sum(CASE WHEN side = 'cur' THEN c ELSE 0 END) AS c",
        "sum(CASE WHEN side = 'cmp' THEN c ELSE 0 END) AS base",
    ]
    if metric == "sum":
        columns += [
            "sum(CASE WHEN side = 'cur' THEN v ELSE 0 END) AS v",
            "sum(CASE WHEN side = 'cmp' THEN v ELSE 0 END) AS basv",
        ]
    elif metric == "avg":
        # A mean is carried as its sum and its count until the very end, so one set's mean is never averaged
        # with another set's mean.
        columns += [
            "sum(CASE WHEN side = 'cur' THEN v ELSE 0 END) AS v",
            "sum(CASE WHEN side = 'cmp' THEN v ELSE 0 END) AS basv",
            "sum(CASE WHEN side = 'cur' THEN nv ELSE 0 END) AS nv",
            "sum(CASE WHEN side = 'cmp' THEN nv ELSE 0 END) AS basnv",
        ]
    return (
        f"CALL {{ {current[0]} {current[1]} RETURN value, {current[2]['columns']}, 'cur' AS side "
        f"UNION ALL "
        f"{baseline[0]} {baseline[1]} RETURN value, {baseline[2]['columns']}, 'cmp' AS side }} "
        f"RETURN {', '.join(columns)} ORDER BY c DESC LIMIT {int(limit)}"
    )


def numeric_extent_query(
    label: str,
    where: str,
    prop: str,
    *,
    link_info: dict[str, tuple[str, str]] | None = None,
) -> str:
    """`(min, max, count)` of the property as a number, ignoring values that are not one.

    A declared type cannot decide this: the same column holds numbers in one dataset and text in another, and the
    chart has to describe the data it has.
    """
    step, var, name, _ = _link_step(prop, "m", link_info)
    return (
        f"MATCH (n:{label}) {where}{step} "
        # No `WHERE v IS NOT NULL`: `min`/`max`/`count(v)` already skip nulls, and `count(*)` has to see them —
        # otherwise `total` equals `count(v)` and the chart cannot say how many objects it left out.
        f"WITH toFloat({var}.`{name}`) AS v "
        "RETURN min(v) AS lo, max(v) AS hi, count(v) AS c, count(*) AS total"
    )


def histogram_query(
    label: str,
    where: str,
    prop: str,
    *,
    lo: float,
    width: float,
    link_info: dict[str, tuple[str, str]] | None = None,
) -> str:
    """Counts per equal interval, `[lo + k·width, lo + (k+1)·width)`."""
    step, var, name, _ = _link_step(prop, "m", link_info)
    counted = "count(DISTINCT n)" if step else "count(*)"
    buckets_ref = "$buckets - 1"
    return (
        f"MATCH (n:{label}) {where}{step} "
        # `n` has to be carried through the first WITH: a WITH replaces the scope, and counting rows afterwards
        # would reference a variable that no longer exists ("Variable `n` not defined").
        f"WITH toFloat({var}.`{name}`) AS v, n AS n WHERE v IS NOT NULL "
        # The maximum lands exactly on the top edge, where `floor((hi - lo) / width)` is `buckets` — outside the
        # intervals that get drawn. Clamping keeps it in the last one instead of dropping those objects.
        "WITH toInteger(floor((v - $lo) / $width)) AS k, n AS n "
        f"WITH (CASE WHEN k >= $buckets THEN {buckets_ref} ELSE k END) AS k, n AS n "
        f"RETURN k, {counted} AS c ORDER BY k"
    )
