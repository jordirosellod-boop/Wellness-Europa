#!/bin/sh
# Prova schema.sql en un Postgres local (socket /var/tmp/pgt, port 5499).
# Ús: sh supabase/tests/run.sh [schema_antic.sql]   (amb argument: prova l'actualització des d'aquella versió)
set -e
cd "$(dirname "$0")/.."
P="psql -h /var/tmp/pgt -p 5499 -U postgres -X -q -t -A"
# Engega el Postgres de proves si no està en marxa
if ! su postgres -c "$P -c 'select 1'" >/dev/null 2>&1; then
  [ -d /var/tmp/pgt/data ] || { mkdir -p /var/tmp/pgt && chown postgres /var/tmp/pgt && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pgt/data >/dev/null"; }
  rm -f /var/tmp/pgt/data/postmaster.pid
  su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgt/data -o '-k /var/tmp/pgt -p 5499' -l /var/tmp/pgt/log start -w" >/dev/null
fi
T=$(mktemp -d); chmod 755 "$T"; cp schema.sql tests/supabase_stub.sql tests/rls_test.sql "$T"/; sed -i -E '/^create extension if not exists pg_(cron|net);/d' "$T/schema.sql"; [ -n "$1" ] && cp "$1" "$T/old.sql" && sed -i -E '/^create extension if not exists pg_(cron|net);/d' "$T/old.sql"; chmod 644 "$T"/*
su postgres -c "$P -c 'drop database if exists t' -c 'drop role if exists anon' -c 'drop role if exists authenticated' -c 'drop role if exists service_role' -c 'create database t'" 2>&1 | grep -v NOTICE || true
if [ -n "$1" ]; then su postgres -c "$P -d t -v ON_ERROR_STOP=1 -f $T/supabase_stub.sql -f $T/old.sql" 2>&1 | grep -iv notice || true; fi
su postgres -c "$P -d t -v ON_ERROR_STOP=1 $( [ -z "$1" ] && echo "-f $T/supabase_stub.sql" ) -f $T/schema.sql -f $T/schema.sql" 2>&1 | grep -iv notice || true
su postgres -c "$P -d t -f $T/rls_test.sql" 2>&1 | grep -E '^(OK|FALLA)|ERROR'
rm -rf "$T"
