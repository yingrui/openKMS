import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import {
  fetchMetrics,
  metricExpressionSql,
  type MetricResponse,
} from "../../../data/metricsApi";
import {
  fetchSemanticModels,
  type SemanticModelResponse,
} from "../../../data/semanticModelsApi";
import { EmptyState, ListPage } from "../../../styles/design-system/index";
import { DatasetAppTabs } from "../../../components/ontology/DatasetAppTabs";
import "../../ontology/ontology-admin.scss";
import "../../../styles/metrics.scss";

/**
 * Every metric, and the model it belongs to — **read-only on purpose**.
 *
 * A metric is authored where it belongs (its model's page, next to its fields and its base dataset),
 * so this page answers "what metrics do we have, and who defines them?" and hands you off to the model
 * to change one. Two buttons here would be a second place to get a definition wrong.
 */
export function MetricsListPage() {
  const { t } = useTranslation("ontology");
  const [metrics, setMetrics] = useState<MetricResponse[]>([]);
  const [models, setModels] = useState<SemanticModelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState<"all" | "covered" | "uncovered">(
    "all",
  );

  useEffect(() => {
    let cancelled = false;
    const coverageParam = coverage === "all" ? undefined : coverage;
    void Promise.all([
      fetchMetrics(undefined, coverageParam),
      fetchSemanticModels(),
    ])
      .then(([metricPage, modelPage]) => {
        if (cancelled) return;
        setMetrics(metricPage.items);
        setModels(modelPage.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coverage]);

  const needle = search.trim().toLowerCase();
  const shown = useMemo(() => {
    // The lookup is inlined rather than closing over a helper, so the dependencies tell the truth.
    const name = (id: string) => models.find((m) => m.id === id)?.name ?? "";
    return metrics.filter(
      (m) =>
        !needle ||
        [
          m.name,
          m.business_definition ?? "",
          name(m.semantic_model_id),
          // Someone searching "满足率" is looking for the metric whose synonyms say so.
          ...(m.ai_context?.synonyms ?? []),
          ...(m.ai_context?.examples ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    );
  }, [metrics, models, needle]);
  const modelName = (id: string) =>
    models.find((m) => m.id === id)?.name ?? t("datasets.dash");

  return (
    <ListPage
      title={t("datasets.metrics")}
      subtitle={t("dataModel.metricsSubtitle")}
      tabs={<DatasetAppTabs />}
    >
      <div className="metrics-toolbar">
        <label className="console-datasets-search metrics-toolbar__search">
          <Search size={18} aria-hidden />
          {/* ds-control-exempt: `.console-datasets-search` styles this input (its own sheet) */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dataModel.metricsSearchPlaceholder")}
            aria-label={t("dataModel.metricsSearchPlaceholder")}
          />
        </label>
        <div className="metrics-toolbar__filters">
          <label className="metrics-toolbar__label">
            {t("dataModel.coverageFilter")}
            <select
              className="ds-control"
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as typeof coverage)}
            >
              <option value="all">{t("dataModel.coverageAll")}</option>
              <option value="covered">{t("dataModel.coverageCovered")}</option>
              <option value="uncovered">
                {t("dataModel.coverageUncovered")}
              </option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="ds-loading">
          <Loader2 size={32} className="ds-loading__spinner" aria-hidden />
          <p>{t("shared.loading")}</p>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={t("dataModel.metricsEmpty")}
          description={t("dataModel.metricsEmptyHint")}
        />
      ) : (
        <div className="ds-table-wrap">
          <table className="ds-table">
            <thead>
              <tr>
                <th>{t("datasets.metricName")}</th>
                <th>{t("dataModel.metricModel")}</th>
                <th>{t("datasets.metricType")}</th>
                <th>{t("datasets.metricDatatype")}</th>
                <th>{t("datasets.metricBaseDataset")}</th>
                <th>{t("dataModel.playgroundExpression")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((metric) => (
                <tr key={metric.id}>
                  <td>
                    <Link
                      to={`/data-model/${metric.semantic_model_id}`}
                      className="ds-table-primary"
                    >
                      {metric.name}
                    </Link>
                    {metric.business_definition ? (
                      <p className="page-subtitle">
                        {metric.business_definition}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    {/* Editing a metric happens in its model — this page never edits one. */}
                    <Link to={`/data-model/${metric.semantic_model_id}`}>
                      {modelName(metric.semantic_model_id)}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`metric-additivity metric-additivity--${metric.additivity}`}
                    >
                      {metric.additivity === "non_additive"
                        ? t("datasets.metricNonAdditive")
                        : t("datasets.metricAdditive")}
                    </span>
                  </td>
                  <td>{metric.datatype ?? t("datasets.dash")}</td>
                  <td>{metric.base_dataset_name ?? t("datasets.dash")}</td>
                  <td>
                    <code>{metricExpressionSql(metric)}</code>
                    {(metric.depends_on ?? []).length > 0 ? (
                      <p className="metric-depends-on">
                        {t("datasets.metricDependsOn")}:{" "}
                        {(metric.depends_on ?? [])
                          .map((d) => d.name)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ListPage>
  );
}
