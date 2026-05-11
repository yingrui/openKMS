"""Auth helper tests."""

from unittest.mock import Mock

from openkms_cli.auth import auth_expired_response


def test_auth_expired_response_detects_invalid_token_code():
    resp = Mock(status_code=401)
    resp.json.return_value = {"detail": {"code": "INVALID_OR_EXPIRED_TOKEN", "message": "x"}}
    assert auth_expired_response(resp) is True


def test_auth_expired_response_ignores_other_status():
    resp = Mock(status_code=403)
    resp.json.return_value = {"detail": {"code": "INVALID_OR_EXPIRED_TOKEN"}}
    assert auth_expired_response(resp) is False
