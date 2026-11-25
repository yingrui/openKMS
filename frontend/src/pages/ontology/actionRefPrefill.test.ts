import { describe, expect, it } from 'vitest';
import { refOptionsFromSelection, refPrefillFromSelection } from './actionRefPrefill';

const spec = {
  type_id: 'product',
  type_name: 'Product',
  property: 'code',
  label_property: 'name',
};

const rows = [
  { id: 'p1', data: { code: 'KFR-35GW', name: '智悦 1.5 匹变频挂机' } },
  { id: 'p2', data: { code: 'XFH-500', name: '新风 500' } },
];

describe('a reference parameter answered by the selection', () => {
  it('maps each ticked object to the declared property and its label', () => {
    expect(refOptionsFromSelection(spec, 'product', rows)).toEqual([
      { value: 'KFR-35GW', label: '智悦 1.5 匹变频挂机' },
      { value: 'XFH-500', label: '新风 500' },
    ]);
  });

  it('offers nothing when the selection is another type', () => {
    expect(refOptionsFromSelection(spec, 'distributor', rows)).toEqual([]);
  });

  it('prefills only when exactly one object is ticked', () => {
    expect(refPrefillFromSelection(spec, 'product', rows.slice(0, 1))).toEqual({
      value: 'KFR-35GW',
      label: '智悦 1.5 匹变频挂机',
    });
    expect(refPrefillFromSelection(spec, 'product', rows)).toBeNull();
  });

  it('drops a row that has no value for the declared property', () => {
    expect(
      refOptionsFromSelection(spec, 'product', [
        { id: 'p3', data: { name: '没有编码' } },
        ...rows,
      ])
    ).toHaveLength(2);
  });
});
