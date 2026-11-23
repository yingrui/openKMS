"""Subcommand registration."""
from __future__ import annotations

from argparse import _SubParsersAction

from . import (
    api,
    audit,
    apps,
    article_channels,
    articles,
    comments,
    connectors,
    data_sources,
    datasets,
    document_channels,
    documents,
    evaluation,
    stories,
    glossaries,
    jobs,
    kb,  # registers `knowledge-bases`, with `faqs` nested inside
    knowledge_map,
    kubernetes,
    media,
    metrics,
    rules,  # also registers `metric-events`
    ontology,  # also nests `objects` and `links` under itself
    pipelines,
    ping,
    search,
    semantic_models,
    wiki,
    wiki_spaces,
    workforce,
)


def register(sub: _SubParsersAction) -> None:
    """Register every top-level subcommand with the parent parser."""
    ping.add_subparser(sub)
    api.add_subparser(sub)
    audit.add_subparser(sub)
    apps.add_subparser(sub)
    search.add_subparser(sub)
    document_channels.add_subparser(sub)
    article_channels.add_subparser(sub)
    documents.add_subparser(sub)
    pipelines.add_subparser(sub)
    articles.add_subparser(sub)
    wiki_spaces.add_subparser(sub)
    wiki.add_subparser(sub)
    kb.add_subparser(sub)
    glossaries.add_subparser(sub)
    knowledge_map.add_subparser(sub)
    data_sources.add_subparser(sub)
    datasets.add_subparser(sub)
    connectors.add_subparser(sub)
    jobs.add_subparser(sub)
    kubernetes.add_subparser(sub)
    comments.add_subparser(sub)
    media.add_media_channels_subparser(sub)
    media.add_media_subparser(sub)
    metrics.add_subparser(sub)
    rules.add_metric_rules_subparser(sub)
    rules.add_metric_events_subparser(sub)
    semantic_models.add_subparser(sub)
    ontology.add_subparser(sub)  # exposes `ontology cypher/...`, `ontology objects ...`, `ontology links ...`
    evaluation.add_subparser(sub)
    stories.add_subparser(sub)
    workforce.add_subparser(sub)
