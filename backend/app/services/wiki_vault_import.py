"""Obsidian vault import: normalize paths, upload binaries, upsert markdown pages, rewrite asset links."""

from __future__ import annotations

import io
import re
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wiki_models import WikiFile, WikiPage
from app.services.page_index import md_to_tree_from_markdown
from app.services.storage import delete_object, object_exists, upload_object

# Limits (defense in depth; tune via env later if needed)
MAX_VAULT_FILES = 2000
MAX_VAULT_TOTAL_BYTES = 80 * 1024 * 1024
MAX_VAULT_FILE_BYTES = 25 * 1024 * 1024
MAX_WIKI_FILENAME_LEN = 512
# S3 / MinIO object key maximum length (UTF-8 bytes approximated by len() for ASCII-heavy paths).
MAX_S3_OBJECT_KEY_LEN = 1024


def strip_nul_bytes(s: str) -> str:
    """Remove NUL characters. PostgreSQL UTF-8 text/varchar rejects U+0000 (asyncpg CharacterNotInRepertoireError)."""
    if not s:
        return s
    return s.replace("\x00", "")


def vault_mirror_object_key(space_id: str, norm_vault_path: str) -> str:
    """S3 key: wiki/{space_id}/vault/{relative_path} — mirrors vault layout for operators."""
    return f"wiki/{space_id}/vault/{norm_vault_path}"


def vault_mirror_key_fits(space_id: str, norm_vault_path: str) -> bool:
    return len(vault_mirror_object_key(space_id, norm_vault_path)) <= MAX_S3_OBJECT_KEY_LEN


def upload_wiki_page_markdown_mirror(
    space_id: str, wiki_path: str, body: str, *, storage_enabled: bool
) -> None:
    """Write wiki page body to vault mirror path …/vault/{wiki_path}.md (UTF-8)."""
    if not storage_enabled:
        return
    norm_md = f"{wiki_path}.md"
    if not vault_mirror_key_fits(space_id, norm_md):
        return
    clean = strip_nul_bytes(body)
    upload_object(
        vault_mirror_object_key(space_id, norm_md),
        clean.encode("utf-8"),
        content_type="text/markdown; charset=utf-8",
    )


def delete_wiki_page_markdown_mirror(space_id: str, wiki_path: str, *, storage_enabled: bool) -> None:
    """Remove vault mirror …/vault/{wiki_path}.md if present."""
    if not storage_enabled:
        return
    norm_md = f"{wiki_path}.md"
    if not vault_mirror_key_fits(space_id, norm_md):
        return
    key = vault_mirror_object_key(space_id, norm_md)
    if object_exists(key):
        delete_object(key)


async def upsert_vault_mirror_wiki_file(
    db: AsyncSession,
    space_id: str,
    norm: str,
    raw: bytes,
    *,
    content_type: str | None,
    wiki_page_id: str | None = None,
) -> WikiFile:
    """
    Upload bytes to the vault mirror S3 key and insert or update wiki_files.
    Re-uploading the same vault-relative path reuses storage_key (unique) and overwrites S3.
    """
    key = vault_mirror_object_key(space_id, norm)
    upload_object(key, raw, content_type=content_type)
    res = await db.execute(select(WikiFile).where(WikiFile.storage_key == key))
    existing = res.scalar_one_or_none()
    if existing is not None:
        if existing.wiki_space_id != space_id:
            raise ValueError("Storage key is already used in another wiki space")
        existing.content_type = content_type
        existing.size_bytes = len(raw)
        existing.filename = norm
        existing.wiki_page_id = wiki_page_id
        return existing
    fid = str(uuid.uuid4())
    wf = WikiFile(
        id=fid,
        wiki_space_id=space_id,
        wiki_page_id=wiki_page_id,
        storage_key=key,
        filename=norm,
        content_type=content_type,
        size_bytes=len(raw),
    )
    db.add(wf)
    return wf


# Match any path segment case-insensitively (e.g. `.Git` on case-insensitive volumes).
_SKIP_DIR_SEGMENTS_CI = frozenset(
    {
        ".obsidian",
        ".trash",
        ".git",
        "__macosx",
    }
)

_MD_LINK = re.compile(r"!?\[([^\]]*)\]\(([^)]+)\)")
_WIKI_EMBED = re.compile(r"!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")


