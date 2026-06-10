export interface ConnectorSyncDateRange {
  startDate: string;
  endDate: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Default manual sync: Jan 1 – Dec 31 of the current calendar year. */
export function defaultManualSyncDateRange(now = new Date()): ConnectorSyncDateRange {
  return yearSyncDateRange(now.getFullYear());
}

export function yearSyncDateRange(year: number): ConnectorSyncDateRange {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

export function validateSyncDateRange(range: ConnectorSyncDateRange): string | null {
  if (!range.startDate || !range.endDate) {
    return 'required';
  }
  if (range.startDate > range.endDate) {
    return 'order';
  }
  return null;
}
