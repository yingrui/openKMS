import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_X_KEY,
  numericValue,
  xLabel,
  type ChartSeries,
  type ExplorerChartSpec,
} from './explorerChartSpec';

/**
 * The colours a series is drawn in.
 *
 * Presentation constants, not tokens: a chart needs several *distinguishable* hues at once, and the
 * theme's semantic colours are not meant for that. They are picked to stay apart on light and dark
 * surfaces; the grid/labels still come from theme variables.
 */
const SERIES_COLORS = [
  '#0d9488',
  '#2563eb',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#65a30d',
  '#db2777',
] as const;

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/** One report block's result, drawn — the data comes from the server, this only draws it. */
export function ExplorerChart({ spec, series }: { spec: ExplorerChartSpec; series: ChartSeries }) {
  const { keys, data } = series;
  const Chart = spec.type === 'bar' ? BarChart : LineChart;
  return (
    <div className="explorer-chart">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={CHART_X_KEY}
            stroke="var(--color-text-secondary)"
            tick={{ fontSize: 12 }}
            tickFormatter={xLabel}
            interval="preserveStartEnd"
          />
          <YAxis stroke="var(--color-text-secondary)" tick={{ fontSize: 12 }} width={64} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-bg-elevated, var(--color-bg))',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
            }}
            formatter={(value) => {
              const n = numericValue(value);
              return n === null ? '—' : compact(n);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((key, i) =>
            spec.type === 'bar' ? (
              <Bar key={key} dataKey={key} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ) : (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
