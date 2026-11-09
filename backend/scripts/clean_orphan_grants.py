#!/usr/bin/env python3
"""Remove resource grants whose grantee no longer exists.

`resource_acl_entries.grantee_id` is a plain string, not a foreign key — it has to be, because a grantee is a user, a group
or `authenticated`. So deleting a user leaves their grants behind: they can never grant anything (the subject is gone), they
keep showing in a sharing panel as a name nobody can account for, and they are why an admin opening a resource's grantees
saw a single entry for a user who had been removed months earlier.

Users are managed by hand, so this is a maintenance tool rather than a migration: dry run by default.

    uv run python scripts/clean_orphan_grants.py            # what would be removed
    uv run python scripts/clean_orphan_grants.py --apply    # remove, printing the rows first
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text

from app.database import async_session_maker

ORPHANS = """
    select a.resource_type, a.resource_id, a.grantee_id, a.permissions
    from resource_acl_entries a
    left join users u on u.id = a.grantee_id
    where a.grantee_type = 'user' and u.id is null
    order by a.resource_type, a.resource_id
"""

DELETE = """
    delete from resource_acl_entries a
    where a.grantee_type = 'user'
      and not exists (select 1 from users u where u.id = a.grantee_id)
"""


async def main() -> int:
    apply = '--apply' in sys.argv
    async with async_session_maker() as db:
        rows = (await db.execute(text(ORPHANS))).all()
        if not rows:
            print('clean-orphan-grants: none')
            return 0
        for resource_type, resource_id, grantee_id, permissions in rows:
            print(f'  {resource_type:16} {resource_id:38} {grantee_id} {"r" if permissions & 1 else ""}{"w" if permissions & 2 else ""}{"m" if permissions & 4 else ""}')
        if not apply:
            print(f'clean-orphan-grants: {len(rows)} orphan grant(s) — pass --apply to remove them')
            return 0
        result = await db.execute(text(DELETE))
        await db.commit()
        print(f'clean-orphan-grants: removed {result.rowcount} orphan grant(s)')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
