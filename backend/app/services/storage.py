"""S3/MinIO object storage service."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import BinaryIO

from app.config import settings


@dataclass(frozen=True, slots=True)
class StorageObjectInfo:
    key: str
    size: int
    last_modified: datetime | None


@dataclass(frozen=True, slots=True)
class StorageListPage:
    prefix: str
    folders: list[str]
    objects: list[StorageObjectInfo]
    next_continuation_token: str | None
    truncated: bool


def validate_storage_key(key: str) -> str:
    k = (key or "").lstrip("/")
    if not k or ".." in k.split("/"):
        raise ValueError("Invalid storage key")
    return k


def validate_storage_prefix(prefix: str) -> str:
    p = (prefix or "").lstrip("/")
    if ".." in p.split("/"):
        raise ValueError("Invalid storage prefix")
    return p


def _client():
    """Create S3 client. Uses MinIO-compatible endpoint if AWS_ENDPOINT_URL is set."""
    import boto3
    from botocore.config import Config

    kwargs: dict = {
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
        "region_name": settings.aws_region,
        "config": Config(signature_version="s3v4"),
    }
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    return boto3.client("s3", **kwargs)


def _bucket() -> str:
    return settings.aws_bucket_name


def upload_object(key: str, body: bytes | BinaryIO, content_type: str | None = None) -> None:
    """Upload bytes or file-like object to S3."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)")

    extra = {}
    if content_type:
        extra["ContentType"] = content_type

    client = _client()
    if isinstance(body, bytes):
        client.put_object(Bucket=_bucket(), Key=key, Body=body, **extra)
    else:
        client.upload_fileobj(body, _bucket(), key, ExtraArgs=extra or None)


def get_object(key: str) -> bytes:
    """Download object from S3. Raises if not found."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured")

    client = _client()
    resp = client.get_object(Bucket=_bucket(), Key=key)
    return resp["Body"].read()


def get_object_stream(key: str):
    """Stream object from S3. Returns a readable stream."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured")

    client = _client()
    resp = client.get_object(Bucket=_bucket(), Key=key)
    return resp["Body"]


def get_redirect_url(key: str, expires_in: int = 3600) -> str:
    """Generate presigned GET URL. Rewrites to frontend proxy URL if configured (avoids S3 CORS)."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured")
    client = _client()
    raw_url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires_in,
    )
    # Rewrite to frontend proxy (/buckets/openkms) so img loads avoid S3 CORS
    frontend = settings.frontend_url.rstrip("/")
    bucket = _bucket()
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(raw_url)
    path = parsed.path
    prefix = f"/{bucket}/"
    if path.startswith(prefix):
        key_path = path[len(prefix) :]
        proxy_path = f"/buckets/{bucket}/{key_path}"
        proxy_url = f"{frontend}{proxy_path}"
        if parsed.query:
            proxy_url += f"?{parsed.query}"
        return proxy_url
    return raw_url


def ensure_bucket() -> None:
    """Create bucket if it does not exist. Configure CORS for frontend image loading (redirect to S3)."""
    if not settings.storage_enabled:
        return
    from botocore.exceptions import ClientError

    client = _client()
    try:
        client.head_bucket(Bucket=_bucket())
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchBucket"):
            client.create_bucket(Bucket=_bucket())

    # CORS: allow frontend origin for GET (img loads after backend redirect to presigned URL)
    frontend_origin = settings.frontend_url.rstrip("/")
    cors_config = {
        "CORSRules": [
            {
                "AllowedOrigins": [frontend_origin],
                "AllowedMethods": ["GET", "HEAD"],
                "AllowedHeaders": ["*"],
                "ExposeHeaders": [],
            }
        ]
    }
    try:
        client.put_bucket_cors(Bucket=_bucket(), CORSConfiguration=cors_config)
    except ClientError:
        pass  # Some backends don't support CORS; ignore


def delete_objects_by_prefix(prefix: str) -> None:
    """Delete all objects with the given prefix (e.g. 'file_hash/')."""
    if not settings.storage_enabled:
        return
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix):
        for obj in page.get("Contents", []):
            client.delete_object(Bucket=_bucket(), Key=obj["Key"])


def object_exists(key: str) -> bool:
    """Check if object exists in S3."""
    if not settings.storage_enabled:
        return False

    try:
        _client().head_object(Bucket=_bucket(), Key=key)
        return True
    except Exception:
        return False


def object_last_modified(key: str) -> datetime | None:
    """Return S3 LastModified for the object, or None if missing or storage disabled."""
    if not settings.storage_enabled:
        return None
    try:
        resp = _client().head_object(Bucket=_bucket(), Key=key)
        lm = resp.get("LastModified")
        if lm is None:
            return None
        return lm if lm.tzinfo else lm.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def delete_object(key: str) -> None:
    """Delete a single object from S3."""
    if not settings.storage_enabled:
        return
    _client().delete_object(Bucket=_bucket(), Key=validate_storage_key(key))


def copy_object(src_key: str, dest_key: str) -> None:
    """Server-side copy within the configured bucket."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured")
    src = validate_storage_key(src_key)
    dest = validate_storage_key(dest_key)
    if src == dest:
        return
    client = _client()
    client.copy_object(
        Bucket=_bucket(),
        Key=dest,
        CopySource={"Bucket": _bucket(), "Key": src},
    )


