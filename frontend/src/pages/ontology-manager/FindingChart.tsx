import {
  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from './findingFormat';
import {
  CHART_X_KEY,
  numericValue,
  xLabel,
  type ChartSeries,
  type FindingChartSpec,
} from './findingView';

/**
 * The colours a series is drawn in — **theme tokens, not constants in code**.
 *
 * A chart needs several hues that stay distinguishable from each other (the theme's semantic colours
 * are not meant for that), but *which* hues is a theming question: dark mode lifts them. So the
 * palette lives in `_css-variables.scss` as `--finding-series-1…8` and the chart only picks one per
 * series. (Tremor does the same thing with its own theme's chart colours.)
 */
const SERIES_COLORS = Array.from({ length: 8 }, (_, i) => `var(--finding-series-${i + 1})`);

/** One story finding's result, drawn — the data comes from the server, this only draws it. */
export function FindingChart({ spec, series }: { spec: FindingChartSpec; series: ChartSeries }) {
  const { keys, data } = series;
  const bars = spec.y;
  const lines = spec.lines ?? [];
  const combo = spec.type === 'combo';
  const Chart = combo ? ComposedChart : spec.type === 'bar' ? BarChart : LineChart;
  return (
    <div className="finding-chart">
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
          <YAxis
            yAxisId="left"
            stroke="var(--color-text-secondary)"
            tick={{ fontSize: 12 }}
            width={64}
          />
          {/* A combo puts its lines on a second axis: a count and a ratio share no scale. */}
          {combo && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--color-text-secondary)"
              tick={{ fontSize: 12 }}
              width={56}
            />
          )}
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
          {keys.map((key, i) => {
            const asBar = combo ? bars.includes(key) : spec.type === 'bar';
            const color = SERIES_COLORS[i % SERIES_COLORS.length];
            return asBar ? (
              <Bar key={key} dataKey={key} yAxisId="left" fill={color} />
            ) : (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                yAxisId={combo && lines.includes(key) ? 'right' : 'left'}
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            );
          })}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
