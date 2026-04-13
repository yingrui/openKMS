"""Alembic seed for ``security_permissions``: only the ``all`` super-permission.

Other permission rows are created by admins (see permission reference API for hints).
"""

from __future__ import annotations

from app.services.permission_catalog import PERM_ALL


def default_permission_seed_rows() -> list[dict[str, object]]:
    """Single built-in row for migrations when the table is empty."""
    return [
        {
            "key": PERM_ALL,
            "label": "All operations (full access)",
            "description": "Satisfies every permission check in the app.",
            "frontend_route_patterns": ["/", "/*"],
            "backend_api_patterns": ["/*"],
        }
    ]
