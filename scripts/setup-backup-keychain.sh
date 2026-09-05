#!/usr/bin/env bash

set -euo pipefail

for command_name in openssl security; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required macOS command is missing: ${command_name}" >&2
    exit 1
  fi
done

keychain_service="${BACKUP_KEYCHAIN_SERVICE:-com.trends.production-db-backup}"
keychain_account="${BACKUP_KEYCHAIN_ACCOUNT:-${USER}}"

if security find-generic-password \
  -a "${keychain_account}" \
  -s "${keychain_service}" >/dev/null 2>&1; then
  echo "Backup encryption password is already stored in macOS Keychain."
  exit 0
fi

backup_password="$(openssl rand -hex 48)"
security add-generic-password \
  -a "${keychain_account}" \
  -s "${keychain_service}" \
  -w "${backup_password}" >/dev/null
unset backup_password

echo "Backup encryption password stored in macOS Keychain."
echo "Store a second copy in an operator-owned password manager before relying on these backups."
