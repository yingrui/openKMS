import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, RotateCcw, Send, Trash2, WrapText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  searchConnector,
  type ConnectorKindInputFieldOut,
  type ConnectorKindOut,
  type ConnectorSearchResult,
} from '../../data/connectorsApi';
import type { KvRow } from './connectorFormUtils';

const ZHIPU_DEFAULT_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

function resolveWebSearchEndpoint(settingsRows: KvRow[], inputValues: Record<string, string>): string {
  const fromSettings = settingsRows.find((r) => r.key.trim() === 'web_search_url')?.value?.trim();
  if (fromSettings) return fromSettings.replace(/\/$/, '');
  const base = (inputValues.api_base_url || ZHIPU_DEFAULT_API_BASE).replace(/\/$/, '');
  return `${base}/web_search`;
}

function playgroundParamKeys(kindMeta: ConnectorKindOut): string[] {
  return (kindMeta.input_fields ?? [])
    .map((f) => f.key)
    .filter((key) => key !== 'api_base_url');
}

function defaultParamsFromInputs(
  kindMeta: ConnectorKindOut,
  inputValues: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of playgroundParamKeys(kindMeta)) {
    const field = kindMeta.input_fields.find((f) => f.key === key);
    out[key] = inputValues[key] ?? field?.default ?? '';
  }
  return out;
}

