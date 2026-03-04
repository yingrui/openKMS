/** Article metadata for listing */
export interface ArticleItem {
  id: string;
  title: string;
  slug: string;
  author: string;
  status: string;
  updated: string;
  fields: Record<string, string>;
}

/** Article with full content for detail view */
export interface ArticleDetail extends ArticleItem {
  content: string;
}

const articleContent: Record<string, string> = {
  '1': `# Life vs Term: Key Product Differences

When recommending life insurance, understanding the core differences between whole life and term products is essential.

## Whole Life Insurance

- **Permanent coverage** – lasts for the policyholder's lifetime
- **Cash value accumulation** – builds savings over time
- **Premium** – typically higher, fixed for life
- **Use case** – estate planning, long-term protection

## Term Life Insurance

- **Temporary coverage** – 10, 20, or 30 year terms
- **No cash value** – pure death benefit
- **Premium** – lower initially, may increase at renewal
- **Use case** – income replacement, mortgage protection

| Feature | Whole Life | Term Life |
|---------|------------|-----------|
| Duration | Lifetime | 10–30 years |
| Premium | Fixed | Level then increases |
| Cash value | Yes | No |
| Cost (initial) | Higher | Lower |

*Discuss client goals to determine the best fit.*`,

  '2': `# Handling Premium Objections

Premium objections are common. Here's a structured approach.

## Reframe the Conversation

1. **Shift from cost to value** – "What would your family need if something happened?"
2. **Compare to monthly expenses** – Premium often costs less than a daily coffee
3. **Emphasize peace of mind** – Protection allows focus on living, not worrying

## Common Objections and Responses

| Objection | Response |
|-----------|----------|
| "Too expensive" | Compare cost per day; show what's at risk |
| "I'm young and healthy" | Best time to lock in low rates |
| "I have coverage at work" | Often insufficient; not portable |

*Practice these scripts in role-play sessions.*`,

  '3': `# Risk Scoring Criteria

Our underwriting risk scoring uses the following factors.

## Primary Factors

1. **Age** – Critical determinant of mortality risk. The mortality rate $q_x$ at age $x$ follows actuarial tables.
2. **Medical history** – Pre-existing conditions, family history
3. **Lifestyle** – Smoking, occupation, hobbies

## Score Formula

The composite risk score is computed as:

$$
\\text{Risk Score} = \\sum_{i=1}^{n} w_i \\cdot f_i
$$

Where $w_i$ is the weight for factor $i$ and $f_i$ is the normalized factor value (0–100).

## Scoring Tiers

| Tier | Score | Action |
|------|-------|--------|
| Preferred | 85–100 | Best rates |
| Standard | 70–84 | Normal rates |
| Substandard | 50–69 | Rating or decline |
| Decline | &lt;50 | Refer to reinsurance |

*All scores are documented in the UW system.*`,

  '4': `# Approval Authority Matrix

Defines who can approve applications at each coverage level.

## Authority Limits by Role

| Role | Limit (Sum Assured) | Conditions |
|------|---------------------|------------|
| UW Associate | Up to $500K | Standard cases only |
| Senior UW | Up to $1.5M | May include substandard |
| UW Manager | Up to $3M | Full authority |
| Chief UW | No limit | All cases |

## Escalation Triggers

- Age &gt; 55 with high sum assured
- Any substandard rating
- Non-standard occupations

*Updated annually; check intranet for latest version.*`,

  '5': `# Claims Intake Checklist

Use this checklist for every new claims notification.

## Required Information

- [ ] Policy number and certificate
- [ ] Claimant details (name, contact)
- [ ] Date and cause of event
- [ ] Medical certificates (if applicable)
- [ ] Supporting documentation

## Initial Triage

| Claim Type | SLA | Next Step |
|------------|-----|-----------|
| Death | 24h | Assign to specialist |
| TPD | 48h | Request medical review |
| Critical Illness | 72h | Verify diagnosis |

*Log all intake in Claims Portal.*`,

  '6': `# Renewal Notice Timeline

Standard timeline for policy renewal communications.

## Key Milestones

| Days Before Expiry | Action |
|--------------------|--------|
| 90 | First renewal notice sent |
| 60 | Reminder if no response |
| 45 | Second reminder |
| 30 | Final notice |
| 14 | Grace period begins |

## Exceptions

- Group policies: 120 days notice
- Lapsed reinstatement: different rules apply

*All notices logged in CRM.*`,
};

const mockArticlesByChannel: Record<string, ArticleItem[]> = {
  ac1a: [
    { id: '1', title: 'Life vs Term: Key Product Differences', slug: 'life-vs-term', author: 'Sales Lead', status: 'Published', updated: '2 hours ago', fields: { category: 'Sales', tags: 'product, life' } },
  ],
  ac1b: [
    { id: '2', title: 'Handling Premium Objections', slug: 'premium-objections', author: 'Sales Lead', status: 'Published', updated: '1 day ago', fields: { category: 'Sales', tags: 'objection, pricing' } },
  ],
  ac2a: [
    { id: '3', title: 'Risk Scoring Criteria', slug: 'risk-scoring', author: 'UW Manager', status: 'Published', updated: '3 days ago', fields: { category: 'Underwriting', tags: 'risk' } },
  ],
  ac2b: [
    { id: '4', title: 'Approval Authority Matrix', slug: 'approval-matrix', author: 'UW Manager', status: 'Published', updated: '1 week ago', fields: { category: 'Underwriting', tags: 'approval' } },
  ],
  ac3a: [
    { id: '5', title: 'Claims Intake Checklist', slug: 'claims-intake', author: 'Ops Lead', status: 'Published', updated: '5 days ago', fields: { category: 'Operation', tags: 'claims' } },
  ],
  ac3b: [
    { id: '6', title: 'Renewal Notice Timeline', slug: 'renewal-timeline', author: 'Ops Lead', status: 'Published', updated: '2 days ago', fields: { category: 'Operation', tags: 'renewal' } },
  ],
  root: [],
  ac1: [],
  ac2: [],
  ac3: [],
};

const articleById = new Map<string, ArticleItem>();
for (const articles of Object.values(mockArticlesByChannel)) {
  for (const a of articles) {
    articleById.set(a.id, a);
  }
}

export function getArticleById(id: string): ArticleItem | undefined {
  return articleById.get(id);
}

export function getArticleDetail(id: string): ArticleDetail | undefined {
  const article = articleById.get(id);
  if (!article) return undefined;
  const content = articleContent[id] ?? '';
  return { ...article, content };
}

export { mockArticlesByChannel };
