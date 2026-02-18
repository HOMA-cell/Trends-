# Deploy And Update (Static + Supabase)

This app is static (`index.html` + JS/CSS) and connects to Supabase.
Recommended host: Netlify (auto deploys on every Git push).

## 1) One-time setup

### A. Push this repo to GitHub

```bash
cd /Users/homare/Documents/Trends-
git add .
git commit -m "Initial commit"
git push -u origin main
```

### B. Connect GitHub repo to Netlify

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

After push, Netlify redeploys automatically.

## 3) Verify the internet deploy

1. Open your Netlify URL in a normal browser tab.
2. Confirm the latest UI/feature is visible.
3. If not visible yet, wait 30-90 seconds and reload once.

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
- After deploy, first visit online once to cache the app shell.
- If users report old JS/CSS after an update:
  - First use `アプリを最新化` from Settings.
  - Then hard refresh (`Cmd+Shift+R` on macOS) if still needed.
