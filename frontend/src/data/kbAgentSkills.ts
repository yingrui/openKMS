/**
 * The qa-agent skills a knowledge base may enable.
 *
 * One list, because the ids and their label keys were copied into three files (the Agent tab, the old General tab, and
 * `knowledgeBasesApi`), so adding a skill meant remembering all three. What the agent can actually run still lives in
 * `qa-agent/qa_agent/skills/` — this is the UI's view of it, and `core` records the ones a KB gets when it enables nothing.
 */

export interface AgentSkillField {
  id: string;
  /** i18n key under `detail.` for the label. */
  labelKey: string;
  /** i18n key under `detail.` for the one-line explanation. */
  helpKey: string;
  core: boolean;
}

export const CORE_AGENT_SKILLS: readonly AgentSkillField[] = [
  { id: 'ontology', labelKey: 'agentSkillOntology', helpKey: 'agentSkillOntologyHelp', core: true },
  { id: 'catalog', labelKey: 'agentSkillCatalog', helpKey: 'agentSkillCatalogHelp', core: true },
  { id: 'page_index', labelKey: 'agentSkillPageIndex', helpKey: 'agentSkillPageIndexHelp', core: true },
];

export const OPTIONAL_AGENT_SKILLS: readonly AgentSkillField[] = [
  { id: 'workspace', labelKey: 'agentSkillWorkspace', helpKey: 'agentSkillWorkspaceHelp', core: false },
  {
    id: 'insurance_calculator',
    labelKey: 'agentSkillInsuranceCalculator',
    helpKey: 'agentSkillInsuranceCalculatorHelp',
    core: false,
  },
  { id: 'premium_estimator', labelKey: 'agentSkillPremiumEstimator', helpKey: 'agentSkillPremiumEstimatorHelp', core: false },
  {
    id: 'product_comparator',
    labelKey: 'agentSkillProductComparator',
    helpKey: 'agentSkillProductComparatorHelp',
    core: false,
  },
];
