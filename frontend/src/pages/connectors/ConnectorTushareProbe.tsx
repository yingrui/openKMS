import { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { probeConnector, type ConnectorProbeResult } from '../../data/connectorsApi';
import { PlaygroundResponsePanel } from './PlaygroundResponsePanel';

function resolveProviderEndpoint(apiBaseUrl: string | undefined): string {
  return (apiBaseUrl || 'https://api.tushare.pro').replace(/\/$/, '');
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoDateToYmd(iso: string): string {
  return iso.replace(/-/g, '');
}

function optionalYmd(iso: string): string | undefined {
  const trimmed = iso.trim();
  return trimmed ? isoDateToYmd(trimmed) : undefined;
}

function optionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function hasProbeFilter(body: {
  ts_code?: string;
  trade_date?: string;
  start_date?: string;
  end_date?: string;
}): boolean {
  return Boolean(body.ts_code || body.trade_date || body.start_date || body.end_date);
}

export function ConnectorTushareProbe({
  connectorId,
  apiBaseUrl,
  embedded = false,
}: {
  connectorId: string;
  apiBaseUrl?: string;
  embedded?: boolean;
}) {
  const { t } = useTranslation('console');
  const endpoint = useMemo(() => resolveProviderEndpoint(apiBaseUrl), [apiBaseUrl]);

  const [tsCode, setTsCode] = useState('');
  const [tradeDate, setTradeDate] = useState(todayIsoDate);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit, setLimit] = useState('');
  const [offset, setOffset] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ConnectorProbeResult | null>(null);
  const [error, setError] = useState<{ status?: number; message: string } | null>(null);
  const [wrapLines, setWrapLines] = useState(true);

  const buildBody = () => ({
    api_name: 'daily' as const,
    ts_code: tsCode.trim() || undefined,
    trade_date: optionalYmd(tradeDate),
    start_date: optionalYmd(startDate),
    end_date: optionalYmd(endDate),
    limit: optionalInt(limit),
    offset: optionalInt(offset),
  });

  const canSend = hasProbeFilter(buildBody());

  const handleSend = async () => {
    const body = buildBody();
    if (!hasProbeFilter(body)) return;
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const response = await probeConnector(connectorId, body);
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

  const statusCode = error?.status ?? (result ? 200 : undefined);
  const statusOk = statusCode !== undefined && statusCode >= 200 && statusCode < 300 && !error;

  const onEnterSend = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSend && !sending) void handleSend();
  };

  return (
    <section className={`connector-playground${embedded ? ' connector-playground--embedded' : ''}`}>
      <div className="connector-playground-toolbar">
        {embedded ? null : <h2>{t('connectors.sectionProbe')}</h2>}
        <div className="connector-playground-endpoint">
          <span className="connector-playground-method">{t('connectors.playgroundMethodPost')}</span>
          <code className="connector-playground-url">{endpoint}</code>
        </div>
        <button
          type="button"
          className="btn btn-primary connector-playground-send"
          disabled={sending || !canSend}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <>
              <Loader2 size={16} className="console-loading-spinner" />
              <span>{t('connectors.probeSending')}</span>
            </>
          ) : (
            <>
              <Send size={16} />
              <span>{t('connectors.probeSend')}</span>
            </>
          )}
        </button>
      </div>

      {embedded ? null : <p className="connector-playground-hint">{t('connectors.probeHint')}</p>}

      <div className="connector-playground-body">
        <div className="connector-playground-params">
          <div className="connector-playground-panel-head">
            <h3>{t('connectors.playgroundParams')}</h3>
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-ts_code" className="connector-playground-field-label">
              <span className="connector-playground-field-name">ts_code</span>
              <span className="connector-playground-field-type">str</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeTsCodeDesc')}</p>
            <input
              id="connector-probe-ts_code"
              type="text"
              className="console-form-control"
              value={tsCode}
              placeholder="000001.SZ"
              onChange={(e) => setTsCode(e.target.value)}
              onKeyDown={onEnterSend}
              autoComplete="off"
            />
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-trade_date" className="connector-playground-field-label">
              <span className="connector-playground-field-name">trade_date</span>
              <span className="connector-playground-field-type">str</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeTradeDateDesc')}</p>
            <input
              id="connector-probe-trade_date"
              type="date"
              className="console-form-control"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              onKeyDown={onEnterSend}
            />
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-start_date" className="connector-playground-field-label">
              <span className="connector-playground-field-name">start_date</span>
              <span className="connector-playground-field-type">str</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeStartDateDesc')}</p>
            <input
              id="connector-probe-start_date"
              type="date"
              className="console-form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onKeyDown={onEnterSend}
            />
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-end_date" className="connector-playground-field-label">
              <span className="connector-playground-field-name">end_date</span>
              <span className="connector-playground-field-type">str</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeEndDateDesc')}</p>
            <input
              id="connector-probe-end_date"
              type="date"
              className="console-form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onKeyDown={onEnterSend}
            />
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-limit" className="connector-playground-field-label">
              <span className="connector-playground-field-name">limit</span>
              <span className="connector-playground-field-type">int</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeLimitDesc')}</p>
            <input
              id="connector-probe-limit"
              type="number"
              min={1}
              className="console-form-control"
              value={limit}
              placeholder="5000"
              onChange={(e) => setLimit(e.target.value)}
              onKeyDown={onEnterSend}
            />
          </div>

          <div className="connector-playground-field">
            <label htmlFor="connector-probe-offset" className="connector-playground-field-label">
              <span className="connector-playground-field-name">offset</span>
              <span className="connector-playground-field-type">int</span>
            </label>
            <p className="connector-playground-field-desc">{t('connectors.probeOffsetDesc')}</p>
            <input
              id="connector-probe-offset"
              type="number"
              min={0}
              className="console-form-control"
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
              onKeyDown={onEnterSend}
            />
          </div>
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
