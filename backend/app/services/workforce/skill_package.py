"""Reading, validating and hashing a workforce skill's file tree.

A skill is `SKILL.md` plus whatever it references. `SKILL.md` starts with a YAML frontmatter block
that the product reads and edits as a form:

```markdown
---
name: contract-review
description: 审阅合同条款并比对模板。需要在合同中核对付款、违约、管辖条款时使用。
entrypoint: scripts/cli.py
subcommands: [check, diff]
---

## 何时使用
...
```

Two rules hold everything else together:

- **`description` is the only text that is always in the prompt**, so it must say *when* to use the
  skill, and it is capped. The body is read on demand, so it can be long — but not unbounded.
- **The registry owns the version number.** The frontmatter does not declare one; a second copy of
  "which version is this" drifts from the row the moment someone edits a draft.

See `docs/features/workforce.md`.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

import yaml

SKILL_FILE = "SKILL.md"

#: Suffixes the editor accepts. A skill is prose and Python; anything else needs a decision first.
ALLOWED_SUFFIXES = (".md", ".py", ".txt", ".json", ".yaml", ".yml")

MAX_FILES = 40
MAX_FILE_BYTES = 50 * 1024
MAX_TOTAL_BYTES = 200 * 1024
MAX_DESCRIPTION_CHARS = 300
MAX_BODY_CHARS = 8000

#: Shapes that are almost never a mistake — a skill is shared with every agent that installs it.
_SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("an API key", re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}")),
    ("a GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{16,}")),
    ("an AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
)

_PATH_RE = re.compile(r"^[A-Za-z0-9._-][A-Za-z0-9._/\-]*$")


@dataclass(frozen=True, slots=True)
class SkillFrontMatter:
    name: str
    description: str
    entrypoint: str | None = None
    subcommands: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SkillReport:
    """What the editor's validation bar shows, and what publishing refuses on."""

    frontmatter: SkillFrontMatter | None
    blocking: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.blocking


def split_frontmatter(text: str) -> tuple[dict, str]:
    """Return `(frontmatter, body)`. A file without frontmatter yields `({}, text)`."""
    stripped = text.lstrip("\ufeff")
    if not stripped.startswith("---"):
        return {}, stripped
    lines = stripped.split("\n")
    for index in range(1, len(lines)):
        if lines[index].strip() in {"---", "..."}:
            raw = "\n".join(lines[1:index])
            body = "\n".join(lines[index + 1 :])
            try:
                parsed = yaml.safe_load(raw) or {}
            except yaml.YAMLError:
                return {"__unparsed__": raw}, body
            return (parsed if isinstance(parsed, dict) else {}), body
    return {}, stripped


def _read_frontmatter(files: dict[str, str]) -> tuple[SkillFrontMatter | None, list[str]]:
    text = files.get(SKILL_FILE)
    if text is None:
        return None, ["缺少 SKILL.md / SKILL.md is missing"]
    data, _ = split_frontmatter(text)
    if "__unparsed__" in data:
        return None, ["SKILL.md 的 frontmatter 不是合法的 YAML / frontmatter is not valid YAML"]

    name = str(data.get("name") or "").strip()
    description = str(data.get("description") or "").strip()
    entrypoint = str(data.get("entrypoint") or "").strip() or None
    raw_subcommands = data.get("subcommands") or []
    if isinstance(raw_subcommands, str):
        subcommands = tuple(part.strip() for part in raw_subcommands.split(",") if part.strip())
    elif isinstance(raw_subcommands, (list, tuple)):
        subcommands = tuple(str(item).strip() for item in raw_subcommands if str(item).strip())
    else:
        return None, ["subcommands 必须是列表 / subcommands must be a list"]

    missing = [
        label
        for label, value in (("name", name), ("description", description))
        if not value
    ]
    if missing:
        return None, [
            f"frontmatter 缺少字段：{', '.join(missing)} / missing frontmatter fields: {', '.join(missing)}"
        ]
    return (
        SkillFrontMatter(
            name=name,
            description=description,
            entrypoint=entrypoint,
            subcommands=subcommands,
        ),
        [],
    )


