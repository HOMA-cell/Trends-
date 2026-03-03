# Deploy And Update (Static + Supabase)

This app is static (`index.html` + JS/CSS) and connects to Supabase.
Primary host: GitHub Pages via GitHub Actions (auto deploys on every push to `main`).
Netlify is still available as an alternative.

## 1) One-time setup

### A. Push this repo to GitHub

```bash
cd /Users/homare/Documents/Trends-
git add .
git commit -m "Initial commit"
git push -u origin main
```

### B. Enable GitHub Pages (recommended)

1. Open your repo on GitHub:
 - `https://github.com/HOMA-cell/Trends-`
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, set:
 - `Source`: `GitHub Actions`
4. The workflow `.github/workflows/deploy-pages.yml` will publish on next push.
5. Expected site URL:
 - `https://homa-cell.github.io/Trends-/`

### C. Optional: Connect GitHub repo to Netlify

1. Open [https://app.netlify.com](https://app.netlify.com)
2. `Add new site` -> `Import an existing project`
3. Choose your GitHub repo (`HOMA-cell/Trends-`)
4. Build settings:
 - `Build command`: (empty)
 - `Publish directory`: `.`
5. Click `Deploy site`

Netlify gives a URL like `https://<site-name>.netlify.app`.

## 2) Daily update flow (local -> internet)

```bash
cd /Users/homare/Documents/Trends-
git add -A
git commit -m "Your update message"
git push origin main
```

After push:
- GitHub Pages deploy runs automatically (`Actions` tab).
- If you also connected Netlify, Netlify redeploys too.

## 3) Verify the internet deploy

1. Open your Pages URL: `https://homa-cell.github.io/Trends-/`
2. Confirm the latest UI/feature is visible.
3. If not visible yet, wait 30-90 seconds and reload once.

If Actions shows:
- `Get Pages site failed` or
- `Pages is not enabled`

Fix once in GitHub:
1. Open `https://github.com/HOMA-cell/Trends-/settings/pages`
2. `Build and deployment` -> `Source` -> `GitHub Actions`
3. Go to `Actions` and click `Re-run jobs`

Alternative:
- Open your Netlify URL if you are using Netlify.
- Confirm the latest UI/feature is visible.
- If not visible yet, wait 30-90 seconds and reload once.

## 4) Local preview

```bash
cd /Users/homare/Documents/Trends-
python3 -m http.server 8000
```

Open `http://localhost:8000`.
Keep this terminal running while you test.

Node.js is now installed, so you can also run:

```bash
cd /Users/homare/Documents/Trends-
npm run dev
```

And run syntax checks with:

```bash
npm run check
```

## 5) If localhost:8000 does not open

1. Check that the server command is still running in a terminal.
2. If not, run `python3 -m http.server 8000` again.
3. If port is busy, run `python3 -m http.server 5173` and open `http://localhost:5173`.

## 6) If users see old JS/CSS after deploy

This app uses a service worker for offline support, so some users may keep an old cache.

1. Open the app.
2. Go to `設定` -> `管理・ツール` -> `データ管理`.
3. Click `アプリを最新化`.
4. The page will reload with the latest files.

If needed, click `キャッシュを削除` first, then `アプリを最新化`.

## 7) Supabase safety

- `anon` key is okay in frontend only with proper RLS.
- Never put `service_role` keys in frontend files.

## 8) Offline/PWA notes

- This project now includes a service worker (`sw.js`) and manifest (`site.webmanifest`).
- GitHub Pages deploy writes `build-meta.json` with commit-based version metadata.
- The app registers the service worker as `sw.js?v=<build-version>` to reduce stale-cache issues.
- After deploy, first visit online once to cache the app shell.
- If users report old JS/CSS after an update:
  - First use `アプリを最新化` from Settings.
  - Then hard refresh (`Cmd+Shift+R` on macOS) if still needed.
