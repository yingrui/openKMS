"""kb — knowledge bases: list / get / create / search / ask / wiki-spaces / semantic-models /
ontology-groups / index."""
from __future__ import annotations

import argparse
import json
import sys

from .._confirm import add_write_flags, confirm_or_abort
from ..client import client
from .._io import print_json


def cmd_list(_: argparse.Namespace) -> None:
    with client() as s:
        r = s.get("/api/knowledge-bases")
    r.raise_for_status()
    print_json(r.json())


def cmd_get(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.id}")
    r.raise_for_status()
    print_json(r.json())


def _ids(raw: str | None, flag: str) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        print(f"{flag} must be a JSON array of ids", file=sys.stderr)
        sys.exit(2)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        print(f"{flag} must be a JSON array of strings", file=sys.stderr)
        sys.exit(2)
    return value


def cmd_create(ns: argparse.Namespace) -> None:
    body: dict[str, object] = {"name": ns.name}
    if ns.description:
        body["description"] = ns.description
    if ns.embedding_model_id:
        body["embedding_model_id"] = ns.embedding_model_id
    if ns.judge_model_id:
        body["judge_model_id"] = ns.judge_model_id
    confirm_or_abort("create knowledge base", "POST", "/api/knowledge-bases", body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post("/api/knowledge-bases", json=body)
        r.raise_for_status()
        kb = r.json()
        links = (
            ("wiki-spaces", "wiki_space_ids_json", "wiki_space_id"),
            ("semantic-models", "semantic_model_ids_json", "semantic_model_id"),
            ("ontology-groups", "ontology_group_ids_json", "ontology_group_id"),
        )
        for endpoint, attr, key in links:
            for item_id in _ids(getattr(ns, attr), f"--{attr.replace('_', '-')}"):
                lr = s.post(f"/api/knowledge-bases/{kb['id']}/{endpoint}", json={key: item_id})
                lr.raise_for_status()
    print_json(kb)


def cmd_delete(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.id}"
    confirm_or_abort("delete knowledge base", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"deleted knowledge base {ns.id}")


def cmd_semantic_models_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.kb_id}/semantic-models")
    r.raise_for_status()
    print_json(r.json())


