"""
End-to-end smoke test for the openkms-skill CLI against a *real* openKMS deployment.

This is NOT a unit test — it actually shells out to `python scripts/cli.py …` and
expects `config.yml` (with `api_base_url` + `api_key`) to be present in the skill
root. The pytest suite next door uses an httpx mock; this file is named `smoke.py`
(no `test_` prefix) so pytest will not collect it.

Usage:
    cd openkms-skill
    python tests/smoke.py                 # run all steps
    python tests/smoke.py 1 5 7           # run only steps #1, #5, #7 (1-indexed)
    OPENKMS_KB_NAME="HSBC Product" python tests/smoke.py

What it covers (each step is independent — failures don't abort the run):
    1.  ping
    2.  search                         -> picks first doc / article id from sections
    3.  document-channels list         -> first channel id
    4.  documents list                 -> first doc id
    5.  documents get   (chain id)
    6.  documents markdown -> /tmp/openkms_smoke/doc_*.md
    7.  article-channels list          -> first channel id
    8.  articles list                  -> first article id
    9.  articles markdown -> /tmp/openkms_smoke/art_*.md
   10.  wiki-spaces list               -> first space id
   11.  wiki list-pages                -> first page path
   12.  wiki get-page  (chain path)
   13.  kb list                        -> KB by name (default "HSBC Product"), else first
   14.  kb get
   15.  kb search   (query from QUESTIONS["kb_search"])
   16.  kb ask      (question from QUESTIONS["kb_ask"])
   17.  kb-faq list
   18.  ontology cypher    (QUESTIONS["cypher"])
   19.  ontology text-to-cypher (QUESTIONS["nl_cypher"])
   20.  ontology ask       (QUESTIONS["ontology_ask"])
   21.  evaluation-datasets list

Outputs:
    - stdout: per-step PASS/FAIL + latency + 1-line summary
    - /tmp/openkms_smoke/*.json  (raw stdout of each command, one file per step)
    - /tmp/openkms_smoke/report.md (human-readable summary table)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SKILL_ROOT = Path(__file__).resolve().parents[1]
CLI        = SKILL_ROOT / "scripts" / "cli.py"
PYTHON     = os.environ.get("OPENKMS_PYTHON", sys.executable)

KB_NAME      = os.environ.get("OPENKMS_KB_NAME", "HSBC Product")
TIMEOUT_FAST = 30   # ping / list / get
TIMEOUT_SLOW = 120  # kb ask / ontology ask (LLM in the loop)

OUT_DIR = Path("/tmp/openkms_smoke")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---- Questions / queries (edit freely) ------------------------------------
QUESTIONS = {
    "search":       "保险",
    "doc_search":   "",                     # leave empty to skip server-side search filter
    "art_search":   "",
    "kb_search":    "既往症 核保",
    "kb_ask":       "客户52岁女性,母亲有乳腺癌史,本人体检发现甲状腺良性结节,投保重疾险时的核保关键点是什么?",
    "cypher":       "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c ORDER BY c DESC LIMIT 10",
    "nl_cypher":    "列出与既往症相关的合规通函",
    "ontology_ask": "与甲状腺结节相关的合规通函有哪些?",
}

# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
class Step:
    def __init__(self, idx: int, name: str):
        self.idx = idx
        self.name = name
        self.ok: bool | None = None
        self.note = ""
        self.dt = 0.0
        self.skipped = False

    def mark(self, ok: bool, note: str = "", skipped: bool = False) -> None:
        self.ok = ok
        self.note = note
        self.skipped = skipped

    def row(self) -> str:
        if self.skipped:
            status = "SKIP"
        elif self.ok is None:
            status = "?"
        elif self.ok:
            status = "PASS"
        else:
            status = "FAIL"
        return f"| {self.idx:>2} | {self.name:<32} | {status:<4} | {self.dt:>5.2f}s | {self.note} |"


def run_cli(*args: str, timeout: int = TIMEOUT_FAST) -> tuple[int, str, str, float]:
    cmd = [PYTHON, str(CLI), *args]
    t0 = time.time()
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, cwd=str(SKILL_ROOT),
        )
        return proc.returncode, proc.stdout, proc.stderr, time.time() - t0
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout after {timeout}s", time.time() - t0


def run_json(step: Step, *args: str, timeout: int = TIMEOUT_FAST):
    """Run a CLI command, save raw stdout, return parsed JSON or None on failure."""
    rc, out, err, dt = run_cli(*args, timeout=timeout)
    step.dt = dt
    raw_path = OUT_DIR / f"{step.idx:02d}_{step.name.replace(' ', '_').replace('/', '_')}.json"
    raw_path.write_text(out or err or "", encoding="utf-8")
    if rc != 0:
        step.mark(False, f"rc={rc} {(err or '').strip()[:120]}")
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError as e:
        step.mark(False, f"non-JSON stdout: {str(e)[:80]}")
        return None


def first_id(payload, *paths: tuple[str, ...]) -> str | None:
    """Try a sequence of dotted-key paths against payload to find an id-like field."""
    for path in paths:
        cur = payload
        ok = True
        for k in path:
            if isinstance(cur, dict) and k in cur:
                cur = cur[k]
            elif isinstance(cur, list) and cur:
                cur = cur[0]
                if isinstance(cur, dict) and k in cur:
                    cur = cur[k]
                else:
                    ok = False
                    break
            else:
                ok = False
                break
        if ok and isinstance(cur, (str, int)):
            return str(cur)
    return None


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------
def main(selected: set[int] | None = None) -> int:
    print(f"=== openkms-skill smoke @ {datetime.now().isoformat(timespec='seconds')} ===")
    print(f"skill root: {SKILL_ROOT}")
    print(f"output dir: {OUT_DIR}")
    print(f"KB name:    {KB_NAME}\n")

    steps: list[Step] = []

    def need(idx: int) -> bool:
        return selected is None or idx in selected

    # State carried across steps
    doc_channel_id: str | None = None
    doc_id: str | None = None
    art_channel_id: str | None = None
    art_id: str | None = None
    space_id: str | None = None
    page_path: str | None = None
    kb_id: str | None = None

    # ---- 1 ping ----------------------------------------------------------
    s = Step(1, "ping"); steps.append(s)
    if need(1):
        data = run_json(s, "ping")
        if data is not None:
            s.mark(True, "ok" if isinstance(data, dict) else f"got {type(data).__name__}")
    else:
        s.mark(True, skipped=True, note="skipped")

    # ---- 2 search --------------------------------------------------------
    s = Step(2, "search"); steps.append(s)
    if need(2):
        data = run_json(s, "search", "--q", QUESTIONS["search"], "--limit", "10")
        if data is not None:
            sections = data.get("sections", []) if isinstance(data, dict) else []
            total = data.get("total") if isinstance(data, dict) else None
            s.mark(True, f"sections={len(sections)} total={total}")
    else:
        s.mark(True, skipped=True)

    # ---- 3 document-channels list ---------------------------------------
    s = Step(3, "document-channels list"); steps.append(s)
    if need(3):
        data = run_json(s, "document-channels", "list")
        if data is not None:
            doc_channel_id = first_id(data, ("items", "id"), ("id",))
            s.mark(True, f"first id={doc_channel_id}")
    else:
        s.mark(True, skipped=True)

    # ---- 4 documents list -----------------------------------------------
    s = Step(4, "documents list"); steps.append(s)
    if need(4):
        args = ["documents", "list", "--limit", "10"]
        if QUESTIONS["doc_search"]:
            args += ["--search", QUESTIONS["doc_search"]]
        data = run_json(s, *args)
        if data is not None:
            doc_id = first_id(data, ("items", "id"), ("id",))
            count = len(data.get("items", [])) if isinstance(data, dict) else 0
            s.mark(True, f"items={count} first id={doc_id}")
    else:
        s.mark(True, skipped=True)

    # ---- 5 documents get -------------------------------------------------
    s = Step(5, "documents get"); steps.append(s)
    if need(5):
        if not doc_id:
            s.mark(False, "no doc_id from step 4", skipped=True)
        else:
            data = run_json(s, "documents", "get", "--id", doc_id)
            if data is not None:
                name = data.get("name") if isinstance(data, dict) else "?"
                has_md = bool(isinstance(data, dict) and data.get("markdown"))
                s.mark(True, f"name={name!r} has_markdown={has_md}")
    else:
        s.mark(True, skipped=True)

    # ---- 6 documents markdown -> file -----------------------------------
    s = Step(6, "documents markdown"); steps.append(s)
    if need(6):
        if not doc_id:
            s.mark(False, "no doc_id", skipped=True)
        else:
            out_md = OUT_DIR / f"doc_{doc_id}.md"
            rc, _out, err, dt = run_cli(
                "documents", "markdown", "--id", doc_id, "--out", str(out_md),
            )
            s.dt = dt
            if rc == 0 and out_md.exists():
                s.mark(True, f"{out_md.name} {out_md.stat().st_size}B")
            else:
                s.mark(False, f"rc={rc} {(err or '').strip()[:120]}")
    else:
        s.mark(True, skipped=True)

    # ---- 7 article-channels list ----------------------------------------
    s = Step(7, "article-channels list"); steps.append(s)
    if need(7):
        data = run_json(s, "article-channels", "list")
        if data is not None:
            art_channel_id = first_id(data, ("items", "id"), ("id",))
            s.mark(True, f"first id={art_channel_id}")
    else:
        s.mark(True, skipped=True)

    # ---- 8 articles list -------------------------------------------------
    s = Step(8, "articles list"); steps.append(s)
    if need(8):
        args = ["articles", "list", "--limit", "10"]
        if QUESTIONS["art_search"]:
            args += ["--search", QUESTIONS["art_search"]]
        data = run_json(s, *args)
        if data is not None:
            art_id = first_id(data, ("items", "id"), ("id",))
            count = len(data.get("items", [])) if isinstance(data, dict) else 0
            s.mark(True, f"items={count} first id={art_id}")
    else:
        s.mark(True, skipped=True)

    # ---- 9 articles markdown ---------------------------------------------
    s = Step(9, "articles markdown"); steps.append(s)
    if need(9):
        if not art_id:
            s.mark(False, "no art_id", skipped=True)
        else:
            out_md = OUT_DIR / f"art_{art_id}.md"
            rc, _out, err, dt = run_cli(
                "articles", "markdown", "--id", art_id, "--out", str(out_md),
            )
            s.dt = dt
            if rc == 0 and out_md.exists():
                s.mark(True, f"{out_md.name} {out_md.stat().st_size}B")
            else:
                s.mark(False, f"rc={rc} {(err or '').strip()[:120]}")
    else:
        s.mark(True, skipped=True)

    # ---- 10 wiki-spaces list --------------------------------------------
    s = Step(10, "wiki-spaces list"); steps.append(s)
    if need(10):
        data = run_json(s, "wiki-spaces", "list")
        if data is not None:
            space_id = first_id(data, ("items", "id"), ("id",))
            s.mark(True, f"first id={space_id}")
    else:
        s.mark(True, skipped=True)

    # ---- 11 wiki list-pages ---------------------------------------------
    s = Step(11, "wiki list-pages"); steps.append(s)
    if need(11):
        if not space_id:
            s.mark(False, "no space_id", skipped=True)
        else:
            data = run_json(s, "wiki", "list-pages", "--space-id", space_id)
            if data is not None:
                page_path = first_id(data, ("items", "path"), ("pages", "path"), ("path",))
                count = (
                    len(data.get("items", []) or data.get("pages", []))
                    if isinstance(data, dict) else 0
                )
                s.mark(True, f"pages={count} first path={page_path!r}")
    else:
        s.mark(True, skipped=True)

    # ---- 12 wiki get-page -----------------------------------------------
    s = Step(12, "wiki get-page"); steps.append(s)
    if need(12):
        if not (space_id and page_path):
            s.mark(False, "missing space_id or page_path", skipped=True)
        else:
            data = run_json(s, "wiki", "get-page",
                            "--space-id", space_id, "--path", page_path)
            if data is not None:
                title = data.get("title") if isinstance(data, dict) else "?"
                s.mark(True, f"title={title!r}")
    else:
        s.mark(True, skipped=True)

    # ---- 13 kb list -> resolve KB ---------------------------------------
    s = Step(13, "kb list"); steps.append(s)
    if need(13):
        data = run_json(s, "kb", "list")
        if data is not None:
            items = data.get("items") if isinstance(data, dict) else (
                data if isinstance(data, list) else []
            )
            for kb in items or []:
                if isinstance(kb, dict) and kb.get("name") == KB_NAME:
                    kb_id = kb.get("id")
                    break
            if not kb_id and items:
                kb_id = items[0].get("id") if isinstance(items[0], dict) else None
            s.mark(kb_id is not None,
                   f"resolved kb_id={kb_id} (target='{KB_NAME}')" if kb_id else "no KB found")
    else:
        s.mark(True, skipped=True)

    # ---- 14 kb get -------------------------------------------------------
    s = Step(14, "kb get"); steps.append(s)
    if need(14):
        if not kb_id:
            s.mark(False, "no kb_id", skipped=True)
        else:
            data = run_json(s, "kb", "get", "--id", kb_id)
            if data is not None:
                stats = data.get("stats") if isinstance(data, dict) else None
                s.mark(True, f"name={data.get('name')!r} stats_keys={list(stats or {})[:3]}")
    else:
        s.mark(True, skipped=True)

    # ---- 15 kb search ----------------------------------------------------
    s = Step(15, "kb search"); steps.append(s)
    if need(15):
        if not kb_id:
            s.mark(False, "no kb_id", skipped=True)
        else:
            data = run_json(
                s, "kb", "search",
                "--id", kb_id, "--q", QUESTIONS["kb_search"], "--limit", "10",
                timeout=TIMEOUT_SLOW,
            )
            if data is not None:
                hits = (
                    data.get("results") or data.get("hits") or data.get("items") or []
                ) if isinstance(data, dict) else []
                s.mark(True, f"hits={len(hits)}")
    else:
        s.mark(True, skipped=True)

    # ---- 16 kb ask -------------------------------------------------------
    s = Step(16, "kb ask"); steps.append(s)
    if need(16):
        if not kb_id:
            s.mark(False, "no kb_id", skipped=True)
        else:
            data = run_json(
                s, "kb", "ask",
                "--id", kb_id, "--question", QUESTIONS["kb_ask"],
                timeout=TIMEOUT_SLOW,
            )
            if data is not None:
                ans = data.get("answer", "") if isinstance(data, dict) else ""
                src = data.get("sources", []) if isinstance(data, dict) else []
                s.mark(bool(ans), f"answer={len(ans)}chars sources={len(src)}")
    else:
        s.mark(True, skipped=True)

    # ---- 17 kb-faq list --------------------------------------------------
    s = Step(17, "kb-faq list"); steps.append(s)
    if need(17):
        if not kb_id:
            s.mark(False, "no kb_id", skipped=True)
        else:
            data = run_json(s, "kb-faq", "list", "--kb-id", kb_id)
            if data is not None:
                items = (
                    data.get("items") or data.get("faqs") or []
                ) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                s.mark(True, f"faqs={len(items)}")
    else:
        s.mark(True, skipped=True)

    # ---- 18 ontology cypher ---------------------------------------------
    s = Step(18, "ontology cypher"); steps.append(s)
    if need(18):
        data = run_json(s, "ontology", "cypher", "--query", QUESTIONS["cypher"],
                        timeout=TIMEOUT_SLOW)
        if data is not None:
            rows = data.get("rows", []) if isinstance(data, dict) else []
            s.mark(True, f"rows={len(rows)}")
    else:
        s.mark(True, skipped=True)

    # ---- 19 ontology text-to-cypher --------------------------------------
    s = Step(19, "ontology text-to-cypher"); steps.append(s)
    if need(19):
        data = run_json(s, "ontology", "text-to-cypher",
                        "--question", QUESTIONS["nl_cypher"], timeout=TIMEOUT_SLOW)
        if data is not None:
            cy = data.get("cypher") if isinstance(data, dict) else None
            s.mark(bool(cy), f"cypher_len={len(cy or '')}")
    else:
        s.mark(True, skipped=True)

    # ---- 20 ontology ask -------------------------------------------------
    s = Step(20, "ontology ask"); steps.append(s)
    if need(20):
        data = run_json(s, "ontology", "ask",
                        "--question", QUESTIONS["ontology_ask"], timeout=TIMEOUT_SLOW)
        if data is not None:
            ans = data.get("answer", "") if isinstance(data, dict) else ""
            rows = data.get("rows", []) if isinstance(data, dict) else []
            s.mark(bool(ans), f"answer={len(ans)}chars rows={len(rows)}")
    else:
        s.mark(True, skipped=True)

    # ---- 21 evaluation-datasets list -------------------------------------
    s = Step(21, "evaluation-datasets list"); steps.append(s)
    if need(21):
        data = run_json(s, "evaluation-datasets", "list")
        if data is not None:
            items = (
                data.get("items") or []
            ) if isinstance(data, dict) else (data if isinstance(data, list) else [])
            s.mark(True, f"datasets={len(items)}")
    else:
        s.mark(True, skipped=True)

    # ---- Print + persist summary ----------------------------------------
    print()
    header = "| #  | command                          | stat | time   | note |"
    sep    = "|----|----------------------------------|------|--------|------|"
    print(header); print(sep)
    for st in steps:
        print(st.row())

    ran  = [st for st in steps if not st.skipped]
    ok   = sum(1 for st in ran if st.ok)
    fail = sum(1 for st in ran if st.ok is False)
    skip = sum(1 for st in steps if st.skipped)
    print(f"\n=== {ok} pass, {fail} fail, {skip} skip ===")

    report = OUT_DIR / "report.md"
    with report.open("w", encoding="utf-8") as f:
        f.write(f"# openkms-skill smoke — {datetime.now().isoformat(timespec='seconds')}\n\n")
        f.write(f"- KB target: `{KB_NAME}`\n")
        f.write(f"- skill root: `{SKILL_ROOT}`\n")
        f.write(f"- raw outputs: `{OUT_DIR}`\n\n")
        f.write(f"**Summary**: {ok} pass, {fail} fail, {skip} skip\n\n")
        f.write(header + "\n" + sep + "\n")
        for st in steps:
            f.write(st.row() + "\n")
    print(f"\nreport: {report}")

    return 0 if fail == 0 else 2


if __name__ == "__main__":
    selected: set[int] | None = None
    if len(sys.argv) > 1:
        try:
            selected = {int(x) for x in sys.argv[1:]}
        except ValueError:
            print("usage: python tests/smoke.py [step-number ...]", file=sys.stderr)
            sys.exit(64)
    sys.exit(main(selected))
