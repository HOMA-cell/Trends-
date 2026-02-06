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

## 3) Local preview

```bash
cd /Users/homare/Documents/Trends-
python3 -m http.server 8000
```

Open `http://localhost:8000`.
Keep this terminal running while you test.

## 4) If localhost:8000 does not open

1. Check that the server command is still running in a terminal.
2. If not, run `python3 -m http.server 8000` again.
3. If port is busy, run `python3 -m http.server 5173` and open `http://localhost:5173`.

## 5) Supabase safety

- `anon` key is okay in frontend only with proper RLS.
- Never put `service_role` keys in frontend files.
