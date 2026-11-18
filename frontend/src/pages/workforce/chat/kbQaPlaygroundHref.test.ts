import { describe, expect, it } from 'vitest';
import { playgroundHrefFromDataQuery } from './kbQaPlaygroundHref';

describe('playgroundHrefFromDataQuery', () => {
  it('prefers SQL Lab when sql is present', () => {
    const href = playgroundHrefFromDataQuery('m1', {
      mode: 'metric',
      metric: 'gmv',
      sql: 'SELECT 1',
    });
    expect(href).toBe('/data-model/m1/playground?mode=sql&sql=SELECT+1');
  });

  it('seeds builder from metric when no sql', () => {
    const href = playgroundHrefFromDataQuery('m1', { mode: 'metric', metric: 'gmv' });
    const u = new URL(href, 'http://local');
    expect(u.pathname).toBe('/data-model/m1/playground');
    expect(u.searchParams.get('mode')).toBe('builder');
    expect(JSON.parse(u.searchParams.get('q') || '')).toEqual({ metric: 'gmv' });
  });

  it('seeds advanced from expression when no sql', () => {
    const href = playgroundHrefFromDataQuery('m1', {
      mode: 'expression',
      expression: 'SUM(x)',
    });
    const u = new URL(href, 'http://local');
    expect(u.pathname).toBe('/data-model/m1/playground');
    expect(u.searchParams.get('mode')).toBe('advanced');
    expect(JSON.parse(u.searchParams.get('q') || '')).toEqual({ expression: 'SUM(x)' });
  });

  it('falls back to bare playground', () => {
    expect(playgroundHrefFromDataQuery('m1', null)).toBe('/data-model/m1/playground');
  });
});
