"""Dataset API: the data-layer permission split (view = data:read, mutate = data:write)."""

import inspect

from app.api import datasets as datasets_api
from app.services.permissions.permission_catalog import (
    PERM_CONSOLE_DATASETS,
    PERM_DATA_READ,
    PERM_ONTOLOGY_READ,
)


def test_dataset_view_is_data_read():
    """The data layer is gated by data:*, never by the ontology or console scopes."""
    assert datasets_api._DATASET_VIEW == (PERM_DATA_READ,)
    for foreign in (PERM_ONTOLOGY_READ, PERM_CONSOLE_DATASETS):
        assert foreign not in datasets_api._DATASET_VIEW


def test_dataset_routes_never_use_the_ontology_or_console_scopes():
    """Mutations carry `data:write`; the module must not reference the old scopes at all."""
    source = inspect.getsource(datasets_api)
    assert "PERM_DATA_WRITE" in source
    assert "PERM_CONSOLE_DATASETS" not in source
    assert "PERM_ONTOLOGY_READ" not in source
    assert "PERM_ONTOLOGY_WRITE" not in source
