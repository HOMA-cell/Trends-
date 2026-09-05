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
- `npm run e2e:smoke` - desktop and mobile browser smoke tests
- `npm run e2e:authenticated` - two-account production flow when E2E secrets are set
- `npm run backup:create` - encrypted local Supabase logical backup

## Production readiness checklist

1. Run `npm run preflight`
2. Run `npm run security`
3. Run `npm run ci`
4. Confirm `supabase migration list --linked` matches every file in `supabase/migrations`
5. Walk through:
   - sign in
   - create a post
   - comment / like
   - DM
   - open profile / detail / shorts
6. In `Settings > Data tools`, save the real production URL in `Live site URL`
7. Verify `build-meta.json` updates after deploy
8. Run `ライブ版を確認` from inside the app

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
- Production operations and backups:
  - `/Users/homare/Documents/Trends-/OPERATIONS.md`
- Monetization rollout and data boundaries:
  - `MONETIZATION.md`

## Node version

This repo is pinned to Node 22 with:

- `/Users/homare/Documents/Trends-/.nvmrc`
- `package.json > engines.node`
