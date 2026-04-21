# Trends

Static workout-social app powered by Supabase.

## Quick start

```bash
nvm use
npm ci
npm run doctor
npm run check
npm run dev
```

Open:

- `http://127.0.0.1:8000/?fresh=1`

## Day-to-day commands

- `npm run dev` - local preview server
- `npm run doctor` - environment readiness summary
- `npm run check` - syntax checks for app and support scripts
- `npm run lint` - ESLint on app source files
- `npm run ci` - local equivalent of GitHub CI

## Production readiness checklist

1. Run `npm run doctor`
2. Run `npm run ci`
3. Apply the baseline Supabase migration:
   - `/Users/homare/Documents/Trends-/supabase/migrations/20260207_000001_baseline_schema_and_policies.sql`
4. Walk through:
   - sign in
   - create a post
   - comment / like
   - DM
   - open profile / detail / shorts
5. In `Settings > Data tools`, set the live site URL when production is on Vercel or a custom domain
6. Verify `build-meta.json` updates after deploy

## Deploy notes

- CI workflow:
  - `/Users/homare/Documents/Trends-/.github/workflows/ci.yml`
- GitHub Pages workflow:
  - `/Users/homare/Documents/Trends-/.github/workflows/deploy-pages.yml`
- Deployment guide:
  - `/Users/homare/Documents/Trends-/DEPLOY.md`
- Supabase checklist:
  - `/Users/homare/Documents/Trends-/SUPABASE_CHECKLIST.md`

## Node version

This repo is pinned to Node 22 with:

- `/Users/homare/Documents/Trends-/.nvmrc`
- `package.json > engines.node`
