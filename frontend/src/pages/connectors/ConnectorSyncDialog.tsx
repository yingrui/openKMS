import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  defaultManualSyncDateRange,
  validateSyncDateRange,
  yearSyncDateRange,
  type ConnectorSyncDateRange,
} from './connectorSyncUtils';

export function ConnectorSyncDialog({
  open,
  syncing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  syncing: boolean;
  onClose: () => void;
  onConfirm: (range: ConnectorSyncDateRange) => void | Promise<unknown>;
}) {
  const { t } = useTranslation('console');
  const [range, setRange] = useState<ConnectorSyncDateRange>(() => defaultManualSyncDateRange());

  const presetYears = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  }, [open]);

  useEffect(() => {
    if (open) {
      setRange(defaultManualSyncDateRange());
    }
  }, [open]);

  if (!open) return null;

  const validation = validateSyncDateRange(range);

  return (
    <div
      className="console-modal-overlay"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !syncing && onClose()}
    >
      <div
        className="console-modal"
        role="dialog"
        aria-labelledby="connector-sync-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="console-modal-header">
          <h2 id="connector-sync-dialog-title">{t('connectors.syncDialogTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={syncing}
            aria-label={t('connectors.closeAria')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="console-modal-body">
          <p className="console-modal-hint">{t('connectors.syncDialogHint')}</p>

          <div className="connector-sync-presets">
            <span className="connector-sync-presets-label">{t('connectors.syncDialogPresets')}</span>
            <div className="connector-sync-presets-row">
              {presetYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  className="btn btn-secondary btn-sm connector-sync-preset-btn"
                  disabled={syncing}
                  onClick={() => setRange(yearSyncDateRange(year))}
                >
                  {t('connectors.syncDialogPresetYear', { year })}
                </button>
              ))}
            </div>
          </div>

          <div className="connector-sync-date-row">
            <div className="console-form-field">
              <label htmlFor="connector-sync-start">{t('connectors.syncStartDate')}</label>
              <input
                id="connector-sync-start"
                type="date"
                className="console-form-control"
                value={range.startDate}
                disabled={syncing}
                onChange={(e) => setRange((prev) => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="console-form-field">
              <label htmlFor="connector-sync-end">{t('connectors.syncEndDate')}</label>
              <input
                id="connector-sync-end"
                type="date"
                className="console-form-control"
                value={range.endDate}
                disabled={syncing}
                onChange={(e) => setRange((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          {validation === 'order' ? (
            <p className="console-form-error" role="alert">
              {t('connectors.syncDateOrderError')}
            </p>
          ) : null}
        </div>

        <div className="console-modal-actions">
          <button type="button" className="btn btn-secondary" disabled={syncing} onClick={onClose}>
            {t('connectors.syncDialogCancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={syncing || validation !== null}
            onClick={() => void onConfirm(range)}
          >
            {syncing ? <Loader2 size={16} className="console-loading-spinner" /> : <Play size={16} />}
            <span>{syncing ? t('connectors.syncRunning') : t('connectors.syncRunNow')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
