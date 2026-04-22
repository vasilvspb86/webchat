#!/usr/bin/env bash
# Provisions a Codespace for webchat: Postgres databases, .env, migrations, seed.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ installing npm deps"
npm install --no-audit --no-fund

echo "→ creating Postgres role + databases (idempotent)"
sudo service postgresql start >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'webchat') THEN
    CREATE USER webchat WITH PASSWORD 'webchat';
  END IF;
END $$;
SELECT 'CREATE DATABASE webchat OWNER webchat'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'webchat')\gexec
SELECT 'CREATE DATABASE webchat_test OWNER webchat'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'webchat_test')\gexec
SQL

echo "→ writing .env (if missing)"
if [ ! -f .env ]; then
  SECRET=$(openssl rand -hex 32)
  cat > .env <<EOF
DATABASE_URL=postgresql://webchat:webchat@localhost:5432/webchat
SESSION_SECRET=$SECRET
PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000
EOF
fi

echo "→ generating Prisma client + running migrations"
npx prisma generate
npx prisma migrate deploy

echo ""
echo "✓ Codespace ready."
echo "  Start the app:   npm run dev"
echo "  Run tests:       npm test"
echo "  Forwarded port:  3000 (opens automatically)"
