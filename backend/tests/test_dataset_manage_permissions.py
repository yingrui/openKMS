"""Dataset API: manage vs view permission split."""

from app.api import datasets as datasets_api
from app.services.permission_catalog import (
    PERM_CONSOLE_DATASETS,
    PERM_ONTOLOGY_READ,
    PERM_ONTOLOGY_WRITE,
)


def test_dataset_view_includes_read_not_write():
    assert PERM_ONTOLOGY_READ in datasets_api._DATASET_VIEW
    assert PERM_ONTOLOGY_WRITE not in datasets_api._DATASET_VIEW
    assert PERM_CONSOLE_DATASETS in datasets_api._DATASET_VIEW


def test_dataset_manage_is_console_datasets_only():
    """Mutating dataset routes use require_permission(console:datasets), not ontology:write."""
    from app.api import datasets as mod

    assert not hasattr(mod, "_DATASET_MANAGE")
    assert PERM_CONSOLE_DATASETS == "console:datasets"
