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
from app.services.identity.acl.acl_identity import resolve_subject_display, subject_exists

#: Candidates only — whether a subject is live is decided by `subject_exists`, not by SQL. An ACL subject may be a
#: `users.id`, a legacy subject named only by `user_api_keys.owner_sub`, or an OIDC `sub`; a `left join users` says the
#: account behind most of this database does not exist.
CANDIDATES = """
    select a.resource_type, a.resource_id, a.grantee_id, a.permissions
    from resource_acl_entries a
    where a.grantee_type = 'user'
    order by a.resource_type, a.resource_id
"""

DELETE = """
    delete from resource_acl_entries
    where resource_type = :resource_type and resource_id = :resource_id
      and grantee_type = 'user' and grantee_id = :grantee_id
"""


async def main() -> int:
    apply = '--apply' in sys.argv
    async with async_session_maker() as db:
        candidates = (await db.execute(text(CANDIDATES))).all()
        orphans = []
        for resource_type, resource_id, grantee_id, permissions in candidates:
            if await subject_exists(db, grantee_id):
                continue
            orphans.append((resource_type, resource_id, grantee_id, permissions))
        if not orphans:
            print(f'clean-orphan-grants: none ({len(candidates)} user grant(s), all with live subjects)')
            return 0
        for resource_type, resource_id, grantee_id, permissions in orphans:
            label = await resolve_subject_display(db, grantee_id)
            print(f'  {resource_type:16} {resource_id:38} {grantee_id} {label:20} {"r" if permissions & 1 else ""}{"w" if permissions & 2 else ""}{"m" if permissions & 4 else ""}')
        if not apply:
            print(f'clean-orphan-grants: {len(orphans)} grant(s) whose subject resolves to nothing — pass --apply to remove')
            return 0
        removed = 0
        for resource_type, resource_id, grantee_id, _permissions in orphans:
            result = await db.execute(text(DELETE), {
                'resource_type': resource_type, 'resource_id': resource_id, 'grantee_id': grantee_id,
            })
            removed += result.rowcount
        await db.commit()
        print(f'clean-orphan-grants: removed {removed} grant(s)')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
