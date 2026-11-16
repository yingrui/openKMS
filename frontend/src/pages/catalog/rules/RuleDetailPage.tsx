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
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellRing, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, StatusChip, StatusLine } from "../../../styles/design-system";
import {
  createRule,
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
import { EntityViewPanel, EntityViewShell } from "../../shared/EntityViewShell";
import { RunRulesDialog } from "./RunRulesDialog";
import { conditionLabel } from "./rulesLabels";
import { ConditionRows } from "./ConditionRows";
import {
  conditionFromRows,
  newRow,
  rowsFromCondition,
  type ConditionRow,
} from "./conditionRowsModel";
import { useRuleActions } from "./useRuleActions";
import { RulesEventsTable } from "./RulesEventsTable";
import { RuleBasicsForm } from "./RuleBasicsForm";
import { RuleScopeForm } from "./RuleScopeForm";
import { RuleAlertForm } from "./RuleAlertForm";
import { SectionSave } from "./SectionSave";
import { RelationEditor } from "./RelationEditor";
import {
  buildRulePayload,
  EMPTY_FORM,
  formFromRule,
  type FormState,
} from "./ruleForm";
import { identitiesPayload } from "./relationDraft";
import "../../../styles/settings-page.scss";
import "../../ontology/ontology-admin.scss";
import "../../../styles/rules.scss";

function statusTone(status: string | null): "ok" | "warn" | "neutral" | "accent" {
  if (status === "fail") return "warn";
  if (status === "pass") return "ok";
  return "neutral";
}

function severityTone(severity: string | null): "warn" | "accent" | "neutral" {
  if (severity === "P0") return "warn";
  if (severity === "P1") return "accent";
  return "neutral";
}

export function RuleDetailPage() {
  const { t } = useTranslation("ontology");
  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const isNew = ruleId === "new";

  const [rule, setRule] = useState<RuleOut | null>(null);
  const [events, setEvents] = useState<EventOut[]>([]);
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [datasets, setDatasets] = useState<DatasetResponse[]>([]);
  const [loading, setLoading] = useState(!isNew);
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
    return { metrics: metricPage.items, datasets: datasetPage.items };
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
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
  }, [isNew, ruleId, t, loadPickers]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isNew) return;
    void loadPickers().then((pickers) => {
      const next: FormState = {
        ...EMPTY_FORM,
        metricId: pickers.metrics[0]?.id ?? "",
        datasetId: pickers.datasets[0]?.id ?? "",
      };
      setForm(next);
      setConditionRows([
        newRow({
          metricId: pickers.metrics[0]?.id ?? "",
          datasetId: pickers.datasets[0]?.id ?? "",
        }),
      ]);
    });
  }, [isNew, loadPickers]);

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

  const saveBasics = () =>
    void patchSection({
      name: form.name.trim(),
      description: form.description.trim(),
      rule_id: form.ruleId.trim() || null,
      severity: form.severity,
      status: form.status,
    });

  const saveCheck = () => {
    if (conditionUnrepresentable) return;
    const identities =
      form.mode === "relation" ? identitiesPayload(form.relations) : null;
    const condition =
      form.mode === "relation" ? null : conditionFromRows(conditionRows);
    if (!identities && !condition) {
      setConditionError(t("rules.conditionIncomplete"));
      return;
    }
    setConditionError(null);
    void patchSection(identities ? { identities } : { condition });
  };

  const saveParams = () =>
    void patchSection({
      group_by: form.groupField.trim()
        ? { field: form.groupField.trim() }
        : null,
      run_params: buildRulePayload(form, null).run_params,
    });

  const saveAlert = () =>
    void patchSection({
      conclusion: form.conclusion.trim(),
      suggestion: form.suggestion.trim(),
    });

  const checkDirty = () =>
    form.mode === "relation"
      ? JSON.stringify(identitiesPayload(form.relations)) !==
        JSON.stringify((rule?.identities ?? []).map((identity) => identity))
      : JSON.stringify(conditionFromRows(conditionRows)) !==
        JSON.stringify(rule?.condition ?? null);

  /** Creating a rule is the one place that saves everything at once — it has no sections to update yet. */
  const create = async () => {
    if (!form.name.trim()) return;
    if (conditionUnrepresentable) {
      setConditionError(t("rules.conditionUnrepresentable"));
      return;
    }
    const condition = conditionFromRows(conditionRows);
    if (!condition) {
      setConditionError(t("rules.conditionIncomplete"));
      return;
    }
    setSaving(true);
    try {
      const created = await createRule(buildRulePayload(form, condition));
      toast.success(t("rules.toastCreated"));
      navigate(`/data-rules/${created.id}`, { replace: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("rules.toastSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  /** Undo every unsaved card: the baseline is what the server last returned. */
  const revert = () => {
    if (isNew) {
      navigate("/data-rules");
      return;
    }
    if (rule) {
      setForm(formFromRule(rule, metrics, datasets));
      const rows = rowsFromCondition(rule.condition);
      setConditionRows(rows ?? []);
      setConditionUnrepresentable(rows === null);
    }
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
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">
          <Loader2 size={16} className="animate-spin" aria-hidden />{" "}
          {t("shared.loading")}
        </p>
      </div>
    );
  }

  if (!isNew && !rule) {
    return (
      <div className="ontology-admin">
        <p className="page-subtitle">{t("rules.notFound")}</p>
      </div>
    );
  }

  const shellTitle = isNew ? t("rules.dialogCreate") : (rule?.name ?? "—");
  const shellMeta = rule ? (
    <>
      {rule.rule_id ?? ""}
      {rule.owner ? ` · ${rule.owner}` : ""} · v{rule.version ?? 1}
    </>
  ) : null;
  const shellActions = isNew ? (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => navigate("/data-rules")}
        disabled={saving}
      >
        {t("shared.cancel")}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void create()}
        disabled={saving || !form.name.trim()}
      >
        {saving ? t("rules.saving") : t("shared.create")}
      </button>
    </>
  ) : rule ? (
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
        { sectionId: "overview", label: t("rules.navOverview") },
        { sectionId: "check", label: t("rules.navCheck") },
        { sectionId: "run-params", label: t("rules.navRunParams") },
        { sectionId: "alert-copy", label: t("rules.navAlertCopy") },
        ...(rule ? [{ sectionId: "events", label: t("rules.navEvents") }] : []),
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

      <div className="account-stack">
        {/* One card per intent: what it is, what must hold, how it runs, what it says. Each saves itself. */}
        <EntityViewPanel
          id="overview"
          title={t("rules.navOverview")}
          actions={
            rule && !isNew ? (
              <SectionSave
                dirty={dirty(
                  "name",
                  "description",
                  "ruleId",
                  "severity",
                  "status",
                )}
                saving={saving}
                onSave={saveBasics}
                onRevert={revert}
              />
            ) : null
          }
        >
          {/* What the rule watches is a fact, not a form field: the subject is chosen when it is created. */}
          <dl className="rules-facts">
            <dt>{t("rules.fieldSubject")}</dt>
            <dd>{metricName(form.metricId)}</dd>
            <dt>{t("rules.colLastRun")}</dt>
            <dd>
              {rule?.last_status ? (
                <StatusLine>
                  <StatusChip tone={statusTone(rule.last_status)}>
                    {t(`rules.status.${rule.last_status}`)}
                  </StatusChip>
                  <StatusLine>
                    {rule.last_period_start || "—"}
                    {rule.last_run_at ? ` · ${new Date(rule.last_run_at).toLocaleString()}` : ""}
                  </StatusLine>
                </StatusLine>
              ) : (
                t("rules.neverRun")
              )}
            </dd>
          </dl>
          <RuleBasicsForm
            value={{
              name: form.name,
              description: form.description,
              ruleId: form.ruleId,
              severity: form.severity,
              status: form.status,
            }}
            onChange={(next) => setForm({ ...form, ...next })}
          />
        </EntityViewPanel>

        <EntityViewPanel
          id="check"
          title={
            form.mode === "relation"
              ? t("rules.panelRelation")
              : t("rules.panelCondition")
          }
          description={
            form.mode === "relation"
              ? t("rules.panelRelationHint")
              : t("rules.panelConditionHint")
          }
          actions={
            rule && !isNew ? (
              <SectionSave
                dirty={checkDirty()}
                saving={saving}
                onSave={saveCheck}
                onRevert={revert}
              />
            ) : null
          }
        >
          {/* Two kinds of check, one place: a threshold, or an identity between metrics. */}
          <div
            className="ds-view-toggle rules-mode"
            role="tablist"
            aria-label={t("rules.modeAria")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={form.mode === "condition"}
              className={`ds-view-toggle__btn ${form.mode === "condition" ? "active" : ""}`}
              onClick={() => setForm({ ...form, mode: "condition" })}
            >
              {t("rules.modeCondition")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={form.mode === "relation"}
              className={`ds-view-toggle__btn ${form.mode === "relation" ? "active" : ""}`}
              onClick={() => setForm({ ...form, mode: "relation" })}
            >
              {t("rules.modeRelation")}
            </button>
          </div>

          {form.mode === "relation" ? (
            <RelationEditor
              value={form.relations}
              onChange={(relations) => setForm({ ...form, relations })}
              metrics={metrics}
              metricName={metricName}
            />
          ) : null}

          {form.mode === "condition" ? (
            <>
              {/* The logic, in words, as the rows are edited — the editor shows fields, this shows the
                      sentence a reader would have to reconstruct from them. */}
              <p className="rules-condition-current">
                {conditionLabel(
                  conditionFromRows(conditionRows),
                  { metricName, datasetName, ...joiners },
                  form.groupField.trim()
                    ? { field: form.groupField.trim() }
                    : null,
                ) ?? t("rules.conditionIncomplete")}
              </p>
              {conditionUnrepresentable ? (
                <p className="rules-condition-warning">
                  {t("rules.conditionUnrepresentable")}
                </p>
              ) : null}
              <ConditionRows
                rows={conditionRows}
                onChange={(next) => {
                  setConditionRows(next);
                  setConditionError(null);
                }}
                metrics={metrics}
                datasets={datasets}
                error={conditionError}
              />
            </>
          ) : null}
        </EntityViewPanel>

        <EntityViewPanel
          id="run-params"
          title={t("rules.navRunParams")}
          description={t("rules.scopeHint")}
          actions={
            rule && !isNew ? (
              <SectionSave
                dirty={dirty("groupField", "runArgs")}
                saving={saving}
                onSave={saveParams}
                onRevert={revert}
              />
            ) : null
          }
        >
          <RuleScopeForm
            value={{ groupField: form.groupField, runArgs: form.runArgs }}
            onChange={(next) => setForm({ ...form, ...next })}
            fields={paramCandidates}
            periodSpec={rulePeriodArgument}
          />
        </EntityViewPanel>

        <EntityViewPanel
          id="alert-copy"
          title={t("rules.navAlertCopy")}
          description={t("rules.panelMeaningHint")}
          actions={
            rule && !isNew ? (
              <SectionSave
                dirty={dirty("conclusion", "suggestion")}
                saving={saving}
                onSave={saveAlert}
                onRevert={revert}
              />
            ) : null
          }
        >
          <RuleAlertForm
            value={{ conclusion: form.conclusion, suggestion: form.suggestion }}
            onChange={(next) => setForm({ ...form, ...next })}
          />
        </EntityViewPanel>

        {rule ? (
          <EntityViewPanel
            id="events"
            title={t("rules.navEvents")}
            description={t("rules.panelEventsHint")}
          >
            {events.length === 0 ? (
              <EmptyState
                icon={<BellRing size={32} aria-hidden />}
                title={t("rules.emptyEvents")}
              />
            ) : (
              <RulesEventsTable
                events={events}
                busyEventId={busyEventId}
                showPeriod
                onTransition={(event, status) =>
                  void actions.moveEvent(event, status)
                }
              />
            )}
          </EntityViewPanel>
        ) : null}
      </div>

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
