import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchObjectAggregate, type ObjectAggregateChart } from '../../data/ontologyApi';
import { EmptyState } from '../../styles/design-system/EmptyState';
import { Loading } from '../../styles/design-system/Loading';

/**
 * The exploration's chart area: one bar chart per property, each aggregating **the current object set**.
 *
 * Clicking a bar adds that value as a condition (`<prop>:eq:<value>`), which is what makes a chart a control
 * rather than a report. Every chart re-aggregates after the click, because they all read the same set.
 */
export function ObjectSetCharts({
  typeId,
  search,
  filters,
  properties,
  onPick,
}: {
  typeId: string;
  search: string;
  filters: string[];
  /** Property names to chart, in order. The caller decides (prominent properties first). */
  properties: string[];
  onPick: (prop: string, value: string) => void;
}) {
  const { t } = useTranslation('explore');
  const [charts, setCharts] = useState<ObjectAggregateChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!typeId || properties.length === 0) {
      setCharts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetchObjectAggregate(typeId, {
        props: properties,
        search: search.trim() || undefined,
        filters,
        limit: 20,
      });
      setCharts(res.charts);
    } catch {
      setCharts([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [typeId, search, filters, properties]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Which property+value pairs are already conditions, so a chosen bar can be highlighted. */
  const applied = useMemo(() => {
    const out = new Set<string>();
    for (const filter of filters) {
      const [prop, op, rawValue] = filter.split(':');
      if (op === 'eq' && prop && rawValue) out.add(`${prop}\u0000${rawValue}`);
    }
    return out;
  }, [filters]);

  if (loading) return <Loading label={t('objectSet.chartsLoading')} />;
  if (failed) return <EmptyState title={t('objectSet.chartsFailed')} />;
  if (charts.length === 0) return <EmptyState title={t('objectSet.chartsEmpty')} />;

  return (
    <div className="object-set-charts">
      {charts.map((chart) => {
        const data = chart.values.slice(0, 12);
        return (
          <figure key={chart.prop} className="object-set-chart">
            <figcaption className="object-set-chart__title">
              {chart.prop}
              {chart.truncated ? (
                <span className="object-set-chart__more">
                  {t('objectSet.chartTruncated', { count: chart.values.length })}
                </span>
              ) : null}
            </figcaption>
            {data.length === 0 ? (
              <p className="object-set-chart__empty">{t('objectSet.chartNoValues')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(96, data.length * 26)}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="value"
                    width={110}
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-bg-muted)' }}
                    formatter={(value) => [String(value ?? ''), t('objectSet.chartCount')]}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 3, 3, 0]}
                    onClick={(entry) => {
                      // recharts hands the row datum; the category value is what a condition needs.
                      const raw = (entry as unknown as { payload?: { value?: string }; value?: string });
                      const picked = raw?.payload?.value ?? raw?.value;
                      if (typeof picked === 'string') onPick(chart.prop, picked);
                    }}
                  >
                    {data.map((entry) => (
                      <Cell
                        key={entry.value}
                        cursor="pointer"
                        fill={
                          applied.has(`${chart.prop}\u0000${entry.value}`)
                            ? 'var(--color-accent)'
                            : 'var(--color-accent-subtle)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </figure>
        );
      })}
    </div>
  );
}
