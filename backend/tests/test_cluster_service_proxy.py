from app.services.kubernetes.cluster_service_proxy import join_proxy_path, service_proxy_resource_path


def test_service_proxy_resource_path():
    assert service_proxy_resource_path("ns", "web", 8080, "") == (
        "/api/v1/namespaces/ns/services/web:8080/proxy/"
    )
    assert service_proxy_resource_path("ns", "web", 8080, "/index.html") == (
        "/api/v1/namespaces/ns/services/web:8080/proxy/index.html"
    )


def test_join_proxy_path():
    assert join_proxy_path("/app", "assets/x.js") == "app/assets/x.js"
    assert join_proxy_path(None, "x") == "x"
    assert join_proxy_path("/app", "") == "app"
