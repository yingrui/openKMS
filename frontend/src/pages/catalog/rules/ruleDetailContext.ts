/**
 * What every tab of a rule page reads from the page that loaded it.
 *
 * The rule, its draft form and the save/evaluate handlers live once, in the page (and its layout route), so a
 * tab is only the part of the rule it shows — switching tabs never reloads or resets a draft.
 */
import type { FormState } from './ruleForm';
import type { RuleOut, RuleRunPeriod } from '../../../data/rulesApi';
import type { EventOut } from '../../../data/eventsApi';
import type { MetricResponse } from '../../../data/metricsApi';
import type { DatasetResponse } from '../../../data/datasetsApi';
import type { ConditionRow } from './conditionRowsModel';

export type RuleDetailCtx = {
  rule: RuleOut | null;
  form: FormState;
  setForm: (next: FormState) => void;
  saving: boolean;
  events: EventOut[];
  metricName: (id: string) => string;
  datasetName: (id: string) => string;
  paramCandidates: string[];
  periodSpec: RuleRunPeriod | null;
  conditionRows: ConditionRow[];
  setConditionRows: (rows: ConditionRow[]) => void;
  conditionUnrepresentable: boolean;
  conditionError: string | null;
  setConditionError: (message: string | null) => void;
  metrics: MetricResponse[];
  datasets: DatasetResponse[];
  joinerWords: { and: string; or: string; scopePrefix: string };
  dirty: (...keys: (keyof FormState)[]) => boolean;
  revert: () => void;
  moveEvent: (event: EventOut, status: 'resolved' | 'dismissed') => Promise<void>;
  busyEventId: string | null;
  /** Delete, from the settings tab's danger zone — the only place it appears. */
  remove: () => Promise<void>;
  /** One save for the whole definition (the settings page is a single form). */
  saveAll: () => void;
  dirtyAll: () => boolean;
  /** True when the metric list could not be loaded, so the editors have no options to offer. */
  pickersMissing: boolean;
};
