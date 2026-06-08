import { Copy, Trash2, WrapText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function PlaygroundResponsePanel({
  responseJson,
  statusCode,
  statusOk,
  wrapLines,
  onWrapLinesChange,
  onClear,
}: {
  responseJson: string | null;
  statusCode: number | undefined;
  statusOk: boolean;
  wrapLines: boolean;
  onWrapLinesChange: (next: boolean) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation('console');

  const handleCopy = async () => {
    if (!responseJson) return;
    try {
      await navigator.clipboard.writeText(responseJson);
      toast.success(t('connectors.playgroundCopyOk'));
    } catch {
      toast.error(t('connectors.playgroundCopyFailed'));
    }
  };

  return (
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
                title={wrapLines ? t('connectors.playgroundUnwrapLines') : t('connectors.playgroundWrapLines')}
                aria-pressed={wrapLines}
                onClick={() => onWrapLinesChange(!wrapLines)}
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
                onClick={() => void handleCopy()}
              >
                <Copy size={15} />
                <span className="connector-playground-tool-label">{t('connectors.playgroundCopy')}</span>
              </button>
              <button
                type="button"
                className="connector-playground-tool-btn"
                title={t('connectors.playgroundClear')}
                onClick={onClear}
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
          <pre className={`connector-playground-json${wrapLines ? ' connector-playground-json--wrap' : ''}`}>
            {responseJson}
          </pre>
        ) : (
          <p className="connector-playground-empty">{t('connectors.playgroundResponseEmpty')}</p>
        )}
      </div>
    </div>
  );
}
