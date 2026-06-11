import type { ConnectorKindOut, ConnectorResponse } from '../../data/connectorsApi';
import type { DatasetResponse } from '../../data/datasetsApi';
import { stripSyncScheduleFromSettings, syncScheduleToSettingsPayload, type SyncScheduleFormState } from './connectorScheduleUtils';

export type KvRow = { id: string; key: string; value: string };

export function newKvRow(): KvRow {
  return { id: crypto.randomUUID(), key: '', value: '' };
}

export function settingsToRows(settings: Record<string, unknown> | null | undefined): KvRow[] {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return [newKvRow()];
  }
  const keys = Object.keys(settings);
  if (keys.length === 0) return [newKvRow()];
  return keys.map((key) => {
    const v = settings[key];
    const value =
      v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v);
    return { id: crypto.randomUUID(), key, value };
  });
}

export function parseSettingValue(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t) && !Number.isNaN(Number(t))) return Number(t);
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function rowsToSettingsObject(rows: KvRow[]): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    if (seen.has(k)) return { ok: false };
    seen.add(k);
    if (r.value.trim() === '') continue;
    out[k] = parseSettingValue(r.value);
  }
  return { ok: true, value: out };
}

export function rowsToSecretsMap(rows: KvRow[]): { ok: true; value: Record<string, string> } | { ok: false } {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k || !r.value.trim()) continue;
    if (seen.has(k)) return { ok: false };
    seen.add(k);
    out[k] = r.value;
  }
  return { ok: true, value: out };
}

function inputValueToFormString(v: unknown, field: ConnectorKindOut['input_fields'][0]): string {
  if (v === null || v === undefined) return field.default ?? '';
  if (field.field_type === 'boolean') {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v).trim() ? String(v) : field.default ?? 'false';
  }
  return typeof v === 'string' ? v : String(v);
}

export function applyKindToInputsOutputs(
  meta: ConnectorKindOut | undefined,
  existingInputs: Record<string, unknown> | null | undefined,
  existingOutputs: Record<string, unknown> | null | undefined
): { inputValues: Record<string, string>; outputDatasetIds: Record<string, string> } {
  const inputValues: Record<string, string> = {};
  if (meta?.input_fields?.length) {
    for (const f of meta.input_fields) {
      const v = existingInputs?.[f.key];
      const s = inputValueToFormString(v, f);
      inputValues[f.key] = s.trim() ? s : (f.default ?? '');
    }
  }
  const outputDatasetIds: Record<string, string> = {};
  if (meta?.output_slots?.length) {
    for (const o of meta.output_slots) {
      const v = existingOutputs?.[o.slot];
      outputDatasetIds[o.slot] = typeof v === 'string' ? v : '';
    }
  }
  return { inputValues, outputDatasetIds };
}

export function settingsRowsForKind(meta: ConnectorKindOut | undefined): KvRow[] {
  if (meta?.default_settings && typeof meta.default_settings === 'object') {
    const keys = Object.keys(meta.default_settings);
    if (keys.length > 0) {
      return keys.map((key) => ({
        id: crypto.randomUUID(),
        key,
        value:
          meta.default_settings![key] === null || meta.default_settings![key] === undefined
            ? ''
            : typeof meta.default_settings![key] === 'string'
              ? meta.default_settings![key]
              : JSON.stringify(meta.default_settings![key]),
      }));
    }
  }
  return [newKvRow()];
}

export function secretRowsForKind(kinds: ConnectorKindOut[], kind: string): KvRow[] {
  const meta = kinds.find((k) => k.kind === kind);
  if (meta?.secret_keys.length) {
    return meta.secret_keys.map((sk) => ({ id: crypto.randomUUID(), key: sk, value: '' }));
  }
  return [newKvRow()];
}

export function datasetOptionLabel(d: DatasetResponse): string {
  const base = (d.display_name && d.display_name.trim()) || `${d.schema_name}.${d.table_name}`;
  return d.data_source_name ? `${base} · ${d.data_source_name}` : base;
}

export function areAllOutputSlotsEmpty(
  selectedKindMeta: ConnectorKindOut | undefined,
  outputDatasetIds: Record<string, string>
): boolean {
  if (!selectedKindMeta?.output_slots?.length) return true;
  return selectedKindMeta.output_slots.every((o) => !(outputDatasetIds[o.slot] ?? '').trim());
}

export function areAllOutputSlotsConfigured(
  selectedKindMeta: ConnectorKindOut | undefined,
  outputDatasetIds: Record<string, string>
): boolean {
  if (!selectedKindMeta?.output_slots?.length) return false;
  return selectedKindMeta.output_slots.every((o) => (outputDatasetIds[o.slot] ?? '').trim().length > 0);
}

