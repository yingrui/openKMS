"""The `SKILL.md` contract: what a workforce skill must satisfy to be published.

Publishing is the moment a package becomes something an agent may install, so these tests check the
two things that would otherwise be discovered in production:

* a draft is allowed to be half-written, but a **release** must have a name that matches the skill,
  a description that says when to use it, and an entrypoint that exists;
* the version number belongs to the registry row, not to the frontmatter.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.api.internal.skills import MAX_SKILL_CHARS, _prompt_payload, skill_prompt
from app.services.workforce.skill_package import (
    MAX_BODY_CHARS,
    MAX_DESCRIPTION_CHARS,
    SKILL_FILE,
    analyse,
    content_hash,
    size_bytes,
    split_frontmatter,
)


def _skill(body: str = "## 何时使用\n\n核对合同。", **frontmatter: str) -> dict[str, str]:
    meta = {"name": "contract-review", "description": "审阅合同条款。需要核对付款与违约条款时使用。"}
    meta.update(frontmatter)
    header = "\n".join(f"{key}: {value}" for key, value in meta.items())
    return {SKILL_FILE: f"---\n{header}\n---\n\n{body}"}


class TestFrontMatter:
    def test_a_file_without_frontmatter_is_body_only(self):
        data, body = split_frontmatter("# 标题\n正文")
        assert data == {}
        assert body == "# 标题\n正文"

    def test_frontmatter_is_separated_from_the_body(self):
        data, body = split_frontmatter("---\nname: x\ndescription: y\n---\n\n正文")
        assert data == {"name": "x", "description": "y"}
        assert body.strip() == "正文"

    def test_invalid_yaml_is_reported_instead_of_raising(self):
        report = analyse({SKILL_FILE: "---\nname: [unclosed\n---\nbody"})
        assert not report.ok
        assert any("YAML" in item for item in report.blocking)


class TestPublishRules:
    def test_a_well_formed_skill_passes(self):
        report = analyse(_skill(), skill_id="contract-review")
        assert report.ok, report.blocking
        assert report.frontmatter is not None
        assert report.frontmatter.description.startswith("审阅合同条款")

    def test_missing_skill_md_blocks(self):
        report = analyse({"notes.md": "x"})
        assert not report.ok
        assert any("SKILL.md" in item for item in report.blocking)

    def test_name_must_equal_the_skill_id(self):
        report = analyse(_skill(name="other-skill"), skill_id="contract-review")
        assert not report.ok
        assert any("name" in item for item in report.blocking)

    def test_description_is_required(self):
        report = analyse({SKILL_FILE: "---\nname: x\n---\nbody"})
        assert not report.ok
        assert any("description" in item for item in report.blocking)

    def test_description_is_capped(self):
        report = analyse(_skill(description="字" * (MAX_DESCRIPTION_CHARS + 1)), skill_id="contract-review")
        assert not report.ok
        assert any("描述" in item for item in report.blocking)

    def test_body_is_capped(self):
        report = analyse(_skill(body="字" * (MAX_BODY_CHARS + 1)), skill_id="contract-review")
        assert not report.ok
        assert any("正文" in item for item in report.blocking)

    def test_entrypoint_must_exist(self):
        files = _skill(entrypoint="scripts/cli.py", subcommands="[check]")
        report = analyse(files, skill_id="contract-review")
        assert not report.ok
        assert any("入口文件不存在" in item for item in report.blocking)

    def test_entrypoint_must_be_python_under_scripts(self):
        files = _skill(entrypoint="bin/cli.sh", subcommands="[check]")
        files["bin/cli.sh"] = "#!/bin/sh"
        report = analyse(files, skill_id="contract-review")
        assert not report.ok
        assert any("scripts/" in item for item in report.blocking)

    def test_entrypoint_without_subcommands_warns_but_publishes(self):
        files = _skill(entrypoint="scripts/cli.py")
        files["scripts/cli.py"] = "print('hi')"
        report = analyse(files, skill_id="contract-review")
        assert report.ok, report.blocking
        assert any("子命令" in item for item in report.warnings)

    def test_paths_cannot_escape_the_skill(self):
        files = _skill()
        files["../secrets.md"] = "x"
        report = analyse(files, skill_id="contract-review")
        assert not report.ok
        assert any("路径不合法" in item for item in report.blocking)

    def test_only_text_and_python_are_allowed(self):
        files = _skill()
        files["assets/logo.png"] = "not really a png"
        report = analyse(files, skill_id="contract-review")
        assert not report.ok
        assert any("不支持的文件类型" in item for item in report.blocking)

    @pytest.mark.parametrize(
        "secret",
        [
            "key = 'sk-abcdefghijklmnopqrstuvwx'",
            "token: ghp_abcdefghijklmnopqrstuvwxyz01",
            "-----BEGIN RSA PRIVATE KEY-----",
            "AKIAIOSFODNN7EXAMPLE",
        ],
    )
    def test_credentials_block_a_publish(self, secret):
        files = _skill()
        files["scripts/cli.py"] = f"# {secret}\nprint('hi')"
        report = analyse(files, skill_id="contract-review")
        assert not report.ok
        assert any("里出现了" in item for item in report.blocking)

    def test_no_files_at_all_blocks(self):
        report = analyse({})
        assert not report.ok


class TestHashing:
    def test_hash_ignores_file_order(self):
        a = {"SKILL.md": "a", "scripts/cli.py": "b"}
        b = {"scripts/cli.py": "b", "SKILL.md": "a"}
        assert content_hash(a) == content_hash(b)

    def test_hash_changes_with_content(self):
        assert content_hash({"SKILL.md": "a"}) != content_hash({"SKILL.md": "b"})

    def test_size_counts_utf8_bytes(self):
        assert size_bytes({"SKILL.md": "中文"}) == 6


class TestRegistryChoice:
    """One route, two registries: the caller names the one its ids came from."""

    def test_an_unknown_registry_is_refused_before_any_lookup(self):
        with pytest.raises(HTTPException) as raised:
            asyncio.run(skill_prompt("somewhere-else", "contract-review", "1", db=None))
        assert raised.value.status_code == 404

    def test_a_long_skill_md_is_truncated_rather_than_refused(self):
        payload = _prompt_payload("contract-review", "合同审阅", "1", "字" * (MAX_SKILL_CHARS + 5))
        assert payload["truncated"] is True
        assert len(payload["content"]) == MAX_SKILL_CHARS
