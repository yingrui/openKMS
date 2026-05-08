"""ontology — cypher / text-to-cypher / answer / ask (3-call chain)."""
from __future__ import annotations

import argparse
import json


def test_ontology_cypher(mock_api):
    recorded, _ = mock_api

    from openkms.commands.ontology import cmd_cypher
    cmd_cypher(argparse.Namespace(query="MATCH (n) RETURN n LIMIT 1"))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/ontology/explore"
    assert json.loads(req.content) == {"cypher": "MATCH (n) RETURN n LIMIT 1"}


def test_ontology_answer_parses_json_args(mock_api):
    recorded, _ = mock_api

    from openkms.commands.ontology import cmd_answer
    cmd_answer(argparse.Namespace(
        question="Q",
        cypher="MATCH (n) RETURN n.name",
        columns_json='["name"]',
        rows_json='[{"name": "Alice"}]',
    ))

    body = json.loads(recorded[-1].content)
    assert body == {
        "question": "Q",
        "cypher": "MATCH (n) RETURN n.name",
        "columns": ["name"],
        "rows": [{"name": "Alice"}],
    }


def test_ontology_ask_chains_three_calls(mock_api, capsys):
    recorded, responses = mock_api
    responses[("POST", "/api/ontology/text-to-cypher")] = (
        200, {"cypher": "MATCH (n) RETURN n", "explanation": "find all"},
    )
    responses[("POST", "/api/ontology/explore")] = (
        200, {"columns": ["n"], "rows": [{"n": {"id": 1}}]},
    )
    responses[("POST", "/api/ontology/answer")] = (
        200, {"answer": "There is 1 node."},
    )

    from openkms.commands.ontology import cmd_ask
    cmd_ask(argparse.Namespace(question="how many nodes?"))

    paths = [r.url.path for r in recorded[-3:]]
    assert paths == [
        "/api/ontology/text-to-cypher",
        "/api/ontology/explore",
        "/api/ontology/answer",
    ]
    # Final answer body forwards the cypher and rows from prior calls.
    final_body = json.loads(recorded[-1].content)
    assert final_body["cypher"] == "MATCH (n) RETURN n"
    assert final_body["rows"] == [{"n": {"id": 1}}]

    # Output is the merged JSON envelope.
    out = json.loads(capsys.readouterr().out)
    assert out["question"] == "how many nodes?"
    assert out["cypher"] == "MATCH (n) RETURN n"
    assert out["explanation"] == "find all"
    assert out["answer"] == "There is 1 node."
