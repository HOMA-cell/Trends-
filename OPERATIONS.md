# Production Operations

This runbook keeps the production beta observable and recoverable without putting credentials in the repository.

## Automated Checks

- `Production Check` runs every six hours and verifies the live build, security headers, Supabase Auth, Data API tables, storage buckets, RLS probes, and the account-deletion function.
- `Browser E2E` runs on pull requests and `main`. Its scheduled run tests the production URL in desktop Chromium and mobile WebKit.
- The authenticated E2E flow creates a disposable post, then verifies like, comment, follow/unfollow, and DM across two dedicated accounts. It removes the post and DM after the run.
- Failure screenshots, traces, and videos are retained in GitHub Actions for 14 days.

Configure these repository secrets for authenticated E2E:

```text
E2E_USER_A_EMAIL
E2E_USER_A_PASSWORD
E2E_USER_A_HANDLE
E2E_USER_B_EMAIL
E2E_USER_B_PASSWORD
E2E_USER_B_HANDLE
```

Use dedicated invited beta accounts. Do not reuse an operator or personal account.

## Database Backups

On macOS, run `npm run backup:setup` once. It generates a strong encryption password and stores it in the operator's login Keychain. Install the lightweight PostgreSQL client with `brew install libpq` if Docker is not installed. Then run `npm run backup:create` weekly from the linked Supabase project directory. The command creates role, schema, data, and Storage object backups in a temporary directory, encrypts them with AES-256, verifies that the archive can be decrypted, and persists only the encrypted archive.

Set these environment variables without committing them:

```text
SUPABASE_DB_URL (optional; the linked Supabase project is used by default)
BACKUP_ENCRYPTION_PASSWORD (optional on a configured macOS operator machine)
BACKUP_OUTPUT_DIR (optional; defaults to ~/Trends-backups)
BACKUP_INCLUDE_STORAGE (optional; defaults to 1)
STORAGE_BACKUP_BUCKETS (optional; defaults to avatars post-media dm-media)
```

Keep a second copy of the Keychain password in an operator-owned password manager. Losing this password makes the backup unrecoverable. For non-macOS environments, set `BACKUP_ENCRYPTION_PASSWORD`; optionally set a Supabase session-pooler or direct database connection string in `SUPABASE_DB_URL`. Do not upload a production dump to this public repository or its Actions artifacts.

Supabase database dumps include Storage metadata but not the underlying image and video objects. The backup command therefore downloads the `avatars`, `post-media`, and `dm-media` objects through the authenticated linked CLI and includes them in the encrypted local archive. Never put a privileged Storage key in frontend code.

## Restore Drill

Run this monthly and after any migration that changes user data:

1. Decrypt one backup without printing the password: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in BACKUP.tar.gz.enc -out BACKUP.tar.gz`.
2. Restore into a disposable Supabase branch or local isolated Postgres instance, never directly into production.
3. Verify Auth users, profiles, posts, comments, DMs, RLS policies, and functions.
4. Delete the disposable environment only after the verification record is saved.

Creating a Supabase branch can incur cost and therefore requires a separate cost confirmation before each restore drill environment is created.

## Incident Response

1. Stop new releases and record the first observed time, build ID, and affected flow.
2. Run `npm run prod:check` and the manual `Browser E2E` workflow.
3. Review Supabase Auth, API, Storage, Postgres, and Edge Function logs without sharing emails, IPs, tokens, or message content.
4. Review `runtime_error` aggregates from `BETA_OPERATIONS.md` and unresolved reports from `MODERATION.md`.
5. Roll Vercel back to the last healthy production deployment if the website caused the incident.
6. For data incidents, preserve logs and create a fresh backup before corrective SQL. Never restore over production as a first response.

## Security Limits

- Supabase leaked-password protection is available only on Pro and above. On Free, keep the eight-character application minimum, enable the strongest free password requirements available in Auth settings, and reconsider Pro before open registration.
- Keep the closed-beta Before User Created hook enabled while invitations are required.
- Review Supabase Security Advisor after every migration and at least weekly during beta.
- The private moderation table intentionally has no browser-facing policy or grant.

Official references: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [password security](https://supabase.com/docs/guides/auth/password-security).
