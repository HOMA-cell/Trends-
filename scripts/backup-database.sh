#!/usr/bin/env bash

set -euo pipefail

for command_name in supabase openssl tar mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 1
  fi
done

if [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]] && command -v security >/dev/null 2>&1; then
  keychain_service="${BACKUP_KEYCHAIN_SERVICE:-com.trends.production-db-backup}"
  keychain_account="${BACKUP_KEYCHAIN_ACCOUNT:-${USER}}"
  BACKUP_ENCRYPTION_PASSWORD="$(security find-generic-password \
    -a "${keychain_account}" \
    -s "${keychain_service}" \
    -w 2>/dev/null || true)"
  export BACKUP_ENCRYPTION_PASSWORD
fi

if [[ -z "${BACKUP_ENCRYPTION_PASSWORD:-}" ]]; then
  echo "No backup encryption password is available." >&2
  echo "On macOS, run: npm run backup:setup" >&2
  echo "Elsewhere, set BACKUP_ENCRYPTION_PASSWORD in the operator environment." >&2
  exit 1
fi

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  dump_target=(--db-url "${SUPABASE_DB_URL}")
else
  dump_target=(--linked)
fi

# Homebrew installs libpq as keg-only, so make its clients available without
# requiring operators to change their shell profile.
for libpq_bin in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin; do
  if [[ -x "${libpq_bin}/pg_dump" ]]; then
    export PATH="${libpq_bin}:${PATH}"
    break
  fi
done

output_dir="${BACKUP_OUTPUT_DIR:-${HOME}/Trends-backups}"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/trends-backup.XXXXXX")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${output_dir}/trends-db-${stamp}.tar.gz.enc"
partial_archive="${archive}.partial"

cleanup() {
  rm -rf "${work_dir}"
  rm -f "${partial_archive}"
}
trap cleanup EXIT

umask 077
mkdir -p "${output_dir}"
chmod 700 "${output_dir}"

run_database_dump() {
  local output_file="$1"
  shift

  if command -v pg_dump >/dev/null 2>&1 && command -v pg_dumpall >/dev/null 2>&1; then
    local command_file="${work_dir}/.$(basename "${output_file}").command.sh"
    supabase db dump "${dump_target[@]}" "$@" --dry-run > "${command_file}"
    chmod 700 "${command_file}"
    bash "${command_file}" > "${output_file}"
    rm -f "${command_file}"
    return
  fi

  supabase db dump "${dump_target[@]}" -f "${output_file}" "$@"
}

backup_storage_bucket() {
  local bucket="$1"
  local list_file="${work_dir}/.storage-${bucket}.list"
  local log_file="${work_dir}/.storage-${bucket}.log"
  local destination="${work_dir}/storage/${bucket}"

  mkdir -p "${destination}"
  if ! supabase storage ls "ss:///${bucket}/" \
    --linked \
    --recursive \
    --experimental > "${list_file}" 2> "${log_file}"; then
    echo "Unable to list Storage bucket: ${bucket}" >&2
    return 1
  fi

  if [[ -s "${list_file}" ]] && ! supabase storage cp \
    -r "ss:///${bucket}/" "${destination}" \
    --linked \
    --experimental \
    --jobs 4 > /dev/null 2> "${log_file}"; then
    echo "Unable to back up Storage bucket: ${bucket}" >&2
    return 1
  fi

  rm -f "${list_file}" "${log_file}"
}

run_database_dump "${work_dir}/roles.sql" --role-only
run_database_dump "${work_dir}/schema.sql"
run_database_dump "${work_dir}/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" \
  -x "storage.vector_indexes"

if [[ "${BACKUP_INCLUDE_STORAGE:-1}" == "1" ]]; then
  read -r -a storage_buckets <<< "${STORAGE_BACKUP_BUCKETS:-avatars post-media dm-media}"
  for bucket in "${storage_buckets[@]}"; do
    backup_storage_bucket "${bucket}"
  done
fi

tar -czf - -C "${work_dir}" . | openssl enc \
  -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_PASSWORD \
  -out "${partial_archive}"

openssl enc \
  -d \
  -aes-256-cbc \
  -pbkdf2 \
  -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_PASSWORD \
  -in "${partial_archive}" | tar -tzf - >/dev/null

mv "${partial_archive}" "${archive}"
chmod 600 "${archive}"

echo "Encrypted backup created: ${archive}"
