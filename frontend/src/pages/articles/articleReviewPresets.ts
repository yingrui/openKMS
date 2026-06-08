import type { ReviewCriterionItem } from '../../data/channelUtils';

export type ReviewPresetId = 'builtin' | 'competitive_analysis';

export interface ReviewPreset {
  id: ReviewPresetId;
  criteria: ReviewCriterionItem[];
  prompt: string;
}

const BUILTIN_EN: ReviewPreset = {
  id: 'builtin',
  prompt: '',
  criteria: [
    { id: 'completeness', label: 'Completeness', description: 'Required topics and sections are present; no empty placeholders.' },
    { id: 'clarity', label: 'Clarity', description: 'Readable for the intended audience; terms are defined where needed.' },
    { id: 'structure', label: 'Structure', description: 'Logical headings, lists, and flow.' },
    { id: 'verifiability', label: 'Verifiability', description: 'Claims are supported by links, citations, or references.' },
    { id: 'consistency', label: 'Consistency', description: 'Terminology and formatting are consistent.' },
  ],
};

const COMPETITIVE_EN: ReviewPreset = {
  id: 'competitive_analysis',
  prompt: `You are an editorial reviewer for competitive analysis articles in an internal knowledge base.

Audience: product, strategy, and business teams. Articles support internal decisions—not external marketing.

Rules:
1. Judge only from the article body; flag gaps as "needs verification" instead of inventing market facts.
2. Claims about competitors (offerings, pricing, positioning, policies) need a source or an explicit "unverified" label.
3. Separate facts, internal interpretation, and speculation; mixed prose should score lower.
4. Expect coverage of: competitors, time range, offering comparison, pricing or commercial logic, go-to-market, target customers, strengths/weaknesses, implications for us.
5. Flag stale data when effective dates are missing.
6. Avoid unsubstantiated negative claims about competitors.

Scoring: 5 = meeting-ready; 3 = usable but needs data or verification; 1 = misleading or unusable.`,
  criteria: [
    { id: 'scope', label: 'Scope', description: 'Competitors, comparison axes, and time range are explicit.' },
    { id: 'coverage', label: 'Coverage', description: 'Offering, pricing, positioning, channels, customers, SWOT, and implications are addressed.' },
    { id: 'evidence', label: 'Evidence', description: 'Key claims have sources or "unverified" labels; facts vs inference are clear.' },
    { id: 'analysis', label: 'Analysis depth', description: 'Goes beyond lists—comparison framework and actionable conclusions.' },
    { id: 'currency', label: 'Currency', description: 'Dates on data and market context; stale content is flagged.' },
    { id: 'tone', label: 'Tone', description: 'Prudent wording; fit for internal decision-making.' },
  ],
};

const BUILTIN_ZH: ReviewPreset = {
  id: 'builtin',
  prompt: '',
  criteria: [
    { id: 'completeness', label: '完整性', description: '必要主题与章节齐全，无空白占位。' },
    { id: 'clarity', label: '清晰度', description: '目标读者可读，术语在需要处有定义。' },
    { id: 'structure', label: '结构', description: '标题、列表与逻辑层次清楚。' },
    { id: 'verifiability', label: '可验证性', description: '主张有来源、链接或引用支撑。' },
    { id: 'consistency', label: '一致性', description: '术语与格式前后一致。' },
  ],
};

const COMPETITIVE_ZH: ReviewPreset = {
  id: 'competitive_analysis',
  prompt: `你是竞品分析文章的编辑审阅者。审阅对象是内部知识库中的竞品分析（markdown）。

目标读者：产品、战略、业务同事；文章用于内部决策参考，不是对外宣传稿。

审阅原则：
1. 只根据正文判断，不臆测市场事实；信息不足时在建议中写明「需补充」或「待核实」。
2. 关于竞品的表述（产品、定价、定位、政策等）需有来源或标注「待核实」。
3. 区分「事实」「我方解读」「推测」；混写在一处要扣分。
4. 应覆盖：对比对象、时间范围、产品/方案对比、价格或商业逻辑、市场与渠道、目标客户、优势劣势、对我方启示。
5. 数据若有时效性，应明确日期；过时未标注要扣分。
6. 避免无法证实的贬损性竞品结论；审慎表述优先。

评分：5 = 可直接用于会议/决策；3 = 框架可用但需补数据；1 = 不可用或误导风险高。`,
  criteria: [
    { id: 'scope', label: '分析范围', description: '竞品对象、对比维度、时间范围是否写清。' },
    { id: 'coverage', label: '信息完整性', description: '产品/方案、定价、定位、渠道、客群、优劣势、启示等是否齐全。' },
    { id: 'evidence', label: '可验证性', description: '关键结论有来源或「待核实」；事实与推断是否区分。' },
    { id: 'analysis', label: '分析深度', description: '有对比框架与可行动结论，而非仅罗列信息。' },
    { id: 'currency', label: '时效性', description: '数据与市场背景有日期；过期内容有标注。' },
    { id: 'tone', label: '表述审慎', description: '适合内部决策，无无法证实的贬损。' },
  ],
};

export function getReviewPresets(locale: string): ReviewPreset[] {
  const zh = locale.startsWith('zh');
  return zh ? [BUILTIN_ZH, COMPETITIVE_ZH] : [BUILTIN_EN, COMPETITIVE_EN];
}

export function getBuiltinCriteria(locale: string): ReviewCriterionItem[] {
  return getReviewPresets(locale)[0].criteria;
}
