"""Scan resources for ACL issues (Console data-security)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.resource_acl import _enrich_default_owner_grant, _grant_labels
from app.models.resource_acl import ResourceAclEntry
from app.services.acl.resource_acl_constants import GRANTEE_AUTHENTICATED
from app.services.acl.resource_acl_issue_detection import (
    ISSUE_TYPES_ORDER,
    ResourceAclIssueScan,
    detect_resource_acl_issues,
)
from app.services.acl.resource_acl_admin_helpers import (
    resolve_resource_label,
    resource_type_label,
    share_path_for,
)


@dataclass
class ScannedResourceIssue:
    resource_type: str
    resource_id: str
    entries: list
    scan: ResourceAclIssueScan


async def scan_resources_with_issues(db: AsyncSession) -> list[ScannedResourceIssue]:
    result = await db.execute(select(ResourceAclEntry))
    all_entries = list(result.scalars().all())
    by_resource: dict[tuple[str, str], list] = defaultdict(list)
    for entry in all_entries:
        by_resource[(entry.resource_type, entry.resource_id)].append(entry)

    scanned: list[ScannedResourceIssue] = []
    for (rt, rid), entries in by_resource.items():
        scan = await detect_resource_acl_issues(db, rt, rid, entries)
        if not scan.issues:
            continue
        scanned.append(ScannedResourceIssue(rt, rid, entries, scan))
    return scanned


def aggregate_issue_counts(scanned: list[ScannedResourceIssue]) -> tuple[int, dict[str, int]]:
    by_issue: dict[str, int] = defaultdict(int)
    for row in scanned:
        for code in row.scan.issues:
            by_issue[code] += 1
    ordered = {code: by_issue.get(code, 0) for code in ISSUE_TYPES_ORDER if by_issue.get(code, 0)}
    for code, count in by_issue.items():
        if code not in ordered:
            ordered[code] = count
    return len(scanned), ordered


async def _audit_grants(db: AsyncSession, resource_type: str, resource_id: str, entries: list):
    from app.api.resource_acl import _channel_creator_identity

    creator_subject, creator_display_name = await _channel_creator_identity(
        db, resource_type, resource_id
    )
    grant_rows, owner, owner_label = await _grant_labels(
        db,
        entries,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    grant_rows, owner, owner_label = await _enrich_default_owner_grant(
        db,
        resource_type,
        resource_id,
        entries,
        grant_rows,
        owner,
        owner_label,
        creator_subject=creator_subject,
        creator_display_name=creator_display_name,
    )
    return grant_rows


async def build_issue_item(db: AsyncSession, row: ScannedResourceIssue) -> dict:
    rt, rid, entries, scan = row.resource_type, row.resource_id, row.entries, row.scan
    label = await resolve_resource_label(db, rt, rid)
    grants = await _audit_grants(db, rt, rid, entries)
    owner = next((g for g in grants if g.is_owner), None)
    owner_persisted = next((g for g in grants if g.grantee_type == "user"), None)
    auth = next((g for g in grants if g.grantee_type == GRANTEE_AUTHENTICATED), None)
    return {
        "resource_type": rt,
        "resource_type_label": resource_type_label(rt),
        "resource_id": rid,
        "resource_label": label,
        "share_path": share_path_for(rt, rid),
        "issues": scan.issues,
        "owner_label": owner.grantee_label if owner else None,
        "owner_permissions": owner_persisted.permissions if owner_persisted else None,
        "others_permissions": auth.permissions if auth else None,
        "inherited_others_permissions": scan.inherited_others_label,
        "broken_group_ids": scan.broken_group_ids,
        "empty_group_ids": scan.empty_group_ids,
        "grants": grants,
    }


def sort_key_for_item(item: dict) -> tuple[str, str]:
    return (item["resource_type_label"], item["resource_label"].lower())


async def list_issue_page(
    db: AsyncSession,
    issue: str,
    *,
    limit: int,
    offset: int,
) -> tuple[int, list[dict], int, dict[str, int]]:
    """Return (total_for_issue, page_items, issue_count, by_issue)."""
    scanned = await scan_resources_with_issues(db)
    issue_count, by_issue = aggregate_issue_counts(scanned)
    matching = [row for row in scanned if issue in row.scan.issues]
    items: list[dict] = []
    for row in matching:
        items.append(await build_issue_item(db, row))
    items.sort(key=sort_key_for_item)
    total = len(items)
    page = items[offset : offset + limit]
    return total, page, issue_count, by_issue
