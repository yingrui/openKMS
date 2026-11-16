import { describe, expect, it } from 'vitest';
import { layoutEr } from './erLayout';

const options = {
  boxWidth: 100,
  gapX: 20,
  gapY: 30,
  padding: 10,
  height: (node: { columns?: string[] }) => 40 + (node.columns?.length ?? 0) * 10,
};

const nodes = [
  { id: 'fact', columns: ['a', 'b', 'c'] },
  { id: 'dim_sku', columns: ['id'] },
  { id: 'dim_day', columns: ['id'] },
];

describe('layoutEr', () => {
  it('puts the joined-to dataset above the one that owns the key', () => {
    const { positions } = layoutEr(
      nodes,
      [
        { source: 'fact', target: 'dim_sku' },
        { source: 'fact', target: 'dim_day' },
      ],
      options,
    );
    expect(positions.dim_sku.y).toBeLessThan(positions.fact.y);
    expect(positions.dim_day.y).toBeLessThan(positions.fact.y);
    /* The two parents share a layer, so they share a row. */
    expect(positions.dim_sku.y).toBe(positions.dim_day.y);
  });

  it('is deterministic and keeps boxes from overlapping', () => {
    const links = [
      { source: 'fact', target: 'dim_sku' },
      { source: 'fact', target: 'dim_day' },
    ];
    const first = layoutEr(nodes, links, options);
    const second = layoutEr([...nodes].reverse(), links, options);
    expect(first.positions).toEqual(second.positions);

    const boxes = nodes.map((node) => ({
      ...first.positions[node.id],
      h: options.height(node),
    }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const apart =
          boxes[i].x + options.boxWidth <= boxes[j].x ||
          boxes[j].x + options.boxWidth <= boxes[i].x ||
          boxes[i].y + boxes[i].h <= boxes[j].y ||
          boxes[j].y + boxes[j].h <= boxes[i].y;
        expect(apart).toBe(true);
      }
    }
  });

  it('survives a cycle in the joins', () => {
    const { positions } = layoutEr(
      [
        { id: 'a' },
        { id: 'b' },
      ],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
      ],
      options,
    );
    expect(Object.keys(positions)).toHaveLength(2);
  });

  it('spreads a layer across the diagram width', () => {
    const { positions } = layoutEr(nodes, [], { ...options, boxWidth: 100 });
    const roots = Object.values(positions).map((p) => p.y);
    expect(new Set(roots).size).toBe(1);
  });
});
