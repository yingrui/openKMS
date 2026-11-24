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
) -> tuple[str, dict]:
    """`(WHERE … , params)` for a node variable.

    `link_info` maps a link api_name to `(rel_type, direction)`, where direction is `out` when the queried type is
    the link's source. A link filter becomes an `EXISTS { … }` subquery so the result stays *objects of the queried
    type* — which is what makes it also the mechanism behind a pivot.
    """
    parts: list[str] = []
    params: dict = {}
    for index, flt in enumerate(filters):
        key = f"f_{index}"
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


def aggregate_query(
    label: str,
    where: str,
    prop: str,
    *,
    limit: int,
) -> str:
    """Distribution of one property over the current object set — the data behind one chart."""
    tail = f"WHERE value IS NOT NULL RETURN value, c ORDER BY c DESC LIMIT {int(limit)}"
    return (
        f"MATCH (n:{label}) {where} "
        f"WITH toString(n.`{prop}`) AS value, count(n) AS c "
        f"{tail}"
    )
