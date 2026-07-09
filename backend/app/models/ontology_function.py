"""Ontology Function registry, versions, executions, groups, and actions."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OntologyFunction(Base):
    __tablename__ = "ontology_functions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="code", server_default="code")
    object_type_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="SET NULL"), nullable=True, index=True
    )
    development_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="experimental", server_default="experimental"
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active")
    published_version_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("ontology_function_versions.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    web_api_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OntologyFunctionVersion(Base):
    __tablename__ = "ontology_function_versions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    function_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_functions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    input_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    entrypoint: Mapped[str] = mapped_column(String(64), nullable=False, default="execute", server_default="execute")
    runtime: Mapped[str] = mapped_column(String(32), nullable=False, default="python3", server_default="python3")
    validation_result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OntologyFunctionExecution(Base):
    __tablename__ = "ontology_function_executions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    function_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_functions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_function_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    caller_user_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    input_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OntologyGroup(Base):
    __tablename__ = "ontology_groups"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OntologyGroupObjectType(Base):
    __tablename__ = "ontology_group_object_types"

    group_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_groups.id", ondelete="CASCADE"), primary_key=True
    )
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), primary_key=True
    )


class OntologyActionType(Base):
    __tablename__ = "ontology_action_types"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    api_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    object_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("object_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False, default="function", server_default="function")
    function_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("ontology_functions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    function_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parameters: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active")
    created_by: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OntologyActionLog(Base):
    __tablename__ = "ontology_action_log"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    action_type_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("ontology_action_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    object_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    caller_user_id: Mapped[str | None] = mapped_column(String(512), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    input_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
