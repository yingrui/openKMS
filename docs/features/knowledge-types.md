# Knowledge types

Shared vocabulary for **what counts as knowledge** in openKMS: user-visible artifacts, machine indexes, and organizational layers. Individual feature pages remain the source of truth for behavior; this page only **classifies** them.

## Primary artifacts

Main **units** of content users create, import, or curate. Each maps to tables/APIs described on its feature page. **Wiki** is one concept: path-addressed markdown, images, binaries, and other files all live under a wiki space (the product may still use separate APIs or tables for “page” vs “file” paths internally).

| Type | Role | Feature page |
|------|------|----------------|
| **Document** | Channel-backed file: parsed markdown (often via PaddleOCR-VL + VLM), metadata, lifecycle, explicit versions. | [Documents](documents.md) |
| **Article** | Markdown-first publication in an article channel; versions; images/attachments in storage. | [Articles](articles.md) |
| **Wiki** | All content under a **wiki space**: `.md` pages (path-addressed, often mirrored to vault), plus uploads and vault assets (images, attachments, other files). One surface for authoring and browsing; storage layout varies by path and type. | [Wiki spaces](wiki-spaces.md) |
| **KB FAQ** | Question–answer pair in a knowledge base; optional vector embedding. | [Knowledge bases](knowledge-bases.md) |
| **KB chunk** | Text segment from a linked document or **wiki** body/path; embedding for RAG. | [Knowledge bases](knowledge-bases.md) |
| **Glossary term** | Term record (e.g. bilingual definitions, import/export). | [Glossaries](glossaries.md) |
| **Ontology object instance** | Typed row in an object type (master or transactional data). | [Ontology](ontology.md) |
| **Ontology link instance** | Typed relationship between two objects (or via a junction dataset). | [Ontology](ontology.md) |
| **Dataset** (ontology) | Tabular source backing object types / many-to-many link patterns. | [Ontology](ontology.md), [Data models](data-models.md) |
| **Evaluation item** | Labeled query + expected answer (and metadata) for a KB evaluation run. | [Evaluation](evaluation.md) |

## Organizational layers (not duplicates of body text)

| Type | Role | Feature page |
|------|------|----------------|
| **Knowledge Map node** | Hierarchical term; **resource links** point at document channels, article channels, or wiki spaces. | [Knowledge map & home](knowledge-map.md) |
| **Document / article relationship** | Directed edge between artifacts (`supersedes`, `amends`, `see_also`, …). | [Documents](documents.md), [Articles](articles.md) |

## Indexes and derived representations

Machine-oriented **views** of knowledge used for search, RAG, and quality—not separate “authoring” types:

| Representation | Used for |
|----------------|----------|
| **Embeddings** (chunks, FAQs, wiki when indexed) | Semantic search, hybrid retrieval, KB Q&A. |
| **Parse layout / block assets** | Auditing OCR/VLM output; not a second logical document. |
| **Graph / index structures** | Wiki link graph cache, ontology storage, Knowledge Map HTML artifact. |

## Cross-cutting dimensions

Use these to **describe** artifacts; they are not parallel top-level “types” in the product model:

| Dimension | Examples |
|-----------|----------|
| **Source modality** | Text-native (article, wiki) vs layout-parsed (document after VLM pipeline). |
| **Provenance** | `document_id`, `wiki_page_id` / wiki paths (see wiki APIs for file-backed paths), `origin_article_id`, agent tool citations. |
| **Lifecycle** | Document `effective_*`, article lifecycle; `include_historical_documents` on KB search. |
| **Access** | Permissions, group scopes, feature toggles, data resources. |

## Entomology (insect research): workflow map {#entomology-workflow-map}

Below is a **practical map** for a lab or individual researcher: what they do, what *kind* of knowledge that is, which [Functionalities](../functionalities.md) already carry it, and what would strengthen support later. It is **not** a commitment roadmap—only a structured gap list derived from the current product.

