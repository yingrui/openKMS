import pytest

from app.services.kubernetes.cluster_config import (
    managed_project_id,
    openkms_secret_labels,
    validate_env_key,
    validate_resource_name,
)
from app.services.projects.deploy_secrets import encrypt_values, decrypt_values, merge_values


def test_validate_resource_name():
    assert validate_resource_name("app-db") == "app-db"
    with pytest.raises(ValueError):
        validate_resource_name("App_DB")
    with pytest.raises(ValueError):
        validate_resource_name("-bad")


def test_validate_env_key():
    assert validate_env_key("DATABASE_URL") == "DATABASE_URL"
    with pytest.raises(ValueError):
        validate_env_key("1bad")


def test_openkms_labels():
    labels = openkms_secret_labels("proj-1")
    assert managed_project_id(labels) == "proj-1"
    assert managed_project_id({}) is None


def test_encrypt_roundtrip_and_merge():
    cipher = encrypt_values({"A": "1", "B": "2"})
    assert decrypt_values(cipher) == {"A": "1", "B": "2"}
    merged = merge_values(
        {"A": "1", "B": "2"},
        set_values={"A": "", "C": "3"},
        remove_keys=["B"],
    )
    assert merged == {"A": "1", "C": "3"}
