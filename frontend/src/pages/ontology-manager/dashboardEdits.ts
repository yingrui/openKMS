/**
 * Editing a dashboard's document (pure list arithmetic).
 *
 * The dashboard **is** the document — editing a report is writing the array back, so the operations
 * are the array ones. Kept pure and tested because the boundary cases (moving the first tile up,
 * removing the last one) are exactly where an off-by-one hides.
 */

import type { DashboardReport } from '../../data/dashboardsApi';
import { viewSpec, type ViewDraft } from './reportDraft';

/** What the report editor can change: what it *is* (source/query) stays where it was built. */
export interface ReportFields {
  title: string;
  insight: string;
  view: ViewDraft;
}

/**
 * Apply edited fields to a report, keeping its source, query and last run.
 *
 * An emptied insight or view is **removed**, not blanked: the document should not carry keys that
 * mean nothing.
 */
export function applyReportFields(report: DashboardReport, fields: ReportFields): DashboardReport {
  const next: DashboardReport = { ...report, title: fields.title.trim() || report.title };
  if (fields.insight.trim()) {
    next.insight = fields.insight.trim();
  } else {
    delete next.insight;
  }
  const view = viewSpec(fields.view);
  if (view) {
    next.view = view;
  } else {
    delete next.view;
  }
  return next;
}

/** Replace one report, leaving the rest — the entry the editor produced. */
export function replaceReport(
  reports: DashboardReport[],
  index: number,
  entry: DashboardReport,
): DashboardReport[] {
  if (index < 0 || index >= reports.length) return reports;
  return reports.map((r, i) => (i === index ? entry : r));
}

/** Drop one report. */
export function removeReport(reports: DashboardReport[], index: number): DashboardReport[] {
  if (index < 0 || index >= reports.length) return reports;
  return reports.filter((_, i) => i !== index);
}

/** Move one report up (-1) or down (+1); a move off either end is a no-op, not a wrap. */
export function moveReport(
  reports: DashboardReport[],
  index: number,
  delta: number,
): DashboardReport[] {
  const target = index + delta;
  if (index < 0 || index >= reports.length || target < 0 || target >= reports.length) return reports;
  const next = [...reports];
  const [entry] = next.splice(index, 1);
  next.splice(target, 0, entry);
  return next;
}