function paramsToPayload(params: Record<string, string>): Record<string, unknown> {
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

function ParamField({
  field,
  value,
  onChange,
}: {
  field: ConnectorKindInputFieldOut;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('console');
  const fieldId = `connector-playground-${field.key}`;

  if (field.field_type === 'boolean') {
    return (
      <div className="connector-playground-field">
        <label htmlFor={fieldId} className="connector-playground-field-label">
          <span className="connector-playground-field-name">{field.key}</span>
          <span className="connector-playground-field-type">boolean</span>
        </label>
        <select
          id={fieldId}
          className="console-form-control"
          value={value === 'true' || value === '1' ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="false">{t('connectors.no')}</option>
          <option value="true">{t('connectors.yes')}</option>
        </select>
      </div>
    );
  }

  if (field.field_type === 'select' && (field.options?.length ?? 0) > 0) {
    return (
      <div className="connector-playground-field">
        <label htmlFor={fieldId} className="connector-playground-field-label">
          <span className="connector-playground-field-name">{field.key}</span>
          <span className="connector-playground-field-type">enum</span>
          {field.required ? (
            <span className="connector-playground-field-required">{t('connectors.playgroundRequired')}</span>
          ) : null}
        </label>
        <p className="connector-playground-field-desc">{field.label}</p>
        <select
          id={fieldId}
          className="console-form-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options!.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="connector-playground-field">
      <label htmlFor={fieldId} className="connector-playground-field-label">
        <span className="connector-playground-field-name">{field.key}</span>
        <span className="connector-playground-field-type">{field.field_type}</span>
        {field.required ? (
          <span className="connector-playground-field-required">{t('connectors.playgroundRequired')}</span>
        ) : null}
      </label>
      <p className="connector-playground-field-desc">{field.label}</p>
      <input
        id={fieldId}
        type={field.field_type === 'integer' ? 'number' : 'text'}
        className="console-form-control"
        value={value}
        placeholder={field.placeholder ?? undefined}
        min={field.field_type === 'integer' ? 1 : undefined}
        max={field.field_type === 'integer' ? 50 : undefined}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

export function ConnectorSearchPlayground({
  connectorId,
  kindMeta,
  baselineInputs,
  inputValues,
  settingsRows,
  embedded = false,
}: {
  connectorId: string;
  kindMeta: ConnectorKindOut;
  baselineInputs: Record<string, string>;
  inputValues: Record<string, string>;
  settingsRows: KvRow[];
  embedded?: boolean;
}) {
  const { t } = useTranslation('console');
  const endpoint = useMemo(
    () => resolveWebSearchEndpoint(settingsRows, inputValues),
    [settingsRows, inputValues]
  );
  const paramFields = useMemo(
    () => (kindMeta.input_fields ?? []).filter((f) => f.key !== 'api_base_url'),
    [kindMeta.input_fields]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [params, setParams] = useState<Record<string, string>>(() =>
    defaultParamsFromInputs(kindMeta, baselineInputs)
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ConnectorSearchResult | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [wrapLines, setWrapLines] = useState(true);

  useEffect(() => {
    setParams(defaultParamsFromInputs(kindMeta, baselineInputs));
  }, [connectorId, kindMeta, baselineInputs]);

  const resetParams = useCallback(() => {
    setParams(defaultParamsFromInputs(kindMeta, baselineInputs));
  }, [kindMeta, baselineInputs]);

  const handleSend = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const response = await searchConnector(connectorId, {
        query: q,
        params: paramsToPayload(params),
      });
      setResult(response);
    } catch (e) {
      const err = e as Error & { status?: number };
      setError({ message: err.message, status: err.status });
    } finally {
      setSending(false);
    }
  };

  const responseJson = error
    ? JSON.stringify({ error: error.message, status: error.status }, null, 2)
    : result
      ? JSON.stringify(result, null, 2)
      : null;

  const statusCode = error?.status ?? result?.debug?.status_code;
  const statusOk = statusCode !== undefined && statusCode >= 200 && statusCode < 300 && !error;

  const handleCopyResponse = async () => {
    if (!responseJson) return;
    try {
      await navigator.clipboard.writeText(responseJson);
      toast.success(t('connectors.playgroundCopyOk'));
    } catch {
      toast.error(t('connectors.playgroundCopyFailed'));
    }
  };

  const handleClearResponse = () => {
    setResult(null);
    setError(null);
  };

  return (
    <section className={`connector-playground${embedded ? ' connector-playground--embedded' : ''}`}>
      <div className="connector-playground-toolbar">
        {embedded ? null : <h2>{t('connectors.sectionPlayground')}</h2>}
        <div className="connector-playground-endpoint">
          <span className="connector-playground-method">{t('connectors.playgroundMethodPost')}</span>
          <code className="connector-playground-url">{endpoint}</code>
        </div>
        <button
          type="button"
          className="btn btn-primary connector-playground-send"
          disabled={sending || !searchQuery.trim()}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <>
              <Loader2 size={16} className="console-loading-spinner" />
              <span>{t('connectors.playgroundSending')}</span>
            </>
          ) : (
            <>
              <Send size={16} />
              <span>{t('connectors.playgroundSend')}</span>
            </>
          )}
        </button>
      </div>

      {embedded ? null : <p className="connector-playground-hint">{t('connectors.playgroundHint')}</p>}

      <div className="connector-playground-body">
        <div className="connector-playground-params">
          <div className="connector-playground-panel-head">
            <h3>{t('connectors.playgroundParams')}</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetParams}>
              <RotateCcw size={14} />
              <span>{t('connectors.playgroundResetParams')}</span>
            </button>
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-playground-search_query" className="connector-playground-field-label">
              <span className="connector-playground-field-name">search_query</span>
              <span className="connector-playground-field-type">string</span>
              <span className="connector-playground-field-required">{t('connectors.playgroundRequired')}</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.playgroundSearchQueryDesc')}</p>
            <input
              id="connector-playground-search_query"
              type="text"
              className="console-form-control"
              value={searchQuery}
              maxLength={70}
              placeholder={t('connectors.testSearchPlaceholder')}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim() && !sending) void handleSend();
              }}
              autoComplete="off"
            />
          </div>

          {paramFields.map((field) => (
            <ParamField
              key={field.key}
              field={field}
              value={params[field.key] ?? ''}
              onChange={(next) => setParams((prev) => ({ ...prev, [field.key]: next }))}
            />
          ))}
        </div>

        <div
          className={`connector-playground-response${responseJson ? ' connector-playground-response--has-result' : ' connector-playground-response--empty'}`}
        >
          <div className="connector-playground-panel-head">
            <h3>{t('connectors.playgroundResponse')}</h3>
            <div className="connector-playground-response-actions">
              {statusCode !== undefined ? (
                <span
                  className={`connector-playground-status${statusOk ? ' connector-playground-status--ok' : ' connector-playground-status--error'}`}
                >
                  {statusOk
                    ? t('connectors.playgroundStatusOk', { status: statusCode })
                    : t('connectors.playgroundStatusError', { status: statusCode })}
                </span>
              ) : null}
              {responseJson ? (
                <div className="connector-playground-response-tools" role="toolbar">
                  <button
                    type="button"
                    className={`connector-playground-tool-btn${wrapLines ? ' active' : ''}`}
                    title={
                      wrapLines
                        ? t('connectors.playgroundUnwrapLines')
                        : t('connectors.playgroundWrapLines')
                    }
                    aria-pressed={wrapLines}
                    onClick={() => setWrapLines((v) => !v)}
                  >
                    <WrapText size={15} />
                    <span className="connector-playground-tool-label">
                      {wrapLines ? t('connectors.playgroundUnwrapLines') : t('connectors.playgroundWrapLines')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="connector-playground-tool-btn"
                    title={t('connectors.playgroundCopy')}
                    onClick={() => void handleCopyResponse()}
                  >
                    <Copy size={15} />
                    <span className="connector-playground-tool-label">{t('connectors.playgroundCopy')}</span>
                  </button>
                  <button
                    type="button"
                    className="connector-playground-tool-btn"
                    title={t('connectors.playgroundClear')}
                    onClick={handleClearResponse}
                  >
                    <Trash2 size={15} />
                    <span className="connector-playground-tool-label">{t('connectors.playgroundClear')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="connector-playground-response-body">
            {responseJson ? (
              <pre
                className={`connector-playground-json${wrapLines ? ' connector-playground-json--wrap' : ''}`}
              >
                {responseJson}
              </pre>
            ) : (
              <p className="connector-playground-empty">{t('connectors.playgroundResponseEmpty')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
