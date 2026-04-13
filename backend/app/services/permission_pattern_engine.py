"""Compile security_permissions backend_api_patterns and match HTTP method + path (strict mode)."""

from __future__ import annotations

from dataclasses import dataclass

from app.models.security_permission import SecurityPermission

_HTTP_METHODS = frozenset({"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"})


@dataclass(frozen=True, slots=True)
class CompiledRule:
    """Single rule: optional HTTP method, path segments, owning permission key, tie-break order."""

    method: str | None
    segments: tuple[str, ...]
    permission_key: str
    specificity: int
    segment_count: int
    source_order: int


def _normalize_path(path: str) -> str:
    p = path.split("?", 1)[0].strip()
    if not p.startswith("/"):
        p = "/" + p
    return p


def path_to_segments(path: str) -> list[str]:
    """Turn '/api/documents/foo' into ['api', 'documents', 'foo']."""
    p = _normalize_path(path)
    return [s for s in p.strip("/").split("/") if s]


def parse_backend_pattern(raw: str) -> tuple[str | None, list[str]]:
    """Parse 'GET /api/x' or '/api/x' into (method_or_none, segment_list)."""
    s = raw.strip()
    if not s:
        raise ValueError("empty pattern")
    parts = s.split(None, 1)
    if len(parts) == 2 and parts[0].upper() in _HTTP_METHODS:
        method = parts[0].upper()
        path_part = parts[1].strip()
    else:
        method = None
        path_part = s
    segs = path_to_segments(path_part)
    return method, segs


def _segment_specificity(seg: str) -> int:
    if seg == "*":
        return 0
    if len(seg) >= 2 and seg.startswith("{") and seg.endswith("}"):
        return 0
    return 1


def _compile_rule(
    permission_key: str,
    raw_pattern: str,
    source_order: int,
) -> CompiledRule:
    method, segs = parse_backend_pattern(raw_pattern)
    spec = sum(_segment_specificity(s) for s in segs)
    return CompiledRule(
        method=method,
        segments=tuple(segs),
        permission_key=permission_key,
        specificity=spec,
        segment_count=len(segs),
        source_order=source_order,
    )


def _segment_match(pattern_seg: str, actual: str) -> bool:
    if pattern_seg == "*":
        return True
    if len(pattern_seg) >= 2 and pattern_seg.startswith("{") and pattern_seg.endswith("}"):
        return bool(actual)
    return pattern_seg == actual


def path_matches_segments(pattern_segs: tuple[str, ...], path_segs: list[str]) -> bool:
    """Trailing segment '*' matches zero or more remaining path segments."""
    if not pattern_segs:
        return len(path_segs) == 0
    if pattern_segs[-1] == "*":
        fixed = pattern_segs[:-1]
        if len(path_segs) < len(fixed):
            return False
        for i, ps in enumerate(fixed):
            if not _segment_match(ps, path_segs[i]):
                return False
        return True
    if len(pattern_segs) != len(path_segs):
        return False
    for ps, act in zip(pattern_segs, path_segs, strict=True):
        if not _segment_match(ps, act):
            return False
    return True


def match_rule(method: str, path_segs: list[str], rule: CompiledRule) -> bool:
    m = method.upper()
    if rule.method is not None and rule.method != m:
        return False
    return path_matches_segments(rule.segments, path_segs)


def compile_rules_from_rows(rows: list[SecurityPermission]) -> list[CompiledRule]:
    """Flatten JSONB pattern lists into sorted rules (best match first)."""
    out: list[CompiledRule] = []
    order = 0
    for row in rows:
        key = row.key
        be = row.backend_api_patterns if isinstance(row.backend_api_patterns, list) else []
        for raw in be:
            if not isinstance(raw, str) or not raw.strip():
                continue
            try:
                out.append(_compile_rule(key, raw, order))
                order += 1
            except ValueError:
                continue
    out.sort(
        key=lambda r: (-r.specificity, -r.segment_count, -r.source_order),
    )
    return out


def resolve_required_permission_key(
    method: str,
    path: str,
    rules: list[CompiledRule],
) -> str | None:
    """Return permission key for the highest-specificity matching rule, or None."""
    path_segs = path_to_segments(path)
    for rule in rules:
        if match_rule(method, path_segs, rule):
            return rule.permission_key
    return None


# --- Frontend-style path patterns (same as SPA gate) ---

def frontend_path_matches_pattern(pathname: str, pattern: str) -> bool:
    """Match React Router pathname against patterns like '/documents' or '/documents/*'."""
    p = pathname.split("?", 1)[0].rstrip("/") or "/"
    if p != "/" and not p.startswith("/"):
        p = "/" + p
    pat = pattern.strip().rstrip("/") or "/"
    if pat != "/" and not pat.startswith("/"):
        pat = "/" + pat
    if pat.endswith("/*"):
        base = pat[:-2].rstrip("/") or "/"
        if base == "/":
            return True
        if p == base:
            return True
        return p.startswith(base + "/")
    return p == pat


def pathname_allowed_by_patterns(pathname: str, patterns: list[str]) -> bool:
    for pat in patterns:
        if pat and frontend_path_matches_pattern(pathname, pat):
            return True
    return False
