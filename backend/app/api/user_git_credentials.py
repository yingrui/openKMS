"""User git PAT credentials (HTTPS remotes)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_auth
from app.database import get_db
from app.models.user_git_credential import UserGitCredential
from app.schemas.project import UserGitCredentialCreate, UserGitCredentialResponse
from app.services.credential_crypto import encrypt_secret
from app.services.feature_toggles import require_agents_feature

router = APIRouter(
    prefix="/user/git-credentials",
    tags=["user-git-credentials"],
    dependencies=[Depends(require_agents_feature)],
)


def _get_sub(request: Request) -> str:
    p = request.state.openkms_jwt_payload
    sub = p.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub


def _to_out(row: UserGitCredential) -> UserGitCredentialResponse:
    return UserGitCredentialResponse(
        id=row.id,
        provider=row.provider,
        label=row.label,
        username=row.username,
        scopes_hint=row.scopes_hint,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[UserGitCredentialResponse], dependencies=[Depends(require_auth)])
async def list_credentials(request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    r = await db.execute(
        select(UserGitCredential).where(UserGitCredential.user_sub == sub).order_by(UserGitCredential.created_at.desc())
    )
    return [_to_out(row) for row in r.scalars().all()]


@router.post("", response_model=UserGitCredentialResponse, status_code=201, dependencies=[Depends(require_auth)])
async def create_credential(
    body: UserGitCredentialCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sub = _get_sub(request)
    row = UserGitCredential(
        user_sub=sub,
        provider=body.provider.strip(),
        label=body.label.strip(),
        username=body.username.strip(),
        encrypted_pat=encrypt_secret(body.token),
        scopes_hint=body.scopes_hint,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{credential_id}", status_code=204, dependencies=[Depends(require_auth)])
async def delete_credential(credential_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    sub = _get_sub(request)
    row = await db.get(UserGitCredential, credential_id)
    if not row or row.user_sub != sub:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(row)
    await db.flush()
