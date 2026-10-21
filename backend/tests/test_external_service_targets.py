"""An external service target is validated where the mistake is cheap to catch.

The expensive one is a cluster DNS name registered as `http`: it looks plausible, saves fine, and
fails at the first call from the sandbox (no cluster DNS there) — so it is refused at save time with
the kind that would work.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.ontology_external_services import (
    _validate_auth,
    _validate_base_path,
    _validate_base_url,
    _validate_paths,
    _validate_timeout,
)


def test_a_plain_origin_is_accepted_and_normalised():
    assert _validate_base_url("http://backend:8200/") == "http://backend:8200"
    assert _validate_base_url("https://pricing.example.com") == "https://pricing.example.com"


@pytest.mark.parametrize(
    "url",
    [
        "http://backend.stock.svc.cluster.local:8200",
        "http://backend.stock.svc:8200",
        "http://BACKEND.STOCK.SVC.CLUSTER.LOCAL:8200",
    ],
)
def test_a_cluster_service_name_is_refused_with_the_kind_that_works(url: str):
    with pytest.raises(HTTPException) as ei:
        _validate_base_url(url)
    assert ei.value.status_code == 400
    assert "k8s_service" in str(ei.value.detail)


@pytest.mark.parametrize("url", ["ftp://backend:8200", "backend:8200", "http://backend:8200?x=1"])
def test_a_non_origin_is_refused(url: str):
    with pytest.raises(HTTPException):
        _validate_base_url(url)


def test_allowed_paths_must_be_prefixes():
    assert _validate_paths(["/api/jobs", "/api/jobs", "/api/webhooks/openkms/"]) == [
        "/api/jobs",
        "/api/webhooks/openkms/",
    ]
    with pytest.raises(HTTPException, match="must be a path prefix"):
        _validate_paths(["api/jobs"])
    with pytest.raises(HTTPException, match="At least one"):
        _validate_paths(["  "])


def test_base_path_is_a_path_not_a_url():
    assert _validate_base_path("") == ""
    assert _validate_base_path("app/") == "/app"
    with pytest.raises(HTTPException):
        _validate_base_path("http://backend/app")


def test_auth_rules():
    assert _validate_auth("none", None) is None
    assert _validate_auth("hmac", None) == "X-OpenKMS-Signature"
    assert _validate_auth("header", "X-API-Key") == "X-API-Key"
    with pytest.raises(HTTPException):
        _validate_auth("header", "")
    with pytest.raises(HTTPException):
        _validate_auth("signed", None)


def test_timeout_range():
    assert _validate_timeout(30) == 30
    for bad in (0, 61):
        with pytest.raises(HTTPException):
            _validate_timeout(bad)