def cmd_semantic_models_add(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/semantic-models"
    body = {"semantic_model_id": ns.semantic_model_id}
    confirm_or_abort("link semantic model", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_semantic_models_delete(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/semantic-models/{ns.semantic_model_id}"
    confirm_or_abort("unlink semantic model", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"unlinked semantic model {ns.semantic_model_id} from KB {ns.kb_id}")


def cmd_ontology_groups_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.kb_id}/ontology-groups")
    r.raise_for_status()
    print_json(r.json())


def cmd_ontology_groups_add(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/ontology-groups"
    body = {"ontology_group_id": ns.ontology_group_id}
    confirm_or_abort("link ontology group", "POST", path, body, ns.yes, ns.dry_run)
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ontology_groups_delete(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/ontology-groups/{ns.ontology_group_id}"
    confirm_or_abort("unlink ontology group", "DELETE", path, None, ns.yes, ns.dry_run)
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"unlinked ontology group {ns.ontology_group_id} from KB {ns.kb_id}")


def cmd_search(ns: argparse.Namespace) -> None:
    body: dict[str, object] = {"query": ns.q}
    if ns.limit:
        body["top_k"] = ns.limit
    with client() as s:
        r = s.post(f"/api/knowledge-bases/{ns.id}/search", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_ask(ns: argparse.Namespace) -> None:
    body = {"question": ns.question}
    with client() as s:
        r = s.post(f"/api/knowledge-bases/{ns.id}/ask", json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_list(ns: argparse.Namespace) -> None:
    with client() as s:
        r = s.get(f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces")
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_reindex(ns: argparse.Namespace) -> None:
    path = (
        f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces/{ns.space_id}/index-job"
    )
    confirm_or_abort(
        "queue KB wiki-space reindex",
        "POST",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_link(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces"
    body = {"wiki_space_id": ns.space_id}
    confirm_or_abort(
        "link wiki space to KB",
        "POST",
        path,
        body,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path, json=body)
    r.raise_for_status()
    print_json(r.json())


def cmd_wiki_spaces_unlink(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.kb_id}/wiki-spaces/{ns.space_id}"
    confirm_or_abort(
        "unlink wiki space from KB",
        "DELETE",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.delete(path)
    r.raise_for_status()
    print(f"unlinked wiki space {ns.space_id} from KB {ns.kb_id}")


def cmd_index(ns: argparse.Namespace) -> None:
    path = f"/api/knowledge-bases/{ns.id}/index-job"
    confirm_or_abort(
        "queue full KB reindex",
        "POST",
        path,
        None,
        ns.yes,
        ns.dry_run,
    )
    with client() as s:
        r = s.post(path)
    r.raise_for_status()
    print_json(r.json())


def add_subparser(sub) -> None:
    p = sub.add_parser("kb", help="Knowledge bases")
    sp = p.add_subparsers(dest="kb_cmd", required=True)

    sp.add_parser("list", help="List KBs (GET /api/knowledge-bases)").set_defaults(fn=cmd_list)

    cr = sp.add_parser(
        "create",
        help="Create a KB (POST /api/knowledge-bases), optionally linking wiki spaces / models / groups",
    )
    cr.add_argument("--name", required=True)
    cr.add_argument("--description", default="")
    cr.add_argument("--wiki-space-ids-json", default=None, help="JSON array of wiki space ids")
    cr.add_argument("--semantic-model-ids-json", default=None, help='JSON array of model ids')
    cr.add_argument("--ontology-group-ids-json", default=None, help='JSON array of group ids')
    cr.add_argument("--embedding-model-id", default=None, help="Embedding model (required before indexing)")
    cr.add_argument("--judge-model-id", default=None, help="Optional judge model")
    add_write_flags(cr)
    cr.set_defaults(fn=cmd_create)

    dl = sp.add_parser("delete", help="Delete a knowledge base (DELETE /api/knowledge-bases/{id})")
    dl.add_argument("--id", required=True)
    add_write_flags(dl)
    dl.set_defaults(fn=cmd_delete)

    g = sp.add_parser("get", help="Get KB with stats (GET /api/knowledge-bases/{id})")
    g.add_argument("--id", required=True)
    g.set_defaults(fn=cmd_get)

    se = sp.add_parser("search", help="Semantic search over chunks + FAQs (POST .../search)")
    se.add_argument("--id", required=True)
    se.add_argument("--q", required=True, help="Query string")
    se.add_argument("--limit", type=int, default=0)
    se.set_defaults(fn=cmd_search)

    a = sp.add_parser("ask", help="Ask the QA agent for a grounded answer (POST .../ask)")
    a.add_argument("--id", required=True)
    a.add_argument("--question", required=True)
    a.set_defaults(fn=cmd_ask)

    idx = sp.add_parser(
        "index",
        help="Queue full KB reindex — documents, linked wiki spaces, FAQ embeddings (POST .../index-job)",
    )
    idx.add_argument("--id", required=True, help="Knowledge base id")
    add_write_flags(idx)
    idx.set_defaults(fn=cmd_index)

    ws = sp.add_parser("wiki-spaces", help="Wiki spaces linked to a knowledge base")
    wsp = ws.add_subparsers(dest="kb_wiki_spaces_cmd", required=True)

    wsl = wsp.add_parser(
        "list",
        help="List wiki spaces linked to a KB (GET .../wiki-spaces)",
    )
    wsl.add_argument("--kb-id", required=True, help="Knowledge base id")
    wsl.set_defaults(fn=cmd_wiki_spaces_list)

    wsr = wsp.add_parser(
        "reindex",
        help=(
            "Re-index wiki pages from one linked space into the KB "
            "(POST .../wiki-spaces/{space_id}/index-job); replaces that space's wiki chunks"
        ),
    )
    wsr.add_argument("--kb-id", required=True, help="Knowledge base id")
    wsr.add_argument("--space-id", required=True, help="Linked wiki space id")
    add_write_flags(wsr)
    wsr.set_defaults(fn=cmd_wiki_spaces_reindex)

    wslk = wsp.add_parser("link", help="Link a wiki space to KB (POST .../wiki-spaces)")
    wslk.add_argument("--kb-id", required=True)
    wslk.add_argument("--space-id", required=True)
    add_write_flags(wslk)
    wslk.set_defaults(fn=cmd_wiki_spaces_link)

    wsul = wsp.add_parser(
        "unlink",
        help="Unlink wiki space and drop its wiki chunks from the KB",
    )
    wsul.add_argument("--kb-id", required=True)
    wsul.add_argument("--space-id", required=True)
    add_write_flags(wsul)
    wsul.set_defaults(fn=cmd_wiki_spaces_unlink)

    sm = sp.add_parser("semantic-models", help="Semantic models linked to a knowledge base")
    smp = sm.add_subparsers(dest="kb_semantic_models_cmd", required=True)
    sml = smp.add_parser("list", help="List linked semantic models (GET .../semantic-models)")
    sml.add_argument("--kb-id", required=True)
    sml.set_defaults(fn=cmd_semantic_models_list)
    sma = smp.add_parser("add", help="Link a semantic model (POST .../semantic-models)")
    sma.add_argument("--kb-id", required=True)
    sma.add_argument("--semantic-model-id", required=True)
    add_write_flags(sma)
    sma.set_defaults(fn=cmd_semantic_models_add)
    smd = smp.add_parser("delete", help="Unlink a semantic model (DELETE .../semantic-models/{id})")
    smd.add_argument("--kb-id", required=True)
    smd.add_argument("--semantic-model-id", required=True)
    add_write_flags(smd)
    smd.set_defaults(fn=cmd_semantic_models_delete)

    og = sp.add_parser("ontology-groups", help="Ontology groups linked to a knowledge base")
    ogp = og.add_subparsers(dest="kb_ontology_groups_cmd", required=True)
    ogl = ogp.add_parser("list", help="List linked ontology groups (GET .../ontology-groups)")
    ogl.add_argument("--kb-id", required=True)
    ogl.set_defaults(fn=cmd_ontology_groups_list)
    oga = ogp.add_parser("add", help="Link an ontology group (POST .../ontology-groups)")
    oga.add_argument("--kb-id", required=True)
    oga.add_argument("--ontology-group-id", required=True)
    add_write_flags(oga)
    oga.set_defaults(fn=cmd_ontology_groups_add)
    ogd = ogp.add_parser("delete", help="Unlink an ontology group (DELETE .../ontology-groups/{id})")
    ogd.add_argument("--kb-id", required=True)
    ogd.add_argument("--ontology-group-id", required=True)
    add_write_flags(ogd)
    ogd.set_defaults(fn=cmd_ontology_groups_delete)
