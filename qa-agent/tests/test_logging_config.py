from qa_agent.logging_config import preview_text


def test_preview_text_truncates():
    assert preview_text("hello", 10) == "hello"
    assert preview_text("x" * 20, 10) == "xxxxxxxxx…"
