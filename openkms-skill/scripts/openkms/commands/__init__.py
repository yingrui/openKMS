"""Subcommand registration."""
from __future__ import annotations

from argparse import _SubParsersAction

from . import (
    article_channels,
    articles,
    document_channels,
    documents,
    evaluation,
    kb,
    kb_faq,
    ontology,  # also nests `objects` and `links` under itself
    ping,
    search,
    wiki,
    wiki_spaces,
)


def register(sub: _SubParsersAction) -> None:
    """Register every top-level subcommand with the parent parser."""
    ping.add_subparser(sub)
    search.add_subparser(sub)
    document_channels.add_subparser(sub)
    article_channels.add_subparser(sub)
    documents.add_subparser(sub)
    articles.add_subparser(sub)
    wiki_spaces.add_subparser(sub)
    wiki.add_subparser(sub)
    kb.add_subparser(sub)
    kb_faq.add_subparser(sub)
    ontology.add_subparser(sub)  # exposes `ontology cypher/...`, `ontology objects ...`, `ontology links ...`
    evaluation.add_subparser(sub)
