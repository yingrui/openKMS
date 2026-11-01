# openKMS goals and business problems

## 1. What we do

**openKMS helps enterprises build intelligent decision systems that hold up and can change.**

The direction is: business experts and AI lead the R&D; the enterprise's internal platform provides data and technical support; IT handles data access, permissions, security, and delivery.

AI has significantly reduced the cost of software development. The more important change is that software is no longer just a carrier of processes—it is beginning to participate in decisions. Intelligent decision systems are not new, but building one used to be expensive and slow, so only a few critical decisions were worth building.
{: #goals-decision-systems}

With the cost down, a new bottleneck appears: **an application can be generated; a decision may still not be dependable.**

Three questions to answer:

- **Can it be built fast?** Not only coding speed, but how ready the knowledge, data, and ontology are.
- **Can it be trusted?** Not model capability, but whether every conclusion has a source and can be recomputed.
- **Can it change?** Beyond DevOps / DataOps / MLOps, whether business experts can adjust rules themselves, and whether a local change triggers a full rebuild.

## 2. Who it is for

**Business experts and AI**: business rules are defined by the experts. Changes used to depend on IT scheduling; now experts and AI maintain the rules and exceptions together, so business changes reach the system faster.
{: #goals-user-value}

**IT team**: handles data access, permissions, and security, and supports delivery.
{: #goals-organization}

Frontline staff use the system to decide; agents use it to execute.
{: #goals-agent-service}

## 3. How we do it

### Fast to build

The prerequisite is that knowledge, data, and the ontology come first; then AI builds the system.

Enterprises do not lack knowledge, but that knowledge is not yet a first-class input: information is scattered, documents are hard for machines to read, there is no single entry point, and expert experience is not made explicit. With an incomplete foundation, AI can only infer; a system built on inference is hard to run reliably.

So the first step is three foundation tasks: knowledge that can be searched and cited; data with provenance that can be traced; an ontology that defines business objects and their relations. Once these are in place, AI builds the system.

Speed does not come from template reuse; it comes from foundation first: once the foundation is ready, AI can build efficiently.<a id="goals-unified-source"></a><a id="goals-documents"></a><a id="goals-library"></a><a id="goals-tacit"></a>

### Trustworthy

The risk of AI is not a lack of capability, but that it still gives highly confident answers when capability falls short.

So a conclusion cannot rest on model inference: it should be based on data, not model judgment; it should be reproducible, not occasionally correct; it should state its boundary, not answer every question.

Responsibility does not attach to an individual; it is carried by the rule and the record: who defined the rule, where the data came from, how the conclusion was computed.<a id="goals-decision"></a><a id="goals-dependable"></a>

### Easy to change

Changes to business rules and logic are owned by the business; changes to data, models, and code are handled by DataOps, MLOps, and DevOps respectively; the architecture should prevent these changes from blocking one another.

Many systems are hard to evolve because knowledge, data, and the ontology are coupled. Once they are decoupled with clear boundaries, a local change no longer triggers a full rebuild; when a rule changes, the affected decisions and the scope that needs review can be identified.<a id="goals-lifecycle"></a>

### Decision-oriented development

One method: decision-oriented development—start from knowledge, build with AI, deliver decisions that can be defended. The seven steps and four principles are in [Decision-oriented development](research/decision-oriented-development.md).
{: #goals-method}

## 4. How we are different

The difference is not "what kind of application we build," but "how we implement it."

Most approaches are custom development: write an application for one scenario, with knowledge, data, and rules embedded in code. The project ships, but knowledge is not accumulated, data is not reused, and the next project starts from scratch.

We do not build a custom application. We build around the coordination of knowledge, data, and application:

- Knowledge becomes a searchable, citable basis;
- Data becomes sourced, traceable fact;
- The application is built on top; when a rule changes, only the corresponding part changes.

Low-code, document stores, chat, BI, and Palantir each solve a segment; we solve how the three work together.

So the difference is in the implementation method: others deliver a custom application; we deliver a foundation where knowledge, data, and application work together.

Backtesting, execution, risk engines, complete ontology, and digital twins are out of scope.<a id="goals-pain-map"></a>

## 5. What we stand for

- **The decision is the unit, not the document.**
- **Knowledge is the material, not an attachment.**
- **Every conclusion should be traceable, recomputable, and clear about its boundary.**
- **AI builds; people decide and are accountable; a local change should allow its impact to be assessed.**
- **Focus on one decision domain at a time; go deep, then repeat.**

The product is judged by three standards: does it make one of the three stronger—fast to build, trustworthy, or easy to change? Does it reduce the business expert's dependence on IT scheduling, or reduce repeated development for IT? Does it improve the traceability and recomputability of conclusions, or reduce coupling in local changes?

Features outside these standards are not included.

Two things remain: every change can explain why; objects can express a dependable state.

The stable version of these principles: [Product principles](agents.md#product-principles).
