#!/usr/bin/env python3
"""Guardrail: interface copy does not use filler words or spoken particles.

This is deliberately **not** a list of technical terms. Words like 网关, 端点 or 接口 are correct in some places and
wrong in others — a credential screen for integrators should say 端点, a model form for operators should not — and no
regex can tell those apart. What belongs here is the opposite kind: words that are unprofessional on *every* screen,
which is why they keep coming back in review.

Three checks, all objective:

1. **Filler and spoken particles** — 搞, 弄, 啥, 呗, 咱们, 一下, 永远, and sentence-final 呢/吧/啊/啦/嘛. They read as
   spoken Chinese, not as interface copy.
2. **Repeated punctuation** — 。。, !!, ??. A typo, but one that ships silently.
3. **Half-width punctuation inside a Chinese sentence** — `,` `!` `?` `;` `:` next to a Chinese character. The rest
   of the product uses full-width; a stray comma looks like a different font.

Words that need context (部署, 网关, 接口, 服务端) are *not* checked here on purpose. A blacklist would ban the correct
uses along with the wrong ones; those belong to review, guided by AGENTS.md's "术语按读者与可操作性判".

Usage: check-i18n-tone.py [--list] [--self-test]
Exits 1 when interface copy contains any of the above. `--self-test` proves the patterns still fire, so a checker
that silently stopped matching is not mistaken for a clean locale.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "i18n" / "locales"

#: Words that are wrong in any interface copy. Each entry: pattern, why.
FILLER: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"搞|弄"), "spoken verb — say what happens (修改 / 处理)"),
    (re.compile(r"啥"), "spoken — use 什么"),
    (re.compile(r"呗|咱们|咋"), "spoken"),
    (re.compile(r"一下"), "spoken softener — say what the action does"),
    (re.compile(r"[^。！？\n](呢|吧|啊|啦|嘛)[。！？]?$"), "sentence-final particle"),
    (re.compile(r"永远"), "overclaim — use 始终 / 不会"),
    (re.compile(r"千万"), "spoken emphasis — drop it"),
]

#: `,` `!` `?` `;` `:` touching a Chinese character.
HALF_WIDTH = re.compile(r"[\u4e00-\u9fff][,;:!?]|[,;:!?][\u4e00-\u9fff]")
REPEATED = re.compile(r"。。|，，|！！|\?\?|；；")

#: Keys whose value is meant to look like code, a path, or a one-word enum: punctuation there is not prose.
SKIP_KEY = re.compile(r"(placeholder|example|pattern|regex|format|code|sql|cypher|json|url|path|suffix|prefix)", re.I)


def strings(path: Path):
    data = json.loads(path.read_text())

    def walk(node, pre=""):
        for key, value in node.items():
            here = f"{pre}{key}"
            if isinstance(value, dict):
                yield from walk(value, f"{here}.")
            elif isinstance(value, str) and not SKIP_KEY.search(here):
                yield here, value

    yield from walk(data)


def offenders() -> list[str]:
    found: list[str] = []
    for path in sorted((LOCALES / "zh-CN").glob("*.json")):
        for key, value in strings(path):
            for pattern, why in FILLER:
                match = pattern.search(value)
                if match:
                    found.append(f"{path.name}:{key}: {match.group(0)!r} — {why} :: {value[:60]}")
            if REPEATED.search(value):
                found.append(f"{path.name}:{key}: repeated punctuation :: {value[:60]}")
            if HALF_WIDTH.search(value):
                found.append(f"{path.name}:{key}: half-width punctuation in Chinese :: {value[:60]}")
    return found


#: (sample, should_fire) — the checker's own canary. Strings a reader would accept must stay silent.
SAMPLES: list[tuple[str, bool]] = [
    ("搞一下这个配置", True),
    ("我们会处理这个配置", False),
    ("「v2」永远指同一批数据", True),
    ("「v2」始终指同一批数据", False),
    ("就这么定了呗。", True),
    ("已保存。", False),
    ("保存成功!", True),
    ("保存成功！", False),
    ("确定吗？", False),
    ("好的。", False),
]


def self_test() -> int:
    """Fail when a sample slips through the patterns, or a good string trips them."""
    failures = []
    for sample, should_fire in SAMPLES:
        fired = any(p.search(sample) for p, _ in FILLER) or bool(REPEATED.search(sample)) or bool(HALF_WIDTH.search(sample))
        if fired != should_fire:
            failures.append(f"  {sample!r}: expected {'fire' if should_fire else 'silence'}")
    if failures:
        print("check-i18n-tone: self-test FAILED", file=sys.stderr)
        for line in failures:
            print(line, file=sys.stderr)
        return 1
    print(f"check-i18n-tone: self-test OK ({len(SAMPLES)} samples)")
    return 0


def main() -> int:
    if "--self-test" in sys.argv and self_test() != 0:
        return 1
    if "--self-test" in sys.argv:
        return 0
    hits = offenders()
    if hits or "--list" in sys.argv:
        for hit in hits:
            print(hit)
    if hits:
        print(
            f"check-i18n-tone: {len(hits)} string(s) above read as spoken Chinese or ship a typo. "
            "Context-dependent terms (部署 / 网关 / 接口) are out of scope on purpose.",
            file=sys.stderr,
        )
        return 1
    print("check-i18n-tone: OK (0 spoken or mistyped strings)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
