import type { ConnectorKindOut } from '../../data/connectorsApi';
import type { KvRow } from './connectorFormUtils';

export const ZHIPU_DEFAULT_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

const PLAYGROUND_EXCLUDED_INPUT_KEYS = new Set(['api_base_url']);

export function playgroundInputFields(kindMeta: ConnectorKindOut) {
  return (kindMeta.input_fields ?? []).filter((f) => !PLAYGROUND_EXCLUDED_INPUT_KEYS.has(f.key));
}

export function resolveWebSearchEndpoint(
  settingsRows: KvRow[],
  inputValues: Record<string, string>
): string {
  const fromSettings = settingsRows.find((r) => r.key.trim() === 'web_search_url')?.value?.trim();
  if (fromSettings) return fromSettings.replace(/\/$/, '');
  const base = (inputValues.api_base_url || ZHIPU_DEFAULT_API_BASE).replace(/\/$/, '');
  return `${base}/web_search`;
}

export function defaultPlaygroundParams(
  kindMeta: ConnectorKindOut,
  inputValues: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of playgroundInputFields(kindMeta)) {
    out[field.key] = inputValues[field.key] ?? field.default ?? '';
  }
  return out;
}

export function playgroundParamsToPayload(params: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(params)) {
    const value = raw.trim();
    if (!value) continue;
    if (key === 'search_intent') {
      out[key] = value === 'true' || value === '1';
    } else if (key === 'count') {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) out[key] = n;
    } else {
      out[key] = value;
    }
  }
  return out;
}
