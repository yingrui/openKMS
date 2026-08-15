#!/bin/bash
# Create ontology_data_layer + dedicated role (not the app superuser).
# Idempotent: safe to re-run on existing volumes; always syncs the role password from env.
# Runs automatically on first cluster init (empty volume). Existing volumes: see docker/README.md.
set -euo pipefail

USER_NAME="${OPENKMS_ONTOLOGY_DATA_USER:-ontology_data}"
USER_PASS="${OPENKMS_ONTOLOGY_DATA_PASSWORD:-openkms-ontology-data-password}"
DB_NAME="${OPENKMS_ONTOLOGY_DATA_DB:-ontology_data_layer}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${USER_NAME}') THEN
	    CREATE ROLE ${USER_NAME} LOGIN PASSWORD '${USER_PASS}';
	  ELSE
	    ALTER ROLE ${USER_NAME} WITH LOGIN PASSWORD '${USER_PASS}';
	  END IF;
	END
	\$\$;

	SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${USER_NAME}'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

	GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${USER_NAME};
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" <<-EOSQL
	GRANT ALL ON SCHEMA public TO ${USER_NAME};
	ALTER SCHEMA public OWNER TO ${USER_NAME};
EOSQL
