/** The one place a rule status or severity becomes a chip colour. */
export function severityTone(severity: string | null): 'warn' | 'accent' | 'neutral' {
  if (severity === 'P0') return 'warn';
  if (severity === 'P1') return 'accent';
  return 'neutral';
}

export function statusTone(status: string | null): 'ok' | 'warn' | 'neutral' {
  if (status === 'fail') return 'warn';
  if (status === 'pass') return 'ok';
  return 'neutral';
}
