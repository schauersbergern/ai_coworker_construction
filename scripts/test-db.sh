#!/usr/bin/env bash
set -euo pipefail

# Reproducible from a fresh checkout: if no local .env.test exists yet,
# bootstrap it from the committed template.
if [ ! -f .env.test ]; then
  cp .env.test.example .env.test
  echo "created .env.test from .env.test.example"
fi

export $(grep -v '^#' .env.test | xargs)

# Ensure the test database exists. Postgres has no "CREATE DATABASE IF NOT
# EXISTS", so check first, then create. Runs against the docker-compose db
# service (the documented local dependency).
if ! docker compose exec -T db psql -U baudoku -d baudoku -tAc \
    "SELECT 1 FROM pg_database WHERE datname='baudoku_test'" | grep -q 1; then
  docker compose exec -T db psql -U baudoku -d baudoku -c "CREATE DATABASE baudoku_test;"
  echo "created database baudoku_test"
fi

pnpm prisma migrate deploy
echo "test db migrated"
