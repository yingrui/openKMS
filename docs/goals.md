# openKMS goals and business problems

> **Elevator pitch**
>
> AI can already write code, build interfaces, and handle data. But software that runs is not a decision that holds up—**AI is just as confident when it is wrong.**
>
> openKMS makes AI-built decision systems trustworthy and able to hold up. It puts enterprise knowledge, data, and ontology first, then directs AI to turn rules into a working system in days; every conclusion is computed from explicit rules and sourced data, not guessed; the business changes the rules, IT runs the platform, and changing one part does not require rebuilding the rest.
>
> **Others sell faster development. We sell decisions that hold up.**

## 1. Goal and value positioning

**openKMS helps enterprises quickly build decision systems that hold up and can change.**

AI can already write software. The hard part is no longer "can we build it," but "does the decision it produces hold up."

Enterprises end up asking three questions:

- Can it be built fast?
- Can it be trusted?
- Can it change?

That is our position: not a faster app generator, but making AI-built decision systems trustworthy and able to hold up.

### Background

AI has collapsed the cost of writing software. The real shift is not putting more processes into systems, but letting software make decisions.

Decision systems are not new. Customs classification, insurance underwriting, quality release, compliance review have always existed; they were simply too expensive and too slow, so only a few critical processes could afford them.
{: #goals-decision-systems}

Lower cost means more decisions can become systems. It also exposes the real bottleneck: **a system can be generated; a decision still may not hold up.**

### Our judgment

**Cheaper code does not make decisions more dependable.**

Being dependable is not about a smarter model. It is about a system with provenance, rules, and records: where the data came from, which version of the rule, how the conclusion was computed. None of these appear just because the model gets stronger; they have to be designed in.

So the direction is not "use AI to write systems faster," but "make the system dependable by design."

## 2. Users and what they care about

### Two roles matter most

**The business expert**: the rules live in their head, and every change needs a ticket. The system has to let them change the rules and confirm exceptions without waiting for IT.
{: #goals-user-value}

**The IT team**: every requirement means development, integration, and release, plus keeping data, permissions, security, and uptime in order. The system has to let IT run the platform, not write every rule for the business.
{: #goals-organization}

In one line: **the business changes the rules; IT runs the platform.**

But not only these two. The frontline use it to decide, compliance uses it to review, managers use it to see risk, and agents use it to execute. The two are the maintainers; the rest are the users.
{: #goals-agent-service}

### What each one cares about

| Role | Cares most about | Fears most |
|---|---|---|
| Business expert | Changing rules, explaining exceptions | Waiting on IT for every change |
| IT team | A stable platform, clean integration, control | Writing code for every requirement |

## 3. What we will do

Three answers, then a direction.

### Can it be built fast?

**Fast starts with putting knowledge, data, and ontology first.**

Enterprises do not lack knowledge: policies, tariff schedules, product specs, past rulings, and the judgement in an expert's head. They do not lack data. The business objects and relations already exist. What they lack is treating these as first-class: they are scattered, in different formats, and unstructured.

- Information is scattered: the policy is in email, the tariff in a file share, the product spec in a deck.
  {: #goals-unified-source}
- Documents are hard to read: scans, tables, and slides mixed together; machines cannot read the layout.
  {: #goals-documents}
- There is no front door: people browse by luck; agents need a clear structure.
  {: #goals-library}
- Experience stays in people's heads: judgement, exceptions, and combined conditions were never written down.
  {: #goals-tacit}

**A weak foundation makes AI guess.** A system built on guesses does not hold up.

So we do three things first: turn knowledge into a searchable, citable basis; turn data into sourced, traceable facts; turn the ontology into clear objects and relations. With those three in place, we direct AI to build the decision system—rules written in plain language, compiled into code, tests, and a release.

**What does fast look like? Knowledge, data, and ontology in place; AI assembles the first working system in days; a change does not require a rebuild.**

**Fast does not mean a template. It means laying the foundation first, then letting AI build on it.**

### Can it be trusted?

**The most dangerous thing about AI is not that it gets it wrong. It is that it gets it wrong with the same confidence as when it gets it right.**

Ask it why, and it cannot tell you. It was not computing. It was guessing.

A decision system you can use cannot run on guesses:

- Not "the model thinks," but "the data says."
  {: #goals-decision}
- Not "it was right this time," but "it is the same every time."
  {: #goals-dependable}
- Not "it can answer anything," but "it says it cannot decide."

Pass these three, and the conclusion is safe to use. Accountability does not rest on one person; it rests on the rule and the record: who defined the rule, where the data came from, how the conclusion was computed.

**What does trustworthy look like? The conclusion traces to a source, and it can be recomputed.**

### Can it change?

**A system is not a one-off. When the business changes, the architecture has to keep up.**

Many systems cannot change, not because the code is hard to edit, but because three things are tangled together: knowledge, data, and the ontology. Change a rule and you touch the data; change a data source and you rewrite the logic; change the business model and the whole application is rebuilt.

We keep them apart: knowledge answers "what is the basis," data answers "what is the fact," and the ontology answers "what exists in the business, and how it connects." Each has its own abstraction and a clear interface, so each can be replaced and evolve on its own; modules combine through abstractions, not hard-coded links.

Change one without rebuilding the whole. When a rule changes, you also know which decisions used the old version and what needs review.
{: #goals-lifecycle}

**Easy to change is not "the code is easy to edit." It is "the architecture lets each part change on its own."**

**What does changeable look like? Change one part without rebuilding the set.**

### Direction

What we do: **make AI-built decision systems trustworthy and able to hold up.**

Not an app generator—it solves "can we build it"; we solve "does the decision hold up."
Not a document store—it solves "keep it"; we solve "can it be used."
Not a chat window—it solves "answer once"; we solve "make the decision."

What we build serves two roles first: **the business expert and IT.** The business changes the rules; IT runs the platform; they decide whether the system can be built, changed, and kept alive.

But not only these two. The frontline use it to decide, compliance uses it to review, managers use it to see risk, and agents use it to execute. The two are the maintainers; the rest are the users.

What we build works like this: **AI builds, rules compute.** AI turns knowledge into a system; at runtime, the conclusion is computed from explicit rules and sourced data. Knowledge, data, and ontology stay separate: each can be replaced on its own, and modules combine through abstractions, not hard-coding.

One decision domain at a time. Take it all the way, then repeat. No complete ontology, no enterprise twin.

**What we do not do:** app generators, document stores, chat windows, BI, backtesting/execution/risk engines, the template business, complete ontology or digital twin.

### Trade-offs

This product has three standards:

1. Which of fast, trustworthy, or changeable does it make stronger?
2. Does it let the business expert stop waiting for IT, or let IT write less code?
3. Does it make the conclusion more traceable and computable, or let one part change on its own?

Anything outside these three standards does not get built, however appealing it looks.

### How it lands: decision-oriented development {#goals-method}

Not with a feature. With a way of working. We call it **decision-oriented development**: start from knowledge, build with AI, deliver decisions that can be defended.

Seven steps:

| Step | What happens | Who |
|---|---|---|
| 1. Collect | documents, data, market knowledge, research methods | consultant + agent |
| 2. Model | objects, relations, time | agent + expert |
| 3. Define | the expert writes the logic in plain language; AI compiles it into code or an algorithm | expert + agent |
| 4. Assemble | case view, evidence, decision entry | agent + engineer |
| 5. Replay | run historical cases and compare with human outcomes | agent + expert |
| 6. Operate | make the decision; the system records the basis | business user |
| 7. Change | when the logic changes, see who is affected and review | IT + expert |

Four principles:

- The decision is the unit, not the document.
- Knowledge is the material, not an attachment.
- Every conclusion is sourced, computable, and bounded.
- AI builds, experts decide, people are accountable; change one thing and you see the impact.

Who does what:

| Role | Owns | Not |
|---|---|---|
| Consultant / implementer | Build the first version, hand over | Long-term operations |
| Business expert | Logic, exceptions, validity | Code, platform |
| IT team | Platform, data, permissions, security, operations | Business rules |
| Frontline | Make decisions | Maintain the system |

Compared with other approaches:

| Approach | Centered on | Who implements |
|---|---|---|
| DDD | domain model | developers |
| DMN | decision tables | business + developers |
| Data-driven / ML | data and models | data scientists |
| Palantir | ontology + apps | forward-deployed engineers |
| Low-code | forms and flows | business configuration |
| **Us** | **the decision** | **AI builds, experts decide, people are accountable** |

The method is still taking shape: process, principles, enforcement, measurement, and a reference case are still being worked out.

### Two steps remain

We still have two steps to take.

First, **every change can say why**: the reason, the evidence, the version, and who made it.

Second, **objects can show they are dependable**: a version, an owner, a validity window, and what depends on them.

The chain is also not fully closed: knowledge → rule → decision → operation → review → rule change. We have every part, but the loop is not closed.

## In one line

AI made *deciding* cheap, but making a decision *right* is still expensive. **Others sell faster development. We sell decisions that hold up.**
{: #goals-pain-map}

The stable version of these principles: [Product principles](agents.md#product-principles).
