"""glossaries — list, terms create, import dry-run."""
from __future__ import annotations

import argparse
import json

import pytest


def test_list(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/glossaries")] = (200, {"items": [], "total": 0})

    from openkms.commands.glossaries import cmd_list

    cmd_list(argparse.Namespace())
    assert recorded[-1].method == "GET"
    assert recorded[-1].url.path == "/api/glossaries"


def test_terms_list_search(mock_api):
    recorded, responses = mock_api
    responses[("GET", "/api/glossaries/g1/terms")] = (
        200,
        {"items": [{"id": "t1", "glossary_id": "g1"}], "total": 1},
    )

    from openkms.commands.glossaries import cmd_terms_list

    cmd_terms_list(argparse.Namespace(glossary_id="g1", search="foo"))
    assert recorded[-1].url.path == "/api/glossaries/g1/terms"
    assert recorded[-1].url.params.get("search") == "foo"


def test_terms_create_yes(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/glossaries/g1/terms")] = (
        201,
        {"id": "t9", "glossary_id": "g1", "primary_en": "x"},
    )

    from openkms.commands.glossaries import cmd_terms_create

    cmd_terms_create(
        argparse.Namespace(
            glossary_id="g1",
            primary_en="x",
            primary_cn="",
            definition="",
            synonyms_en_json="",
            synonyms_cn_json="",
            yes=True,
            dry_run=False,
        )
    )
    assert json.loads(recorded[-1].content) == {"primary_en": "x"}


def test_import_dry_run(mock_api, tmp_path):
    recorded, _ = mock_api
    f = tmp_path / "t.json"
    f.write_text('[{"primary_en":"a","primary_cn":"甲"}]', encoding="utf-8")

    from openkms.commands.glossaries import cmd_import

    with pytest.raises(SystemExit) as ei:
        cmd_import(
            argparse.Namespace(
                glossary_id="g1",
                terms_file=str(f),
                mode="append",
                yes=False,
                dry_run=True,
            )
        )
    assert ei.value.code == 0
    assert not recorded
