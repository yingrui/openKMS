-- Extra application data DB (not owned by Alembic).
-- Use as Console → Data Sources (PostgreSQL) for Ontology datasets and Connector sync targets.
-- Runs only on first cluster init (empty volume). Existing volumes: create manually.

CREATE DATABASE ontology_data_layer;
