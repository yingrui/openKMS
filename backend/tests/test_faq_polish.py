"""Unit tests for FAQ answer polish."""
import asyncio

import pytest

from app.services.faq_generation import polish_faq_answer


def test_polish_faq_answer_requires_both_fields():
    with pytest.raises(ValueError, match="required"):
        asyncio.run(
            polish_faq_answer("", "answer", {"base_url": "http://x/v1", "api_key": "k", "model_name": "m"})
        )
