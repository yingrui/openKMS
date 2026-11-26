import { useTranslation } from 'react-i18next';
import type { ObjectAggregateChart } from '../../data/ontologyApi';
import type { ExplorationResponse } from '../../data/explorationsApi';
import { ObjectSetActionOutcome } from './ObjectSetActionOutcome';
import { ObjectSetCharts } from './ObjectSetCharts';
import { ObjectSetComparePicker } from './ObjectSetComparePicker';
import type { ChartSettings, ChartSpec } from './objectSetChartsModel';
import type { ActionOutcome } from './useObjectSetOutcome';

/**
 * The chart perspective as one unit: the compare control, the outcome of an action, and the charts themselves.
 *
 * It is a component rather than a block of JSX because the three are one thought — what the numbers are, what they
 * are measured against, and what just changed — and because the page that owns the exploration is not the place to
 * describe a chart board.
 */
export function ObjectSetChartBoard({
  compareLabel,
  explorations,
  onCompare,
  outcome,
  onDismissOutcome,
  typeId,
  search,
  filters,
  chartSpecs,
  chartOptions,
  chartLabels,
  compare,
  refreshKey,
  onLoaded,
  onSettings,
  onPick,
  onPickPair,
  onPickRange,
  onRemove,
  onMove,
}: {
  compareLabel: string | null;
  explorations: ExplorationResponse[];
  onCompare: (target: string) => void;
  outcome: ActionOutcome | null;
  onDismissOutcome: () => void;
  typeId: string;
  search: string;
  filters: string[];
  chartSpecs: ChartSpec[];
  chartOptions: { value: string; label: string }[];
  chartLabels: Record<string, string>;
  compare?: { filters: string[]; label: string };
  refreshKey: number;
  onLoaded: (charts: ObjectAggregateChart[]) => void;
  onSettings: (key: string, next: ChartSettings) => void;
  onPick: (prop: string, value: string) => void;
  onPickPair: (prop: string, value: string, splitProp: string, splitValue: string) => void;
  onPickRange: (prop: string, from: number, to: number) => void;
  onRemove: (prop: string) => void;
  onMove: (prop: string, direction: -1 | 1) => void;
}) {
  const { t } = useTranslation('explore');
  return (
    <>
      <div className="object-set-toolbar object-set-toolbar--end">
        <ObjectSetComparePicker
          label={compareLabel}
          explorations={explorations}
          onChange={onCompare}
        />
      </div>
      {outcome ? (
        <ObjectSetActionOutcome
          actionName={outcome.name}
          changed={outcome.succeeded}
          changes={outcome.changes}
          onDismiss={onDismissOutcome}
        />
      ) : null}
      <div className="object-set-section">
        <h2 className="object-set-section__title">{t('objectSet.chartsTitle')}</h2>
      </div>
      <ObjectSetCharts
        typeId={typeId}
        search={search}
        filters={filters}
        specs={chartSpecs}
        options={chartOptions}
        labels={chartLabels}
        compare={compare}
        refreshKey={refreshKey}
        onLoaded={onLoaded}
        onSettings={onSettings}
        onPick={onPick}
        onPickPair={onPickPair}
        onPickRange={onPickRange}
        onRemove={onRemove}
        onMove={onMove}
        canMove={chartSpecs.length > 1}
      />
    </>
  );
}
