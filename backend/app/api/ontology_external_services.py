"""External HTTP services an Ontology Function may call (`client.external("turtle")`).

Registered by the author, next to the Function that uses it — not in Console — because the unit that
needs the credential is the Function. The list endpoint never returns the secret; the resolve
endpoint (called by the function runtime with the *caller's* token) does, which is what makes the
sandbox able to send the request.

Reads/writes need `ontology:read` / `ontology:write`; resolving needs the same read permission plus
an authenticated caller, and is recorded by the audit middleware like any other POST.
"""

from __future__ import annotations

import uuid
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_any_permission, require_auth
from app.api.ontology.deps import validate_api_name
from app.database import get_db
from app.models.external_service import AUTH_KINDS, ExternalService
from app.services.credentials.credential_encryption import decrypt, encrypt
from app.services.permissions.permission_catalog import PERM_ONTOLOGY_READ, PERM_ONTOLOGY_WRITE

router = APIRouter(
    prefix="/ontology/external-services",
    tags=["ontology-external-services"],
    dependencies=[Depends(require_auth)],
)

MAX_TIMEOUT_SECONDS = 60


class ExternalServiceCreate(BaseModel):
    api_name: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=256)
    description: str | None = None
    base_url: str = Field(min_length=1, max_length=512)
    auth_kind: str = "none"
    auth_header_name: str | None = None
    secret: str | None = None
    allowed_paths: list[str] = []
    timeout_seconds: int = 10


class ExternalServiceUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    base_url: str | None = None
    auth_kind: str | None = None
    auth_header_name: str | None = None
    #: Omit to keep the stored secret; send an empty string to clear it.
    secret: str | None = None
    allowed_paths: list[str] | None = None
    timeout_seconds: int | None = None


class ExternalServiceResponse(BaseModel):
    id: str
    api_name: str
    display_name: str
    description: str | None = None
    base_url: str
    auth_kind: str
    auth_header_name: str | None = None
    has_secret: bool
    allowed_paths: list[str]
    timeout_seconds: int
    created_at: object
    updated_at: object


class ExternalServiceResolveResponse(BaseModel):
    """What the function runtime needs to make the call itself."""

    api_name: str
    base_url: str
    auth_kind: str
    auth_header_name: str | None = None
    secret: str | None = None
    allowed_paths: list[str]
    timeout_seconds: int


def _validate_base_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="base_url must be an http(s) origin, e.g. http://backend:8200")
    if parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="base_url must not carry a query or fragment")
    return value.strip().rstrip("/")


