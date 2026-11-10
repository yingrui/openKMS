# Decision-oriented development

**A method for building decision systems from enterprise knowledge.**

Status: working note. Companion to [Goals](../goals.md) (the declaration) and the
[TRIZ analysis](triz-openkms.md) (the audit). This is not a shipped spec.

## The claim

Most software methods start from one of: the domain model (DDD), the data (data-driven), the
form (low-code), the ontology (Palantir), or the rule table (DMN). Decision-oriented development
starts from **the decision**: a case goes in, a conclusion comes out, and the conclusion has to be
defensible.

The unit is not the service, the table, or the page. It is the decision.

## Why the existing methods do not fit

| Method | Starts from | What it optimizes | What it misses for decisions |
|---|---|---|---|
| DDD | domain model | service boundaries and language | no decision record, validity, or accountability |
| DMN | decision table | rule evaluation | rules only; no knowledge, data, or AI-built logic |
| Data-driven / ML | data and models | prediction accuracy | no basis, no authority, no change impact |
| Palantir | ontology + apps | operational integration | needs forward-deployed engineers; heavy |
| Low-code | forms and flows | business configuration | no grounding in knowledge; no accountability |

Decision-oriented development borrows from all of them, but anchors on the decision.

## The method

Seven steps, four principles, four roles, four gates.

### Steps

| Step | What happens | Output |
|---|---|---|
| 1. Collect | gather documents, data, market knowledge, research methods | a searchable knowledge base |
| 2. Model | define objects, relations, time | a decision-scoped model |
| 3. Define | the expert writes the logic in plain language; AI compiles it into code or an algorithm; tests run against historical cases | spec + implementation, paired |
| 4. Assemble | case view, evidence, decision entry | a decision surface |
| 5. Replay | run historical cases and compare with human outcomes | an evaluation set and agreement rate |
| 6. Operate | make decisions; the system records basis, version, actor | decision records |
| 7. Change | version the logic, compute impact, review | version graph + review queue |

### Principles

1. The decision is the unit, not the document.
2. Knowledge is the material, not an attachment.
3. Every conclusion has a basis, a validity, and an owner.
4. AI builds, experts decide, people are accountable; change one thing and you see the impact.

### Roles

| Role | Owns | Not |
|---|---|---|
| Consultant / engineer | collect, model, assemble | the final call |
| Business expert | logic, exceptions, validity | how much is written |
| Business user | make decisions | maintain the system |
| Organization | permissions, impact, audit, review | day-to-day writing |

### Gates

The method only holds if the gates are enforced:

- A logic change cannot go live without a version and an owner.
- A decision cannot be recorded without a basis.
- A change cannot ship without an impact list.
- A superseded logic cannot keep deciding.

## Walkthrough 1: customs classification

**The decision:** which HS code applies, what duty rate follows, which documents are required.

| Step | What happens | Where it breaks today |
|---|---|---|
| Collect | tariff schedule, classification rules, prior rulings, product specs | scattered across PDFs, web pages, and spreadsheets |
| Model | product, shipment, tariff line, ruling | the tariff is a document, not an object with a validity window |
| Define | General Rules of Interpretation and exceptions, written by a customs expert | logic lives in a person's head or a spreadsheet macro |
| Assemble | case view with product data, applicable rules, tariff version | the broker opens four systems and a PDF |
| Replay | past declarations vs official rulings | no replay set; errors are found by audit |
| Operate | submit the declaration; record basis | the declaration records the code, not the reasoning |
| Change | tariff update → affected products and open cases | nobody knows which open cases depend on the old rate |

**What the method needs here:** point-in-time tariff versions, a product-to-tariff model, a decision
record with the rule and the tariff version, and an impact query for tariff changes.

## Walkthrough 2: quant trading

**The decision:** buy, sell, or hold; how much; which universe; under what constraints.

| Step | What happens | Where it breaks today |
|---|---|---|
| Collect | market rules, factor theory, papers, failed experiments, point-in-time data | knowledge sits in PDFs and notebooks; data is current-state only |
| Model | instrument, portfolio, order, time series | instrument identity changes with symbol changes and mergers |
| Define | factor definitions, signal thresholds, risk limits | research code and production code drift |
| Assemble | signal board, evidence (factor values, backtest), order ticket | the screen shows the signal, not the basis |
| Replay | backtest, out-of-sample, walk-forward | look-ahead and survivorship bias are easy to introduce |
| Operate | execution, monitoring, attribution | a loss cannot be traced to the signal that caused it |
| Change | factor decay, regime change → re-fit and review | nobody knows which live models use the old factor |

**What the method needs here:** point-in-time data, paired spec + code, a replay harness, decision
records with the factor version, and an impact list when a factor changes.

## What the platform must provide

The method is only real if the platform enforces it:

| Capability | Why the method needs it |
|---|---|
| change context (reason, evidence, version, actor) | a decision cannot cite what it does not record |
| object versions + validity | a superseded logic must stop deciding |
| dependency / impact | a change must produce a review list, not a guess |
| owner / sign-off | accountability cannot be inferred from "who edited" |
| point-in-time data | time-sensitive domains cannot answer "what did we know then" |
| an evaluation harness | AI-generated logic must be tested, not trusted |

## What is unproven

- **Agent-built logic may be shallow.** AI can produce plausible logic that fails on exceptions.
- **Human validation may become rubber-stamping.** A click is not a judgement.
- **Templates may not generalize.** The first project is always bespoke; reuse is a hypothesis.
- **Point-in-time is missing today.** Without it, time-sensitive decisions cannot be defended.

## Related

- [Goals](../goals.md) — the three promises and the declaration of this method.
- [TRIZ analysis](triz-openkms.md) — which of these claims are supported by the current system.
- [Data layer](../features/data-layer.md) · [Ontology](../features/ontology.md) · [Chamber](../features/app-builder.md)
- [Development plan](../development_plan.md)
