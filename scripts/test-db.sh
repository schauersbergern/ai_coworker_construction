#!/usr/bin/env bash
set -euo pipefail
export $(grep -v '^#' .env.test | xargs)
pnpm prisma migrate deploy
echo "test db migrated"
