"""What to call a dataset in prose, lists, messages and audit rows.

One function, no dependencies beyond the model, and deliberately **below** both `services/ontology` and `services/acl`:
the ACL admin surface needs to name a dataset, and reaching up into the ontology package for that closed a cycle.
"""
from __future__ import annotations

from app.models.dataset import Dataset


def dataset_label(dataset: Dataset) -> str:
    """By kind, not by a fallback pipe: a **file** dataset has no `schema_name`/`table_name`.

    `display_name or f"{schema}.{table}"` prints **null.null** for one, which is the bug that made this function exist;
    a file dataset falls back to its id, because it has no physical table to name.
    """
    name = (dataset.display_name or "").strip()
    if name:
        return name
    if dataset.kind == "file":
        return dataset.id
    return f"{dataset.schema_name}.{dataset.table_name}"
