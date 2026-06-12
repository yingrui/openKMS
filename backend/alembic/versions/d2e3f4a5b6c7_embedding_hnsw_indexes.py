"""Embedding ANN indexes (removed).

pgvector HNSW (and IVFFlat) require a fixed vector(N) column type. openKMS
allows each knowledge base / wiki space to use a different embedding model, so
stored vectors may have different dimensions in the same table. A table-level
ANN index would therefore be incorrect.

Semantic search continues to use cosine_distance on dimensionless vector columns.
"""

from typing import Sequence, Union

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
