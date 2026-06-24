"""Encrypt/decrypt user secrets (git PAT) using Fernet derived from app secret."""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    key = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Invalid encrypted credential") from e