| Research workflow | Conceptual knowledge (what they need to record or query) | openKMS artifacts / types to use **today** | Primary functionalities | Gaps / plausible **future** work |
|-------------------|----------------------------------------------------------|---------------------------------------------|----------------------------|----------------------------------|
| Read and cite papers (PDFs, scans, OCR) | Parsed text + figures + stable citations | **Document** → **KB chunk**; optional **Article** for digests | [Documents](documents.md), [Knowledge bases](knowledge-bases.md), [Pipelines, jobs & models](pipelines-and-jobs.md) | Bibliographic graph (DOI, cited-by); specimen–literature links as first-class edges |
| Write methods, SOPs, field protocols | Narrative + checklists | **Wiki** pages; **Article** for citable “methods paper” | [Wiki spaces](wiki-spaces.md), [Articles](articles.md) | Form-style SOP templates; versioned protocol objects beyond generic article lifecycle |
| Species / taxon pages (morphology, ecology notes) | Long-form structured prose + images | **Wiki** or **Article**; images as wiki assets or article attachments | [Wiki spaces](wiki-spaces.md), [Articles](articles.md) | Optional **taxon profile** template (fields for diagnosis, host plant, distribution summary) |
| Checklists, survey tables, simple matrices | Tabular + narrative | **Wiki** tables; **Ontology** dataset-backed types for repeatable rows | [Wiki spaces](wiki-spaces.md), [Ontology](ontology.md) | CSV/TSV bulk import into ontology tables; simple “spreadsheet view” UX |
| Specimen / voucher catalog | Accessioned physical object + metadata | **Ontology object instances** (e.g. `Specimen`) + **Document** for labels/scans | [Ontology](ontology.md), [Documents](documents.md), [Console & authentication](console-and-auth.md) (scopes) | Native **Specimen** model (accession, disposition, loans); barcode/QR workflows |
| Field / trap event (who, when, where, protocol) | Sampling **event** linked to specimens/taxa | **Ontology** objects + **links**; geo/time as properties | [Ontology](ontology.md) | **Darwin Core**-aligned event & occurrence import/export; map picker for GPS |
| Taxonomic names & glossary | Terms + translations + usage | **Glossary term**; **Ontology** for synonym structure | [Glossaries](glossaries.md), [Ontology](ontology.md) | Sync to external nomenclature (Catalogue of Life, GBIF backbone); not a public vocabulary server today |
| Trait measurements (continuous, units, repeated) | Trait × individual × study | **Ontology** properties + optional **dataset** for bulk rows | [Ontology](ontology.md) | Trait matrix editor; unit validation; time-series / repeated-measures layout |
| Images (habitus, slides, labels) | Visual evidence linked to taxon/specimen | **Document** (image upload + parse path where applicable); **Wiki** embeds | [Documents](documents.md), [Wiki spaces](wiki-spaces.md) | Typed **media evidence** links (specimen ↔ image) beyond generic metadata |
| Audio (e.g. orthopteran calls) | Acoustic evidence + optional transcript | **Wiki** / **Article** attachments; text in **Wiki** | [Wiki spaces](wiki-spaces.md), [Articles](articles.md) | Transcription pipeline; acoustic feature index; player with time-range notes |
| Video (behavior, flight) | Rich media evidence | Attachments + prose description | [Wiki spaces](wiki-spaces.md), [Articles](articles.md) | Transcript + keyframe indexing for search; same “file vs parsed knowledge” gap as [CAD section](#cad-bim-gis-and-other-professional-binaries) |
| Identification keys | Branching decision content | **Wiki** / **Article** (static markdown) | [Wiki spaces](wiki-spaces.md), [Articles](articles.md) | Interactive multi-entry key UI; scoring / evidence hooks |
| RAG over lab + literature corpus | Embeddings over curated text | **KB chunk**, **KB FAQ** | [Knowledge bases](knowledge-bases.md), [Pipelines, jobs & models](pipelines-and-jobs.md) | Domain-tuned eval sets ([Evaluation](evaluation.md)); better provenance for hybrid retrieval (ongoing) |
| Lab / project navigation | “Where is everything?” | **Knowledge Map** nodes → link to doc channels, wiki, article channels | [Knowledge map & home](knowledge-map.md) | Map nodes that deep-link into **ontology** subsets (e.g. “this project’s specimens”) |
| Cross-resource discovery | One search box | Metadata in documents; names in global search | [Global search](global-search.md) | Search ontology instances and trait values; geo search |
| Automation & scripting | Push/pull content | REST + CLI / skills | [OpenCode skill (openkms)](opencode-openkms-skill.md), [API reference](api-reference.md) | DwC-A / IPT-style publish bundles; notebook export |

### How to read the “future” column

- **Modeling only** (no new tables): conventions, ontology design, wiki templates—already possible.
- **Product**: new surfaces (specimen UI, event importer, interactive keys, media indexers) or **integrations** (GBIF, Zenodo DOI, Darwin Core).
- **Pipeline / model registry**: new parse or embedding paths (audio transcript model, video keyframes) via [Pipelines, jobs & models](pipelines-and-jobs.md)—fits openKMS’s existing “worker + CLI” pattern if you invest in extractors.

## Domain patterns we do not model as built-in types

The following rows **compress** gaps that are unpacked in the [entomology workflow map](#entomology-workflow-map) (workflow lens). Both sections are documentation only—not a roadmap commitment.

openKMS defines a **general** set of artifacts (documents, wiki, articles, KB, ontology, map). A specialist building *their* system—for example an **insect researcher**—often expects **domain primitives** that are **not** first-class types here. Many can be **approximated** with [Ontology](ontology.md) (typed objects + links + datasets), [Wiki](wiki-spaces.md) (narrative, tables, images), and [Documents](documents.md) (papers, scans, PDFs for RAG).

| Research-style need | Typical expectation | In openKMS today |
|----------------------|---------------------|------------------|
| **Specimen / voucher** | Accession number, lot, disposition, barcode, loans | No specimen or collection-management module; model as ontology objects + metadata if needed |
| **Observation / sampling event** | Who, when, GPS, trap/protocol, effort | No “field event” entity; use ontology or narrative wiki; not Darwin-Core–aligned out of the box |
| **Nomenclature / ranked taxonomy** | Accepted name, synonyms, citation of publication | No taxonomic authority service; manual ontology or prose |
| **Trait & measurement tables** | Many traits × many specimens, units, repeated sampling | Glossary is **term**-centric, not a trait matrix; ontology can hold rows but without a dedicated trait/TSDB product layer |
| **Audio / video as primary evidence** | Sonograms, call libraries, annotated video | Files in wiki/articles/attachments only; no media-specific knowledge type or timeline editor — see [Rich media and 3D](#rich-media-and-3d) |
| **3D / volumetric evidence** (meshes, micro-CT, photogrammetry) | Scale, orientation, specimen link | No mesh or stack viewer; no spatial index as first-class knowledge — same [Rich media and 3D](#rich-media-and-3d) pattern |
| **CAD / BIM / GIS source files** | DWG, DXF, IFC, STEP, geodatabases as *authoritative* artifacts | No geometry viewer or CAD-aware parse into searchable text; see below |
| **Interactive identification keys** | Dichotomous or multi-entry keys | Not native; static keys in wiki/article only |
| **Bibliography as a graph** | DOI, cited-by, specimen–literature links | Articles and documents exist; no BibTeX-grade citation graph as a built-in type |
| **Published vocabulary (SKOS / OBO registry)** | Reusable term IDs for the field | App ontology is for **your** instances and types in this deployment, not a public term server |

So the “universe” of possible knowledge **in science** is larger than this product’s **named artifact set**: openKMS centers **corpora, narrative, light graph, and RAG**. Discipline depth usually means **custom ontology + imports + conventions**, not new built-in tables—unless you extend the product.

## Rich media (audio, video) and 3D assets {#rich-media-and-3d}

For many researchers—**entomologists** included—**recordings** (calls, behavior video) and **spatial** assets (habitus scans, micro-CT, photogrammetry meshes) are as central as PDFs. In openKMS **today**, those files are still **attachments or uploads** under [Wiki spaces](wiki-spaces.md), [Articles](articles.md), or [Documents](documents.md) where the deployment allows, plus **prose and ontology links** describing them. There is no dedicated table/API for **timecode**, **waveform features**, **mesh topology**, or **voxel stacks** as first-class fields.

Treating them as **new primary knowledge types** (not only “a file on a page”) would mean something closer to **Document** semantics: a **logical asset** with stable id, permissions, lifecycle, and **machine indexes** you can search and cite—e.g. **time-based media**: transcript segments + optional segment embeddings; **3D / volumetric**: scale, CRS or specimen frame, thumbnails or key slices, and typed edges to specimens or taxa. Until that exists, the same workaround pattern as [CAD, BIM, GIS, and other professional binaries](#cad-bim-gis-and-other-professional-binaries) applies: keep authoritative binaries where storage fits, push **text and numbers** (captions, measurements, CSV exports) into wiki/KB/ontology so [Knowledge bases](knowledge-bases.md) and search stay useful. Gaps for insects are already listed in the [workflow map](#entomology-workflow-map).

### Recording as [Article](articles.md) vs [Document](documents.md) (conceptual tradeoff)

Neither path is “wrong”; they optimize for different **centers of gravity**. This is about **how you model** audio/video *today* if you stay inside existing types—not a promise that either path auto-indexes waveforms or video.

| | **Article + attachment** (markdown body + file under `attachments/`) | **Document** (channel upload, original blob + markdown slot) |
|---|------------------------------------------------------------------------|----------------------------------------------------------------|
| **Fit** | **Narrative-first**: methods, protocol, taxon context, links, and the recording as **evidence** next to the text. | **Corpus-first**: same *bucket* as PDFs and scans; good if you later add a **job** that turns a recording into **markdown** (transcript, segments, labels) the product already knows how to chunk and search. |
| **Pros** | [Attachments](articles.md) and bulk import are built for arbitrary files; no expectation that a **VLM/layout** pipeline will “read” a `.mp4` or `.wav`; [lifecycle](articles.md), [relationships](articles.md), and **article channel** links on the [Knowledge map](knowledge-map.md) match “publication-like” lab outputs. | **Channels**, **jobs**, and **metadata extraction** patterns already exist; [document versions](documents.md) and channel-level automation mirror **operator** workflows on large corpora; aligns with “everything important is a document row” mental models. |
| **Cons** | [Knowledge bases](knowledge-bases.md) today ground on **linked documents** and **wiki** text—not on mining attachment binaries—so **searchable** RAG content is what you put in **markdown** (transcript, notes, timestamps), not an automatic extract from the file. | The documented **parse** path is **raster/PDF/office-like** ([Documents](documents.md)); without a **new pipeline**, Process jobs are a poor match for raw audio/video and the detail UI is **text/layout** oriented, not player-first. |
| **Practical rule of thumb** | Choose when the **write-up** (SOP, field note, species page) is the curated object and the file is **supporting evidence**. | Choose when you are willing to treat the file like other **ingested corpus** items **and** invest in extraction to fill `markdown` / KB—*or* you only need storage + manual markdown sidecar until then. |

[Wiki spaces](wiki-spaces.md) are a third bundle pattern (page + uploads) with similar tradeoffs to articles for “prose + file,” plus wiki-native linking.

### When video deserves a new *functionality* (not only attachments) {#video-as-functionality}

A **functionality** in openKMS is roughly a **named surface + API + operator story** on [Functionalities](../functionalities.md)—not just a file MIME type. **Article/wiki attachments** stay the right scope when video is **occasional evidence** next to prose. Promote **video (or “recordings”)** to its own functionality when teams keep hitting gaps that are **structural**, not cosmetic:

| Signal | Why attachments + prose stop scaling |
|--------|----------------------------------------|
| **Library UX** | Users need a **recording-centric** list (filters, bulk actions, thumbnails), not “find the article that might have a clip.” |
| **Time** | **Duration**, **in/out points**, **chapters**, and **time-aligned notes** are first-class—not only free text in markdown. |
| **Derivatives** | You routinely need **proxies** (lower resolution), **posters**, **audio extracted from video**, or **HLS-style** delivery—operator jobs, not one-off manual ffmpeg. |
| **Transcripts & search** | **Captions/transcripts** are maintained as structured segments (start/end, speaker, confidence), indexed for [Knowledge bases](knowledge-bases.md) or global search **without** pretending the binary is a “document parse.” |
| **Governance** | **Retention**, **quotas**, **PII in frames** (faces, license plates in field video), or **consent** need policies tied to the **asset**, not only to the parent page. |
| **Linking** | Many-to-many edges (recording ↔ specimen, event, taxon) exceed what ad-hoc [Ontology](ontology.md) + URLs in markdown express without pain. |

**Naming:** a first slice is often **“Recordings”** or **“Media”** so **audio** and later **video-adjacent** evidence sit under one operator story; reserve **“Video platform”** language if you would otherwise imply streaming, DRM, or live ingest—usually out of scope for research KMS unless explicitly required.

**Phasing (advice):** (1) **Conventions** on articles/wiki + ontology until signals appear. (2) **Minimal new functionality**: asset registry + player + transcript store + one job type (e.g. “generate transcript → segments”) + KB indexing on **text derivatives** only. (3) **DAM-scale** features (rights, complex transcoding graphs, scene search) only if product strategy commits—otherwise integration with an external object store + deep links often wins.

## CAD, BIM, GIS, and other professional binaries

**Architecture and engineering** (and adjacent fields) often treat **CAD**, **BIM**, or **GIS** project files as the real “knowledge,” not only the PDFs derived from them. openKMS does **not** ship native **geometry**, **sheet/revision semantics**, or **parametric model** types. The [Documents](documents.md) path that feeds **VLM parsing and KB chunks** is oriented toward **raster/PDF/office-like** inputs and the upload surfaces documented there—not toward DWG/IFC/STEP as first-class parsed corpora.

**What you can do today:** store or link authoritative binaries **outside** the parsed-doc pipeline (or as **wiki**/**article** attachments where your deployment allows); ingest **PDF exports, sheets, markdown narratives, and metadata** as **documents** / **wiki** so RAG and search stay useful; use **ontology** for structured fields (project id, revision, sheet, discipline) pointing at those assets.

This is the same *pattern* as long-form **video** as primary searchable knowledge: the product can hold **files** and **text about** them; it does not yet treat every professional format as **automatically extracted, indexed text knowledge**.

## Explicitly out of scope today

**Generative image** or **generative video** as registered model categories or first-class knowledge **kinds** are not part of the [model registry](pipelines-and-jobs.md) (`ocr`, `vl`, `llm`, `embedding`, `text-classification` only). That is separate from **evidence** audio/video/3D as research objects: those are discussed under [Rich media and 3D assets](#rich-media-and-3d) (today: files + derivatives; not yet a dedicated primary type). Images and video may appear as **document inputs**, **article attachments**, **wiki assets**, or **inline assets**—not as a separate “generated media knowledge type” in ingestion or RAG.

## See also

- [Functionalities](../functionalities.md) — routing index for all feature pages.
- [Architecture](../architecture.md) — end-to-end diagram and storage overview.