export function buildConnectorPayload(
  selectedKindMeta: ConnectorKindOut | undefined,
  formName: string,
  formEnabled: boolean,
  inputValues: Record<string, string>,
  outputDatasetIds: Record<string, string>,
  settingsRows: KvRow[],
  secretRows: KvRow[],
  options: { isCreate: boolean; syncSchedule?: SyncScheduleFormState | null }
):
  | {
      ok: true;
      body: {
        name: string;
        enabled: boolean;
        settings: Record<string, unknown>;
        inputs?: Record<string, string>;
        outputs?: Record<string, string>;
        secrets?: Record<string, string>;
        kind?: string;
      };
      scheduleAutoDisabled?: boolean;
    }
  | { ok: false; error: 'required' | 'duplicate' | 'outputs' | 'schedule_outputs' | 'secrets' } {
  if (!formName.trim() || (options.isCreate && !selectedKindMeta)) {
    return { ok: false, error: 'required' };
  }

  const settingsResult = rowsToSettingsObject(settingsRows);
  if (!settingsResult.ok) return { ok: false, error: 'duplicate' };

  const secretsResult = rowsToSecretsMap(secretRows);
  if (!secretsResult.ok) return { ok: false, error: 'duplicate' };

  const isSearchTool = selectedKindMeta?.category === 'search_tool';
  const hasInputFields = (selectedKindMeta?.input_fields?.length ?? 0) > 0;
  const hasOutputSlots = !isSearchTool && (selectedKindMeta?.output_slots?.length ?? 0) > 0;

  const inputsObj: Record<string, string> = {};
  if (hasInputFields && selectedKindMeta) {
    for (const f of selectedKindMeta.input_fields) {
      inputsObj[f.key] = (inputValues[f.key] ?? '').trim() || (f.default ?? '');
    }
  }

  const outputsObj: Record<string, string> = {};
  if (hasOutputSlots && selectedKindMeta) {
    const missing: string[] = [];
    for (const o of selectedKindMeta.output_slots) {
      const id = (outputDatasetIds[o.slot] ?? '').trim();
      if (id) {
        outputsObj[o.slot] = id;
      } else {
        missing.push(o.slot);
      }
    }
    if (Object.keys(outputsObj).length > 0 && missing.length > 0) {
      return { ok: false, error: 'outputs' };
    }
  }

  let syncScheduleForPayload = options.syncSchedule;
  let scheduleAutoDisabled = false;
  if (
    syncScheduleForPayload &&
    selectedKindMeta?.category === 'sync' &&
    areAllOutputSlotsEmpty(selectedKindMeta, outputDatasetIds) &&
    syncScheduleForPayload.enabled
  ) {
    syncScheduleForPayload = { ...syncScheduleForPayload, enabled: false };
    scheduleAutoDisabled = true;
  }

  const scheduleEnabled =
    syncScheduleForPayload?.enabled === true && selectedKindMeta?.category === 'sync';
  if (scheduleEnabled && hasOutputSlots && selectedKindMeta) {
    const allConfigured = selectedKindMeta.output_slots.every(
      (o) => (outputDatasetIds[o.slot] ?? '').trim().length > 0
    );
    if (!allConfigured) {
      return { ok: false, error: 'schedule_outputs' };
    }
  }

  const secrets = secretsResult.value;
  if (options.isCreate) {
    for (const req of selectedKindMeta?.secret_keys ?? []) {
      if (!secrets[req]?.trim()) return { ok: false, error: 'secrets' };
    }
  }

  const settings: Record<string, unknown> = { ...settingsResult.value };
  if (syncScheduleForPayload && selectedKindMeta?.category === 'sync') {
    settings.sync_schedule = syncScheduleToSettingsPayload(syncScheduleForPayload);
  }

  const body: {
    name: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    inputs?: Record<string, string>;
    outputs?: Record<string, string>;
    secrets?: Record<string, string>;
    kind?: string;
  } = {
    name: formName.trim(),
    enabled: formEnabled,
    settings,
  };
  if (options.isCreate && selectedKindMeta) body.kind = selectedKindMeta.kind;
  if (hasInputFields) body.inputs = inputsObj;
  if (hasOutputSlots) body.outputs = outputsObj; // may be {} when no datasets configured
  if (Object.keys(secrets).length > 0) body.secrets = secrets;
  return { ok: true, body, scheduleAutoDisabled: scheduleAutoDisabled || undefined };
}

export function initFormFromConnector(kinds: ConnectorKindOut[], row: ConnectorResponse) {
  const meta = kinds.find((k) => k.kind === row.kind);
  const { inputValues, outputDatasetIds } = applyKindToInputsOutputs(meta, row.inputs, row.outputs);
  return {
    formName: row.name,
    formKind: row.kind,
    formEnabled: row.enabled,
    inputValues,
    outputDatasetIds,
    settingsRows:
      row.settings && Object.keys(stripSyncScheduleFromSettings(row.settings) ?? {}).length > 0
        ? settingsToRows(stripSyncScheduleFromSettings(row.settings))
        : settingsRowsForKind(meta),
    secretRows: secretRowsForKind(kinds, row.kind),
  };
}
