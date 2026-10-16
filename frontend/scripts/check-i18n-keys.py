#!/usr/bin/env python3
"""Guardrail: every `t('key')` must exist in the locale files, and its placeholders must interpolate.

A missing key does not crash — i18next renders the key itself, so the UI quietly shows
`dataModel.removeDimension` instead of a label (that is exactly how two bugs shipped).
A **built** key — ``t(`dataInsights.age_${bucket}`)`` — cannot be checked like a literal, so it is
checked by its **static prefix**: the locale must have at least one key starting with it. That is the
cheap half of the problem, and the half that bit: the code asked for `age_minutes` while the locale had
`ageMinutes`, so the reader was shown the key itself.

A **single**-brace placeholder is the quieter twin: `{max}` is not i18next syntax (it wants
`{{max}}`), so the reader sees the literal `{max}` — which is how "Showing the top {max} only."
shipped. Both are checked here.

This checks the files where the namespace is knowable:

- the namespace(s) come from `useTranslation('ns')` / `useTranslation(['a','b'])` in the
  same file; with no call, `defaultNS` (`common`) applies;
- a `t('ns:key')` prefix wins;
- files whose `t` arrives from a hook/props cannot be resolved statically and are skipped;
- plural keys pass when the base key, `<key>_one/_other/_plural/_zero` or the base key
  object exists.

Usage: check-i18n-keys.py [--list]     (--list prints every key that fails)
Exits 1 when a key is missing.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
LOCALES = SRC / "i18n" / "locales"
DEFAULT_NS = "common"

USE_NS = re.compile(r"useTranslation\(\s*(?:\[\s*)?['\"]([\w-]+)['\"]")
USE_CALL = re.compile(r"useTranslation\(([^)]*)\)")
NS_LIST = re.compile(r"['\"]([\w-]+)['\"]")
T_CALL = re.compile(r"\bt\(\s*['\"]([^'\"]+)['\"]")
PLURAL_SUFFIXES = ("_zero", "_one", "_two", "_few", "_many", "_other", "_plural")
#: A single-brace placeholder i18next will not touch (double braces are interpolation).
NOT_INTERPOLATED = re.compile(r"(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})")


def load_locales() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in (LOCALES / "en").glob("*.json"):
        out[path.stem] = json.loads(path.read_text())
    return out


def key_exists(ns_data: dict | None, key: str) -> bool | None:
    """True/False, or None when the namespace itself is unknown (cannot judge)."""
    if ns_data is None:
        return None
    node = ns_data
    for part in key.split("."):
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            parent = node if isinstance(node, dict) else {}
            if any(f"{part}{s}" in parent for s in PLURAL_SUFFIXES):
                return True
            return False
    return True


def namespaces_in(source: str) -> list[str] | str | None:
    """The namespaces this file can resolve against.

    A list when the hook is called with literals, `'any'` when the namespace comes in as a
    prop/variable (unknowable — then a key only fails when it exists in *no* namespace), and
    None when `t` is not from a hook in this file (cannot judge).
    """
    if "useTranslation" not in source:
        return None
    calls = USE_CALL.findall(source)
    literals = USE_NS.findall(source)
    if literals:
        # `useTranslation(['a','b'])` — collect the whole list
        listed = [m for arg in calls for m in NS_LIST.findall(arg)]
        return listed or literals
    if any(call.strip() for call in calls):
        return "any"
    return [DEFAULT_NS]


def offenders() -> list[str]:
    locales = load_locales()
    out: list[str] = []
    for path in sorted(SRC.rglob("*.tsx")):
        source = path.read_text(errors="ignore")
        nss = namespaces_in(source)
        if nss is None:
            continue
        for match in T_CALL.finditer(source):
            raw = match.group(1)
            ns, key = (raw.split(":", 1) + [None])[:2] if ":" in raw else (None, raw)
            if ns:
                candidates = [ns]
            elif nss == "any":
                candidates = list(locales)
            else:
                candidates = nss
            verdicts = [key_exists(locales.get(c or DEFAULT_NS), key) for c in candidates]
            if any(v is True for v in verdicts) or all(v is None for v in verdicts):
                continue
            rel = path.relative_to(ROOT)
            line = source.count("\n", 0, match.start()) + 1
            out.append(f"{rel}:{line}: {key}  (ns: {', '.join(candidates)})")
    return out


def placeholder_offenders() -> list[str]:
    """Locale strings that use `{name}` where i18next needs `{{name}}`.

    Reported per file so the fix is obvious; the key path is what matters, not the source line.
    """
    out: list[str] = []
    for path in sorted(LOCALES.glob("*/*.json")):
        data = json.loads(path.read_text())

        def walk(node, prefix: str = "") -> None:
            if isinstance(node, dict):
                for key, value in node.items():
                    walk(value, f"{prefix}.{key}" if prefix else key)
            elif isinstance(node, str):
                for name in NOT_INTERPOLATED.findall(node):
                    out.append(
                        f"{path.relative_to(ROOT)}: {prefix} uses {{{name}}} — "
                        f"i18next needs {{{{{name}}}}}"
                    )

        walk(data)
    return out


#: `t(`a.b_${x}`)` — a key whose tail comes from data. Matches only backtick literals after `t(`.
BUILT_CALL = re.compile(r"\bt\(\s*`([^`]*\$\{[^`]*)`")


def built_key_offenders() -> list[str]:
    """Built keys whose static prefix matches no key in the locale (English is the source)."""
    locales = load_locales()
    everything: set[str] = set()
    for namespace in locales.values():
        everything |= set(key_paths(namespace))
    out: list[str] = []
    for path in SRC.rglob("*.tsx"):
        if ".test." in path.name:
            continue
        for match in BUILT_CALL.finditer(path.read_text(errors="ignore")):
            literal = match.group(1)
            prefix = literal.split("${", 1)[0]
            if not prefix or " " in prefix or not re.search(r"[a-zA-Z]", prefix):
                continue
            # A prefix with no separator yet (`` `${kind}Title` ``) belongs to a namespace we cannot name.
            if "." not in prefix:
                continue
            if not any(key.startswith(prefix) for key in everything):
                out.append(f"{path.relative_to(ROOT)}: t(`{literal}`) — no key starts with '{prefix}'")
    return out


def key_paths(node, prefix: str = "") -> list[str]:
    """Every key in a namespace, as a flat path."""
    if not isinstance(node, dict):
        return [prefix]
    out: list[str] = []
    for key, value in node.items():
        out.extend(key_paths(value, f"{prefix}.{key}" if prefix else key))
    return out


def main() -> int:
    found = offenders()
    if "--list" in sys.argv or found:
        for line in found:
            print(line)
    if found:
        print(
            f"check-shared-styles: {len(found)} i18n key(s) above are missing from the "
            "locale files — the UI would render the raw key",
            file=sys.stderr,
        )
        return 1

    built = built_key_offenders()
    if built:
        for line in built:
            print(line)
        print(
            f"check-shared-styles: {len(built)} built i18n key(s) above have no matching prefix in the "
            "locale files — the UI would render the built string itself",
            file=sys.stderr,
        )
        return 1

    bad_placeholders = placeholder_offenders()
    if bad_placeholders:
        for line in bad_placeholders:
            print(line)
        print(
            f"check-shared-styles: {len(bad_placeholders)} i18n placeholder(s) would be shown "
            "literally — see the note at the top of this script",
            file=sys.stderr,
        )
        return 1

    print("check-shared-styles: i18n keys OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
