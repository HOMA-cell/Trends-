# Deploy And Update (Static + Supabase)

This project is a static app (`index.html` + JS/CSS) backed by Supabase.
Recommended hosting: Netlify (simple and automatic redeploys).

## 1) One-time setup

### A. Put this project on GitHub

```bash
cd /Users/homare/Documents/Trends-
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

### B. Connect GitHub repo to Netlify

1. Open [https://app.netlify.com](https://app.netlify.com)
2. `Add new site` -> `Import an existing project`
3. Choose your GitHub repo
4. Build settings:
   - `Build command`: leave empty
   - `Publish directory`: `.`
5. Click `Deploy site`

Netlify gives you a URL like:
`https://<site-name>.netlify.app`

## 2) How to update the live site

Every time you change local files:

```bash
cd /Users/homare/Documents/Trends-
git add .
git commit -m "Update UI and bug fixes"
git push
```

Netlify auto-deploys from `main` after each push.

## 3) Local test before pushing

```bash
cd /Users/homare/Documents/Trends-
python3 -m http.server 8000
```

Open:
`http://localhost:8000`

## 4) Supabase note

- `anon` key is safe for client-side apps only with correct RLS policies.
- Do not put your Supabase service role key in frontend files.

