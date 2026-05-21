# Knowledge map and home

Hierarchical taxonomy of terms (`taxonomy_nodes`) and their links to channels / wiki spaces / article channels (`taxonomy_resource_links`). Rendered as a force graph on the signed-in home page. Toggle: `taxonomy` (default on).

| Feature | Status | Description |
|---------|--------|-------------|
| Knowledge Map (data model) | ✅ | Hierarchical `taxonomy_nodes` and `taxonomy_resource_links` (document channel, article channel id, wiki space); `GET/POST/PATCH/DELETE /api/taxonomy/*` (FastAPI **`app.api.knowledge_map`**); **taxonomy:read** / **taxonomy:write** permission keys with default route/API patterns (SPA primary path **`/knowledge-map`**, legacy **`/taxonomy`** redirects) |
| Knowledge Map UI | ✅ | **`/knowledge-map`** (lazy; **`/taxonomy`** redirects); sidebar **Knowledge Map** above **Glossaries** when feature toggle + path allowed; sitemap-style copy; **Edit map** vs **Explore (3D)** tabs: tree + **Node details** (refer-tos, CRUD) on Edit; **`KnowledgeMapForceGraph3D`** (`react-force-graph-3d`, lazy) for force-layout 3D; taxonomy selection syncs to tree + `?node=`; resource click opens channel/wiki/articles; **New node** modal; reorder/move/edit/delete |
| openkms-skill (HTTP) | ✅ | **`knowledge-map nodes tree`**, **`nodes create|patch|delete`**, **`resource-links list|put|delete`** (personal API key; `taxonomy:read` / `taxonomy:write` when enforced); see [OpenCode skill](opencode-openkms-skill.md) |
| Home hub | ✅ | Signed-in `/` loads `GET /api/home/hub` when **taxonomy:read** or **documents:read** (hub JSON: taxonomy counts, work items, placeholder **share_requests**). With **taxonomy:read** (and `taxonomy` toggle): **Knowledge Map graph** (2D **`react-force-graph-2d`**, `KnowledgeMapForceGraph`) is the page center; same tree + resource-links APIs; term click → **`/knowledge-map?node=`**, resource click → open channel/wiki/articles; work items and browse shortcuts below. Without taxonomy read: work items + shortcuts only |
| Static home (guests) | ✅ | **`/`** always shows **`HomeStaticLanding`** for unauthenticated users (marketing hero, pain points, benefits, functionalities, Sign in CTA); no system setting—**`MainLayout`** only gates non-home routes |
| Feature toggle | ✅ | `taxonomy` (default on); Console → Feature Toggles |
