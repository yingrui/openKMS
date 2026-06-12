# Ontology — objects, links, datasets

Object types and link types model an entity-relationship layer that can be backed by PostgreSQL datasets and optionally indexed into Neo4j for graph exploration. The **Objects & links** sidebar group is shown when route patterns allow; a **Neo4j** data source still drives graph counts and Object Explorer behavior where applicable.

## Objects and links

| Feature | Status | Description |
|---------|--------|-------------|
| Object types | ✅ | Schema for entity types (name, description, properties JSONB, optional dataset_id, key_property, is_master_data, display_property); managed under Ontology → Object types (`/ontology/object-types`); **Sharing** action opens `/ontology/object-types/{id}/settings?tab=sharing`; table Actions: index-to-graph when Neo4j exists and the type has a linked dataset or at least one stored instance; indexing uses dataset rows, or `object_instances` when there is no dataset; header **Index Objects** indexes all such types; Edit dialog: wider, property name/type read-only when editing, primary key radio selector; Master Data flag (only master data types usable for document labels); display_property for label picker display |
| Object instances | ✅ | Instances of object types with property values; CRUD at `/objects/:typeId` (admin write + parent type write ACL) |
| Link types | ✅ | Schema for relationships between two object types; managed under Ontology → Link types (`/ontology/link-types`); **Sharing** action opens `/ontology/link-types/{id}/settings?tab=sharing`; table Actions: index when Neo4j exists and the type has a junction/source-dataset setup or at least one saved link; per-row dialog differs for table-driven vs saved links; header **Index Links** runs bulk for all such types |
| Link instances | ✅ | Instances of link types (source → target); CRUD at `/links/:typeId` (admin write + parent link type write ACL) |
| Objects list | ✅ | User-facing list at `/objects`; instances and instance_count from Neo4j when Neo4j data source exists |
| Links list | ✅ | User-facing list at `/links`; instances and link_count from Neo4j when Neo4j data source exists |
| Object Explorer | ✅ | Graph view at `/object-explorer`; runs Cypher on Neo4j, renders force-directed graph via react-force-graph-2d; checkbox selection for object/link types (sidebar lists only types the user can read via ACL); **tabs** switch between manual Cypher and plain-language text-to-Cypher (**Execute** / generate-and-run under the active input); query stack sits above results and the graph uses remaining main-column height; **list view** paginates rows client-side (page size 25–200) to limit DOM size; **node/link color legend** slides in from the right (collapsed by default so the graph uses full width); layout modes (force, left-to-right, top-to-bottom, radial); zoom in/out/fit, fullscreen; main column uses **flex height** (`app-content--object-explorer`) so the graph fills the viewport without a bottom dead band |
| Ontology overview | ✅ | Single page at `/ontology` with **List** (card grids) or **Graph** (schema diagram: object types as nodes, link types as directed edges; click to open browse pages) toggle; preference stored in `localStorage` |
| Ontology sidebar | ✅ | **Ontology** is a top-level item **next to Glossaries** (same menu group); links to `/ontology`; indented subnav for Datasets, Object types, Link types, Objects, Links, Object Explorer when on those routes; visibility follows permission patterns (Neo4j presence still affects graph-backed counts) |
| Search | ✅ | Optional search filter on object instances |
| Schema admin counts | ✅ | Ontology Object types / Link types pages: instance_count and link_count from datasets (PostgreSQL) |

## Data sources and datasets

PostgreSQL and Neo4j connections live in **Console → Data Sources**; mappings from a connection to a specific table become **datasets**, edited under the Ontology sidebar.

| Feature | Status | Description |
|---------|--------|-------------|
| Data Source CRUD | ✅ | PostgreSQL and Neo4j connection configs; Console → Data Sources |
| Credential encryption | ✅ | Username/password encrypted with Fernet before storage; key from OPENKMS_DATASOURCE_ENCRYPTION_KEY or derived from secret_key |
| Test connection | ✅ | `POST /api/data-sources/{id}/test` validates connectivity |
| Neo4j delete all | ✅ | `POST /api/data-sources/{id}/neo4j-delete-all` wipes all nodes and relationships; confirmation modal in Console |
| Dataset CRUD | ✅ | Map PostgreSQL tables (schema.table) from a data source; **Ontology → Datasets** (`/ontology/datasets`); legacy `/console/datasets` redirects |
| List tables from source | ✅ | `GET /api/datasets/from-source/{id}` — requires **`console:datasets`** (Manage datasets) |
| Dataset detail | ✅ | Click dataset name → `/ontology/datasets/:id` with Data tab (rows, pagination) and Metadata tab (column info); **Settings** opens General (display name) and Sharing |
| Dataset rows | ✅ | `GET /api/datasets/{id}/rows?limit=&offset=` fetches paginated rows from table |
| Dataset metadata | ✅ | `GET /api/datasets/{id}/metadata` returns column name, type, nullable, position from information_schema |
| Search datasets | ✅ | Client-side search by display name, schema.table, data source on list page |
| Object type–dataset link | ✅ | Object types can link to a dataset (dataset_id); instance_count shows dataset table row count |
| Link type cardinality | ✅ | Link types have cardinality (one-to-one, one-to-many, many-to-many) and optional dataset link for many-to-many |
| Link type FK mapping | ✅ | Source/Target key properties; junction table columns (source_dataset_column, target_dataset_column) for many-to-many |
| M:M junction table links | ✅ | When link type has dataset_id, links and link_count come from junction table; Add/Delete disabled for dataset-backed links |
| M:1/1:M link count | ✅ | When source object type has dataset and source_key_property (FK column), link_count from rows where FK is not null |
| Index to Neo4j | ✅ | Ontology **Object types** / **Link types** pages: Index Objects/Links button when Neo4j data source exists; indexes datasets as nodes, link types as relationships |
