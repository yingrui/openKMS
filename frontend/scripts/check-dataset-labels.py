#!/usr/bin/env python3
"""A dataset's label comes from `datasetLabel()`, not from string-building at the call site.

The same expression — `` `${d.schema_name}.${d.table_name}` ``, usually behind ``d.display_name ||`` — was written in
thirteen places. Every one of them printed **null.null** for a file dataset, which has neither a schema nor a table: the
kind of bug that appears once in a screenshot and is copy-pasted everywhere before anyone sees it.

The helper knows the three shapes (display name → table → source → id). This check keeps call sites honest.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

#: `something.display_name || `${something.schema_name}.${something.table_name}` — the exact composed label.
COMPOSED = re.compile(
    r"\w+(?:\.\w+)*\.display_name\s*(?:\?\.\s*trim\(\)\s*)?\|\|\s*`\$\{\w+(?:\.\w+)*\.schema_name\}"
)


def offenders() -> list[str]:
    out: list[str] = []
    for path in sorted(SRC.rglob("*.ts*")):
        if ".test." in path.name:
            continue
        for match in COMPOSED.finditer(path.read_text(errors="ignore")):
            line = path.read_text(errors="ignore").count("\n", 0, match.start()) + 1
            out.append(f"{path.relative_to(ROOT)}:{line}: composed dataset label — use datasetLabel()")
    return out


def main() -> int:
    found = offenders()
    if found:
        for line in found:
            print(line)
        print(
            f"check-shared-styles: {len(found)} composed dataset label(s) above — use datasetLabel() from "
            "pages/ontology-manager/datasetLabel.ts (it knows a file dataset has no schema.table)",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: dataset labels OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
