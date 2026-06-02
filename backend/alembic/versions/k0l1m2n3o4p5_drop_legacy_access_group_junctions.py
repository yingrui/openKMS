"""Drop legacy access_group junction tables (scopes live in resource_acl_entries).

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-06-02

Keeps access_groups and access_group_members.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k0l1m2n3o4p5"
down_revision: Union[str, Sequence[str], None] = "j9k0l1m2n3o4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LEGACY_JUNCTION_TABLES = (
    "access_group_data_resources",
    "access_group_channels",
    "access_group_article_channels",
    "access_group_knowledge_bases",
    "access_group_wiki_spaces",
    "access_group_evaluations",
    "access_group_datasets",
    "access_group_object_types",
    "access_group_link_types",
)


def upgrade() -> None:
    for table in _LEGACY_JUNCTION_TABLES:
        op.drop_table(table)


def downgrade() -> None:
    op.create_table(
        "access_group_channels",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("channel_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["document_channels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "channel_id"),
    )
    op.create_table(
        "access_group_article_channels",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("article_channel_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["article_channel_id"], ["article_channels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "article_channel_id"),
    )
    op.create_table(
        "access_group_knowledge_bases",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("knowledge_base_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["knowledge_base_id"], ["knowledge_bases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "knowledge_base_id"),
    )
    op.create_table(
        "access_group_wiki_spaces",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("wiki_space_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["wiki_space_id"], ["wiki_spaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "wiki_space_id"),
    )
    op.create_table(
        "access_group_evaluations",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("evaluation_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["evaluation_id"], ["evaluations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "evaluation_id"),
    )
    op.create_table(
        "access_group_datasets",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("dataset_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "dataset_id"),
    )
    op.create_table(
        "access_group_object_types",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("object_type_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["object_type_id"], ["object_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "object_type_id"),
    )
    op.create_table(
        "access_group_link_types",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("link_type_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["link_type_id"], ["link_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "link_type_id"),
    )
    op.create_table(
        "access_group_data_resources",
        sa.Column("group_id", sa.String(length=36), nullable=False),
        sa.Column("data_resource_id", sa.String(length=36), nullable=False),
        sa.ForeignKeyConstraint(["data_resource_id"], ["data_resources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["access_groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "data_resource_id"),
    )
