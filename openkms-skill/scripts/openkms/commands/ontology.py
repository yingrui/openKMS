"""ontology — Cypher exec / text-to-cypher / answer / ask (NL chain). All new."""
from __future__ import annotations

import argparse
import json
import sys

from ..client import client
from .._io import print_json


def cmd_cypher(ns: argparse.Namespace) -> None:
    body = {"cypher": ns.query}
    with client() as s:
        r = s.post("/api/ontology/explore", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_text_to_cypher(ns: argparse.Namespace) -> None:
    body = {"question": ns.question}
    with client() as s:
        r = s.post("/api/ontology/text-to-cypher", json=body)
    r.raise_for_status()
    print_json(r.json())


def _parse_json_arg(label: str, value: str) -> object:
    try:
        return json.loads(value)
    except json.JSONDecodeError as e:
        print(f"--{label}: invalid JSON ({e})", file=sys.stderr)
        sys.exit(2)


def cmd_answer(ns: argparse.Namespace) -> None:
    body = {
        "question": ns.question,
        "cypher": ns.cypher,
        "columns": _parse_json_arg("columns-json", ns.columns_json),
        "rows": _parse_json_arg("rows-json", ns.rows_json),
    }
    with client() as s:
        r = s.post("/api/ontology/answer", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ask(ns: argparse.Namespace) -> None:
    """Convenience: text-to-cypher → explore → answer, all in one shot."""
    with client() as s:
        ttc = s.post("/api/ontology/text-to-cypher", json={"question": ns.question})
        ttc.raise_for_status()
        ttc_data = ttc.json()
        cypher = ttc_data["cypher"]
        explanation = ttc_data.get("explanation", "")

        ex = s.post("/api/ontology/explore", json={"cypher": cypher})
        ex.raise_for_status()
        ex_data = ex.json()
        columns = ex_data.get("columns", [])
        rows = ex_data.get("rows", [])

        ans = s.post(
            "/api/ontology/answer",
            json={
                "question": ns.question,
                "cypher": cypher,
                "columns": columns,
                "rows": rows,
            },
        )
        ans.raise_for_status()
        ans_data = ans.json()

    print_json({
        "question": ns.question,
        "cypher": cypher,
        "explanation": explanation,
        "columns": columns,
        "rows": rows,
        "answer": ans_data.get("answer", ""),
    })


def add_subparser(sub) -> None:
    p = sub.add_parser("ontology", help="Ontology graph queries (Cypher + NL)")
    sp = p.add_subparsers(dest="ont_cmd", required=True)

    cy = sp.add_parser("cypher", help="Run a read-only Cypher query (POST /api/ontology/explore)")
    cy.add_argument("--query", required=True, help='e.g. "MATCH (n) RETURN n LIMIT 10"')
    cy.set_defaults(fn=cmd_cypher)

    ttc = sp.add_parser(
        "text-to-cypher",
        help="Convert NL question to Cypher (POST /api/ontology/text-to-cypher)",
    )
    ttc.add_argument("--question", required=True)
    ttc.set_defaults(fn=cmd_text_to_cypher)

    an = sp.add_parser("answer", help="Summarize Cypher results in NL (POST /api/ontology/answer)")
    an.add_argument("--question", required=True)
    an.add_argument("--cypher", required=True)
    an.add_argument("--columns-json", required=True, help='JSON array, e.g. \'["name","age"]\'')
    an.add_argument("--rows-json", required=True, help='JSON array of row objects')
    an.set_defaults(fn=cmd_answer)

    ask = sp.add_parser(
        "ask",
        help="Convenience: NL question → Cypher → results → NL answer (3-call chain)",
    )
    ask.add_argument("--question", required=True)
    ask.set_defaults(fn=cmd_ask)
