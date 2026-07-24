from app.services.ontology.sdk_codegen import render_sdk_source


def test_render_sdk_source_contains_types_and_queries() -> None:
    src = render_sdk_source(
        object_types=[("Employee", "Employee")],
        queries=[("helloGreeting", "Hello")],
    )
    assert "class Employee:" in src
    assert 'api_name: str = "Employee"' in src
    assert "class hello_greeting:" in src
    assert 'api_name: str = "helloGreeting"' in src
    assert '"Employee"' in src
