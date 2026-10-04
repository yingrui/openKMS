"""ACL identity matching used for owner-scoped comment lookups."""

import asyncio

from app.services.acl.acl_identity import user_grant_matches


def test_owner_acl_grant_matches_username_vs_uuid_sub():
    """Ownership must use ACL identity matching, not grantee_id == sub."""

    async def _run() -> None:
        matched = await user_grant_matches(
            None,
            "yingrui",
            "11dcdd51-b251-4a69-9288-05ab2952be38",
            {"sub": "11dcdd51-b251-4a69-9288-05ab2952be38", "preferred_username": "yingrui"},
        )
        assert matched is True

    asyncio.run(_run())
