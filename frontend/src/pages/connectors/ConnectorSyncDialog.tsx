import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, FormField } from '../../styles/design-system';
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

  const presetYears = (() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  })();

  // A fresh range each time the dialog opens (render-time adjustment, not an effect).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setRange(defaultManualSyncDateRange());
  }

  const validation = validateSyncDateRange(range);

  return (
    <Dialog
      open={open}
      onClose={() => !syncing && onClose()}
      closeDisabled={syncing}
      title={t('connectors.syncDialogTitle')}
      closeAriaLabel={t('connectors.closeAria')}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" disabled={syncing} onClick={onClose}>
            {t('connectors.syncDialogCancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={syncing || validation !== null}
            onClick={() => void onConfirm(range)}
          >
            {syncing ? (
              <Loader2 size={16} className="console-loading-spinner" />
            ) : (
              <Play size={16} />
            )}
            <span>{syncing ? t('connectors.syncRunning') : t('connectors.syncRunNow')}</span>
          </button>
        </>
      }
    >
      <p className="page-subtitle">{t('connectors.syncDialogHint')}</p>

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
        <FormField label={t('connectors.syncStartDate')} htmlFor="connector-sync-start">
          <input
            id="connector-sync-start"
            type="date"
            value={range.startDate}
            disabled={syncing}
            onChange={(e) => setRange((prev) => ({ ...prev, startDate: e.target.value }))}
          />
        </FormField>
        <FormField label={t('connectors.syncEndDate')} htmlFor="connector-sync-end">
          <input
            id="connector-sync-end"
            type="date"
            value={range.endDate}
            disabled={syncing}
            onChange={(e) => setRange((prev) => ({ ...prev, endDate: e.target.value }))}
          />
        </FormField>
      </div>

      {validation === 'order' ? (
        <p className="console-form-error" role="alert">
          {t('connectors.syncDateOrderError')}
        </p>
      ) : null}
    </Dialog>
  );
}
