/**
 * The metric graph, as a dialog: what is *defined* from what, and what is *asserted* about it.
 *
 * The two kinds are deliberately not mixed. A derived edge comes from an expression — checking it would
 * restate the definition and always pass, so it is shown as structure ("this is how the number is made").
 * An assertion edge comes from a rule — it can fail, it has a period, and it links to the rule that runs it.
 * Reading them as one list is what makes people write tautological checks.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Dialog, StatusChip } from '../../../styles/design-system';
import { fetchMetricGraph, type MetricGraph } from '../../../data/metricsApi';

export function MetricGraphDialog({
  open,
  onClose,
  semanticModelId,
}: {
  open: boolean;
  onClose: () => void;
  semanticModelId: string;
}) {
  const { t } = useTranslation('ontology');
  const [graph, setGraph] = useState<MetricGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchMetricGraph(semanticModelId)
      .then((next) => {
        if (!cancelled) setGraph(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    // A second open re-reads: the graph is a view, and the definition may have changed meanwhile.
    return () => {
      cancelled = true;
    };
  }, [open, semanticModelId]);

  const nodeName = (id: string) => graph?.nodes.find((node) => node.id === id)?.name ?? id;
  const derived = graph?.edges.filter((edge) => edge.kind === 'derived') ?? [];
  const assertions = graph?.edges.filter((edge) => edge.kind === 'assertion') ?? [];

  const weightLabel = (weight: number) => (weight === 1 ? '' : ` × ${weight}`);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('dataModel.graphTitle')}
      closeAriaLabel={t('shared.close')}
      size="lg"
    >
      {error ? <p className="rules-condition-warning">{error}</p> : null}
      {!graph && !error ? <p className="entity-view__readonly">{t('shared.loading')}</p> : null}
      {graph ? (
        <>
          <p className="settings-page-hint">
            {t('dataModel.graphSummary', {
              metrics: graph.nodes.length,
              derived: graph.derived_count,
              assertions: graph.assertion_count,
            })}
          </p>

          <h3 className="metric-graph__heading">{t('dataModel.graphAssertions')}</h3>
          <p className="settings-page-hint">{t('dataModel.graphAssertionsHint')}</p>
          {assertions.length === 0 ? (
            <p className="entity-view__readonly">{t('dataModel.graphNoAssertions')}</p>
          ) : (
            <ul className="metric-graph__list">
              {assertions.map((edge) => (
                <li key={`${edge.from}-${edge.to}-${edge.rule_id}`} className="metric-graph__row">
                  <code>
                    {nodeName(edge.from)} = {nodeName(edge.to)}
                    {weightLabel(edge.weight)}
                  </code>
                  <span className="metric-graph__note">
                    {edge.tolerance?.rel
                      ? `±${edge.tolerance.rel * 100}%`
                      : edge.tolerance?.abs
                        ? `±${edge.tolerance.abs}`
                        : ''}
                  </span>
                  {edge.health ? (
                    <StatusChip tone={edge.health === 'fail' ? 'warn' : 'ok'}>{edge.health}</StatusChip>
                  ) : null}
                  {edge.rule_object_id ? (
                    <Link to={`/data-rules/${edge.rule_object_id}`} className="console-table-link">
                      {t('dataModel.graphOpenRule')}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="metric-graph__heading">{t('dataModel.graphDerived')}</h3>
          <p className="settings-page-hint">{t('dataModel.graphDerivedHint')}</p>
          {derived.length === 0 ? (
            <p className="entity-view__readonly">{t('dataModel.graphNoDerived')}</p>
          ) : (
            <ul className="metric-graph__list">
              {derived.map((edge) => (
                <li key={`${edge.from}-${edge.to}`} className="metric-graph__row">
                  <code>
                    {nodeName(edge.from)} ← {nodeName(edge.to)}
                    {weightLabel(edge.weight)}
                  </code>
                  <span className="metric-graph__note">{t('dataModel.graphDefinition')}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="settings-page-hint">{t('dataModel.graphFooter')}</p>
        </>
      ) : null}
    </Dialog>
  );
}
