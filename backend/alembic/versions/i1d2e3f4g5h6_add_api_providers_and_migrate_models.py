"""add_api_providers_and_migrate_models

Revision ID: i1d2e3f4g5h6
Revises: h0c2d4e6f8a1
Create Date: 2026-03-10

Introduces api_providers table. Models move to provider_id FK; base_url and api_key
move to provider. Migrates existing api_models data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "i1d2e3f4g5h6"
down_revision: Union[str, None] = "h0c2d4e6f8a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"), {"t": table_name})
    return result.scalar()


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"
    ), {"t": table_name, "c": column_name})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create api_providers table
    if not _table_exists(conn, "api_providers"):
        op.create_table(
            "api_providers",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(256), nullable=False),
            sa.Column("base_url", sa.String(512), nullable=False),
            sa.Column("api_key", sa.Text(), nullable=True),
            sa.Column("config", postgresql.JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if not _table_exists(conn, "api_models"):
        return

    # 2. Add provider_id column (nullable)
    if not _column_exists(conn, "api_models", "provider_id"):
        op.add_column("api_models", sa.Column("provider_id", sa.String(64), nullable=True))

    # 3. Data migration: create providers from distinct (provider, base_url)
    # and link api_models to them
    seen: dict[tuple[str, str], str] = {}
    idx = 0
    rows = list(conn.execute(sa.text("SELECT id, provider, base_url, api_key FROM api_models")))
    for row in rows:
        model_id, provider_name, base_url, api_key = row
        key = (provider_name, base_url)
        if key not in seen:
            idx += 1
            provider_id = f"provider_mig_{idx:04d}"
            conn.execute(sa.text(
                "INSERT INTO api_providers (id, name, base_url, api_key) VALUES (:id, :name, :base_url, :api_key)"
            ), {"id": provider_id, "name": provider_name, "base_url": base_url, "api_key": api_key or None})
            seen[key] = provider_id
        conn.execute(sa.text("UPDATE api_models SET provider_id = :pid WHERE id = :mid"), {"pid": seen[key], "mid": model_id})

    # 4. Make provider_id NOT NULL
    op.alter_column("api_models", "provider_id", nullable=False)

    # 5. Add FK
    op.create_foreign_key(
        "fk_api_models_provider_id",
        "api_models",
        "api_providers",
        ["provider_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 6. Drop old columns
    if _column_exists(conn, "api_models", "base_url"):
        op.drop_column("api_models", "base_url")
    if _column_exists(conn, "api_models", "api_key"):
        op.drop_column("api_models", "api_key")
    if _column_exists(conn, "api_models", "provider"):
        op.drop_column("api_models", "provider")


def downgrade() -> None:
    conn = op.get_bind()

    # Re-add provider, base_url, api_key to api_models
    if _column_exists(conn, "api_models", "provider_id") and not _column_exists(conn, "api_models", "provider"):
        op.add_column("api_models", sa.Column("provider", sa.String(256), nullable=True))
        op.add_column("api_models", sa.Column("base_url", sa.String(512), nullable=True))
        op.add_column("api_models", sa.Column("api_key", sa.Text(), nullable=True))
        for row in conn.execute(sa.text("SELECT m.id, m.provider_id, p.name, p.base_url, p.api_key FROM api_models m JOIN api_providers p ON m.provider_id = p.id")):
            conn.execute(sa.text("UPDATE api_models SET provider = :p, base_url = :u, api_key = :k WHERE id = :id"), {"p": row[2], "u": row[3], "k": row[4], "id": row[0]})
        op.alter_column("api_models", "provider", nullable=False)
        op.alter_column("api_models", "base_url", nullable=False)

    op.drop_constraint("fk_api_models_provider_id", "api_models", type_="foreignkey")
    op.drop_column("api_models", "provider_id")
    op.drop_table("api_providers")
