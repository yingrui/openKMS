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
import { formatNumber } from './reportFormat';
import {
  CHART_X_KEY,
  numericValue,
  xLabel,
  type ChartSeries,
  type ExplorerChartSpec,
} from './reportView';

/**
 * The colours a series is drawn in — **theme tokens, not constants in code**.
 *
 * A chart needs several hues that stay distinguishable from each other (the theme's semantic colours
 * are not meant for that), but *which* hues is a theming question: dark mode lifts them. So the
 * palette lives in `_css-variables.scss` as `--report-series-1…8` and the chart only picks one per
 * series. (Tremor does the same thing with its own theme's chart colours.)
 */
const SERIES_COLORS = Array.from({ length: 8 }, (_, i) => `var(--report-series-${i + 1})`);

/** One dashboard report's result, drawn — the data comes from the server, this only draws it. */
export function ExplorerChart({ spec, series }: { spec: ExplorerChartSpec; series: ChartSeries }) {
  const { keys, data } = series;
  const Chart = spec.type === 'bar' ? BarChart : LineChart;
  return (
    <div className="report-chart">
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
              return n === null ? '—' : formatNumber(n);
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
