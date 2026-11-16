/**
 * One rule: read it, run it, edit it — on a page, not in a dialog.
 *
 * A rule is a handful of metadata plus a condition, and the condition needs room: a summary of what is
 * stored, a form view, and a JSON view for the shapes the form cannot express. That is a page's worth
 * of work ("both views at once serves neither" was the same conclusion the quality-rule page reached),
 * so the page has two modes — read and edit — and the header carries the mode's actions.
 *
 * `/rules/new` is the same page in edit mode, so creating and editing cannot drift apart.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { StatusChip, StatusLine } from "../../../styles/design-system";
import {
  fetchRule,
  fetchRuleEvents,
  updateRule,
  type RuleOut,
  type RuleRunPeriod,
  type RulesEvaluateResponse,
} from "../../../data/rulesApi";
import type { EventOut } from "../../../data/eventsApi";
import { fetchMetrics, type MetricResponse } from "../../../data/metricsApi";
import { fetchDatasets, type DatasetResponse } from "../../../data/datasetsApi";
import {
  fetchModelFields,
  type SemanticModelFieldResponse,
} from "../../../data/semanticModelFieldsApi";
import { EntityViewLoading, EntityViewShell } from "../../shared/EntityViewShell";
import { RunRulesDialog } from "./RunRulesDialog";
import {
  conditionFromRows,
  rowsFromCondition,
  type ConditionRow,
} from "./conditionRowsModel";
import { useRuleActions } from "./useRuleActions";
import {
  buildRulePayload,
  EMPTY_FORM,
  formFromRule,
  type FormState,
} from "./ruleForm";
import type { RuleDetailCtx } from "./ruleDetailContext";
import { severityTone } from "./ruleTones";
import "../../../styles/settings-page.scss";
import "../../ontology/ontology-admin.scss";
import "../../../styles/rules.scss";

export function RuleDetailPage() {
  const { t } = useTranslation("ontology");
  const { ruleId } = useParams<{ ruleId: string }>();

  const [rule, setRule] = useState<RuleOut | null>(null);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(true);
  /** Every card saves its own fields; there is no page-wide edit mode. */
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const rulePeriodArgument =
    (rule?.run_params?.arguments.find(
      (argument): argument is RuleRunPeriod => argument.role === "period",
    ) as RuleRunPeriod | undefined) ?? null;
  const [conditionRows, setConditionRows] = useState<ConditionRow[]>([]);
  /** The stored condition has a shape this editor cannot draw — editing would silently rewrite it. */
  const [conditionUnrepresentable, setConditionUnrepresentable] =
    useState(false);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  // A trial's result lives here, not on the rule: 试算 publishes nothing, so there is nothing to reload.
  const [trial, setTrial] = useState<RulesEvaluateResponse | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [paramCandidates, setParamCandidates] = useState<string[]>([]);
  /** The metric list failed to load: an editor without options would look like a broken rule. */
  const [pickersMissing, setPickersMissing] = useState(false);

  const metricName = useMemo(() => {
    const byId = new Map(metrics.map((metric) => [metric.id, metric.name]));
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [metrics]);
  const datasetName = useMemo(() => {
    const byId = new Map(
      datasets.map((dataset) => [
        dataset.id,
        dataset.display_name || dataset.table_name || dataset.id.slice(0, 8),
      ]),
    );
    return (id: string) => byId.get(id) ?? id.slice(0, 8);
  }, [datasets]);

  /** Fields a group-by can use: the model fields of the metric this rule watches. */
  useEffect(() => {
    let cancelled = false;
    const metric = metrics.find((entry) => entry.id === form.metricId);
    if (!metric) {
      setParamCandidates([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const fields = await fetchModelFields(metric.semantic_model_id);
        if (!cancelled) {
          setParamCandidates(
            fields.items.map((field: SemanticModelFieldResponse) => field.name),
          );
        }
      } catch {
        if (!cancelled) setParamCandidates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.metricId, metrics]);

  const loadPickers = useCallback(async () => {
    const [metricPage, datasetPage] = await Promise.all([
      fetchMetrics().catch(() => ({ items: [] as MetricResponse[], total: 0 })),
      fetchDatasets({ limit: 200 }).catch(() => ({
        items: [] as DatasetResponse[],
        total: 0,
      })),
    ]);
    setMetrics(metricPage.items);
    setDatasets(datasetPage.items);
    setPickersMissing(metricPage.items.length === 0);
    return { metrics: metricPage.items, datasets: datasetPage.items };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, eventPage, pickers] = await Promise.all([
        fetchRule(ruleId ?? ""),
        fetchRuleEvents(ruleId ?? "", { limit: 50 }).catch(() => ({
          items: [] as EventOut[],
          total: 0,
        })),
        loadPickers(),
      ]);
      setRule(current);
      setEvents(eventPage.items);
      const next = formFromRule(current, pickers.metrics, pickers.datasets);
      setForm(next);
      setBaseline(next);
      // A stored condition the flat editor cannot show (a nested group) leaves the rows empty and the
      // page says so; nothing is silently rewritten.
      const rows = rowsFromCondition(current.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("rules.toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [ruleId, t, loadPickers]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One card's fields, compared against what the server last returned. */
  const dirty = (...keys: (keyof FormState)[]) =>
    keys.some(
      (key) => JSON.stringify(form[key]) !== JSON.stringify(baseline[key]),
    );

  const patchSection = async (body: Record<string, unknown>) => {
    if (!rule) return false;
    setSaving(true);
    try {
      const updated = await updateRule(rule.id, body);
      setRule(updated);
      const next = formFromRule(updated, metrics, datasets);
      setForm(next);
      setBaseline(next);
      toast.success(t("rules.toastUpdated"));
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("rules.toastSaveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** One save for the whole definition: the settings page is one form, like a model's. */
  const saveAll = () => {
    if (!rule) return;
    if (conditionUnrepresentable) {
      setConditionError(t("rules.conditionUnrepresentable"));
      return;
    }
    const condition = conditionFromRows(conditionRows);
    if (form.mode === "condition" && !condition) {
      setConditionError(t("rules.conditionIncomplete"));
      return;
    }
    const payload = buildRulePayload(form, condition);
    void patchSection(payload as unknown as Record<string, unknown>);
  };

  const dirtyAll = () =>
    JSON.stringify(buildRulePayload(form, conditionFromRows(conditionRows))) !==
    JSON.stringify(buildRulePayload(baseline, rule?.condition ?? null));

  /** Undo the draft: back to what the server last returned. */
  const revert = () => {
    setForm(baseline);
    const rows = rowsFromCondition(rule?.condition ?? null);
    setConditionRows(rows ?? []);
    setConditionUnrepresentable(rows === null);
    setConditionError(null);
  };

  const actions = useRuleActions({
    rule,
    load,
    runOpen,
    setRunOpen,
    setTrial,
    running,
    setRunning,
    eventCount: events.length,
    setBusyEventId,
  });

  // The author's own word for what a run picks ("方案") makes the sentence concrete; without one the
  // sentence stays domain-neutral ("one object at a time"). Neither ever says "scenario".
  const groupLabel = rule?.group_by?.label ?? null;
  const joiners = {
    and: t("rules.joinAnd"),
    or: t("rules.joinOr"),
    scopePrefix: t("rules.scopePrefix"),
    scopeAtRunTime: groupLabel
      ? t("rules.groupedByNamed", { name: groupLabel })
      : t("rules.groupedBy"),
  };
  if (loading) {
    return <EntityViewLoading label={t("shared.loading")} />;
  }

  if (!rule) {
    return <p className="entity-view__readonly">{t("rules.notFound")}</p>;
  }

  const shellTitle = rule?.name ?? "—";
  const shellMeta = rule ? (
    <>
      {rule.rule_id ?? ""}
      {rule.owner ? ` · ${rule.owner}` : ""} · v{rule.version ?? 1}
    </>
  ) : null;
  const shellActions = rule ? (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setRunOpen(true)}
        disabled={running}
      >
        {running ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <Play size={16} aria-hidden />
        )}
        {t("rules.run")}
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void actions.remove()}
      >
        {t("rules.deleteRule")}
      </button>
    </>
  ) : null;

  const base = `/data-rules/${rule?.id ?? ""}`;
  const ctx: RuleDetailCtx = {
    rule,
    form,
    setForm,
    saving,
    events,
    metricName,
    datasetName,
    paramCandidates,
    periodSpec: rulePeriodArgument,
    conditionRows,
    setConditionRows,
    conditionUnrepresentable,
    conditionError,
    setConditionError,
    metrics,
    datasets,
    joinerWords: joiners,
    dirty,
    revert,
    moveEvent: actions.moveEvent,
    busyEventId,
    remove: actions.remove,
    saveAll,
    dirtyAll,
    pickersMissing,
  };

  return (
    <EntityViewShell
      backTo="/data-rules"
      backLabel={t("rules.backToList")}
      title={shellTitle}
      meta={shellMeta}
      identityAction={
        rule ? (
          <StatusLine>
            <StatusChip tone={severityTone(rule.severity)}>
              {rule.severity ?? "—"}
            </StatusChip>
            <StatusChip tone={rule.status === "paused" ? "neutral" : "ok"}>
              {rule.status === "paused" ? t("rules.paused") : t("rules.active")}
            </StatusChip>
          </StatusLine>
        ) : null
      }
      navItems={[
        { to: base, label: t("rules.navOverview"), end: true },
        { to: `${base}/events`, label: t("rules.navEvents") },
        { to: `${base}/settings`, label: t("rules.navSettings") },
      ]}
    >
      <header className="page-header">
        <div>
          {rule?.description ? (
            <p className="page-subtitle">{rule.description}</p>
          ) : null}
        </div>
        <div className="page-header-actions">{shellActions}</div>
      </header>

      <Outlet context={ctx} />

      <RunRulesDialog
        open={runOpen}
        busy={running}
        onClose={() => {
          setRunOpen(false);
          setTrial(null);
        }}
        onRun={(params) => void actions.run(params)}
        onTrial={(params) => void actions.trialRun(params)}
        trial={trial}
        runArguments={rule?.run_params?.arguments ?? []}
        lookups={{
          metricName,
          datasetName,
          ...joiners,
          derivedWord: (word) =>
            t(
              `rules.evidence${{ target: "Target", residual: "Residual", tolerance: "Tolerance" }[word]}`,
            ),
        }}
      />
    </EntityViewShell>
  );
}
