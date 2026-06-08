"""Registered connector kinds: labels, secrets, structured inputs, dataset outputs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.services.connector_search.schemas import ZHIPU_WEB_SEARCH_OUTPUT_SCHEMA
from app.services.credential_encryption import decrypt, encrypt

CATEGORY_SYNC = "sync"
CATEGORY_SEARCH_TOOL = "search_tool"

ZHIPU_API_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
ZHIPU_WEB_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search"


@dataclass(frozen=True, slots=True)
class ConnectorInputField:
    """Declarative non-secret input (e.g. API base URL)."""

    key: str
    label: str
    field_type: str  # "url" | "string" | "select" | "boolean" | "integer"
    required: bool = True
    default: str | None = None
    placeholder: str | None = None
    options: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ConnectorOutputSlot:
    """Target sink for sync jobs (e.g. ontology dataset)."""

    slot: str
    label: str
    description: str
    resource: str  # "dataset"


@dataclass(frozen=True, slots=True)
class ConnectorKindSpec:
    """Static metadata for one connector implementation."""

    kind: str
    category: str
    label: str
    description: str
    secret_keys: frozenset[str]
    input_fields: tuple[ConnectorInputField, ...] = ()
    output_slots: tuple[ConnectorOutputSlot, ...] = ()
    output_schema: dict[str, Any] | None = None
    default_settings: dict[str, Any] | None = None


CONNECTOR_KINDS: dict[str, ConnectorKindSpec] = {
    "tushare": ConnectorKindSpec(
        kind="tushare",
        category=CATEGORY_SYNC,
        label="Tushare",
        description="China market data via tushare.pro (token + API URL; sync targets two datasets).",
        secret_keys=frozenset({"TUSHARE_TOKEN"}),
        input_fields=(
            ConnectorInputField(
                key="api_base_url",
                label="Tushare API base URL",
                field_type="url",
                required=True,
                default="https://api.tushare.pro",
                placeholder="https://api.tushare.pro",
            ),
        ),
        output_slots=(
            ConnectorOutputSlot(
                slot="stock_trade_daily",
                label="Daily stock data",
                description="Tabular target for daily quotes, adj factor, and dividends (per trading day), aligned with a stock_trade_daily-style pipeline.",
                resource="dataset",
            ),
            ConnectorOutputSlot(
                slot="trade_calendar",
                label="Trade calendar",
                description="Tabular target for exchange trade calendars (e.g. SSE/SZSE cal_date / is_open), aligned with a trade_calendar-style pipeline.",
                resource="dataset",
            ),
        ),
    ),
    "zhipu_web_search": ConnectorKindSpec(
        kind="zhipu_web_search",
        category=CATEGORY_SEARCH_TOOL,
        label="Zhipu web search",
        description="Web search via Zhipu BigModel (Bearer API key). Used by Agents as an on-demand search tool; no dataset outputs.",
        secret_keys=frozenset({"ZHIPU_API_KEY"}),
        input_fields=(
            ConnectorInputField(
                key="api_base_url",
                label="API base URL",
                field_type="url",
                required=True,
                default=ZHIPU_API_BASE_URL,
                placeholder=ZHIPU_API_BASE_URL,
            ),
            ConnectorInputField(
                key="search_engine",
                label="Search engine",
                field_type="select",
                required=True,
                default="search_std",
                options=("search_std", "search_pro", "search_pro_sogou", "search_pro_quark"),
            ),
            ConnectorInputField(
                key="search_intent",
                label="Search intent detection",
                field_type="boolean",
                required=False,
                default="false",
            ),
            ConnectorInputField(
                key="count",
                label="Result count",
                field_type="integer",
                required=False,
                default="10",
            ),
            ConnectorInputField(
                key="content_size",
                label="Content size",
                field_type="select",
                required=False,
                default="medium",
                options=("medium", "high"),
            ),
            ConnectorInputField(
                key="search_recency_filter",
                label="Recency filter",
                field_type="select",
                required=False,
                default="noLimit",
                options=("oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"),
            ),
            ConnectorInputField(
                key="search_domain_filter",
                label="Domain filter (optional)",
                field_type="string",
                required=False,
                placeholder="www.example.com",
            ),
        ),
        output_slots=(),
        output_schema=ZHIPU_WEB_SEARCH_OUTPUT_SCHEMA,
        default_settings={"web_search_url": ZHIPU_WEB_SEARCH_URL},
    ),
}


def list_kind_specs() -> list[ConnectorKindSpec]:
    return sorted(CONNECTOR_KINDS.values(), key=lambda s: s.kind)


def get_kind_spec(kind: str) -> ConnectorKindSpec | None:
    return CONNECTOR_KINDS.get(kind)


def validate_kind(kind: str) -> None:
    if kind not in CONNECTOR_KINDS:
        allowed = ", ".join(sorted(CONNECTOR_KINDS))
        raise ValueError(f"Unknown connector kind '{kind}'. Allowed: {allowed}")


def validate_secrets_for_kind(kind: str, secrets: dict[str, str]) -> None:
    spec = CONNECTOR_KINDS.get(kind)
    if not spec:
        validate_kind(kind)
        return
    for k in secrets:
        if k not in spec.secret_keys:
            raise ValueError(f"Unknown secret key '{k}' for connector kind '{kind}'.")


_URLish = re.compile(r"^https?://[^\s]+$", re.IGNORECASE)


def _coerce_input_value(field: ConnectorInputField, raw: Any) -> Any:
    if field.field_type == "boolean":
        if isinstance(raw, bool):
            return raw
        s = str(raw).strip().lower() if raw is not None else ""
        if not s and field.default is not None:
            s = str(field.default).strip().lower()
        return s in ("true", "1", "yes")
    if field.field_type == "integer":
        s = str(raw).strip() if raw is not None else ""
        if not s and field.default is not None:
            s = str(field.default).strip()
        if not s:
            if field.required:
                raise ValueError(f"Missing required input '{field.key}'.")
            return None
        try:
            return int(s)
        except ValueError as e:
            raise ValueError(f"Input '{field.key}' must be an integer.") from e
    s = (str(raw).strip() if raw is not None else "") or ""
    if not s and field.default is not None:
        s = str(field.default).strip()
    if field.required and not s:
        raise ValueError(f"Missing required input '{field.key}'.")
    if s and field.field_type == "url" and not _URLish.match(s):
        raise ValueError(f"Input '{field.key}' must be a valid http(s) URL.")
    if s and field.field_type == "select" and field.options and s not in field.options:
        allowed = ", ".join(field.options)
        raise ValueError(f"Input '{field.key}' must be one of: {allowed}.")
    return s if s else None


def normalize_and_validate_inputs(kind: str, inputs: dict[str, Any] | None) -> dict[str, Any]:
    """Apply defaults, then validate required fields and types. Returns normalized dict."""
    spec = CONNECTOR_KINDS.get(kind)
    if not spec or not spec.input_fields:
        if inputs:
            raise ValueError(f"Connector kind '{kind}' does not declare inputs; remove inputs or use an empty object.")
        return {}

    out: dict[str, Any] = dict(inputs or {})
    normalized: dict[str, Any] = {}
    for field in spec.input_fields:
        cell = out.get(field.key)
        if cell is None and field.key not in out:
            cell = None
        value = _coerce_input_value(field, cell)
        if value is not None:
            normalized[field.key] = value
        elif field.required:
            raise ValueError(f"Missing required input '{field.key}' for connector kind '{kind}'.")
    for k in out:
        if k not in {f.key for f in spec.input_fields}:
            raise ValueError(f"Unknown input key '{k}' for connector kind '{kind}'.")
    return normalized


def merge_kind_settings(kind: str, settings: dict[str, Any] | None) -> dict[str, Any]:
    """Apply kind default_settings, then user settings (user wins)."""
    spec = CONNECTOR_KINDS.get(kind)
    merged: dict[str, Any] = dict(spec.default_settings) if spec and spec.default_settings else {}
    if settings:
        merged.update(settings)
    return merged


def normalize_and_validate_settings(kind: str, settings: dict[str, Any] | None) -> dict[str, Any]:
    """Merge kind defaults and validate search_tool settings when applicable."""
    merged = merge_kind_settings(kind, settings)
    if kind == "zhipu_web_search":
        url = str(merged.get("web_search_url") or "").strip()
        if not url:
            raise ValueError("Missing setting 'web_search_url' for Zhipu web search connector.")
        if not _URLish.match(url):
            raise ValueError("Setting 'web_search_url' must be a valid http(s) URL.")
        merged["web_search_url"] = url
    return merged


def normalize_and_validate_outputs(kind: str, outputs: dict[str, Any] | None) -> dict[str, str]:
    """Validate slot keys and non-empty dataset id strings."""
    spec = CONNECTOR_KINDS.get(kind)
    if not spec:
        validate_kind(kind)
        return {}
    if spec.category == CATEGORY_SEARCH_TOOL:
        if outputs:
            raise ValueError(f"Connector kind '{kind}' is search_tool and does not use outputs.")
        return {}
    if not spec.output_slots:
        if outputs:
            raise ValueError(f"Connector kind '{kind}' does not declare outputs; remove outputs or use an empty object.")
        return {}

    slots = {s.slot for s in spec.output_slots}
    raw = dict(outputs or {})
    out: dict[str, str] = {}
    for slot in spec.output_slots:
        v = raw.get(slot.slot)
        sid = (str(v).strip() if v is not None else "") or ""
        if not sid:
            raise ValueError(f"Missing output dataset for slot '{slot.slot}' ({slot.label}).")
        out[slot.slot] = sid
    for k in raw:
        if k not in slots:
            raise ValueError(f"Unknown output slot '{k}' for connector kind '{kind}'.")
    return out


def merge_secrets_encrypted(
    existing_cipher: str | None,
    patch: dict[str, str] | None,
    *,
    kind: str,
) -> str | None:
    """Merge PATCH secrets into stored ciphertext. Empty string removes a key. None patch = unchanged.

    Sending ``{}`` clears all stored secrets for the connector.
    """
    if patch is None:
        return existing_cipher
    if len(patch) == 0:
        return None
    validate_secrets_for_kind(kind, patch)
    current: dict[str, str] = {}
    if existing_cipher:
        try:
            raw = decrypt(existing_cipher)
            if raw:
                current = dict(json.loads(raw))
        except Exception:
            current = {}
    for k, v in patch.items():
        if v == "":
            current.pop(k, None)
        else:
            current[k] = v
    if not current:
        return None
    return encrypt(json.dumps(current, sort_keys=True))


def decrypt_secrets_blob(cipher: str | None) -> dict[str, str]:
    """Decrypt stored secrets JSON; internal use by workers or tests."""
    if not cipher:
        return {}
    try:
        data = json.loads(decrypt(cipher))
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items() if isinstance(v, str)}
    except Exception:
        pass
    return {}


def secrets_status(spec: ConnectorKindSpec, cipher: str | None) -> dict[str, bool]:
    """Which secret keys have a non-empty value (for API responses; no values leaked)."""
    plain = decrypt_secrets_blob(cipher)
    return {k: bool(plain.get(k)) for k in sorted(spec.secret_keys)}
