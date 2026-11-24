import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import type { ChartSettings } from './objectSetChartsModel';

/**
 * One chart's question: how many, or how much — and split by what.
 *
 * A count answers "where are they"; an average of a numeric property answers "where is it worst", which is the
 * question people actually bring to a set of objects. The split turns one distribution into a comparison.
 */
export function ObjectSetChartSettings({
  settings,
  options,
  onChange,
}: {
  settings: ChartSettings;
  options: { value: string; label: string }[];
  onChange: (next: ChartSettings) => void;
}) {
  const { t } = useTranslation('explore');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const metric = settings.metric ?? 'count';
  return (
    <div className="object-set-chart-settings" ref={rootRef}>
      <button
        type="button"
        className="object-set-chart__action"
        aria-expanded={open}
        aria-label={t('objectSet.chartSettings')}
        title={t('objectSet.chartSettings')}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={13} aria-hidden />
      </button>
      {open ? (
        <div className="object-set-chart-settings__panel" role="group">
          <label>
            <span>{t('objectSet.chartMetric')}</span>
            <select
              className="ds-control ds-control--compact"
              value={metric}
              onChange={(e) => {
                const next = e.target.value as ChartSettings['metric'];
                onChange(
                  next === 'count'
                    ? { split: settings.split }
                    : { metric: next, measure: settings.measure, split: settings.split }
                );
              }}
            >
              <option value="count">{t('objectSet.metricCount')}</option>
              <option value="sum">{t('objectSet.metricSum')}</option>
              <option value="avg">{t('objectSet.metricAvg')}</option>
              <option value="min">{t('objectSet.metricMin')}</option>
              <option value="max">{t('objectSet.metricMax')}</option>
            </select>
          </label>
          {metric !== 'count' ? (
            <label>
              <span>{t('objectSet.chartMeasure')}</span>
              <select
                className="ds-control ds-control--compact"
                value={settings.measure ?? ''}
                onChange={(e) =>
                  onChange({ ...settings, metric, measure: e.target.value || undefined })
                }
              >
                <option value="">{t('objectSet.chartMeasurePick')}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            <span>{t('objectSet.chartSplit')}</span>
            <select
              className="ds-control ds-control--compact"
              value={settings.split ?? ''}
              onChange={(e) => onChange({ ...settings, split: e.target.value || undefined })}
            >
              <option value="">{t('objectSet.chartSplitNone')}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
