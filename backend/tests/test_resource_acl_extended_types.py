"""Tests for evaluation, glossary, and ontology type resource ACL."""

from app.services.acl.resource_acl_constants import (
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    RT_DATASET,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    SECURABLE_RESOURCE_TYPES,
)


def test_glossary_in_securable_resource_types():
    assert RT_DATASET in SECURABLE_RESOURCE_TYPES
    assert RT_GLOSSARY in SECURABLE_RESOURCE_TYPES
    assert RT_EVALUATION in SECURABLE_RESOURCE_TYPES
    assert RT_OBJECT_TYPE in SECURABLE_RESOURCE_TYPES
    assert RT_LINK_TYPE in SECURABLE_RESOURCE_TYPES


def test_migration_seed_perm_rwm():
    assert (PERM_READ | PERM_WRITE | PERM_MANAGE) == 7