def _safe_storage_basename(name: str) -> str:
    base = (name.rsplit("/", 1)[-1] or "file").strip() or "file"
    base = re.sub(r"[^a-zA-Z0-9._-]", "_", base)[:200]
    return base or "file"


def join_and_norm_dir_rel(dir_path: str, rel: str) -> str | None:
    """Join dir_path + rel and normalize ..; return None if path escapes above root."""
    stack: list[str] = []
    if dir_path:
        stack = [p for p in dir_path.split("/") if p]
    for seg in rel.replace("\\", "/").split("/"):
        if seg in ("", "."):
            continue
        if seg == "..":
            if not stack:
                return None
            stack.pop()
        else:
            stack.append(seg)
    return "/".join(stack) if stack else None


def normalize_vault_entry_path(raw: str) -> str | None:
    """Strip leading slashes and ./ ; reject empty, ., .. segments."""
    p = raw.replace("\\", "/").strip()
    while p.startswith("./"):
        p = p[2:]
    p = p.lstrip("/")
    if not p:
        return None
    parts = p.split("/")
    for seg in parts:
        if not seg or seg == "." or seg == "..":
            return None
    return "/".join(parts)


def iter_zip_vault_entries(raw_zip: bytes) -> list[tuple[str, bytes]]:
    """Read a zip archive; skip zip-slip and invalid paths. Returns (normalized relative path, bytes)."""
    out: list[tuple[str, bytes]] = []
    with zipfile.ZipFile(io.BytesIO(raw_zip), "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/").strip()
            if not name or name.startswith("/"):
                continue
            parts = PurePosixPath(name).parts
            if ".." in parts:
                continue
            norm = normalize_vault_entry_path(name)
            if not norm:
                continue
            data = zf.read(info.filename)
            out.append((norm, data))
    return out


def should_skip_vault_path(norm: str) -> bool:
    if not norm:
        return True
    parts = norm.split("/")
    if any(p and p.lower() in _SKIP_DIR_SEGMENTS_CI for p in parts):
        return True
    if parts[-1] in (".DS_Store", "Thumbs.db"):
        return True
    return False


def md_relative_path_to_wiki_path(norm_md: str) -> str:
    """foo/bar.md -> foo/bar (any .md case)."""
    lower = norm_md.lower()
    if lower.endswith(".md"):
        return norm_md[: -len(".md")]
    return norm_md


def title_from_markdown_body(body: str, fallback: str) -> str:
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("#"):
            return (s.lstrip("#").strip() or fallback)[:512]
    seg = fallback.split("/")[-1] if fallback else fallback
    return (seg or fallback or "untitled")[:512]


def _recompute_page_index(page: WikiPage) -> None:
    page.page_index = md_to_tree_from_markdown(page.body or "", doc_name=page.title or page.path)


def _file_content_url(space_id: str, file_id: str) -> str:
    return f"/api/wiki-spaces/{space_id}/files/{file_id}/content"


def rewrite_markdown_assets(
    body: str,
    md_norm_path: str,
    path_to_file_id: dict[str, str],
    basename_to_ids: dict[str, list[str]],
    space_id: str,
) -> tuple[str, list[str]]:
    """
    Rewrite ![](rel) and ![[x]] to /api/wiki-spaces/.../files/{id}/content when resolvable.
    md_norm_path is vault-relative path to the .md file (e.g. wiki/note.md).
    """
    warnings: list[str] = []
    note_dir = str(PurePosixPath(md_norm_path).parent)
    if note_dir == ".":
        note_dir = ""

    def resolve_link(href: str) -> str | None:
        h = href.strip()
        if not h:
            return None
        if h.startswith(("http://", "https://", "mailto:", "data:", "#", "/api/")):
            return None
        h = h.split("?", 1)[0].split("#", 1)[0]
        resolved = join_and_norm_dir_rel(note_dir, h) if note_dir else join_and_norm_dir_rel("", h)
        if not resolved:
            return None
        fid = path_to_file_id.get(resolved)
        if fid:
            return fid
        # try case-insensitive
        lower_map = {k.lower(): v for k, v in path_to_file_id.items()}
        return lower_map.get(resolved.lower())

    def replace_md_link(m: re.Match[str]) -> str:
        full = m.group(0)
        if not full.startswith("!"):
            return full
        label, href = m.group(1), m.group(2)
        fid = resolve_link(href)
        if not fid:
            return full
        url = _file_content_url(space_id, fid)
        return f"![{label}]({url})"

    out = _MD_LINK.sub(replace_md_link, body)

    def replace_wiki_embed(m: re.Match[str]) -> str:
        target = m.group(1).strip()
        if not target or target.startswith("/") or "://" in target:
            return m.group(0)
        resolved = join_and_norm_dir_rel(note_dir, target)
        if not resolved:
            return m.group(0)
        fid = path_to_file_id.get(resolved)
        if not fid:
            lower_map = {k.lower(): v for k, v in path_to_file_id.items()}
            fid = lower_map.get(resolved.lower())
        if not fid:
            base = target.split("/")[-1]
            ids = basename_to_ids.get(base, [])
            if len(ids) == 1:
                fid = ids[0]
            elif len(ids) > 1:
                warnings.append(f"Ambiguous ![[{target}]] in {md_norm_path}")
                return m.group(0)
        if not fid:
            return m.group(0)
        url = _file_content_url(space_id, fid)
        return f"![]({url})"

    out = _WIKI_EMBED.sub(replace_wiki_embed, out)
    return out, warnings


