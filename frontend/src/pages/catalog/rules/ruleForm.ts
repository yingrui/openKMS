/**
 * The rule form: its state, the rule → form conversion, and the form → payload conversion.
 *
 * Extracted from the page (over the 700-line guard) and, more importantly, so the conversions are pure
 * functions a test can hold: a rule round-tripping through the editor must not lose an identity.
 */
import type {
  RuleArgument,
  RuleCondition,
  RuleOut,
  RuleWritePayload,
} from "../../../data/rulesApi";
import type { MetricResponse } from "../../../data/metricsApi";
import type { DatasetResponse } from "../../../data/datasetsApi";
import {
  emptyRelationDraft,
  identitiesPayload,
  type RelationDraft,
} from "./relationDraft";
import type { RunArgumentDraft } from "./RuleScopeForm";

export type FormState = {
  /** A threshold check, or an identity between metrics — exactly one is sent. */
  mode: "condition" | "relation";
  relations: RelationDraft[];
  name: string;
  description: string;
  ruleId: string;
  metricId: string;
  datasetId: string;
  aggFn: "count" | "sum" | "avg" | "min" | "max";
  aggColumn: string;
  op: string;
  threshold: string;
  severity: "P0" | "P1" | "P2";
  conclusion: string;
  suggestion: string;
  status: "active" | "paused";
  groupField: string;
  runArgs: RunArgumentDraft[];
};

export const EMPTY_FORM: FormState = {
  mode: "condition",
  relations: [emptyRelationDraft()],
  name: "",
  description: "",
  ruleId: "",
  metricId: "",
  datasetId: "",
  aggFn: "count",
  aggColumn: "",
  op: ">",
  threshold: "0",
  severity: "P1",
  conclusion: "",
  suggestion: "",
  status: "active",
  groupField: "",
  runArgs: [],
};

export function formFromRule(
  rule: RuleOut,
  metrics: MetricResponse[],
  datasets: DatasetResponse[],
): FormState {
  const condition = rule.condition;
  const single = condition && "left" in condition ? condition : null;
  const left = single?.left;
  const identities = rule.identities ?? [];
  return {
    mode: identities.length > 0 ? "relation" : "condition",
    relations:
      identities.length > 0
        ? identities.map((identity) => ({
            target: identity.target.metric,
            members: identity.members.map((member) => ({
              metricId: member.metric,
              weight: String(member.weight ?? 1),
            })),
            toleranceKind: identity.tolerance?.rel
              ? ("rel" as const)
              : ("abs" as const),
            toleranceValue: String(
              identity.tolerance?.rel ?? identity.tolerance?.abs ?? 0,
            ),
            suggestion: identity.suggestion ?? '',
          }))
        : [emptyRelationDraft()],
    name: rule.name ?? "",
    description: rule.description ?? "",
    ruleId: rule.rule_id ?? "",
    metricId: left && "metric" in left ? left.metric : (metrics[0]?.id ?? ""),
    datasetId:
      left && "dataset_agg" in left
        ? left.dataset_agg.dataset_id
        : (datasets[0]?.id ?? ""),
    aggFn: left && "dataset_agg" in left ? left.dataset_agg.fn : "count",
    aggColumn:
      left && "dataset_agg" in left ? (left.dataset_agg.column ?? "") : "",
    op: single?.op ?? ">",
    threshold: String(single?.right.value ?? 0),
    severity: (rule.severity as FormState["severity"]) ?? "P1",
    conclusion: rule.conclusion ?? "",
    suggestion: rule.suggestion ?? "",
    status: rule.status === "paused" ? "paused" : "active",
    groupField: rule.group_by?.field ?? "",
    runArgs: (rule.run_params?.arguments ?? []).map(
      (argument): RunArgumentDraft => ({
        kind: argument.kind === "key" ? "key" : "filter",
        field: argument.field ?? argument.key,
        required: Boolean(argument.required),
        period: argument.role === "period",
      }),
    ),
  };
}

/** The write payload for a rule page: the form, plus the check it currently describes. */
export function buildRulePayload(
  form: FormState,
  condition: RuleCondition | null,
): RuleWritePayload {
  const identities =
    form.mode === "relation" ? identitiesPayload(form.relations) : null;
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    rule_id: form.ruleId.trim() || null,
    metric_id: form.metricId,
    ...(identities ? { identities } : { condition }),
    severity: form.severity,
    conclusion: form.conclusion.trim(),
    suggestion: form.suggestion.trim(),
    status: form.status,
    group_by: form.groupField.trim() ? { field: form.groupField.trim() } : null,
    run_params: {
      arguments: form.runArgs
        .filter((argument) => argument.field.trim())
        .map((argument): RuleArgument => ({
          key: argument.field.trim(),
          kind: argument.kind,
          field: argument.field.trim(),
          required: argument.period ? true : argument.required,
          ...(argument.period ? { role: "period" as const } : {}),
        })),
    },
  };
}
