"""Fernet-based encryption for DataSource credentials (username, password)."""
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Lazy-initialize Fernet from env key or derive from secret_key."""
    global _fernet
    if _fernet is not None:
        return _fernet

    key_b64 = settings.datasource_encryption_key
    if key_b64 and key_b64.strip():
        try:
            _fernet = Fernet(key_b64.strip().encode())
            return _fernet
        except Exception:
            raise ValueError(
                "OPENKMS_DATASOURCE_ENCRYPTION_KEY is set but invalid. "
                "Generate with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            ) from None

    # Fallback: derive from secret_key (dev only; production should set explicit key)
    salt = b"openkms-datasource-encryption"
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(settings.secret_key.encode()))
    _fernet = Fernet(key)
    return _fernet


def encrypt(plain: str) -> str:
    """Encrypt a string (e.g. username, password). Returns base64 ciphertext."""
    if plain is None or plain == "":
        return ""
    f = _get_fernet()
    cipher = f.encrypt(plain.encode("utf-8"))
    return cipher.decode("ascii")


def decrypt(cipher: str) -> str:
    """Decrypt a base64 ciphertext. Returns plain string."""
    if cipher is None or cipher == "":
        return ""
    f = _get_fernet()
    plain = f.decrypt(cipher.encode("ascii"))
    return plain.decode("utf-8")
