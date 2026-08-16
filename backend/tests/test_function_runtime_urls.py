"""URL helpers for ontology-function-service execute."""

from app.services.ontology.function_runtime import (
    _prefer_ipv4_loopback,
    function_client_base_url,
    ontology_function_service_base_url,
)


def test_prefer_ipv4_loopback_rewrites_localhost() -> None:
    assert _prefer_ipv4_loopback("http://localhost:8105") == "http://127.0.0.1:8105"
    assert _prefer_ipv4_loopback("http://localhost:8102/") == "http://127.0.0.1:8102/"
    assert _prefer_ipv4_loopback("http://127.0.0.1:8105") == "http://127.0.0.1:8105"
    assert _prefer_ipv4_loopback("http://ontology-function-service:8105") == (
        "http://ontology-function-service:8105"
    )


def test_function_urls_prefer_ipv4(monkeypatch) -> None:
    from app.config import settings

    monkeypatch.setattr(settings, "ontology_function_service_url", "http://localhost:8105")
    monkeypatch.setattr(settings, "openkms_backend_url", "http://localhost:8102")
    monkeypatch.setattr(settings, "ontology_function_client_base_url", None)
    assert ontology_function_service_base_url() == "http://127.0.0.1:8105"
    assert function_client_base_url() == "http://127.0.0.1:8102"

    monkeypatch.setattr(settings, "ontology_function_client_base_url", "http://host.docker.internal:8102")
    assert function_client_base_url() == "http://host.docker.internal:8102"
