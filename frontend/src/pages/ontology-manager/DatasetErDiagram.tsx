export type ErNode = {
  id: string;
  label: string;
  cardinality: string;
  columns: string;
};

type Props = {
  centerLabel: string;
  nodes: ErNode[];
  emptyLabel: string;
};

/**
 * Lightweight ER star diagram: the current dataset in the center, related
 * datasets around it, one edge per registered join. Deterministic layout
 * (no force simulation) — good for a single dataset's neighborhood.
 */
export function DatasetErDiagram({ centerLabel, nodes, emptyLabel }: Props) {
  if (nodes.length === 0) {
    return <p className="dataset-er__empty">{emptyLabel}</p>;
  }

  const width = 720;
  const height = 420;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 80;

  return (
    <svg className="dataset-er" viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet">
      {nodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        return (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={x} y2={y} className="dataset-er__edge" />
            <text x={(cx + x) / 2} y={(cy + y) / 2 - 6} className="dataset-er__edge-label" textAnchor="middle">
              {n.cardinality}
            </text>
            <rect x={x - 92} y={y - 24} width={184} height={48} rx={10} className="dataset-er__node" />
            <text x={x} y={y - 3} className="dataset-er__node-label" textAnchor="middle">
              {n.label}
            </text>
            <text x={x} y={y + 15} className="dataset-er__node-sub" textAnchor="middle">
              {n.columns}
            </text>
          </g>
        );
      })}
      <rect
        x={cx - 92}
        y={cy - 28}
        width={184}
        height={56}
        rx={10}
        className="dataset-er__node dataset-er__node--center"
      />
      <text x={cx} y={cy + 2} className="dataset-er__node-label" textAnchor="middle">
        {centerLabel}
      </text>
    </svg>
  );
}
