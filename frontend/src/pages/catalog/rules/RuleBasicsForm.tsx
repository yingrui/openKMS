/**
 * A rule's own facts: what it is called, what it is about, how urgent, and the dimension it is checked per.
 *
 * Split out of the rule page (which was over the 700-line guard): these fields are plain form state and
 * have nothing to do with how the check itself is written.
 */
import { useTranslation } from "react-i18next";
import { FormField, StatusLineNote } from "../../../styles/design-system";
import type { RuleRunPeriod } from "../../../data/rulesApi";

/** A declared run parameter other than the period: a slice (`filter`) or a scope set (`key`). */
export type RunArgumentDraft = {
  kind: "filter" | "key";
  field: string;
  required: boolean;
  /** Marks the parameter whose value names the period (its interval goes on the event). */
  period: boolean;
};

export type BasicsValue = {
  name: string;
  ruleId: string;
  severity: "P0" | "P1" | "P2";
  status: "active" | "paused";
  groupField: string;
  runArgs: RunArgumentDraft[];
};

export function RuleBasicsForm({
  value,
  onChange,
  fields,
  periodSpec,
  groupField,
}: {
  value: BasicsValue;
  onChange: (next: Partial<BasicsValue>) => void;
  /** Field names of the subject, offered as suggestions — the server validates them anyway. */
  fields: string[];

  /** What a run will ask for, as the server resolves it — the period *value* is a run argument. */
  periodSpec: RuleRunPeriod | null;
  /** The rule's group field, if any: a `key` argument may only narrow the groups it defines. */
  groupField: string;
}) {
  const { t } = useTranslation("ontology");
  return (
    <div className="rules-form">
      <FormField label={t("rules.fieldName")}>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t("rules.fieldNamePlaceholder")}
        />
      </FormField>
      <FormField
        label={t("rules.fieldRuleId")}
        hint={t("rules.fieldRuleIdHint")}
      >
        <input
          type="text"
          value={value.ruleId}
          onChange={(e) => onChange({ ruleId: e.target.value })}
          placeholder={t("rules.fieldRuleIdPlaceholder")}
          autoComplete="off"
        />
      </FormField>
      <FormField label={t("rules.fieldSeverity")}>
        <select
          value={value.severity}
          onChange={(e) =>
            onChange({ severity: e.target.value as BasicsValue["severity"] })
          }
        >
          {["P0", "P1", "P2"].map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t("rules.fieldStatus")}>
        <select
          value={value.status}
          onChange={(e) =>
            onChange({ status: e.target.value as BasicsValue["status"] })
          }
        >
          <option value="active">{t("rules.active")}</option>
          <option value="paused">{t("rules.paused")}</option>
        </select>
      </FormField>
      <FormField label={t("rules.groupField")} hint={t("rules.groupFieldHint")}>
        <input
          type="text"
          value={value.groupField}
          onChange={(e) => onChange({ groupField: e.target.value })}
          placeholder="scenario_id"
          list="rule-group-fields"
        />
        <datalist id="rule-group-fields">
          {fields.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </FormField>
      {/* 运行参数：规则声明自己要什么；运行对话框里填的是这些参数的值。 */}
      <div className="rules-run-args">
        <p className="rules-run-args__title">{t("rules.runArgsTitle")}</p>
        <p className="settings-page-hint">{t("rules.runArgsHint")}</p>
        {value.runArgs.map((argument, index) => (
          <div
            className="rules-run-args__row"
            key={`${argument.kind}-${index}`}
          >
            <FormField label={t("rules.runArgKind")}>
              <select
                value={argument.kind}
                onChange={(e) =>
                  onChange({
                    runArgs: value.runArgs.map((entry, at) =>
                      at === index
                        ? {
                            ...entry,
                            kind: e.target.value as RunArgumentDraft["kind"],
                          }
                        : entry,
                    ),
                  })
                }
              >
                <option value="filter">{t("rules.runArgFilter")}</option>
                <option value="key" disabled={!groupField}>
                  {t("rules.runArgKey")}
                </option>
              </select>
            </FormField>
            <FormField label={t("rules.runArgField")}>
              <select
                value={argument.field}
                onChange={(e) =>
                  onChange({
                    runArgs: value.runArgs.map((entry, at) =>
                      at === index
                        ? { ...entry, field: e.target.value }
                        : entry,
                    ),
                  })
                }
              >
                <option value="">{t("rules.runArgFieldPick")}</option>
                {(argument.kind === "key" && groupField
                  ? [groupField]
                  : fields
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FormField>
            <label className="rules-run-args__required">
              <input
                type="checkbox"
                checked={argument.required}
                onChange={(e) =>
                  onChange({
                    runArgs: value.runArgs.map((entry, at) =>
                      at === index
                        ? { ...entry, required: e.target.checked }
                        : entry,
                    ),
                  })
                }
              />
              {t("rules.runArgRequired")}
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                onChange({
                  runArgs: value.runArgs.filter((_entry, at) => at !== index),
                })
              }
            >
              {t("rules.runArgRemove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() =>
            onChange({
              runArgs: [
                ...value.runArgs,
                { kind: "filter", field: "", required: false, period: false },
              ],
            })
          }
        >
          {t("rules.runArgAdd")}
        </button>
        {periodSpec ? (
          <StatusLineNote>
            {periodSpec.has_interval
              ? t("rules.runParamsRequired", {
                  formats: periodSpec.format ?? t("rules.runParamsCustomFormat"),
                })
              : t("rules.periodNoInterval")}
          </StatusLineNote>
        ) : null}
      </div>
    </div>
  );
}
