#!/usr/bin/env bash
# Refresh the vendored Swagger UI (served at /static/swagger-ui; see app/main.py).
#
# The docs page must not need a CDN: jsdelivr is unreachable from some of the networks this runs on, and
# the failure is a blank page with `SwaggerUIBundle is not defined`. `swagger-ui-dist` is only a *source*
# for these three files — the backend serves them itself.
set -euo pipefail
cd "$(dirname "$0")/../.."

(cd frontend && npm install --save-dev --save-exact swagger-ui-dist@5)
mkdir -p backend/app/static/swagger-ui
cp frontend/node_modules/swagger-ui-dist/swagger-ui-bundle.js \
   frontend/node_modules/swagger-ui-dist/swagger-ui.css \
   frontend/node_modules/swagger-ui-dist/favicon-32x32.png \
   backend/app/static/swagger-ui/
echo "vendored swagger-ui-dist $(node -p "require('./frontend/node_modules/swagger-ui-dist/package.json').version")"
