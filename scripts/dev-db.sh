#!/bin/sh
# Local databases without Docker (TECH-DESIGN §10.2). Safe to run again at any time.
#
# Creates the role `lamp` (password `lamp`, CREATEDB for Prisma's shadow database) and the
# databases lamp_dev, lamp_test and lamp_e2e on the local Postgres 18, then writes the
# connection strings to apps/api/.env.local and apps/api/.env.test (other lines are kept).
#
# Creating the role needs an admin connection. The script uses, in order:
#   1. $PG_ADMIN, if set (e.g. PG_ADMIN="psql -U postgres -h 127.0.0.1")
#   2. your own user, if it is a superuser or has CREATEROLE (Postgres.app on macOS)
#   3. sudo -u postgres psql (the distro package on Linux; asks for your sudo password)
# Everything after the role is done as `lamp` itself.
#
# Env: DB_HOST (default 127.0.0.1), DB_PORT (default 5432).
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
api="$root/apps/api"
role=lamp
password=lamp
host=${DB_HOST:-127.0.0.1}
port=${DB_PORT:-5432}
databases="lamp_dev lamp_test lamp_e2e"

# Postgres.app doesn't put its tools on PATH unless you ask it to.
pgapp=/Applications/Postgres.app/Contents/Versions/latest/bin
if ! command -v psql >/dev/null 2>&1 && [ -d "$pgapp" ]; then
  PATH="$pgapp:$PATH"
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found. Install PostgreSQL 18 (Postgres.app on macOS, PGDG packages on Linux)." >&2
  exit 1
fi

if ! pg_isready -q -h "$host" -p "$port" 2>/dev/null; then
  echo "error: no Postgres is accepting connections on $host:$port. Start it, or set DB_HOST / DB_PORT." >&2
  exit 1
fi

admin_psql() {
  if [ -n "${PG_ADMIN:-}" ]; then
    # Word splitting is intended: PG_ADMIN is a command line.
    # shellcheck disable=SC2086
    $PG_ADMIN -X -q -v ON_ERROR_STOP=1 -d postgres "$@"
  elif [ "$(psql -X -At -h "$host" -p "$port" -d postgres \
    -c 'select rolsuper or rolcreaterole from pg_roles where rolname = current_user' 2>/dev/null)" = t ]; then
    psql -X -q -v ON_ERROR_STOP=1 -h "$host" -p "$port" -d postgres "$@"
  else
    echo "Creating the role needs the postgres superuser; running psql through sudo." >&2
    # cd / so psql doesn't warn that the postgres user can't read the current directory.
    (cd / && sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -p "$port" -d postgres "$@")
  fi
}

lamp_psql() {
  PGPASSWORD=$password psql -X -q -v ON_ERROR_STOP=1 -h "$host" -p "$port" -U "$role" "$@"
}

echo "Role $role"
# Passed with -c, not on stdin: sudo with use_pty (the Ubuntu 24.04 default) can drop piped
# input when there's no terminal, and psql then exits 0 having run nothing.
admin_psql -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$role') THEN
    CREATE ROLE $role;
  END IF;
END
\$\$;
ALTER ROLE $role WITH LOGIN CREATEDB NOSUPERUSER PASSWORD '$password';"

server=$(lamp_psql -At -d postgres -c 'show server_version_num')
if [ "$server" -lt 180000 ]; then
  echo "error: Lamp needs PostgreSQL 18, but the server on $host:$port is $(lamp_psql -At -d postgres -c 'show server_version')." >&2
  exit 1
fi

for db in $databases; do
  echo "Database $db"
  lamp_psql -d postgres <<SQL
SELECT 'CREATE DATABASE $db OWNER $role' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')
\gexec
SQL
  lamp_psql -d "$db" -c 'select 1' >/dev/null
done

url() {
  echo "postgresql://$role:$password@$host:$port/$1"
}

# Sets KEY=value in an env file: replaces the existing line or appends one.
set_var() {
  file=$1 key=$2 value=$3
  tmp="$file.tmp.$$"
  awk -v k="$key" -v v="$value" '
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$file" >"$tmp"
  mv "$tmp" "$file"
}

if [ ! -f "$api/.env.local" ]; then
  cp "$api/.env.example" "$api/.env.local"
fi
set_var "$api/.env.local" DATABASE_URL "$(url lamp_dev)"

if [ ! -f "$api/.env.test" ]; then
  echo "# Used by the API tests (src/config/env.ts). Written by scripts/dev-db.sh." >"$api/.env.test"
fi
set_var "$api/.env.test" DATABASE_URL "$(url lamp_test)"
set_var "$api/.env.test" E2E_DATABASE_URL "$(url lamp_e2e)"

echo "Wrote apps/api/.env.local (lamp_dev) and apps/api/.env.test (lamp_test, lamp_e2e)."
