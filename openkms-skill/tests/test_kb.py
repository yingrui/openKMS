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
    cmd_create(argparse.Namespace(kb_id="kb1", question="Q", answer="A"))

    req = recorded[-1]
    assert req.method == "POST"
    assert req.url.path == "/api/knowledge-bases/kb1/faqs"
    assert json.loads(req.content) == {"question": "Q", "answer": "A"}
