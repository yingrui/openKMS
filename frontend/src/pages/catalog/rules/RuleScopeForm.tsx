/**
 * **Scope and run parameters**: what the check is computed per, and what a run must supply.
 *
 * Separate from the basic information because it answers a different question — "which slice of the data, and
 * which period" — and because the group field constrains what a `key` parameter can name.
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

export type ScopeValue = {
  groupField: string;
  runArgs: RunArgumentDraft[];
};

export function RuleScopeForm({
  value,
  onChange,
  fields,
  periodSpec,
}: {
  value: ScopeValue;
  onChange: (next: Partial<ScopeValue>) => void;
  /** Field names of the subject, offered as suggestions — the server validates them anyway. */
  fields: string[];
  /** What a run will ask for, as the server resolves it — the period *value* is a run argument. */
  periodSpec: RuleRunPeriod | null;
}) {
  const { t } = useTranslation("ontology");
  const groupField = value.groupField;
  return (
    <div className="rules-form">
      <FormField label={t("rules.groupField")} hint={t("rules.groupFieldHint")}>
        <input
          type="text"
          value={value.groupField}
          onChange={(e) => onChange({ groupField: e.target.value })}
          list="rule-group-fields"
        />
        <datalist id="rule-group-fields">
          {fields.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </FormField>

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
                checked={argument.required || argument.period}
                disabled={argument.period}
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
            {argument.kind === "filter" ? (
              <label className="rules-run-args__required">
                <input
                  type="checkbox"
                  checked={argument.period}
                  onChange={(e) =>
                    onChange({
                      // Only one parameter can name the period: a run has one period.
                      runArgs: value.runArgs.map((entry, at) => ({
                        ...entry,
                        period: at === index ? e.target.checked : false,
                      })),
                    })
                  }
                />
                {t("rules.runArgPeriod")}
              </label>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                onChange({
                  runArgs: value.runArgs.filter((_e, at) => at !== index),
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
                  formats:
                    periodSpec.format ?? t("rules.runParamsCustomFormat"),
                })
              : t("rules.periodNoInterval")}
          </StatusLineNote>
        ) : null}
      </div>
    </div>
  );
}
