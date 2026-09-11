# HOSTING.md — free static hosts for Techlysis

Techlysis is a static site (HTML/CSS/JS, no build). Any static host works.
Keys are injected at runtime, so you don't need a build step on any of these.

## GitHub Pages (built-in)

Covered in [README.md](README.md): the included `.github/workflows/pages.yml`
injects your secrets and deploys on push to `main`.

## Netlify Drop

1. Go to <https://app.netlify.com/drop>.
2. Drag the **entire project folder** onto the page. Done.

For secrets, either commit `js/env.runtime.js` (not recommended) or just have
users paste keys in **Settings → Keys** (localStorage). Netlify env vars are
build-time only and won't help a pure-static deploy.

## Cloudflare Pages

1. Dashboard → **Workers & Pages → Create → Pages → Upload assets**.
2. Drag the project folder. No build command, output directory = `/`.

Or connect the Git repo: build command empty, output directory `/`.

## Vercel

1. `npx vercel` in the project folder, or import the repo.
2. Framework preset: **Other**; build command empty; output directory `.`.

## Surge

```bash
npx surge . techlysis.surge.sh
```

## Any static file server

The site has no server-side logic — `python3 -m http.server`, `npx serve`,
`busybox httpd`, or an S3/CloudFront bucket all work.

---

### Note on API keys in static hosting

Anything in a static bundle (including `js/env.runtime.js`) is readable by
visitors. That's fine for the Supabase **anon** key (RLS protects data) and
acceptable for free-tier Twelve Data keys. For serious use, proxy those calls
through a tiny serverless function so keys stay secret.
