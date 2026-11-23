import { describe, expect, it } from 'vitest';
import { API_NAME_RE, firstPort, suggestApiName } from './registerDefaults';
import type { KubernetesServiceItem } from '../../data/kubernetesClustersApi';

const svc = (over: Partial<KubernetesServiceItem>): KubernetesServiceItem => ({
  name: 'svc',
  namespace: 'default',
  type: 'ClusterIP',
  cluster_ip: null,
  ports: null,
  created_at: null,
  ...over,
});

describe('API_NAME_RE', () => {
  it('accepts the identifiers the backend accepts', () => {
    expect(API_NAME_RE.test('forecast_workbench')).toBe(true);
    expect(API_NAME_RE.test('App2')).toBe(true);
  });

  it('rejects what the backend rejects, so the form can say so first', () => {
    expect(API_NAME_RE.test('2app')).toBe(false);
    expect(API_NAME_RE.test('forecast-workbench')).toBe(false);
    expect(API_NAME_RE.test('forecast workbench')).toBe(false);
  });
});

describe('suggestApiName', () => {
  it('turns the Service name into a legal identifier', () => {
    expect(suggestApiName('forecast-workbench')).toBe('forecast_workbench');
    expect(suggestApiName('2forecast')).toBe('svc_2forecast');
  });
});

describe('firstPort', () => {
  it('prefers the parsed port list', () => {
    expect(firstPort(svc({ port_numbers: [8000, 9000] }))).toBe(8000);
  });

  it('falls back to the raw ports string, then to 80', () => {
    expect(firstPort(svc({ ports: '80:31234/TCP' }))).toBe(80);
    expect(firstPort(svc({}))).toBe(80);
  });
});
