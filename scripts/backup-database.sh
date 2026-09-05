#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" || -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_URL and BACKUP_ENCRYPTION_PASSWORD before running this command." >&2
  exit 1
fi

for command_name in supabase openssl tar mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
done

output_dir="${BACKUP_OUTPUT_DIR:-${HOME}/Trends-backups}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/trends-backup.XXXXXX")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${output_dir}/trends-db-${stamp}.tar.gz.enc"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

mkdir -p "${output_dir}"
supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${work_dir}/roles.sql" --role-only
supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${work_dir}/schema.sql"
supabase db dump --db-url "${SUPABASE_DB_URL}" -f "${work_dir}/data.sql" --use-copy --data-only
tar -czf - -C "${work_dir}" . | openssl enc \
  -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_PASSWORD \
  -out "${archive}"
chmod 600 "${archive}"

echo "Encrypted backup created: ${archive}"