@dataclass
class VaultImportResult:
    pages_upserted: int = 0
    files_uploaded: int = 0
    skipped: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


async def import_vault_entries(
    db: AsyncSession,
    space_id: str,
    entries: list[tuple[str, bytes]],
    *,
    storage_enabled: bool,
) -> VaultImportResult:
    """
    entries: (vault-relative path, raw bytes). Paths must be normalized (forward slashes, no ..).
    """
    result = VaultImportResult()
    if len(entries) > MAX_VAULT_FILES:
        raise ValueError(f"Too many files (max {MAX_VAULT_FILES})")

    total = sum(len(b) for _, b in entries)
    if total > MAX_VAULT_TOTAL_BYTES:
        raise ValueError(f"Vault too large (max {MAX_VAULT_TOTAL_BYTES} bytes)")

    md_items: list[tuple[str, str]] = []  # norm path, text
    bin_items: list[tuple[str, bytes]] = []

    for norm, raw in entries:
        if len(raw) > MAX_VAULT_FILE_BYTES:
            result.skipped.append(f"{norm} (file too large)")
            continue
        if should_skip_vault_path(norm):
            result.skipped.append(norm)
            continue
        lower = norm.lower()
        if lower.endswith(".md"):
            try:
                text = strip_nul_bytes(raw.decode("utf-8"))
            except UnicodeDecodeError:
                result.warnings.append(f"Skipped non-UTF-8 markdown: {norm}")
                result.skipped.append(norm)
                continue
            md_items.append((norm, text))
        else:
            bin_items.append((norm, raw))

    has_binaries = len(bin_items) > 0
    if has_binaries and not storage_enabled:
        raise ValueError("Storage is not configured; cannot import binary attachments")

    path_to_file_id: dict[str, str] = {}
    basename_to_ids: dict[str, list[str]] = {}

    for norm, raw in bin_items:
        if len(norm) > MAX_WIKI_FILENAME_LEN:
            result.warnings.append(f"Path too long for DB filename, skipped: {norm[:80]}...")
            result.skipped.append(norm)
            continue
        if not vault_mirror_key_fits(space_id, norm):
            result.warnings.append(f"S3 key too long, skipped: {norm[:80]}...")
            result.skipped.append(norm)
            continue
        wf = await upsert_vault_mirror_wiki_file(db, space_id, norm, raw, content_type=None, wiki_page_id=None)
        path_to_file_id[norm] = wf.id
        base = norm.rsplit("/", 1)[-1]
        basename_to_ids.setdefault(base, []).append(fid)
        result.files_uploaded += 1

    await db.flush()

    md_mirror_payloads: list[tuple[str, str]] = []

    for norm_md, body in md_items:
        wiki_path = md_relative_path_to_wiki_path(norm_md)
        wiki_path_clean = strip_nul_bytes(wiki_path)
        if not wiki_path_clean or len(wiki_path_clean) > 512:
            result.warnings.append(f"Invalid wiki path for {norm_md}")
            result.skipped.append(norm_md)
            continue
        title = strip_nul_bytes(title_from_markdown_body(body, wiki_path_clean))
        new_body, warns = rewrite_markdown_assets(
            body, norm_md, path_to_file_id, basename_to_ids, space_id
        )
        new_body = strip_nul_bytes(new_body)
        result.warnings.extend(warns)

        q = await db.execute(
            select(WikiPage).where(WikiPage.wiki_space_id == space_id, WikiPage.path == wiki_path_clean)
        )
        page = q.scalar_one_or_none()
        if page:
            page.title = title
            page.body = new_body
            _recompute_page_index(page)
        else:
            page = WikiPage(
                id=str(uuid.uuid4()),
                wiki_space_id=space_id,
                path=wiki_path_clean,
                title=title,
                body=new_body,
                metadata_=None,
            )
            _recompute_page_index(page)
            db.add(page)
        result.pages_upserted += 1
        md_mirror_payloads.append((norm_md, new_body))

    await db.flush()

    if storage_enabled:
        for norm_md, new_body in md_mirror_payloads:
            if not vault_mirror_key_fits(space_id, norm_md):
                result.warnings.append(f"Vault mirror not stored (S3 key too long): {norm_md[:80]}...")
                continue
            upload_object(
                vault_mirror_object_key(space_id, norm_md),
                new_body.encode("utf-8"),
                content_type="text/markdown; charset=utf-8",
            )

    return result


