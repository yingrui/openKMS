"""Two ways to reach an external service: a URL, or a Service inside a registered cluster.

A plain URL is called straight from the function sandbox. A Kubernetes Service is not reachable that
way — its DNS lives inside the cluster — so that kind is called by the openKMS backend through the
cluster's kubeconfig (the same tunnel the hosted-App proxy uses). The registry decides which, so a
Function's source (`client.external("turtle")`) does not change when the transport does.

Revision ID: k7l8m9n0b1v2
Revises: b5e7c1a9d3f2
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k7l8m9n0b1v2"
down_revision: Union[str, Sequence[str], None] = "b5e7c1a9d3f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "external_services",
        sa.Column("kind", sa.String(length=16), server_default="http", nullable=False),
    )
    op.add_column("external_services", sa.Column("cluster_id", sa.String(length=64), nullable=True))
    op.add_column("external_services", sa.Column("namespace", sa.String(length=256), nullable=True))
    op.add_column("external_services", sa.Column("service", sa.String(length=256), nullable=True))
    op.add_column("external_services", sa.Column("port", sa.Integer(), nullable=True))
    op.add_column(
        "external_services",
        sa.Column("base_path", sa.String(length=512), server_default="", nullable=False),
    )
    op.create_foreign_key(
        "external_services_cluster_id_fkey",
        "external_services",
        "kubernetes_clusters",
        ["cluster_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_external_services_cluster_id", "external_services", ["cluster_id"], unique=False
    )
    # A Kubernetes-service entry has no URL; a URL entry has no cluster coordinates.
    op.alter_column("external_services", "base_url", existing_type=sa.String(length=512), nullable=True)


def downgrade() -> None:
    # Rows that only make sense as a cluster service cannot satisfy the NOT NULL URL.
    op.execute("DELETE FROM external_services WHERE base_url IS NULL")
    op.alter_column("external_services", "base_url", existing_type=sa.String(length=512), nullable=False)
    op.drop_index("ix_external_services_cluster_id", table_name="external_services")
    op.drop_constraint("external_services_cluster_id_fkey", "external_services", type_="foreignkey")
    op.drop_column("external_services", "base_path")
    op.drop_column("external_services", "port")
    op.drop_column("external_services", "service")
    op.drop_column("external_services", "namespace")
    op.drop_column("external_services", "cluster_id")
    op.drop_column("external_services", "kind")
