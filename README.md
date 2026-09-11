# Techlysis

A **multi-asset market analysis workstation** built with **pure HTML + CSS +
vanilla JavaScript** — no React/Vue, no build step, no bundler. Open
`index.html` or serve the folder, and it works. Hostable on GitHub Pages.

Pick an asset + timeframe → fetch the latest OHLCV → get a full written report
and every concept drawn on an interactive canvas chart. Toggle any overlay on
or off.

> **Educational use only — not financial advice.**

---

## Features

- **Assets:** Gold (XAUUSD), EURUSD, USOIL (WTI), GBPJPY, BTCUSD, ETHUSD
- **Timeframes:** 1m · 3m · 5m · 15m · 30m · 1h · 4h · 1d — bar counts 100/200/300/500
- **Data cascade with a labelled source badge**
  - FX/commodities: Twelve Data (key) → Yahoo → Stooq → synthetic demo
  - Crypto: Binance (no key) → Twelve Data → Yahoo → CoinGecko → synthetic demo
  - Direct fetch first, then public CORS proxies. Never crashes — always shows
    analysis, even offline on demo data.
- **Analysis:** EMA 9/21/50/200, SMA20, Bollinger, VWAP, RSI, MACD, Stochastic,
  ADX, ATR, classic pivots, swings, market structure (HH/HL/LH/LL), BOS, S/R
  clusters, supply/demand zones, FVGs, order blocks, fixed-range volume profile
  (POC/VAH/VAL/HVN/LVN), Fibonacci ret/ext (auto-anchored), plus a composite
  bull/bear bias score with an executive narrative.
- **Trade Entry toolkit:** setup detection (demand bounce, supply reject, OB
  retest, FVG fill, EMA21 pullback, BOS/breakout, VP levels, Fib 50/61.8, RSI
  extremes) ranked by quality + confluence, long AND short plans with
  entry/SL/TP1–3 (R-multiples snapped to levels), position sizing from account
  $ + risk %, A–D confluence checklist, session/liquidity tip, ATR volatility
  regime, pre-trade checklist, and a CONSIDER LONG/SHORT / MARGINAL / WAIT
  decision banner.
- **Chart UX:** canvas pan/zoom (drag, wheel, Shift+wheel, ◀▶ buttons, arrows,
  +/−, double-click fit, Fit/1:1), crosshair + OHLC tooltip + legend, per-layer
  checkboxes, configurable scroll/zoom speed and default bars.
- **Settings panel (⚙):** Keys · Tools · Account · Help. Everything persists to
  localStorage and syncs to Supabase when signed in.
- **Supabase (optional):** email/password auth, cloud sync of settings, journal,
  and lightweight analysis snapshots. **Guest mode needs nothing.**
- **Local journal** (localStorage) + copy-plan-text + print/PDF.

---

## Run locally

No install, no build. Pick either:

```bash
# Option A — just open it
open index.html            # macOS
start index.html           # Windows

# Option B — tiny static server (recommended)
cd Techlysis
python3 -m http.server 8000
# → http://localhost:8000
```

The app runs fine from `file://`; a local server is only recommended because a
few data sources behave better over `http://`.

### Smoke test (optional, zero dependencies)

A headless test harness exercises the full pipeline in Node (data cascade →
indicators → SMC → trade plans → report rendering → chart draw paths, plus
unit checks for resampling and zone-mitigation semantics):

```bash
node tools/smoke-test.cjs            # exit code 0 = all checks passed
SMOKE_VERBOSE=1 node tools/smoke-test.cjs   # with per-stage timing
```

It stubs the network as offline, so it also proves the synthetic-demo
fallback path works end to end.

---

## GitHub Pages

1. Push this repo to GitHub.
2. Repo → **Settings → Pages** → Source = **GitHub Actions**.
3. Add the **3 secrets** (Settings → Secrets and variables → Actions):
   - `TWELVE_DATA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Push to `main` → `.github/workflows/pages.yml` injects the secrets into
   `js/env.runtime.js` and deploys the site.

`.nojekyll` and `404.html` are already included for a clean static deploy.

See **[SETUP_KEYS.md](SETUP_KEYS.md)** for full key/Supabase instructions and
**[HOSTING.md](HOSTING.md)** for other free hosts (Netlify Drop, Cloudflare
Pages, etc.).

---

## Supabase schema

Run **[SUPABASE_SCHEMA.sql](SUPABASE_SCHEMA.sql)** (identical copy at
`supabase/schema.sql`) in the Supabase SQL editor. It creates `profiles`,
`user_settings`, `trade_journal`, `saved_analyses` with row-level security and a
sign-up trigger. **“Success. No rows returned”** means it applied OK.

**Never** commit or inject a Supabase `service_role` key — the frontend uses the
anon key only.

---

## Project structure

```
Techlysis/
├── index.html
├── css/style.css
├── js/
│   ├── config.js          assets, timeframes, defaults, CORS proxies
│   ├── utils.js           formatting, math, seeded PRNG, helpers
│   ├── env.js             env resolution (runtime + localStorage)
│   ├── env.runtime.js     committed EMPTY stub (CI injects secrets here)
│   ├── env.runtime.example.js
│   ├── settings-store.js  localStorage settings + event bus
│   ├── settings-panel.js  ⚙ Settings slide-over
│   ├── supabase-client.js optional Supabase wrapper (CDN UMD)
│   ├── data.js            data cascade + synthetic demo
│   ├── indicators.js      EMA/SMA/RSI/MACD/Stoch/ADX/ATR/VWAP/BB/pivots
│   ├── smc.js             swings, structure, BOS, S/R, zones, FVG, OB
│   ├── volume-profile.js  POC/VAH/VAL/HVN/LVN
│   ├── fibonacci.js       auto-anchored retracements & extensions
│   ├── trade.js           setups, plans, sizing, confluence, decision
│   ├── analysis.js        bias engine + narrative
│   ├── chart.js           pure-canvas interactive chart
│   ├── report.js          report tabs + copyable plan text
│   └── app.js             orchestrator
├── supabase/schema.sql
├── SUPABASE_SCHEMA.sql    duplicate at root (easy to find)
├── tools/smoke-test.cjs   headless end-to-end smoke test (node, no deps)
├── SETUP_KEYS.md
├── .env.example
├── .gitignore
├── .nojekyll
├── 404.html
├── README.md
└── .github/workflows/pages.yml
```

---

## Disclaimer

Techlysis is **educational tooling only** and **not financial advice**. Trading
leveraged assets involves substantial risk of loss. Always do your own research.
