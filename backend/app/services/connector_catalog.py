"""Registered connector kinds: labels, secrets, structured inputs, dataset outputs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from app.services.credential_encryption import decrypt, encrypt


@dataclass(frozen=True, slots=True)
class ConnectorInputField:
    """Declarative non-secret input (e.g. API base URL)."""

    key: str
    label: str
    field_type: str  # "url" | "string"
    required: bool = True
    default: str | None = None
    placeholder: str | None = None


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
    label: str
    description: str
    secret_keys: frozenset[str]
    input_fields: tuple[ConnectorInputField, ...] = ()
    output_slots: tuple[ConnectorOutputSlot, ...] = ()


CONNECTOR_KINDS: dict[str, ConnectorKindSpec] = {
    "tushare": ConnectorKindSpec(
        kind="tushare",
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


def normalize_and_validate_inputs(kind: str, inputs: dict[str, Any] | None) -> dict[str, Any]:
    """Apply defaults, then validate required fields and types. Returns normalized dict."""
    spec = CONNECTOR_KINDS.get(kind)
    if not spec or not spec.input_fields:
        if inputs:
            raise ValueError(f"Connector kind '{kind}' does not declare inputs; remove inputs or use an empty object.")
        return {}

    out: dict[str, Any] = dict(inputs or {})
    for field in spec.input_fields:
        cell = out.get(field.key)
        s = (str(cell).strip() if cell is not None else "") or ""
        if not s and field.default is not None:
            s = str(field.default).strip()
            out[field.key] = s
        if field.required and not s:
            raise ValueError(f"Missing required input '{field.key}' for connector kind '{kind}'.")
        if s and field.field_type == "url" and not _URLish.match(s):
            raise ValueError(f"Input '{field.key}' must be a valid http(s) URL.")
        if s:
            out[field.key] = s
    for k in list(out.keys()):
        if k not in {f.key for f in spec.input_fields}:
            raise ValueError(f"Unknown input key '{k}' for connector kind '{kind}'.")
    return {f.key: out[f.key] for f in spec.input_fields if f.key in out}


def normalize_and_validate_outputs(kind: str, outputs: dict[str, Any] | None) -> dict[str, str]:
    """Validate slot keys and non-empty dataset id strings."""
    spec = CONNECTOR_KINDS.get(kind)
    if not spec or not spec.output_slots:
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
