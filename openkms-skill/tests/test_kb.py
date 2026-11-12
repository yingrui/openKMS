"""kb — list/get/search/ask + kb-faq list/create."""
from __future__ import annotations

import argparse
import json


def test_kb_list(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_list
    cmd_list(argparse.Namespace())

    assert recorded[-1].url.path == "/api/knowledge-bases"


def test_kb_search_body(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_search
    cmd_search(argparse.Namespace(id="kb1", q="breast cancer", limit=5))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/search"
    body = json.loads(req.content)
    assert body == {"query": "breast cancer", "top_k": 5}


def test_kb_ask_body(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_ask
    cmd_ask(argparse.Namespace(id="kb1", question="what is X?"))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/ask"
    assert json.loads(req.content) == {"question": "what is X?"}


def test_kb_wiki_spaces_list(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_wiki_spaces_list
    cmd_wiki_spaces_list(argparse.Namespace(kb_id="kb1"))

    req = recorded[-1]
    assert req.method == "GET"
    assert req.url.path == "/api/knowledge-bases/kb1/wiki-spaces"


def test_kb_wiki_spaces_reindex(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_wiki_spaces_reindex
    cmd_wiki_spaces_reindex(
        argparse.Namespace(kb_id="kb1", space_id="ws9", yes=True, dry_run=False)
    )

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/wiki-spaces/ws9/index-job"


def test_kb_index_job(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb import cmd_index
    cmd_index(argparse.Namespace(id="kb1", yes=True, dry_run=False))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/index-job"


def test_kb_faq_list_pagination(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb_faq import cmd_list
    cmd_list(argparse.Namespace(kb_id="kb1", limit=50, offset=0))

    req = recorded[-1]
    assert req.url.path == "/api/knowledge-bases/kb1/faqs"
    assert req.url.params["limit"] == "50"


def test_kb_faq_create(mock_api):
    recorded, _ = mock_api

    from openkms.commands.kb_faq import cmd_create
    cmd_create(argparse.Namespace(kb_id="kb1", question="Q", answer="A", yes=True, dry_run=False))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/faqs"
    assert json.loads(req.content) == {"question": "Q", "answer": "A"}


def test_kb_create_links_wiki_space_model_and_group(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/knowledge-bases")] = (201, {"id": "kb1", "name": "分货知识库"})
    responses[("POST", "/api/knowledge-bases/kb1/wiki-spaces")] = (201, {"id": "link1"})
    responses[("POST", "/api/knowledge-bases/kb1/semantic-models")] = (201, {"id": "link2"})
    responses[("POST", "/api/knowledge-bases/kb1/ontology-groups")] = (201, {"id": "link3"})

    from openkms.commands.kb import cmd_create

    cmd_create(
        argparse.Namespace(
            name="分货知识库",
            description="demo",
            embedding_model_id="model_1",
            judge_model_id=None,
            wiki_space_ids_json='["ws1"]',
            semantic_model_ids_json='["sm1"]',
            ontology_group_ids_json='["og1"]',
            yes=True,
            dry_run=False,
        )
    )

    paths = [req.url.path for req in recorded]
    assert paths == [
        "/api/knowledge-bases",
        "/api/knowledge-bases/kb1/wiki-spaces",
        "/api/knowledge-bases/kb1/semantic-models",
        "/api/knowledge-bases/kb1/ontology-groups",
    ]
    assert json.loads(recorded[0].content)["embedding_model_id"] == "model_1"
    assert json.loads(recorded[1].content) == {"wiki_space_id": "ws1"}
    assert json.loads(recorded[2].content) == {"semantic_model_id": "sm1"}
    assert json.loads(recorded[3].content) == {"ontology_group_id": "og1"}


def test_kb_create_rejects_a_non_array_id_flag(mock_api):
    from openkms.commands.kb import cmd_create

    try:
        cmd_create(
            argparse.Namespace(
                name="x",
                description="",
                embedding_model_id=None,
                judge_model_id=None,
                wiki_space_ids_json='"ws1"',
                semantic_model_ids_json=None,
                ontology_group_ids_json=None,
                yes=True,
                dry_run=False,
            )
        )
    except SystemExit as exc:
        assert exc.code == 2
    else:
        raise AssertionError("expected SystemExit for a non-array --wiki-space-ids-json")


def test_kb_delete(mock_api):
    recorded, responses = mock_api
    responses[("DELETE", "/api/knowledge-bases/kb1")] = (204, None)

    from openkms.commands.kb import cmd_delete

    cmd_delete(argparse.Namespace(id="kb1", yes=True, dry_run=False))
    assert recorded[-1].method == "DELETE"
    assert recorded[-1].url.path == "/api/knowledge-bases/kb1"


def test_kb_semantic_model_add(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/knowledge-bases/kb1/semantic-models")] = (201, {"id": "l1"})

    from openkms.commands.kb import cmd_semantic_models_add

    cmd_semantic_models_add(
        argparse.Namespace(kb_id="kb1", semantic_model_id="sm1", yes=True, dry_run=False)
    )
    assert recorded[-1].url.path == "/api/knowledge-bases/kb1/semantic-models"
    assert json.loads(recorded[-1].content) == {"semantic_model_id": "sm1"}


def test_kb_ontology_group_add(mock_api):
    recorded, responses = mock_api
    responses[("POST", "/api/knowledge-bases/kb1/ontology-groups")] = (201, {"id": "l1"})

    from openkms.commands.kb import cmd_ontology_groups_add

    cmd_ontology_groups_add(
        argparse.Namespace(kb_id="kb1", ontology_group_id="og1", yes=True, dry_run=False)
    )
    assert recorded[-1].url.path == "/api/knowledge-bases/kb1/ontology-groups"
    assert json.loads(recorded[-1].content) == {"ontology_group_id": "og1"}
