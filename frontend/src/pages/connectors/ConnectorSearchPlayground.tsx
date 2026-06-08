import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchConnector, type ConnectorKindOut, type ConnectorSearchResult } from '../../data/connectorsApi';
import type { KvRow } from './connectorFormUtils';
import {
  defaultPlaygroundParams,
  playgroundInputFields,
  playgroundParamsToPayload,
  resolveWebSearchEndpoint,
} from './connectorPlaygroundUtils';
import { PlaygroundParamField } from './PlaygroundParamField';
import { PlaygroundResponsePanel } from './PlaygroundResponsePanel';

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
  const paramFields = useMemo(() => playgroundInputFields(kindMeta), [kindMeta]);

  const [searchQuery, setSearchQuery] = useState('');
  const [params, setParams] = useState<Record<string, string>>(() =>
    defaultPlaygroundParams(kindMeta, baselineInputs)
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ConnectorSearchResult | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [wrapLines, setWrapLines] = useState(true);

  useEffect(() => {
    setParams(defaultPlaygroundParams(kindMeta, baselineInputs));
  }, [connectorId, kindMeta, baselineInputs]);

  const resetParams = useCallback(() => {
    setParams(defaultPlaygroundParams(kindMeta, baselineInputs));
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
        params: playgroundParamsToPayload(params),
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
            <PlaygroundParamField
              key={field.key}
              field={field}
              value={params[field.key] ?? ''}
              onChange={(next) => setParams((prev) => ({ ...prev, [field.key]: next }))}
            />
          ))}
        </div>

        <PlaygroundResponsePanel
          responseJson={responseJson}
          statusCode={statusCode}
          statusOk={statusOk}
          wrapLines={wrapLines}
          onWrapLinesChange={setWrapLines}
          onClear={() => {
            setResult(null);
            setError(null);
          }}
        />
      </div>
    </section>
  );
}