async def wiki_file_path_maps(
    db: AsyncSession, space_id: str
) -> tuple[dict[str, str], dict[str, list[str]]]:
    """Build path → file id and basename → ids from existing WikiFile rows in this space."""
    result = await db.execute(select(WikiFile).where(WikiFile.wiki_space_id == space_id))
    rows = list(result.scalars().all())
    path_to_file_id: dict[str, str] = {}
    basename_to_ids: dict[str, list[str]] = {}
    for f in rows:
        path_to_file_id[f.filename] = f.id
        base = f.filename.rsplit("/", 1)[-1]
        basename_to_ids.setdefault(base, []).append(f.id)
    return path_to_file_id, basename_to_ids


async def import_markdown_vault_file(
    db: AsyncSession,
    space_id: str,
    raw_vault_path: str,
    body: str,
    *,
    storage_enabled: bool = False,
) -> tuple[str, list[str]]:
    """
    Upsert one markdown page from vault-relative path (e.g. wiki/a.md).
    Rewrites asset links using WikiFile.filename keys already stored for the space.
    Returns (wiki_page_path_without_md_suffix, warnings).
    """
    norm = normalize_vault_entry_path(raw_vault_path.strip())
    if not norm:
        raise ValueError("Invalid vault path")
    if should_skip_vault_path(norm):
        raise ValueError("Path is in a skipped folder (.git, .obsidian, …)")
    if not norm.lower().endswith(".md"):
        raise ValueError("vault_path must end with .md")
    body = strip_nul_bytes(body)
    wiki_path = strip_nul_bytes(md_relative_path_to_wiki_path(norm))
    if not wiki_path or len(wiki_path) > 512:
        raise ValueError("Wiki page path too long or invalid")

    path_to_file_id, basename_to_ids = await wiki_file_path_maps(db, space_id)
    title = strip_nul_bytes(title_from_markdown_body(body, wiki_path))
    new_body, warns = rewrite_markdown_assets(body, norm, path_to_file_id, basename_to_ids, space_id)
    new_body = strip_nul_bytes(new_body)

    q = await db.execute(select(WikiPage).where(WikiPage.wiki_space_id == space_id, WikiPage.path == wiki_path))
    page = q.scalar_one_or_none()
    if page:
        page.title = title
        page.body = new_body
        _recompute_page_index(page)
    else:
        page = WikiPage(
            id=str(uuid.uuid4()),
            wiki_space_id=space_id,
            path=wiki_path,
            title=title,
            body=new_body,
            metadata_=None,
        )
        _recompute_page_index(page)
        db.add(page)
    await db.flush()
    if storage_enabled:
        if vault_mirror_key_fits(space_id, norm):
            upload_object(
                vault_mirror_object_key(space_id, norm),
                new_body.encode("utf-8"),
                content_type="text/markdown; charset=utf-8",
            )
        else:
            warns.append(f"Vault mirror not stored (S3 key too long): {norm}")
    return wiki_path, warns
