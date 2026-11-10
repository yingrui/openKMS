"""Prompt versions: nothing is live until it is published, and publishing needs evidence.

One event loop for the whole module: the engine's pool binds connections to the first loop it sees, and a fresh
`asyncio.run` per test would hand them a closed one ("attached to a different loop").
"""
import asyncio

import pytest
from sqlalchemy import select

from app.database import async_session_maker
from app.models.agent_prompt import STATUS_PUBLISHED, STATUS_RETIRED, AgentPrompt
from app.models.knowledge_base import KnowledgeBase
from app.services.workspace.evaluations import prompt_store
from app.services.workspace.evaluations.prompt_store import (
    DEFAULT_SYSTEM_PROMPT,
    PromptStoreError,
    create_draft,
    list_versions,
    publish,
    resolve_system_prompt,
)

KB = "kb-prompt-test"
KB_NAME = "prompt-store test kb"


@pytest.fixture(scope="module")
def loop():
    from app.database import engine

    loop = asyncio.new_event_loop()
    yield loop
    # Leave the pool as we found it: the engine binds connections to the loop that created them, and other tests call
    # `asyncio.run` per case. Disposing here means they get fresh connections instead of ones tied to this closed loop.
    loop.run_until_complete(engine.dispose())
    loop.close()


async def _cleanup() -> None:
    async with async_session_maker() as db:
        for row in (await db.execute(select(AgentPrompt).where(AgentPrompt.knowledge_base_id == KB))).scalars():
            await db.delete(row)
        kb = await db.get(KnowledgeBase, KB)
        if kb is not None:
            await db.delete(kb)
        await db.commit()


async def _ensure_kb() -> None:
    """The FK is real, so the tests need a real knowledge base — no stub id."""
    async with async_session_maker() as db:
        if await db.get(KnowledgeBase, KB) is None:
            db.add(KnowledgeBase(id=KB, name=KB_NAME))
            await db.commit()


@pytest.fixture(autouse=True)
def clean(loop):
    loop.run_until_complete(_cleanup())
    loop.run_until_complete(_ensure_kb())
    yield
    loop.run_until_complete(_cleanup())


def draft(loop, body: str) -> int:
    async def run() -> int:
        async with async_session_maker() as db:
            row = await create_draft(db, KB, body=body, notes=None, author=None, author_name=None)
            await db.commit()
            return row.version

    return loop.run_until_complete(run())


def publish_version(loop, version: int) -> dict:
    async def run() -> dict:
        async with async_session_maker() as db:
            row = await publish(db, KB, version)
            await db.commit()
            return {"status": row.status, "gate": row.gated_by_run_id}

    return loop.run_until_complete(run())


def resolve(loop) -> tuple[str, str | None]:
    async def run() -> tuple[str, str | None]:
        async with async_session_maker() as db:
            return await resolve_system_prompt(db, KB)

    return loop.run_until_complete(run())


def versions(loop) -> dict[int, str]:
    async def run() -> dict[int, str]:
        async with async_session_maker() as db:
            return {r.version: r.status for r in await list_versions(db, KB)}

    return loop.run_until_complete(run())


@pytest.fixture
def evidence(monkeypatch):
    """Stand in for "an evaluation run was completed after this draft" — the store's only proof of evidence."""

    async def fake_gate(db, kb_id, since):
        return type("Run", (), {"id": "run-1"})()

    monkeypatch.setattr(prompt_store, "latest_run_since", fake_gate)


class TestDrafts:
    def test_no_rows_means_the_code_default(self, loop):
        assert resolve(loop) == (DEFAULT_SYSTEM_PROMPT, None)

    def test_a_draft_does_not_change_what_the_agent_reads(self, loop):
        draft(loop, "Draft text.")
        assert resolve(loop) == (DEFAULT_SYSTEM_PROMPT, None)

    def test_versions_increase_and_are_never_edited_in_place(self, loop):
        assert (draft(loop, "one"), draft(loop, "two")) == (1, 2)

    def test_an_empty_body_is_refused(self, loop):
        async def run():
            async with async_session_maker() as db:
                await create_draft(db, KB, body="   ", notes=None, author=None, author_name=None)

        with pytest.raises(PromptStoreError):
            loop.run_until_complete(run())


class TestPublishGate:
    def test_publishing_without_a_run_is_refused(self, loop):
        version = draft(loop, "Candidate.")
        with pytest.raises(PromptStoreError, match="evaluation run"):
            publish_version(loop, version)

    def test_a_published_version_becomes_what_the_agent_reads(self, loop, evidence):
        version = draft(loop, "Published text.")
        assert publish_version(loop, version) == {"status": STATUS_PUBLISHED, "gate": "run-1"}
        assert resolve(loop) == ("Published text.", f"system@v{version}")

    def test_rollback_is_publishing_an_older_version(self, loop, evidence):
        v1 = draft(loop, "first")
        v2 = draft(loop, "second")
        publish_version(loop, v1)
        publish_version(loop, v2)
        publish_version(loop, v1)
        assert versions(loop) == {1: STATUS_PUBLISHED, 2: STATUS_RETIRED}
        assert resolve(loop)[0] == "first"

    def test_an_unknown_version_is_refused(self, loop):
        with pytest.raises(PromptStoreError, match="does not exist"):
            publish_version(loop, 99)
