# Techlysis — keys & Supabase setup

Techlysis is a **pure static** app (HTML + CSS + vanilla JS). It needs **no build
step**, and it works fully in **guest mode** with zero keys (it falls back to a
seeded synthetic demo feed). Keys only upgrade the data source and enable cloud
sync.

---

## 1. Where keys come from

Keys are resolved at runtime in this priority order:

1. `window.__TECHLYSIS_ENV` — set by `js/env.runtime.js`
2. `localStorage` overrides — pasted in **Settings → Keys** (browser only)

The Settings → Keys panel is the easiest way to test locally: paste your key,
hit **Save keys**, and it's stored in your browser's localStorage (never sent to
any server).

---

## 2. Twelve Data (optional, primary FX/commodities source)

1. Sign up at <https://twelvedata.com> and copy your API key.
2. Paste it in **Settings → Keys → Twelve Data API key**, or set
   `TWELVE_DATA_API_KEY` in `js/env.runtime.js` / GitHub Secrets.

Without it, the FX & commodities cascade falls back to Yahoo → Stooq →
synthetic demo. Crypto still uses Binance first (no key needed).

> Note: a front-end key is visible to visitors of a hosted site. Twelve Data
> free plans are rate-limited; for production, consider a proxy.

---

## 3. Supabase (optional, cloud sync)

Cloud sync (settings + journal + saved analyses) needs a Supabase project.

1. Create a project at <https://supabase.com>.
2. In **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
3. In the **SQL Editor**, paste the entire contents of `SUPABASE_SCHEMA.sql`
   (identical copy also at `supabase/schema.sql`) and click **Run**.

   When it finishes you'll see: **“Success. No rows returned.”** — that means
   the schema (tables + RLS + trigger) applied correctly.

4. In **Authentication → Providers → Email**, leave email enabled (the app uses
   email/password sign up / sign in).

### ⚠️ NEVER use the service_role key

The **`service_role`** key bypasses row-level security and has full database
access. It must **never** appear in the frontend, in `env.runtime.js`, on
GitHub Pages, or in any committed file. Techlysis only ever uses the
**anon** key (which is safe for browsers) — RLS keeps each user's data private.

---

## 4. GitHub Pages secrets

For the hosted deployment, add these **3** secrets at
*repo → Settings → Secrets and variables → Actions → New repository secret*:

| Secret               | Value                                          |
|----------------------|------------------------------------------------|
| `TWELVE_DATA_API_KEY`| Your Twelve Data key (or leave blank)          |
| `SUPABASE_URL`       | `https://YOUR-PROJECT.supabase.co`             |
| `SUPABASE_ANON_KEY`  | Your Supabase **anon** (public) key            |

On every push to `main`, `.github/workflows/pages.yml` injects these into
`js/env.runtime.js`, then deploys the site to GitHub Pages.
