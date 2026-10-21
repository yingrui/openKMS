"""A named external HTTP endpoint an Ontology Function may call.

Functions run in a sandbox whose only vocabulary used to be the openKMS API itself, so anything
that needed another system (a backtester, a pricing service) had to be wired outside the ontology.
Registering the service here gives the Function author a name — ``client.external("turtle")`` — and
gives the deployment one place to see, and rotate, the credential.

Deliberately small: a base URL, one credential, and the path prefixes this service may be called on.
The secret is stored encrypted and never returned by the API; the client resolves it at execution
time, so it is not part of the Function source.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

AUTH_KINDS = ("none", "bearer", "header", "hmac")
#: How the request reaches the service: a URL called from the sandbox, or a Service inside a
#: registered cluster called by the backend through that cluster's kubeconfig.
SERVICE_KINDS = ("http", "k8s_service")


class ExternalService(Base):
    __tablename__ = "external_services"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="http", server_default="http"
    )
    #: `http`: origin only (scheme + host + optional port + optional base path) — a Function
    #: supplies the rest. `k8s_service`: null; the coordinates below are used instead.
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cluster_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("kubernetes_clusters.id", ondelete="SET NULL"), nullable=True, index=True
    )
    namespace: Mapped[str | None] = mapped_column(String(256), nullable=True)
    service: Mapped[str | None] = mapped_column(String(256), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Fixed path prefix the service mounts at (``""`` when it serves ``/api/...`` at its root).
    base_path: Mapped[str] = mapped_column(
        String(512), nullable=False, default="", server_default=""
    )
    auth_kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default="none", server_default="none"
    )
    #: Header name for ``header`` auth (e.g. ``X-API-Key``) or ``hmac`` (default
    #: ``X-OpenKMS-Signature``); unused for bearer.
    auth_header_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Path prefixes the service may be called on, e.g. ``["/api/jobs", "/api/webhooks/"]``.
    allowed_paths: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    timeout_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=10, server_default="10"
    )
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
