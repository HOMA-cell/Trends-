# Trends

Static workout-social app powered by Supabase.

Primary production host: Vercel
Manual fallback: GitHub Pages

## Quick start

```bash
nvm use
npm ci
npm run preflight
npm run dev
```

Open:

- `http://127.0.0.1:8000/?fresh=1`

## Day-to-day commands

- `npm run dev` - local preview server
- `npm run doctor` - environment readiness summary
- `npm run security` - security-focused static checks
- `npm run preflight` - doctor + syntax + deploy metadata
- `npm run check` - syntax checks for app and support scripts
- `npm run lint` - ESLint on app source files
- `npm run ci` - local equivalent of GitHub CI

## Production readiness checklist

1. Run `npm run preflight`
2. Run `npm run security`
3. Run `npm run ci`
4. Apply the baseline Supabase migration:
   - `/Users/homare/Documents/Trends-/supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`
4. Walk through:
   - sign in
   - create a post
   - comment / like
   - DM
   - open profile / detail / shorts
5. In `Settings > Data tools`, save the real production URL in `Live site URL`
6. Verify `build-meta.json` updates after deploy
7. Run `ライブ版を確認` from inside the app

## Deploy notes

- CI workflow:
  - `/Users/homare/Documents/Trends-/.github/workflows/ci.yml`
- GitHub Pages workflow:
  - `/Users/homare/Documents/Trends-/.github/workflows/deploy-pages.yml` (manual fallback only)
- Vercel config:
  - `/Users/homare/Documents/Trends-/vercel.json`
- Deployment guide:
  - `/Users/homare/Documents/Trends-/DEPLOY.md`
- Launch checklist:
  - `/Users/homare/Documents/Trends-/LAUNCH_CHECKLIST.md`
- Supabase checklist:
  - `/Users/homare/Documents/Trends-/SUPABASE_CHECKLIST.md`
- Security notes:
  - `/Users/homare/Documents/Trends-/SECURITY.md`

## Node version

This repo is pinned to Node 22 with:

- `/Users/homare/Documents/Trends-/.nvmrc`
- `package.json > engines.node`
