# openKMS goals and business problems

**openKMS helps enterprises quickly build intelligent decision systems that are trustworthy and built to evolve.**

- **Fast to build**: AI turns business logic into a working system—people set the logic and make the call; AI implements and tests.
- **Trustworthy**: every conclusion stands on the enterprise's own knowledge and data—what it rests on, where it comes from, which version, whether it is current, who set it, and who can change it are all answerable.
- **Easy to change**: business can change the logic, engineering can iterate the system—change one criterion and you know which decisions used the old version and what needs review.

We do not sell a fixed piece of software. We provide what it takes to build these systems: material, rules, actions, and the mechanism that makes a decision reliable.

## What a decision system is {#goals-decision-systems}

A case comes in. Rules are applied, documents and data are read, and a conclusion comes out. Customs classification, insurance underwriting, quality release, compliance review—these are all decision systems.

It is not a document store, not a chat window, not a BI report. It has to answer three things: on what basis, is it still valid, and who is accountable.

## Why it does not work today {#goals-user-value}

**For people**: can't find it, can't trust it, no time to write, stale without notice, answers stay private.

**For the organization** {#goals-organization}:

- **Information is scattered** {#goals-unified-source}: email, file shares, legacy systems, and tickets each hold a copy.
- **Documents are hard to read** {#goals-documents}: PDFs, scans, decks, and tables are mixed together; machines can't read the layout.
- **There is no front door** {#goals-library}: people browse by luck; agents need a clear structure.
- **Experience stays in people's heads** {#goals-tacit}: judgement, exceptions, and combined conditions live with the expert.
- **Rules expire unnoticed** {#goals-lifecycle}: when a policy, regulation, or contract changes, everything that depends on it goes stale.
- **From "found it" to "can decide"** {#goals-decision}: finding a paragraph is not enough; you need to know how it relates to the object, the data, and the rule.
- **For agents** {#goals-agent-service}: an agent does not need a chat window; it needs something it can query, compute with, act on, and rely on.

**One thing, two sides** {#goals-pain-map}: what users feel ("can't find it, can't trust it, nobody owns it") is what the organization sees ("scattered, hard to read, expired").

## Fast to build: what it takes

**The material is already there.** Documents, data, business objects and their relations exist; AI does not start from zero.

**Reuse.** The first project becomes a template; the second starts from it. Do it once, and the next one is faster.

What this needs is a working build loop: **logic (plain language) → code or algorithm → test → publish**, and a place to assemble the parts.

## Trustworthy: what makes it hold {#goals-dependable}

A decision is trustworthy when it can answer four questions:

| Question | What it must show |
|---|---|
| What is the basis? | rule, evidence, source, version |
| Is it still current? | whether the rule expired, whether the data is fresh |
| Who has the authority? | owner, delegated scope |
| Can it be reviewed or reversed? | decision record, rollback |

These four do not have to be four fields. They can live on the business object, in a separate decision record, or in the change log—whatever the work needs.

## Easy to change: what it takes

**Versions and impact.** Business logic is not carved in stone; it changes. When it does, the system has to know:

- which version of the logic is current;
- which decisions used the old one;
- what depends on it and needs review.

It is not "the code is easy to edit." It is "after the change, you know who it affects." That takes three things: version history, dependencies between objects, and a review queue.

## We are working out a method {#goals-method}

Building these systems is not "install a product." There is a way of doing it. We call it **decision-oriented development**: start from knowledge, build with AI, deliver decisions that can be defended.

Seven steps:

| Step | What happens | Who |
|---|---|---|
| 1. Collect | documents, data, market knowledge, research methods | consultant + agent |
| 2. Model | objects, relations, time | agent + expert |
| 3. Define | the expert writes the logic in plain language; AI compiles it into code or an algorithm | expert + agent |
| 4. Assemble | case view, evidence, decision entry | agent + engineer |
| 5. Replay | run historical cases and compare with human outcomes | agent + expert |
| 6. Operate | make the decision; the system records the basis | business user |
| 7. Change | when the logic changes, see who is affected and review | organization + expert |

Four principles:

- The decision is the unit, not the document.
- Knowledge is the material, not an attachment.
- Every conclusion has a basis, a validity, and an owner.
- AI builds, experts decide, people are accountable; change one thing and you see the impact.

Who does what:

| Role | Owns | Not |
|---|---|---|
| Consultant / engineer | Collect, model, assemble | The final call |
| Business expert | Logic, exceptions, validity | How much is written |
| Business user | Make decisions | Maintain the system |
| Organization | Permissions, impact, audit, review | Day-to-day writing |

Compared with other approaches:

| Approach | Centered on | Who implements |
|---|---|---|
| DDD | domain model | developers |
| DMN | decision tables | business + developers |
| Data-driven / ML | data and models | data scientists |
| Palantir | ontology + apps | forward-deployed engineers |
| Low-code | forms and flows | business configuration |
| **Us** | **the decision** | **AI builds, experts decide, people are accountable** |

The method is still taking shape: process, principles, enforcement, measurement, and a reference case all need work.

## What is missing today

Not a new object. Two things:

1. **Every change can say why**: the reason, the evidence, the version, and who made it.
2. **Objects can show they are reliable**: a version, an owner, a validity window, and what depends on them.

And one chain is not connected: knowledge → rule → decision → operation → review → rule change. We have a part of every step, but not the chain.

## What we are not

- **Not a document store**: storing files is not the point.
- **Not a chat window**: an answer that ends the conversation is not a decision system.
- **Not BI**: charts alone do not make a decision, and nobody is accountable for a chart.
- **Not a digital twin**: we do not model the whole enterprise, only the slice a decision needs.
