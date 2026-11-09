"""Read SQL code, not SQL text: which relations a statement names, and where.

Pure and dependency-free, because everything it answers is a **security** question: a relation it cannot see must never
mean "unrestricted", and a keyword inside a string literal is not a keyword at all. Two bugs lived here before the rules
were written down — `FROM"t"` (no space) and `FROM/**/"t"` (a comment) are valid SQL that a `\\s+` regex read as *no
relation*, which silently emptied both the allowlist and the row-policy rewrite.

The contract: `relation_refs` raises `RelationShapeError` on anything it cannot read. Callers turn that into a refusal —
never into "carry on unfiltered".
"""
from __future__ import annotations

import re

#: Whitespace *and* comments: in SQL a comment is whitespace, so `FROM"t"` and `FROM/**/"t"` are both valid
#: PostgreSQL — and a regex that insists on `\s+` reads neither, which silently emptied the relation list (no allowlist
#: check, and no row restriction either). Anything that follows FROM/JOIN is now parsed, not pattern-matched.
_SKIP = re.compile(r"(?:\s+|--[^\n]*|/\*.*?\*/)+", re.S)
_KEYWORD = re.compile(r"\b(?:from|join)\b", re.I)
_NAME = re.compile(r'"(?:[^"]|"")*"|[A-Za-z_][\w$]*')


class RelationShapeError(ValueError):
    """A FROM/JOIN the scanner cannot read. Refused, because "not recognised" must never mean "unrestricted"."""


def mask_quoted(sql: str, *, identifiers: bool = True) -> str:
    """The same SQL with quoted text blanked out, same length, so offsets still line up.

    A keyword inside `'…'` (or inside `"…"`, a quoted identifier) is not code: `SELECT 'from here'` has no FROM, and
    rewriting it would put a subquery **inside the literal** — the user's value would change meaning, and `'joined from
    here'` was refused as "Table here is not in this semantic model". Double quotes are blanked for keyword finding only;
    the relation name itself is read from the original. `identifiers=False` keeps `"…"` visible — the guard against
    `schema.table.column` has to *see* quoted names to refuse them.
    """
    out = list(sql)
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'" or (ch == '"' and identifiers):
            quote = ch
            j = i + 1
            while j < n:
                if sql[j] == quote:
                    if j + 1 < n and sql[j + 1] == quote:  # '' and "" escape by doubling
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            for k in range(i, min(j, n)):
                out[k] = " "
            i = j
            continue
        if ch == "$":
            dollar = re.match(r"\$[A-Za-z_]*\$", sql[i:])
            if dollar:
                tag = dollar.group(0)
                close = sql.find(tag, i + len(tag))
                end = n if close < 0 else close + len(tag)
                for k in range(i, end):
                    out[k] = " "
                i = end
                continue
        i += 1
    return "".join(out)


def _skip_ws(sql: str, at: int) -> int:
    match = _SKIP.match(sql, at)
    return match.end() if match else at


def _parse_name(sql: str, at: int) -> tuple[str, int] | None:
    match = _NAME.match(sql, at)
    if not match:
        return None
    return match.group(0), match.end()


def relation_refs(sql: str) -> list[tuple[int, int, str | None, str]]:
    """`(start, end, schema_or_None, table)` for every relation after FROM / JOIN.

    Skips whitespace and comments, accepts a subquery `(SELECT …)` (its own FROM is scanned too, since every keyword is
    visited), and **raises** on anything else — `ONLY`, a parenthesised table name, a stray operator. The caller refuses
    the statement rather than running it unread: a relation the scanner missed is a table the allowlist never checked.
    """
    out: list[tuple[int, int, str | None, str]] = []
    masked = mask_quoted(sql)
    for match in _KEYWORD.finditer(masked):
        at = _skip_ws(sql, match.end())
        if at >= len(sql):
            raise RelationShapeError("SQL ends right after FROM/JOIN.")
        if sql[at] == "(":
            # A subquery: legal, and its relations are found by this same scan. A parenthesised *table name* is not.
            inner = _skip_ws(sql, at + 1)
            word = _NAME.match(sql, inner)
            if not word or word.group(0).lower() not in ("select", "with"):
                raise RelationShapeError(
                    "Wrap a subquery in FROM (SELECT …), or name the table directly: FROM schema.table."
                )
            continue
        only = _NAME.match(sql, at)
        if only and only.group(0).lower() == "only":
            raise RelationShapeError(
                "FROM ONLY is not supported in SQL Lab; drop ONLY (datasets never use table inheritance)."
            )
        parts: list[str] = []
        start: int | None = None
        end = at
        while True:
            parsed = _parse_name(sql, end)
            if not parsed:
                break
            name, end = parsed
            start = at if start is None else start
            parts.append(_unquote(name))
            after = _skip_ws(sql, end)
            if after < len(sql) and sql[after] == ".":
                end = _skip_ws(sql, after + 1)
                continue
            break
        if not parts:
            token = sql[at : at + 24].split()[0] if sql[at : at + 24].strip() else sql[at : at + 1]
            raise RelationShapeError(
                f"Cannot read the relation after {match.group(0).upper()} ({token!r}). "
                "Name the table as schema.table or quote it."
            )
        out.append((start, end, parts[-2] if len(parts) >= 2 else None, parts[-1]))
    return out


def _unquote(ident: str) -> str:
    s = ident.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        return s[1:-1].replace('""', '"')
    return s
