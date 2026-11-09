"""Build outline markdown and preview JSON for .xmind uploads (no VLM pipeline)."""

from __future__ import annotations

import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from typing import Any

_CONTENT_JSON = "content.json"
_CONTENT_XML = "content.xml"
_SKIP_ATTACHMENT_NAMES = frozenset(
    {
        _CONTENT_JSON,
        _CONTENT_XML,
        "metadata.json",
        "manifest.json",
        "meta.xml",
        "styles.xml",
        "Thumbnails/thumbnail.png",
    }
)


class MindmapPreviewError(ValueError):
    """Raised when an .xmind archive cannot be read."""


def _md_escape(text: str) -> str:
    return (
        text.replace("[", r"\[")
        .replace("]", r"\]")
        .replace("(", r"\(")
        .replace(")", r"\)")
        .replace("*", r"\*")
        .replace("_", r"\_")
        .replace("#", r"\#")
    )


def _norm_ws(value: str | None) -> str:
    return re.sub(r"[ \t]+\n", "\n", value or "").strip()


def _indent(level: int) -> str:
    return " " * level


def _add_note_lines(lines: list[str], note: str, level: int) -> None:
    note = _norm_ws(note)
    if not note:
        return
    for ln in note.splitlines():
        lines.append(f"{_indent(level + 1)}> {ln}" if ln.strip() else f"{_indent(level + 1)}>")


def _format_topic_line(
    title: str,
    *,
    hyperlink: str | None = None,
    labels: list[str] | None = None,
    markers: list[str] | None = None,
) -> str:
    text = _md_escape(title) if title else "(untitled)"
    if hyperlink:
        safe_url = hyperlink.replace(")", r"\)")
        text = f"[{text}]({safe_url})"
    suffix: list[str] = []
    if labels:
        for label in labels:
            label = str(label).strip()
            if label:
                suffix.append(f"`{_md_escape(label)}`")
    if markers:
        for marker in markers:
            marker = str(marker).strip()
            if marker:
                suffix.append(f"<{_md_escape(marker)}>")
    if suffix:
        text += " " + " ".join(suffix)
    return text


def _json_note(topic: dict[str, Any]) -> str:
    notes = topic.get("notes") or {}
    plain = notes.get("plain") if isinstance(notes, dict) else None
    if isinstance(plain, dict):
        return _norm_ws(plain.get("content"))
    if isinstance(notes, str):
        return _norm_ws(notes)
    return ""


def _json_labels(topic: dict[str, Any]) -> list[str]:
    labels = topic.get("labels") or {}
    if isinstance(labels, dict):
        items = labels.get("labels") or []
        if isinstance(items, list):
            return [str(x) for x in items]
        return []
    if isinstance(labels, list):
        return [str(x) for x in labels]
    return []


def _json_markers(topic: dict[str, Any]) -> list[str]:
    out: list[str] = []
    markers = topic.get("markers") or []
    if isinstance(markers, list):
        for marker in markers:
            if isinstance(marker, dict):
                mid = marker.get("markerId") or marker.get("id") or marker.get("marker-id")
                if mid:
                    out.append(str(mid))
            elif isinstance(marker, str):
                out.append(marker)
    for key in ("marker-refs", "markerRefs"):
        refs = topic.get(key) or []
        if isinstance(refs, list):
            for marker in refs:
                if isinstance(marker, dict):
                    mid = marker.get("markerId") or marker.get("id")
                    if mid:
                        out.append(str(mid))
    return out


def _json_children(topic: dict[str, Any]) -> list[dict[str, Any]]:
    children = topic.get("children") or {}
    out: list[dict[str, Any]] = []
    if isinstance(children, dict):
        for key in ("attached", "detached"):
            items = children.get(key) or []
            if isinstance(items, list):
                out.extend([item for item in items if isinstance(item, dict)])
    elif isinstance(children, list):
        out.extend([item for item in children if isinstance(item, dict)])
    return out


