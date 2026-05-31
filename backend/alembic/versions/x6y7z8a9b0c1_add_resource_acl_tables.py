"""Add resource ACL tables and migrate legacy group scopes.

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-05-30

"""
from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op

revision: str = "x6y7z8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "w5x6y7z8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERM_READ = 1

JUNCTION_MIGRATIONS = [
    ("access_group_channels", "document_channel", "channel_id"),
    ("access_group_article_channels", "article_channel", "article_channel_id"),
    ("access_group_knowledge_bases", "knowledge_base", "knowledge_base_id"),
    ("access_group_wiki_spaces", "wiki_space", "wiki_space_id"),
    ("access_group_evaluations", "evaluation", "evaluation_id"),
    ("access_group_datasets", "dataset", "dataset_id"),
    ("access_group_object_types", "object_type", "object_type_id"),
    ("access_group_link_types", "link_type", "link_type_id"),
]


def upgrade() -> None:
    op.create_table(
        "resource_acl_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=64), nullable=False),
        sa.Column("grantee_type", sa.String(length=32), nullable=False),
        sa.Column("grantee_id", sa.String(length=320), nullable=True),
        sa.Column("permissions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "resource_type",
            "resource_id",
            "grantee_type",
            "grantee_id",
            name="uq_resource_acl_grantee",
        ),
    )
    op.create_index("ix_resource_acl_entries_resource_type", "resource_acl_entries", ["resource_type"])
    op.create_index("ix_resource_acl_entries_resource_id", "resource_acl_entries", ["resource_id"])
    op.create_index("ix_resource_acl_entries_grantee_id", "resource_acl_entries", ["grantee_id"])

    op.create_table(
        "access_group_members",
        sa.Column("subject", sa.String(length=320), nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("subject", "group_id"),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO access_group_members (subject, group_id) "
            "SELECT user_id, group_id FROM access_group_users "
            "ON CONFLICT DO NOTHING"
        )
    )

    for table, resource_type, fk_col in JUNCTION_MIGRATIONS:
        rows = conn.execute(sa.text(f"SELECT group_id, {fk_col} FROM {table}")).fetchall()
        for group_id, resource_id in rows:
            conn.execute(
                sa.text(
                    "INSERT INTO resource_acl_entries "
                    "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                    "VALUES (:id, :rt, :rid, 'group', :gid, :perm) "
                    "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "rt": resource_type,
                    "rid": resource_id,
                    "gid": group_id,
                    "perm": PERM_READ,
                },
            )

    # Data resources: anchor-based grants
    dr_rows = conn.execute(
        sa.text(
            "SELECT agr.group_id, dr.resource_kind, dr.attributes, "
            "dr.anchor_channel_id, dr.anchor_knowledge_base_id "
            "FROM access_group_data_resources agr "
            "JOIN data_resources dr ON dr.id = agr.data_resource_id"
        )
    ).fetchall()
    kind_to_type = {
        "document": "document_channel",
        "knowledge_base": "knowledge_base",
        "evaluation": "evaluation",
        "dataset": "dataset",
        "object_type": "object_type",
        "link_type": "link_type",
    }
    id_keys = {
        "document": "channel_id",
        "knowledge_base": "kb_id",
        "evaluation": "evaluation_id",
        "dataset": "dataset_id",
        "object_type": "object_type_id",
        "link_type": "link_type_id",
    }
    for group_id, kind, attrs, anchor_ch, anchor_kb in dr_rows:
        import json

        attributes = attrs if isinstance(attrs, dict) else json.loads(attrs or "{}")
        rt = kind_to_type.get(kind)
        rid = None
        if kind == "document" and anchor_ch:
            rt, rid = "document_channel", anchor_ch
        elif kind == "knowledge_base" and anchor_kb:
            rt, rid = "knowledge_base", anchor_kb
        elif rt:
            key = id_keys.get(kind)
            if key and attributes.get(key):
                rid = str(attributes[key])
            elif kind == "knowledge_base" and attributes.get("name"):
                kb = conn.execute(
                    sa.text("SELECT id FROM knowledge_bases WHERE name = :n LIMIT 1"),
                    {"n": str(attributes["name"])},
                ).fetchone()
                if kb:
                    rid = kb[0]
        if rt and rid:
            conn.execute(
                sa.text(
                    "INSERT INTO resource_acl_entries "
                    "(id, resource_type, resource_id, grantee_type, grantee_id, permissions) "
                    "VALUES (:id, :rt, :rid, 'group', :gid, :perm) "
                    "ON CONFLICT ON CONSTRAINT uq_resource_acl_grantee DO NOTHING"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "rt": rt,
                    "rid": rid,
                    "gid": group_id,
                    "perm": PERM_READ,
                },
            )

    op.drop_table("access_group_users")


def downgrade() -> None:
    op.create_table(
        "access_group_users",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "group_id"),
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO access_group_users (user_id, group_id) "
            "SELECT subject, group_id FROM access_group_members "
            "WHERE subject IN (SELECT id FROM users)"
        )
    )
    op.drop_table("access_group_members")
    op.drop_index("ix_resource_acl_entries_grantee_id", table_name="resource_acl_entries")
    op.drop_index("ix_resource_acl_entries_resource_id", table_name="resource_acl_entries")
    op.drop_index("ix_resource_acl_entries_resource_type", table_name="resource_acl_entries")
    op.drop_table("resource_acl_entries")