def _check_paths(files: dict[str, str]) -> list[str]:
    problems: list[str] = []
    for path in files:
        if not _PATH_RE.match(path) or ".." in path.split("/"):
            problems.append(f"路径不合法：{path} / invalid path: {path}")
        elif not path.lower().endswith(ALLOWED_SUFFIXES):
            problems.append(f"不支持的文件类型：{path} / unsupported file type: {path}")
    return problems


def _check_secrets(files: dict[str, str]) -> list[str]:
    problems: list[str] = []
    for path, content in files.items():
        for label, pattern in _SECRET_PATTERNS:
            if pattern.search(content):
                problems.append(f"{path} 里出现了{label} / {path} looks like it contains {label}")
    return problems


def analyse(files: dict[str, str], *, skill_id: str | None = None) -> SkillReport:
    """Everything the editor needs to say about a draft.

    Blocking findings refuse a publish. Warnings are shown while editing and may be ignored: a
    half-written skill is a normal state, a half-written *release* is not.
    """
    blocking: list[str] = []
    warnings: list[str] = []

    if not files:
        return SkillReport(frontmatter=None, blocking=("技能还没有任何文件 / the skill has no files",))

    blocking.extend(_check_paths(files))

    if len(files) > MAX_FILES:
        blocking.append(f"文件数超过 {MAX_FILES} / more than {MAX_FILES} files")

    total = 0
    for path, content in files.items():
        size = len(content.encode("utf-8"))
        total += size
        if size > MAX_FILE_BYTES:
            blocking.append(
                f"{path} 超过 {MAX_FILE_BYTES // 1024}KB / {path} is larger than {MAX_FILE_BYTES // 1024}KB"
            )
    if total > MAX_TOTAL_BYTES:
        blocking.append(
            f"总大小超过 {MAX_TOTAL_BYTES // 1024}KB / total size is larger than {MAX_TOTAL_BYTES // 1024}KB"
        )

    frontmatter, errors = _read_frontmatter(files)
    blocking.extend(errors)

    if frontmatter is not None:
        if skill_id is not None and frontmatter.name != skill_id:
            blocking.append(
                f"frontmatter 的 name 必须等于技能 ID（{skill_id}） / frontmatter name must equal the skill id ({skill_id})"
            )
        if len(frontmatter.description) > MAX_DESCRIPTION_CHARS:
            blocking.append(
                f"描述超过 {MAX_DESCRIPTION_CHARS} 字 / description is longer than {MAX_DESCRIPTION_CHARS} characters"
            )
        _, body = split_frontmatter(files.get(SKILL_FILE, ""))
        if len(body) > MAX_BODY_CHARS:
            blocking.append(
                f"SKILL.md 正文超过 {MAX_BODY_CHARS} 字 / SKILL.md body is longer than {MAX_BODY_CHARS} characters"
            )
        if frontmatter.entrypoint is not None:
            entry = frontmatter.entrypoint
            if not (entry.startswith("scripts/") and entry.endswith(".py")):
                blocking.append(
                    "入口必须是 scripts/ 下的 .py 文件 / entrypoint must be a .py file under scripts/"
                )
            elif entry not in files:
                blocking.append(f"入口文件不存在：{entry} / entrypoint file is missing: {entry}")
            elif not frontmatter.subcommands:
                warnings.append(
                    "入口没有声明子命令 / the entrypoint declares no subcommands"
                )

    blocking.extend(_check_secrets(files))
    return SkillReport(
        frontmatter=frontmatter,
        blocking=tuple(dict.fromkeys(blocking)),
        warnings=tuple(dict.fromkeys(warnings)),
    )


def content_hash(files: dict[str, str]) -> str:
    digest = hashlib.sha256()
    for path in sorted(files):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(files[path].encode("utf-8"))
        digest.update(b"\0")
    return digest.hexdigest()


def size_bytes(files: dict[str, str]) -> int:
    return sum(len(content.encode("utf-8")) for content in files.values())