def _strip_ns(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _xml_child(elem: ET.Element, localname: str) -> ET.Element | None:
    for child in list(elem):
        if _strip_ns(child.tag) == localname:
            return child
    return None


def _xml_children(elem: ET.Element, localname: str) -> list[ET.Element]:
    return [child for child in list(elem) if _strip_ns(child.tag) == localname]


def _xml_text(elem: ET.Element | None) -> str:
    if elem is None:
        return ""
    return (elem.text or "").strip()


def _xml_note(topic_el: ET.Element) -> str:
    notes_el = _xml_child(topic_el, "notes")
    if notes_el is None:
        return ""
    return _xml_text(_xml_child(notes_el, "plain"))


def _xml_labels(topic_el: ET.Element) -> list[str]:
    labels_el = _xml_child(topic_el, "labels")
    if labels_el is None:
        return []
    return [_xml_text(label) for label in _xml_children(labels_el, "label") if _xml_text(label)]


def _xml_markers(topic_el: ET.Element) -> list[str]:
    markers_el = _xml_child(topic_el, "markers")
    if markers_el is None:
        return []
    out: list[str] = []
    for marker in _xml_children(markers_el, "marker"):
        mid = marker.attrib.get("marker-id") or marker.attrib.get("markerId") or marker.attrib.get("id")
        if mid:
            out.append(mid)
    return out


def _xml_hyperlink(topic_el: ET.Element) -> str | None:
    for attr in ("{http://www.w3.org/1999/xlink}href", "href", "xlink:href"):
        if attr in topic_el.attrib:
            return topic_el.attrib.get(attr)
    return None


def _xml_topic_children(topic_el: ET.Element) -> list[ET.Element]:
    children_el = _xml_child(topic_el, "children")
    if children_el is None:
        return []
    out: list[ET.Element] = []
    for topics_el in _xml_children(children_el, "topics"):
        out.extend(_xml_children(topics_el, "topic"))
    return out


def _count_json_topics(topic: dict[str, Any]) -> int:
    count = 1
    for child in _json_children(topic):
        count += _count_json_topics(child)
    return count


def _count_xml_topics(topic_el: ET.Element) -> int:
    count = 1
    for child in _xml_topic_children(topic_el):
        count += _count_xml_topics(child)
    return count


def _walk_json_topic(lines: list[str], topic: dict[str, Any], level: int) -> None:
    title = str(topic.get("title") or "")
    hyperlink = topic.get("hyperlink") or topic.get("href")
    item = _format_topic_line(
        title,
        hyperlink=str(hyperlink) if hyperlink else None,
        labels=_json_labels(topic),
        markers=_json_markers(topic),
    )
    lines.append(f"{_indent(level)}- {item}")
    _add_note_lines(lines, _json_note(topic), level)
    for child in _json_children(topic):
        _walk_json_topic(lines, child, level + 1)


def _walk_xml_topic(lines: list[str], topic_el: ET.Element, level: int) -> None:
    title = _xml_text(_xml_child(topic_el, "title"))
    item = _format_topic_line(
        title,
        hyperlink=_xml_hyperlink(topic_el),
        labels=_xml_labels(topic_el),
        markers=_xml_markers(topic_el),
    )
    lines.append(f"{_indent(level)}- {item}")
    _add_note_lines(lines, _xml_note(topic_el), level)
    for child in _xml_topic_children(topic_el):
        _walk_xml_topic(lines, child, level + 1)


def _parse_content_json(raw: bytes) -> list[dict[str, Any]]:
    data = json.loads(raw.decode("utf-8"))
    if isinstance(data, dict) and "sheets" in data:
        sheets = data["sheets"]
    elif isinstance(data, dict) and "rootTopic" in data:
        sheets = [data]
    elif isinstance(data, list):
        sheets = data
    else:
        raise MindmapPreviewError("Unrecognized structure in content.json")
    if not isinstance(sheets, list) or not sheets:
        raise MindmapPreviewError("No sheets found in content.json")
    return [sheet for sheet in sheets if isinstance(sheet, dict)]


def _parse_content_xml(raw: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    sheets: list[dict[str, Any]] = []
    for sheet_el in _xml_children(root, "sheet"):
        title = _xml_text(_xml_child(sheet_el, "title")) or "Untitled sheet"
        topic_el = _xml_child(sheet_el, "topic")
        sheets.append({"title": title, "root_el": topic_el})
    if not sheets:
        raise MindmapPreviewError("No sheets found in content.xml")
    return sheets


def _list_attachments(zf: zipfile.ZipFile) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        base = name.split("/")[-1]
        if name in _SKIP_ATTACHMENT_NAMES or base in _SKIP_ATTACHMENT_NAMES:
            continue
        if name.startswith("Thumbnails/"):
            continue
        info = zf.getinfo(name)
        out.append({"path": name, "size_bytes": info.file_size})
    out.sort(key=lambda item: item["path"])
    return out


def _sheet_markdown_json(sheet: dict[str, Any], index: int) -> tuple[dict[str, Any], list[str]]:
    title = str(sheet.get("title") or f"Sheet {index}")
    root = sheet.get("rootTopic") or {}
    root_title = str(root.get("title") or "Root")
    lines = [f"# {title}", f"## {root_title}"]
    _add_note_lines(lines, _json_note(root), 0)
    for child in _json_children(root):
        _walk_json_topic(lines, child, 0)
    return (
        {
            "name": title,
            "root_title": root_title,
            "topic_count": _count_json_topics(root) if root else 0,
        },
        lines,
    )


def _sheet_markdown_xml(sheet: dict[str, Any], index: int) -> tuple[dict[str, Any], list[str]]:
    title = str(sheet.get("title") or f"Sheet {index}")
    root_el = sheet.get("root_el")
    lines = [f"# {title}"]
    if root_el is None:
        return {"name": title, "root_title": "", "topic_count": 0}, lines + ["_(No root topic)_"]
    root_title = _xml_text(_xml_child(root_el, "title")) or "Root"
    lines.append(f"## {root_title}")
    _add_note_lines(lines, _xml_note(root_el), 0)
    for child in _xml_topic_children(root_el):
        _walk_xml_topic(lines, child, 0)
    return (
        {
            "name": title,
            "root_title": root_title,
            "topic_count": _count_xml_topics(root_el),
        },
        lines,
    )


def build_xmind_preview(content: bytes, *, file_hash: str) -> tuple[dict[str, Any], str]:
    """Return ``(parsing_result, markdown)`` for storage on the document row."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise MindmapPreviewError("File is not a valid .xmind archive.") from exc

    with zf:
        names = set(zf.namelist())
        if _CONTENT_JSON in names:
            source_format = "content.json"
            sheets = _parse_content_json(zf.read(_CONTENT_JSON))
            sheet_parts = [_sheet_markdown_json(sheet, i + 1) for i, sheet in enumerate(sheets)]
        elif _CONTENT_XML in names:
            source_format = "content.xml"
            sheets = _parse_content_xml(zf.read(_CONTENT_XML))
            sheet_parts = [_sheet_markdown_xml(sheet, i + 1) for i, sheet in enumerate(sheets)]
        else:
            raise MindmapPreviewError("Archive has no content.json or content.xml.")

        attachments = _list_attachments(zf)

    md_parts: list[str] = []
    sheet_meta: list[dict[str, Any]] = []
    for meta, lines in sheet_parts:
        sheet_meta.append(meta)
        md_parts.append("\n".join(lines).strip())
    markdown = "\n\n".join(part for part in md_parts if part).strip()
    if attachments:
        attachment_lines = ["## Attachments", ""]
        for item in attachments:
            attachment_lines.append(f"- `{item['path']}` ({item['size_bytes']} bytes)")
        attachment_section = "\n".join(attachment_lines)
        markdown = f"{markdown}\n\n{attachment_section}".strip() if markdown else attachment_section

    preview: dict[str, Any] = {
        "document_kind": "mindmap",
        "file_hash": file_hash,
        "format": source_format,
        "page_count": len(sheet_meta),
        "sheets": sheet_meta,
        "attachments": attachments,
    }
    return preview, markdown
