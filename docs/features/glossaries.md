# Glossaries

Bilingual (EN/CN) term definitions with synonyms, AI-suggested translations, and JSON import/export.

| Feature | Status | Description |
|---------|--------|-------------|
| Glossary management | ✅ | CRUD via `/api/glossaries`; GlossaryList with create/edit/delete |
| Multiple glossaries | ✅ | Create glossaries for different domains |
| Bilingual terms | ✅ | Add primary EN, primary CN, definition, synonyms EN, synonyms CN per term |
| Term CRUD | ✅ | Add/edit/delete terms in glossary; at least one of primary_en or primary_cn required |
| Search terms | ✅ | `GET /api/glossaries/{id}/terms?search=` filters by primary, definition, or synonyms (case-insensitive); debounced in UI |
| AI suggestion | ✅ | `POST /api/glossaries/{id}/terms/suggest` – LLM suggests translation, definition, and synonyms; button in Add Term form when primary entered |
| Export | ✅ | `GET /api/glossaries/{id}/export` returns JSON with glossary_id, name, terms array |
| Import | ✅ | `POST /api/glossaries/{id}/import` with `{ terms, mode: "append" \| "replace" }`; JSON file picker in UI |
