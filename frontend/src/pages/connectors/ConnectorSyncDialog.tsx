import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CheckList,
  CheckListItem,
  Dialog,
  FormField,
} from '../../styles/design-system';
import type { ConnectorKindOutputSlotOut } from '../../data/connectorsApi';
import {
  defaultManualSyncDateRange,
  syncSlotIds,
  syncSlotSelectionPayload,
  validateSyncDateRange,
  yearSyncDateRange,
  type ConnectorSyncDateRange,
} from './connectorSyncUtils';

export function ConnectorSyncDialog({
  open,
  syncing,
  slots,
  onClose,
  onConfirm,
}: {
  open: boolean;
  syncing: boolean;
  slots: ConnectorKindOutputSlotOut[];
  onClose: () => void;
  onConfirm: (range: ConnectorSyncDateRange, slots: string[] | undefined) => void | Promise<unknown>;
}) {
  const { t } = useTranslation('console');
  const allSlotIds = syncSlotIds(slots);
  const [range, setRange] = useState<ConnectorSyncDateRange>(() => defaultManualSyncDateRange());
  const [selectedSlots, setSelectedSlots] = useState<string[]>(allSlotIds);

  const presetYears = (() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2];
  })();

  // A fresh range each time the dialog opens (render-time adjustment, not an effect).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setRange(defaultManualSyncDateRange());
      setSelectedSlots(allSlotIds);
    }
  }

  const rangeError = validateSyncDateRange(range);
  const noSlots = selectedSlots.length === 0;

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
            disabled={syncing || rangeError !== null || noSlots}
            onClick={() =>
              void onConfirm(range, syncSlotSelectionPayload(selectedSlots, allSlotIds))
            }
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

      {rangeError === 'order' ? (
        <p className="console-form-error" role="alert">
          {t('connectors.syncDateOrderError')}
        </p>
      ) : null}

      <div className="connector-sync-slots">
        <div className="connector-sync-slots-head">
          <span className="connector-sync-presets-label">{t('connectors.syncDialogSlots')}</span>
          <div className="connector-sync-presets-row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={syncing || selectedSlots.length === allSlotIds.length}
              onClick={() => setSelectedSlots(allSlotIds)}
            >
              {t('connectors.syncDialogSlotsAll')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={syncing || noSlots}
              onClick={() => setSelectedSlots([])}
            >
              {t('connectors.syncDialogSlotsNone')}
            </button>
          </div>
        </div>
        <p className="console-modal-hint">{t('connectors.syncDialogSlotsHint')}</p>
        <CheckList>
          {slots.map((slot) => (
            <CheckListItem
              key={slot.slot}
              checked={selectedSlots.includes(slot.slot)}
              disabled={syncing}
              onChange={(checked) =>
                setSelectedSlots((prev) =>
                  checked ? [...prev, slot.slot] : prev.filter((s) => s !== slot.slot)
                )
              }
            >
              {slot.label}
              <code className="connector-sync-slot-id">{slot.slot}</code>
            </CheckListItem>
          ))}
        </CheckList>
        {noSlots ? (
          <p className="console-form-error" role="alert">
            {t('connectors.syncDialogSlotsRequired')}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
