/** 告警事件: what this rule actually raised, with the evidence and the triage actions. */
import { BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router-dom';
import { EntityViewPanel } from '../../shared/EntityViewShell';
import { EmptyState } from '../../../styles/design-system';
import { RulesEventsTable } from './RulesEventsTable';
import type { RuleDetailCtx } from './ruleDetailContext';

export function RuleEventsTab() {
  const { t } = useTranslation('ontology');
  const { events, busyEventId, moveEvent } = useOutletContext<RuleDetailCtx>();

  return (
    <EntityViewPanel id="events" title={t('rules.navEvents')} description={t('rules.panelEventsHint')}>
      {events.length === 0 ? (
        <EmptyState icon={<BellRing size={32} aria-hidden />} title={t('rules.emptyEvents')} />
      ) : (
        <RulesEventsTable
          events={events}
          busyEventId={busyEventId}
          showPeriod
          onTransition={(event, status) => void moveEvent(event, status)}
        />
      )}
    </EntityViewPanel>
  );
}
