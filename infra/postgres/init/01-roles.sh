#!/bin/sh
# Runs once, when the PostgreSQL volume is first created.
# - smilesync_app: the API's runtime login. Migrations grant it SELECT/INSERT/UPDATE
#   on data tables and only SELECT/INSERT on the audit log (NFR 4). No DELETE anywhere.
# - smilesync_test: a separate database for the automated tests.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" -v owner="$POSTGRES_USER" <<'EOSQL'
CREATE ROLE smilesync_app LOGIN PASSWORD :'app_password';
CREATE DATABASE smilesync_test OWNER :"owner";
EOSQL