def _validate_paths(paths: list[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in paths:
        path = (raw or "").strip()
        if not path:
            continue
        if not path.startswith("/") or "://" in path:
            raise HTTPException(
                status_code=400, detail=f"allowed path {path!r} must be a path prefix starting with '/'"
            )
        if path not in cleaned:
            cleaned.append(path)
    if not cleaned:
        raise HTTPException(status_code=400, detail="At least one allowed path prefix is required")
    return cleaned


def _validate_auth(auth_kind: str, header_name: str | None) -> str | None:
    if auth_kind not in AUTH_KINDS:
        raise HTTPException(status_code=400, detail=f"auth_kind must be one of {AUTH_KINDS}")
    if auth_kind == "header":
        name = (header_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="auth_header_name is required for header auth")
        return name
    if auth_kind == "hmac":
        # Signature header defaults to the one this project's receivers check.
        return (header_name or "").strip() or "X-OpenKMS-Signature"
    return None


def _validate_timeout(value: int) -> int:
    if value < 1 or value > MAX_TIMEOUT_SECONDS:
        raise HTTPException(
            status_code=400, detail=f"timeout_seconds must be between 1 and {MAX_TIMEOUT_SECONDS}"
        )
    return value


def _to_response(service: ExternalService) -> ExternalServiceResponse:
    return ExternalServiceResponse(
        id=service.id,
        api_name=service.api_name,
        display_name=service.display_name,
        description=service.description,
        base_url=service.base_url,
        auth_kind=service.auth_kind,
        auth_header_name=service.auth_header_name,
        has_secret=bool(service.secret_encrypted),
        allowed_paths=list(service.allowed_paths or []),
        timeout_seconds=service.timeout_seconds,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


async def _get_service(db: AsyncSession, service_id: str) -> ExternalService:
    service = await db.get(ExternalService, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="External service not found")
    return service


@router.get("", response_model=list[ExternalServiceResponse])
async def list_external_services(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    rows = (
        await db.execute(select(ExternalService).order_by(ExternalService.api_name))
    ).scalars().all()
    return [_to_response(r) for r in rows]


@router.post("", response_model=ExternalServiceResponse, status_code=201)
async def create_external_service(
    body: ExternalServiceCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    validate_api_name(body.api_name)
    existing = await db.execute(
        select(ExternalService).where(ExternalService.api_name == body.api_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"api_name {body.api_name!r} is already registered")
    auth_header_name = _validate_auth(body.auth_kind, body.auth_header_name)
    if body.auth_kind != "none" and not (body.secret or "").strip():
        raise HTTPException(status_code=400, detail="A secret is required for this auth_kind")

    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    uname = p.get("preferred_username") or p.get("name")
    service = ExternalService(
        id=str(uuid.uuid4()),
        api_name=body.api_name,
        display_name=body.display_name.strip(),
        description=(body.description or "").strip() or None,
        base_url=_validate_base_url(body.base_url),
        auth_kind=body.auth_kind,
        auth_header_name=auth_header_name,
        secret_encrypted=encrypt(body.secret.strip()) if (body.secret or "").strip() else None,
        allowed_paths=_validate_paths(body.allowed_paths),
        timeout_seconds=_validate_timeout(body.timeout_seconds),
        created_by=sub if isinstance(sub, str) else None,
        created_by_name=str(uname)[:256] if isinstance(uname, str) and uname.strip() else None,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return _to_response(service)


@router.patch("/{service_id}", response_model=ExternalServiceResponse)
async def update_external_service(
    service_id: str,
    body: ExternalServiceUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    service = await _get_service(db, service_id)
    if body.display_name is not None:
        service.display_name = body.display_name.strip()
    if body.description is not None:
        service.description = body.description.strip() or None
    if body.base_url is not None:
        service.base_url = _validate_base_url(body.base_url)
    if body.auth_kind is not None:
        service.auth_kind = body.auth_kind
        service.auth_header_name = _validate_auth(body.auth_kind, body.auth_header_name)
        if body.auth_kind == "none":
            service.secret_encrypted = None
    elif body.auth_header_name is not None:
        service.auth_header_name = _validate_auth(service.auth_kind, body.auth_header_name)
    if body.secret is not None:
        service.secret_encrypted = encrypt(body.secret.strip()) if body.secret.strip() else None
    if service.auth_kind != "none" and not service.secret_encrypted:
        raise HTTPException(status_code=400, detail="A secret is required for this auth_kind")
    if body.allowed_paths is not None:
        service.allowed_paths = _validate_paths(body.allowed_paths)
    if body.timeout_seconds is not None:
        service.timeout_seconds = _validate_timeout(body.timeout_seconds)
    await db.commit()
    await db.refresh(service)
    return _to_response(service)


@router.delete("/{service_id}", status_code=204)
async def delete_external_service(
    service_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_WRITE)),
):
    service = await _get_service(db, service_id)
    await db.delete(service)


@router.post("/by-api-name/{api_name}/resolve", response_model=ExternalServiceResolveResponse)
async def resolve_external_service(
    api_name: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_any_permission(PERM_ONTOLOGY_READ)),
):
    """Hand the runtime one service's URL and credential.

    Called by `openkms_functions` when a Function first uses `client.external(name)`; the caller's
    token is what authorises it, and the audit middleware records the call (who resolved which
    service). The path allowlist travels with the answer, and the client refuses anything outside it
    before sending — the sandbox makes the request, the registry decides where it may go.
    """
    service = (
        await db.execute(select(ExternalService).where(ExternalService.api_name == api_name))
    ).scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"External service not found: {api_name}")
    return ExternalServiceResolveResponse(
        api_name=service.api_name,
        base_url=service.base_url,
        auth_kind=service.auth_kind,
        auth_header_name=service.auth_header_name,
        secret=decrypt(service.secret_encrypted) if service.secret_encrypted else None,
        allowed_paths=list(service.allowed_paths or []),
        timeout_seconds=service.timeout_seconds,
    )
