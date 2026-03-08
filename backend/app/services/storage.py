"""S3/MinIO object storage service."""

from typing import BinaryIO

from app.config import settings


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
    frontend = settings.keycloak_frontend_url.rstrip("/")
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
    frontend_origin = settings.keycloak_frontend_url.rstrip("/")
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


