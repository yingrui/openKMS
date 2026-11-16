"""List relationships that the uniqueness check would now refuse.

Read-only: it prints the joins whose target declares no key and whose profile shows either repeating values or
no profile at all. Run it against a live deployment before relying on the stricter save path, so the existing
catalog is not a surprise.

    cd backend && uv run python scripts/audit_dataset_joins.py
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db.session import session_scope
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.dataset_profile import DatasetProfile


async def main() -> None:
    async with session_scope() as db:
        joins = (await db.execute(select(DatasetJoin))).scalars().all()
        targets = {
            d.id: d for d in (await db.execute(select(Dataset))).scalars().all()
        }
        profiles = {
            p.dataset_id: p for p in (await db.execute(select(DatasetProfile))).scalars().all()
        }

    refused: list[str] = []
    for join in joins:
        target = targets.get(join.to_dataset_id)
        if target is None:
            continue
        declared = bool(target.primary_key_columns) or any(target.unique_keys or [])
        if declared:
            continue
        columns = [str(c) for c in (join.to_columns or [])]
        label = target.display_name or target.table_name or target.id
        profile = profiles.get(target.id)
        if profile is None or profile.computed_at is None:
            refused.append(f"{join.id}  {label} → no statistics (refresh first)")
            continue
        if len(columns) > 1:
            refused.append(f"{join.id}  {label} → composite target with no declared key")
            continue
        stats = next((c for c in (profile.column_stats or []) if c.get("column") == columns[0]), None)
        if not stats or stats.get("distinct_count") is None or profile.row_count is None:
            refused.append(f"{join.id}  {label}.{columns[0]} → no statistics for that column")
            continue
        non_null = profile.row_count - int(stats.get("null_count") or 0)
        if int(stats["distinct_count"]) != non_null:
            refused.append(
                f"{join.id}  {label}.{columns[0]} → {stats['distinct_count']} distinct for "
                f"{non_null} non-null rows (would multiply rows)"
            )

    print(f"{len(joins)} relationships, {len(refused)} would be refused:")
    for line in refused:
        print(f"  {line}")


if __name__ == "__main__":
    asyncio.run(main())
