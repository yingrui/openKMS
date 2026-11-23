"""One list of sources, assembled from whichever tools a turn actually used.

Sources used to be "whichever family produced them", because retrieval ran before generation: a turn could only produce
one. Now the model calls tools, and one answer can quote a document section, a semantic-model query and a web page at the
same time. "First family wins" then stopped being a preference and became a filter — evidence the answer cited
disappeared because another family happened to be non-empty.

So the rule is additive: every family a turn produced is kept, in a stable order, deduplicated by identity. The same
object serves the streamed path (which only sees tool events) and the finished transcript (which has the messages), so a
new source family is added in one place instead of two.
"""

from __future__ import annotations

from .schemas import SourceItem

#: The order families appear in the drawer. Internal evidence first, external last: a reader who was given a document
#: and a web page needs to see the document first, and the dashed web card is the reminder that the rest came from
#: outside this deployment.
FAMILIES: tuple[str, ...] = ("page", "catalog", "ontology", "searched", "web")

#: `source_type` values a source may carry. The frontend maps each to a card style and a label; an unlisted value would
#: silently render as "semantic search", which is how an external page could be mistaken for a corpus hit.
SOURCE_TYPES: tuple[str, ...] = (
    "chunk",
    "faq",
    "document_section",
    "metric",
    "semantic_model",
    "ontology",
    "web",
)


def _identity(item: SourceItem) -> str:
    """Two rows are the same source when they point at the same thing: a URL for the web, an id otherwise."""
    return (item.url or "").strip() or item.id


class EvidenceLedger:
    """What a turn's tools returned, gathered per family and read once at the end."""

    def __init__(self) -> None:
        self._by_family: dict[str, list[SourceItem]] = {name: [] for name in FAMILIES}
        self._seen: set[str] = set()

    def add(self, family: str, items: list[SourceItem] | None) -> int:
        """Append one family's rows. Returns how many were new (duplicates are dropped, not merged)."""
        if family not in self._by_family:
            raise ValueError(f"unknown evidence family: {family}")
        added = 0
        for item in items or []:
            key = _identity(item)
            if not key or key in self._seen:
                continue
            self._seen.add(key)
            self._by_family[family].append(item)
            added += 1
        return added

    def is_empty(self) -> bool:
        return not self._seen

    def snapshot(self) -> list[SourceItem]:
        """Every row, in family order — what the answer's `sources` should be."""
        out: list[SourceItem] = []
        for name in FAMILIES:
            out.extend(self._by_family[name])
        return out

    def items(self, family: str) -> list[SourceItem]:
        """One family's rows — for the caller that has to merge a transcript with what the stream collected."""
        return list(self._by_family.get(family, ()))

    def count(self, family: str) -> int:
        return len(self._by_family.get(family, ()))
