"""The tool catalogue: one description per tool, and it is the one the model receives.

These tests exist because the screen used to keep its own copy of the capability list and one sentence per capability,
while the model received the full tool descriptions. Two copies, and the screen's was the poorer one.
"""
from __future__ import annotations

from qa_agent.skills import ALL_SKILL_IDS, CORE_SKILL_IDS
from qa_agent.tool_catalog import tool_catalog

CATALOG = tool_catalog()


def _capability(skill_id: str) -> dict:
    return next(item for item in CATALOG["capabilities"] if item["id"] == skill_id)


def test_every_selectable_capability_is_listed_with_its_tools():
    listed = {item["id"] for item in CATALOG["capabilities"]}
    assert set(ALL_SKILL_IDS) <= listed
    for item in CATALOG["capabilities"]:
        assert item["tools"], f"{item['id']} lists no tools"
        assert item["name"]


def test_core_matches_the_runtime_default():
    assert {item["id"] for item in CATALOG["capabilities"] if item["core"]} == set(CORE_SKILL_IDS)


def test_descriptions_are_the_tool_descriptions():
    for item in CATALOG["capabilities"]:
        for tool in item["tools"]:
            assert tool["description"], f"{tool['name']} has no description"
            # Short enough to read in a list, long enough to say what it does and where its limits are.
            # A description is the model's only briefing at call time: what it does, when to use it, what it returns.
            # Short ones were 60–90 characters and said only what the tool was called.
            assert 150 <= len(tool["description"]) <= 600, (tool["name"], len(tool["description"]))
            assert tool["parameters"] is not None


def test_code_execution_carries_its_policy():
    env = _capability("code_execution")
    assert [t["name"] for t in env["tools"]] == ["run_python", "run_command"]
    policy = env["policy"]
    allow = policy["allowlist"]
    # Inspection only: programs that start other programs or change files at any path are added per agent, not by default.
    assert "cat" in allow["builtin_allow"]
    assert "python" not in allow["builtin_allow"]
    assert "rm" not in allow["builtin_allow"]
    assert "curl" not in allow["builtin_allow"]
    assert policy["writable"] == "out/"
    assert allow["additive"] is True
    assert policy["timeout_seconds"] > 0


def test_the_allow_list_names_the_one_tool_it_constrains():
    """`run_python` runs code, not a command line: the allow list cannot constrain it, so the catalogue says which
    tool it does constrain rather than implying it covers the capability."""
    allow = _capability("code_execution")["policy"]["allowlist"]
    assert allow["tools"] == ["run_command"]


def test_no_capability_ships_prose_of_its_own():
    """A capability is its tools. A hand-written paragraph per capability used to ride along and drift from them."""
    for item in CATALOG["capabilities"]:
        assert "prompt" not in item
        assert "description" not in item


def test_every_capability_sits_in_a_known_group_and_says_what_it_is_for():
    groups = [group["id"] for group in CATALOG["groups"]]
    assert groups == ["retrieval", "documents", "data", "files", "runtime"]
    for capability in CATALOG["capabilities"]:
        assert capability["group"] in groups, capability["id"]
        assert capability.get("summary"), f"{capability['id']} has no summary"
        assert capability["requires"] is not None


def test_capabilities_are_ordered_by_group_then_core():
    """"The screen must not invent an order: the runtime's order is the order."""
    order = {group["id"]: index for index, group in enumerate(CATALOG["groups"])}
    keys = [(order[c["group"]], not c["core"]) for c in CATALOG["capabilities"]]
    assert keys == sorted(keys)


def test_only_code_execution_carries_a_policy():
    with_policy = [c["id"] for c in CATALOG["capabilities"] if "policy" in c]
    assert with_policy == ["code_execution"]


def test_descriptions_are_not_shown_with_their_source_indentation():
    """A docstring's folded lines are joined; only paragraph breaks survive, so a paragraph does not arrive with a
    ragged four-space gutter down its left side."""
    for capability in CATALOG["capabilities"]:
        for tool in capability["tools"]:
            assert "\n    " not in tool["description"], tool["name"]


class TestToolLedger:
    """`agent_tools` is the ledger: a capability maps to "all" or to an explicit list of tool ids."""

    def test_all_means_every_tool_the_capability_has_today(self):
        from qa_agent.skills import tools_for

        names = [t.name for t in tools_for({"catalog": "all"})]
        assert names == [
            "get_semantic_model",
            "query_semantic_model",
            "run_sql",
        ]

    def test_a_list_narrows_to_the_tools_named(self):
        from qa_agent.skills import tools_for

        # "shell but not python" — the case a capability-level switch cannot express.
        assert [t.name for t in tools_for({"code_execution": ["exec.shell"]})] == ["run_command"]

    def test_a_missing_capability_is_off(self):
        from qa_agent.skills import tools_for

        names = [t.name for t in tools_for({"catalog": "all"})]
        assert "run_python" not in names

    def test_an_unknown_id_is_ignored_rather_than_fatal(self):
        from qa_agent.skills import tools_for

        assert [t.name for t in tools_for({"catalog": ["catalog.query", "catalog.gone"]})] == [
            "query_semantic_model"
        ]

    def test_an_empty_ledger_falls_back_to_the_core_capabilities(self):
        from qa_agent.skills import tools_for

        names = [t.name for t in tools_for({})]
        assert "run_cypher" in names
        assert "run_python" not in names


def test_every_parameter_says_what_it_is():
    """A tool name and a type are not enough: `model_id` could be anything until someone says where it comes from."""
    missing = [
        f"{tool['name']}.{name}"
        for capability in CATALOG["capabilities"]
        for tool in capability["tools"]
        for name, schema in (tool["parameters"].get("properties") or {}).items()
        if not schema.get("description")
    ]
    assert missing == []


def test_retrieval_is_two_capabilities_not_one():
    """Searching our own documents and calling the internet are one kind of act and two different boundaries: a single
    switch would let "search the knowledge base" also mean "reach the web"."""
    ids = {capability["id"] for capability in CATALOG["capabilities"]}
    assert {"knowledge_search", "web_search"} <= ids
    for capability_id in ("knowledge_search", "web_search"):
        assert _capability(capability_id)["group"] == "retrieval"
    # Reading our own corpus is what a knowledge service does by default; reaching the internet is not.
    assert _capability("knowledge_search")["core"] is True
    assert _capability("web_search")["core"] is False


def test_the_request_carries_every_field_the_answer_path_reads():
    """A schema that drops a field does not fail a unit test — it silently stops sending it. The answer path reads
    these by name, so the request must keep them."""
    from qa_agent.schemas import AskRequest

    fields = set(AskRequest.model_fields)
    assert {
        "agent_tools",
        "agent_config",
        "installed_skills",
        "skills_registry",
        "agent_name",
        "agent_description",
        "system_prompt",
        "prompt_version",
    } <= fields