def list_storage_page(
    prefix: str = "",
    *,
    continuation_token: str | None = None,
    max_keys: int = 100,
    delimiter: str = "/",
) -> StorageListPage:
    """List one page of objects and common prefixes under prefix."""
    if not settings.storage_enabled:
        raise RuntimeError("S3 storage is not configured")
    safe_prefix = validate_storage_prefix(prefix)
    limit = max(1, min(int(max_keys), 200))
    kwargs: dict = {
        "Bucket": _bucket(),
        "Prefix": safe_prefix,
        "Delimiter": delimiter,
        "MaxKeys": limit,
    }
    if continuation_token:
        kwargs["ContinuationToken"] = continuation_token
    resp = _client().list_objects_v2(**kwargs)
    folders = [cp["Prefix"] for cp in resp.get("CommonPrefixes") or []]
    objects: list[StorageObjectInfo] = []
    for obj in resp.get("Contents") or []:
        key = obj.get("Key") or ""
        if key == safe_prefix or key.endswith("/"):
            continue
        lm = obj.get("LastModified")
        if lm is not None and lm.tzinfo is None:
            lm = lm.replace(tzinfo=timezone.utc)
        objects.append(
            StorageObjectInfo(
                key=key,
                size=int(obj.get("Size") or 0),
                last_modified=lm,
            )
        )
    return StorageListPage(
        prefix=safe_prefix,
        folders=folders,
        objects=objects,
        next_continuation_token=resp.get("NextContinuationToken"),
        truncated=bool(resp.get("IsTruncated")),
    )


def iter_object_keys(prefix: str) -> list[str]:
    """List all object keys under prefix (server-side pagination)."""
    if not settings.storage_enabled:
        return []
    safe_prefix = validate_storage_prefix(prefix)
    client = _client()
    paginator = client.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=_bucket(), Prefix=safe_prefix):
        for obj in page.get("Contents") or []:
            key = obj.get("Key") or ""
            if key and not key.endswith("/"):
                keys.append(key)
    return keys


def move_object_key(src_key: str, dest_key: str, *, delete_source: bool = True) -> bool:
    """Copy object to dest; optionally delete source. Returns False if source missing."""
    src = validate_storage_key(src_key)
    dest = validate_storage_key(dest_key)
    if not object_exists(src):
        return False
    if object_exists(dest) and dest != src:
        return True
    copy_object(src, dest)
    if delete_source and src != dest:
        delete_object(src)
    return True


def move_prefix(
    source_prefix: str,
    destination_prefix: str,
    *,
    delete_source: bool = True,
) -> tuple[int, int, list[str]]:
    """Move all objects under source_prefix into destination_prefix (preserving relatives)."""
    src_prefix = validate_storage_prefix(source_prefix)
    if src_prefix and not src_prefix.endswith("/"):
        src_prefix += "/"
    dest_prefix = validate_storage_prefix(destination_prefix)
    if dest_prefix and not dest_prefix.endswith("/"):
        dest_prefix += "/"
    moved = 0
    skipped = 0
    errors: list[str] = []
    for key in iter_object_keys(src_prefix):
        if not key.startswith(src_prefix):
            skipped += 1
            continue
        rel = key[len(src_prefix) :]
        if not rel or ".." in rel.split("/"):
            skipped += 1
            continue
        dest_key = f"{dest_prefix}{rel}"
        try:
            if move_object_key(key, dest_key, delete_source=delete_source):
                moved += 1
            else:
                skipped += 1
        except Exception as e:
            errors.append(f"{key}: {e}")
    return moved, skipped, errors

