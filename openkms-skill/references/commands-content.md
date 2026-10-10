# Commands — content (search, docs, articles, wiki, KB, glossaries, map, eval)

Part of [agentskills.io](https://agentskills.io/specification) **`references/`**. Load when working on channels, pages, KB, glossaries, knowledge map, or evaluations.

Prefix every invocation with `python scripts/cli.py` (or the project-agent path — see [setup.md](setup.md)). Mutating commands need `-y`/`--yes` (or `--dry-run`); non-TTY without `--yes` exits 2. Prefer `<group> --help` over inventing flags. Domain gotchas: [pitfalls.md](pitfalls.md).

## Read / query

| Goal | Command |
|------|---------|
| Verify connectivity | `ping` |
| Global search | `search --q "…" --types documents,articles --limit 20` |
| Document channels (tree) | `document-channels list --tree` |
| Pipelines | `pipelines list` (or `--table`) |
| Article channels (tree) | `article-channels list --tree` |
| List documents | `documents list --channel-id ID --search "…" --limit 50` |
| Document metadata + body | `documents get --id DOC_ID` |
| Document lineage | `documents relationships list --id DOC_ID` |
| Document markdown → file | `documents markdown --id DOC_ID --out ./case.md` |
| List articles | `articles list --channel-id ID --search "…"` |
| Article lineage | `articles relationships list --id ART_ID` |
| Article markdown | `articles markdown --id ART_ID` |
| Latest content review | `articles reviews latest --id ART_ID` |
| List content reviews | `articles reviews list --id ART_ID --limit 10` |
| Wiki pages in a space | `wiki list-pages --space-id SP_ID` |
| Wiki semantic / substring search | `wiki pages semantic-matches --space-id SP_ID --q "…" --top-k 10` |
| Wiki space files (full vault) | `wiki files list --space-id SP_ID` |
| Docs linked to a wiki space | `wiki-spaces documents list --space-id SP_ID` |
| One wiki page by path | `wiki get-page --space-id SP_ID --path notes/onboarding` |
| List KBs | `kb list` |
| Wiki spaces on a KB | `kb wiki-spaces list --kb-id KB_ID` |
| KB hybrid search | `kb search --id KB_ID --q "…" --limit 10` |
| KB grounded ask | `kb ask --id KB_ID --question "…"` |
| List FAQs | `kb-faq list --kb-id KB_ID` |
| Glossaries / terms / export | `glossaries list` · `glossaries get --id GL_ID` · `glossaries terms list --glossary-id GL_ID [--search "…"]` · `glossaries terms get …` · `glossaries export --glossary-id GL_ID` |
| Knowledge map tree / links | `knowledge-map nodes tree` · `knowledge-map resource-links list` |
| Comments | `comments list --resource-type document --resource-id ID` |
| Media list | `media list [--channel-id ID]` |
| Evaluation metadata / items / runs | `evaluations get --id EV_ID` · `evaluations items list --id EV_ID` · `evaluation-runs list --evaluation-id EV_ID` · `evaluation-runs get …` · `evaluation-runs compare …` |

## Write

| Goal | Command |
|------|---------|
| Create / update document channel | `document-channels create --name "Inbox" --yes` · `document-channels update --id DC_ID … --yes` |
| Channel with parse pipeline | `pipelines list --table` then `document-channels create --name "…" --pipeline-id pipeline_… --yes` |
| Upload document | `documents upload --channel-id ID --file /path/to/doc.pdf --yes` |
| Lifecycle / lineage | `documents lifecycle patch --id DOC_ID … --yes` · `documents relationships create\|delete … --yes` |
| Put markdown / export zip | `documents put-markdown --id DOC --file ./x.md --yes` · `documents export --id DOC --out ./doc.zip --yes` |
| Create / update article channel | `article-channels create --name "…" --yes` · `article-channels update --id AC_ID … --yes` |
| Create article / from URL | `articles create --channel-id ID --name "…" --markdown-file ./x.md --yes` · `articles from-url --channel-id ID --url … --yes` |
| Run content review | `articles review run --id ART_ID --yes` |
| Article lineage | `articles relationships create\|delete … --yes` |
| Wiki space / link docs | `wiki-spaces create --name "…" --yes` · `wiki-spaces documents link\|unlink … --yes` |
| Upsert wiki page | `wiki put-page --space-id ID --path my/page --title "T" --file ./note.md --yes` |
| Delete wiki stored file | `wiki files delete --space-id SP_ID --file-id FILE_ID --yes` |
| Wiki semantic index | `wiki-spaces semantic-index --id SP --yes` |
| Link wiki → KB / reindex | `kb wiki-spaces link --kb-id KB --space-id SP --yes` · `kb wiki-spaces reindex --kb-id KB --space-id SP --yes` · `kb index --id KB --yes` |
| Create FAQ | `kb-faq create --kb-id ID --question "Q" --answer "A" --yes` |
| Glossary CRUD / import / suggest | `glossaries create\|update\|delete …` · `glossaries terms create\|update\|delete …` · `glossaries import --glossary-id GL_ID --terms-file ./terms.json --mode replace --yes` · `glossaries terms suggest … --yes` |
| Knowledge map nodes / resource links | `knowledge-map nodes create\|patch\|delete … --yes` · `knowledge-map resource-links put\|delete … --yes` |
| Evaluations (prefer update/items — see [pitfalls.md](pitfalls.md)) | `evaluations create\|update … --yes` · `evaluations items add\|update\|delete … --yes` · `evaluations run --id EV_ID --type qa_answer --yes` |

Recipes: [workflows.md](workflows.md) **A–F**. CLI ↔ HTTP (operators): [REFERENCE.md](REFERENCE.md).
