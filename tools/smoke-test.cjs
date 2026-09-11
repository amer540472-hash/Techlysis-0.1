/* Techlysis headless smoke test.
 *
 * Loads every js/ file (in index.html order) inside a minimal DOM shim in
 * Node, fires DOMContentLoaded, lets the app run its first analysis on the
 * synthetic-demo fallback (network is stubbed offline), then exercises:
 *   - the full analysis/trade/report pipeline for every asset & timeframe
 *   - aggregated timeframes (3m/4h) bar count + bar spacing
 *   - chart draw paths (all overlays, all subcharts, trade plans, zoom/pan)
 *   - SMC zone freshness (mitigation) semantics
 *   - resample epoch alignment
 *   - trade-plan stop invariants in market AND limit entry modes
 *   - stale-request guard on rapid asset switching
 *   - settings panel flow + UI re-sync after reset
 *   - journal save/list flow
 *
 * Run:  node tools/smoke-test.cjs          (quiet stage logs)
 *       SMOKE_VERBOSE=1 node tools/smoke-test.cjs   (per-stage timing)
 * Exit code 0 = all checks passed.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERBOSE = !!process.env.SMOKE_VERBOSE;
let failures = 0;

function check(name, cond, extra) {
  if (cond) {
    console.log('  ok  - ' + name);
  } else {
    failures++;
    console.log('  FAIL- ' + name + (extra ? '  [' + extra + ']' : ''));
  }
}

/* ----------------------------- DOM shim ----------------------------- */
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 10 });
      return function () { return undefined; };
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}

function makeEl(id) {
  const listeners = {};
  const classSet = new Set();
  const el = {
    id: id || '',
    tagName: 'DIV',
    children: [],
    parentNode: null,
    style: {},
    dataset: {},
    className: '',
    value: '',
    checked: false,
    textContent: '',
    title: '',
    tabIndex: -1,
    _listeners: listeners,
    classList: {
      add(c) { classSet.add(c); },
      remove(c) { classSet.delete(c); },
      contains(c) { return classSet.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !classSet.has(c) : !!force;
        if (on) classSet.add(c); else classSet.delete(c);
        return on;
      }
    },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent() {},
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    setAttribute(k, v) { this[k] = String(v); },
    getAttribute(k) { return this[k] != null ? String(this[k]) : null; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    focus() {},
    click() {},
    getBoundingClientRect() { return { width: 960, height: 540, left: 0, top: 0, right: 960, bottom: 540 }; },
    getContext() { return makeCtx(); },
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', { get() { return html; }, set(v) { html = String(v); } });
  return el;
}

const els = {};
const docListeners = {};
global.document = {
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement(tag) { const e = makeEl(); e.tagName = String(tag).toUpperCase(); return e; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener(name, fn) { (docListeners[name] = docListeners[name] || []).push(fn); },
  body: makeEl('body'),
  documentElement: makeEl('html'),
  execCommand() { return true; }
};

const lsStore = new Map();
global.localStorage = {
  getItem: k => (lsStore.has(String(k)) ? lsStore.get(String(k)) : null),
  setItem: (k, v) => lsStore.set(String(k), String(v)),
  removeItem: k => lsStore.delete(String(k)),
  clear: () => lsStore.clear()
};

const winListeners = {};
global.window = global;
global.self = global;
global.addEventListener = (name, fn) => { (winListeners[name] = winListeners[name] || []).push(fn); };
global.removeEventListener = () => {};
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'node-smoke', clipboard: undefined },
  writable: true, configurable: true
});
global.devicePixelRatio = 1;
global.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 0);
global.cancelAnimationFrame = t => clearTimeout(t);
global.fetch = () => Promise.reject(new Error('offline (smoke test)'));
global.print = () => {};
global.alert = () => {};
global.ResizeObserver = undefined; // chart guards on this
global.HTMLCanvasElement = function () {};

/* ----------------------------- load app ----------------------------- */
const FILES = [
  'config', 'utils', 'env.runtime', 'env', 'settings-store', 'supabase-client',
  'data', 'indicators', 'smc', 'volume-profile', 'fibonacci', 'trade',
  'analysis', 'chart', 'report', 'settings-panel', 'app'
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8');
  try {
    (0, eval)(code);
  } catch (e) {
    console.log('LOAD ERROR in js/' + f + '.js: ' + (e && e.stack || e));
    process.exit(1);
  }
}
check('all modules load', typeof global.TL === 'object' && !!TL.app && !!TL.chart && !!TL.report);

/* ---- optional pipeline instrumentation ---- */
const T0 = Date.now();
function wrap(obj, name, tag) {
  const orig = obj[name];
  obj[name] = function (...args) {
    const t = Date.now() - T0;
    let out;
    try {
      out = orig.apply(this, args);
    } catch (e) {
      if (VERBOSE) console.log(`  [${t}ms] ${tag} THREW: ` + (e && e.message));
      throw e;
    }
    if (out && typeof out.then === 'function') {
      if (VERBOSE) console.log(`  [${t}ms] ${tag} start (async)`);
      return out.then(v => { if (VERBOSE) console.log(`  [${Date.now() - T0}ms] ${tag} resolved`); return v; },
                    e => { console.log(`  [${Date.now() - T0}ms] ${tag} REJECTED: ` + (e && e.message)); throw e; });
    }
    if (VERBOSE) console.log(`  [${t}ms] ${tag} done`);
    return out;
  };
}
wrap(TL.data, 'fetch', 'data.fetch');
wrap(TL.analysis, 'run', 'analysis.run');
wrap(TL.trade, 'analyze', 'trade.analyze');
wrap(TL.report, 'renderAll', 'report.renderAll');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 4000)) {
    let v;
    try { v = fn(); } catch (e) { v = null; console.log('  poll error (' + label + '): ' + e.message); }
    if (v) return v;
    await sleep(25);
  }
  failures++;
  console.log('  FAIL- timeout waiting for: ' + (label || 'condition'));
  return null;
}

/* catch stray errors */
process.on('uncaughtException', e => { failures++; console.log('  FAIL- uncaughtException: ' + (e && e.stack || e)); });
process.on('unhandledRejection', e => { failures++; console.log('  FAIL- unhandledRejection: ' + (e && e.stack || e)); });

/* ------------------------- SMC fixture helpers ------------------------- */
function fixtureBar(bars, i, o, h, l, c, t0) {
  bars.push({ time: t0 + i * 3600000, open: o, high: h, low: l, close: c, volume: 100 });
}

(async function main() {
  /* fire DOMContentLoaded → app init → first analyze() */
  (docListeners['DOMContentLoaded'] || []).forEach(fn => {
    try { fn(); } catch (e) { failures++; console.log('  FAIL- init threw: ' + (e && e.stack || e)); }
  });

  console.log('\n[first analysis — XAUUSD 15m 200 bars]');
  const a1 = await waitFor(() => TL.app.getAnalysis(), 5000, 'first analysis');
  const t1 = TL.app.getTrade();
  const d1 = TL.app.getData();
  check('analysis produced', !!a1);
  check('trade produced', !!t1);
  check('data produced', !!d1);
  if (a1 && t1 && d1) {
    check('synthetic fallback used (offline)', d1.source === 'synthetic-demo', d1.source);
    check('source errors collected', Array.isArray(d1.errors) && d1.errors.length >= 2, JSON.stringify(d1.errors));
    check('bar count matches request', d1.count === 200, 'got ' + d1.count);
    check('bias score in range', Number.isFinite(a1.bias.score) && a1.bias.score >= -100 && a1.bias.score <= 100, String(a1.bias.score));
    check('bias label set', typeof a1.biasLabel === 'string' && a1.biasLabel.length > 0);
    check('narrative written', typeof a1.narrative === 'string' && a1.narrative.length > 50);
    check('key levels built', a1.keyLevels.all.length > 0, String(a1.keyLevels.all.length));
    check('long plan sane (sl < entry)', t1.long.sl < t1.long.entry, 'sl=' + t1.long.sl + ' entry=' + t1.long.entry);
    check('short plan sane (sl > entry)', t1.short.sl > t1.short.entry, 'sl=' + t1.short.sl + ' entry=' + t1.short.entry);
    check('long TP1 above entry', t1.long.tp1 && t1.long.tp1.price > t1.long.entry);
    check('short TP1 below entry', t1.short.tp1 && t1.short.tp1.price < t1.short.entry);
    check('TPs ordered (long)', t1.long.tp1.price <= t1.long.tp2.price && t1.long.tp2.price <= t1.long.tp3.price,
      [t1.long.tp1.price, t1.long.tp2.price, t1.long.tp3.price].join('/'));
    check('position size > 0', t1.long.positionSize > 0, String(t1.long.positionSize));
    check('decision banner set', typeof t1.decision.banner === 'string' && t1.decision.banner.length > 0);
    check('confluence checks exist', t1.confluence.length >= 8, String(t1.confluence.length));
    check('volume profile computed', !!a1.vp && Number.isFinite(a1.vp.poc) && a1.vp.vah >= a1.vp.val);
    check('fib computed', !!a1.fib && a1.fib.ret.length > 0);
    check('ATR finite', Number.isFinite(a1.smc.atr) && a1.smc.atr > 0, String(a1.smc.atr));
    check('RSI in 0..100', a1.indicators.last.rsi == null || (a1.indicators.last.rsi >= 0 && a1.indicators.last.rsi <= 100),
      String(a1.indicators.last.rsi));
  }

  console.log('\n[report rendering]');
  await sleep(60);
  const panes = ['tab-full', 'tab-trade', 'tab-technical', 'tab-smc', 'tab-vp', 'tab-fundamental', 'tab-levels'];
  for (const p of panes) {
    const html = document.getElementById(p).innerHTML;
    check('pane #' + p + ' rendered', typeof html === 'string' && html.length > 200, 'len=' + (html || '').length);
    check('pane #' + p + ' has no "NaN"/"undefined" leak', html.indexOf('NaN') === -1 && html.indexOf('undefined') === -1,
      (html.match(/.{0,40}(NaN|undefined).{0,40}/) || [''])[0]);
  }
  const planTxt = TL.report.planText(a1, t1);
  check('plan text generated', planTxt.length > 400 && planTxt.indexOf('Techlysis trade plan') === 0);
  check('plan text has no NaN', planTxt.indexOf('NaN') === -1, (planTxt.match(/.{0,40}NaN.{0,40}/) || [''])[0]);
  check('checklist spelling fixed', planTxt.indexOf('Inviolation') === -1 && planTxt.indexOf('Invalidation (stop)') !== -1);

  console.log('\n[chart draw paths — all overlays + all subcharts]');
  TL.store.setPath('overlays.pivots', true);
  TL.store.setPath('overlays.bb', true);
  TL.store.setPath('overlays.sma20', true);
  TL.store.setPath('overlays.fib', true);
  let drawErr = null;
  try {
    TL.chart.redraw();
    await sleep(60);
    TL.chart.setIndicator('MACD'); TL.chart.redraw(); await sleep(30);
    TL.chart.setIndicator('STOCH'); TL.chart.redraw(); await sleep(30);
    TL.chart.setIndicator('RSI');
    TL.chart.setTradePlan(t1.long, true); TL.chart.redraw(); await sleep(30);
    TL.chart.setTradePlan(t1.short, true); TL.chart.redraw(); await sleep(30);
    TL.chart.fit(); await sleep(30);
    TL.chart.zoomIn(); TL.chart.zoomOut(); TL.chart.panBars(5); TL.chart.panBars(-5);
    TL.chart.oneToOne(); await sleep(30);
  } catch (e) { drawErr = e; }
  check('chart interactions do not throw', !drawErr, drawErr && drawErr.stack || '');
  const chartState = TL.chart.getState();
  check('chart has bars', chartState.bars.length === 200, String(chartState.bars.length));
  check('legend rendered', document.getElementById('chart-legend').innerHTML.length > 20);
  check('canvas made focusable for keyboard shortcuts', document.getElementById('chart-canvas').getAttribute('tabindex') === '0');

  console.log('\n[timeframe switch — aggregated TFs (4h, 3m) keep full bar count]');
  for (const tf of ['4h', '3m', '1d', '1m', '1h']) {
    TL.store.update({ timeframe: tf });
    TL.events.emit('asset-changed');
    const ok = await waitFor(() => TL.app.getAnalysis() && TL.app.getAnalysis().timeframe === tf, 5000, 'analysis for ' + tf);
    const d = TL.app.getData();
    check(tf + ': analysis rendered', !!ok);
    check(tf + ': full bar count after aggregation', d && d.count === 200, d ? 'got ' + d.count : 'no data');
    check(tf + ': bar spacing matches timeframe', d && d.bars.length > 2 ?
      Math.abs((d.bars[d.bars.length - 1].time - d.bars[d.bars.length - 2].time) - TL.TIMEFRAMES[tf].minutes * 60000) < TL.TIMEFRAMES[tf].minutes * 60000 * 1.5 : false,
      d && d.bars.length > 2 ? 'dt=' + (d.bars[d.bars.length - 1].time - d.bars[d.bars.length - 2].time) / 60000 + 'm expected ' + TL.TIMEFRAMES[tf].minutes + 'm' : '');
  }

  console.log('\n[resample unit — epoch alignment & OHLCV merge]');
  {
    const t0 = Date.UTC(2026, 0, 1, 1, 0, 0); // 01:00 UTC — deliberately misaligned
    const hourly = [];
    for (let i = 0; i < 24; i++) hourly.push({ time: t0 + i * 3600e3, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 });
    const r4 = TL.data.resample(hourly, 4, 3600e3);
    check('resample: times aligned to 4h epochs', r4.every(b => b.time % (4 * 3600e3) === 0), JSON.stringify(r4.map(b => new Date(b.time).toISOString())));
    check('resample: total volume preserved', Math.abs(r4.reduce((s, b) => s + b.volume, 0) - 240) < 1e-6);
    // window 04:00 UTC contains hourly bars at 04,05,06,07 → i = 3,4,5,6 (t0 = 01:00)
    // open = 100+3 = 103, close = 101+6 = 107, high = max(102+i) = 108, low = min(99+i) = 102
    const w = r4.find(b => b.time === Date.UTC(2026, 0, 1, 4, 0, 0));
    check('resample: OHLC merge correct', !!w && w.open === 103 && w.close === 107 && w.high === 108 && w.low === 102,
      w ? JSON.stringify(w) : 'window missing');
    check('resample: window count correct', r4.length === 7, String(r4.length));
  }

  console.log('\n[SMC freshness — mitigation semantics]');
  {
    const t0 = Date.UTC(2026, 0, 5);
    /* Scenario A: demand zone formed at bar1, REVISITED at bar9 → mitigated */
    const A = [];
    fixtureBar(A, 0, 100, 101, 99.8, 100.5, t0);
    fixtureBar(A, 1, 100, 101, 99, 99.5, t0);      // bearish base (zone 99..101)
    fixtureBar(A, 2, 99.5, 103, 99.2, 102.8, t0);  // impulsive rally
    fixtureBar(A, 3, 102.8, 106, 102.5, 105.8, t0);
    fixtureBar(A, 4, 105.8, 109, 105.5, 108.8, t0);
    fixtureBar(A, 5, 108.8, 112, 108.5, 111.8, t0);
    fixtureBar(A, 6, 111.8, 113, 111, 112.5, t0);
    fixtureBar(A, 7, 112.5, 113, 110, 110.5, t0);
    fixtureBar(A, 8, 110.5, 111, 106, 106.5, t0);
    fixtureBar(A, 9, 106.5, 107, 100.2, 100.8, t0); // trades back into 99..101
    fixtureBar(A, 10, 100.8, 105, 100.5, 104.8, t0);
    fixtureBar(A, 11, 104.8, 106, 104.5, 105.5, t0);
    const smcA = TL.smc.compute(A, { swings: { strength: 2 }, fvg: { lookback: 5 } });
    const zA = smcA.demand.find(z => z.bottom <= 99.5 && z.top >= 100.5);
    check('zone detected in fixture A', !!zA, JSON.stringify(smcA.demand));
    check('revisited zone marked MITIGATED (fresh=false)', zA && zA.fresh === false, zA ? 'fresh=' + zA.fresh : 'n/a');

    /* Scenario B: same zone, touched ONLY by the current (last) bar → still fresh */
    const B = [];
    fixtureBar(B, 0, 100, 101, 99.8, 100.5, t0);
    fixtureBar(B, 1, 100, 101, 99, 99.5, t0);
    fixtureBar(B, 2, 99.5, 103, 99.2, 102.8, t0);
    fixtureBar(B, 3, 102.8, 106, 102.5, 105.8, t0);
    fixtureBar(B, 4, 105.8, 109, 105.5, 108.8, t0);
    fixtureBar(B, 5, 108.8, 112, 108.5, 111.8, t0);
    fixtureBar(B, 6, 111.8, 113, 111, 112.5, t0);
    fixtureBar(B, 7, 112.5, 113, 111.5, 112, t0);
    fixtureBar(B, 8, 112, 112.5, 108, 108.5, t0);
    fixtureBar(B, 9, 108.5, 109, 100, 100.8, t0);  // current bar tests the zone
    const smcB = TL.smc.compute(B, { swings: { strength: 2 }, fvg: { lookback: 5 } });
    const zB = smcB.demand.find(z => z.bottom <= 99.5 && z.top >= 100.5);
    check('zone detected in fixture B', !!zB, JSON.stringify(smcB.demand));
    check('zone tested only by current bar stays FRESH', zB && zB.fresh === true, zB ? 'fresh=' + zB.fresh : 'n/a');
  }

  console.log('\n[asset switch — every asset analyzes cleanly, stop invariant holds]');
  for (const asset of ['BTCUSD', 'EURUSD', 'USOIL', 'GBPJPY', 'ETHUSD', 'XAUUSD']) {
    TL.store.update({ asset: asset, timeframe: '1h' });
    TL.events.emit('asset-changed');
    const ok = await waitFor(() => TL.app.getAnalysis() && TL.app.getAnalysis().asset === asset, 5000, 'analysis for ' + asset);
    const tt = TL.app.getTrade();
    const aa = TL.app.getAnalysis();
    check(asset + ': analyzed', !!ok);
    check(asset + ': plans sane', tt && tt.long.sl < tt.long.entry && tt.short.sl > tt.short.entry);
    if (tt && aa) {
      const minD = aa.smc.atr * (TL.store.get().risk.slAtrMult || 1.5) * 0.999;
      check(asset + ': long stop distance ≥ ATR×mult', tt.long.entry - tt.long.sl >= minD,
        'dist=' + (tt.long.entry - tt.long.sl) + ' min=' + minD);
      check(asset + ': short stop distance ≥ ATR×mult', tt.short.sl - tt.short.entry >= minD,
        'dist=' + (tt.short.sl - tt.short.entry) + ' min=' + minD);
    }
    await sleep(40);
  }

  console.log('\n[limit-entry mode — stop invariant still holds]');
  {
    const prev = TL.app.getAnalysis();
    TL.store.setPath('tools.trade.riskFill', 'limit');
    TL.events.emit('asset-changed');
    const ok = await waitFor(() => TL.app.getAnalysis() && TL.app.getAnalysis() !== prev, 5000, 'limit-mode analysis');
    const tt = TL.app.getTrade();
    const aa = TL.app.getAnalysis();
    check('limit mode: analysis produced', !!ok && !!tt);
    if (tt && aa) {
      check('limit mode: entryType valid', ['market', 'limit'].indexOf(tt.long.entryType) !== -1, tt.long.entryType);
      const minD = aa.smc.atr * (TL.store.get().risk.slAtrMult || 1.5) * 0.999;
      check('limit mode: long |entry-sl| ≥ ATR×mult', Math.abs(tt.long.entry - tt.long.sl) >= minD,
        'entry=' + tt.long.entry + ' sl=' + tt.long.sl);
      check('limit mode: short |entry-sl| ≥ ATR×mult', Math.abs(tt.short.entry - tt.short.sl) >= minD,
        'entry=' + tt.short.entry + ' sl=' + tt.short.sl);
      check('limit mode: RR finite', Number.isFinite(tt.long.rr) && Number.isFinite(tt.short.rr));
    }
    TL.store.setPath('tools.trade.riskFill', 'market');
  }

  console.log('\n[rapid switching — stale results discarded]');
  {
    TL.store.update({ asset: 'BTCUSD' }); TL.events.emit('asset-changed');
    TL.store.update({ asset: 'EURUSD' }); TL.events.emit('asset-changed');
    const ok = await waitFor(() => TL.app.getAnalysis() && TL.app.getAnalysis().asset === 'EURUSD', 5000, 'EURUSD final');
    await sleep(150);
    check('settles on last requested asset', !!ok && TL.app.getAnalysis().asset === 'EURUSD',
      TL.app.getAnalysis() && TL.app.getAnalysis().asset);
    check('chart matches final asset', TL.chart.getState().asset === 'EURUSD', TL.chart.getState().asset);
  }

  console.log('\n[settings persistence]');
  check('settings saved to localStorage', lsStore.has('tl.settings.v1'));
  const persisted = JSON.parse(lsStore.get('tl.settings.v1'));
  check('persisted asset matches', persisted.asset === 'EURUSD', persisted.asset);

  console.log('\n[journal save/list flow]');
  let jErr = null;
  try {
    TL.store.update({ asset: 'XAUUSD', timeframe: '15m' });
    TL.events.emit('asset-changed');
    await waitFor(() => {
      const a = TL.app.getAnalysis();
      return a && a.asset === 'XAUUSD' && a.timeframe === '15m';
    }, 5000, 'xau 15m');
    const rc = document.getElementById('report-content');
    const clickL = (rc._listeners['click'] || [])[0];
    clickL({ target: { id: 'btn-save-journal' } });
    const j = TL.store.get().journal;
    check('journal entry saved', j.length === 1, String(j.length));
    check('journal entry has plan text', j[0] && j[0].planText && j[0].planText.length > 100);
    document.getElementById('btn-journal')._listeners['click'][0]();
    check('journal modal opened', document.getElementById('journal-modal').classList.contains('open'));
    document.getElementById('journal-close')._listeners['click'][0]();
    check('journal modal closed', !document.getElementById('journal-modal').classList.contains('open'));
  } catch (e) { jErr = e; }
  check('journal flow does not throw', !jErr, jErr && jErr.stack || '');

  console.log('\n[settings panel apply + UI re-sync]');
  let sErr = null;
  try {
    document.getElementById('btn-settings')._listeners['click'][0]();
    check('settings overlay opens', document.getElementById('settings-overlay').classList.contains('open'));
    check('keys pane rendered', document.getElementById('keys-tools').innerHTML.indexOf('key-twelve') !== -1);
    check('tools pane rendered', document.getElementById('tools-tools').innerHTML.length > 200);
    check('account pane rendered', document.getElementById('account-tools').innerHTML.indexOf('acc-account') !== -1);
    check('help pane rendered', document.getElementById('help-content').innerHTML.length > 200);
    document.getElementById('btn-reset-settings')._listeners['click'][0]();
    await sleep(400);
    check('reset defaults re-runs analysis', !!TL.app.getAnalysis());
    check('header selects re-synced after reset',
      document.getElementById('sel-asset').value === 'XAUUSD' && document.getElementById('sel-tf').value === '15m',
      document.getElementById('sel-asset').value + '/' + document.getElementById('sel-tf').value);
    check('footer version wired to TL.VERSION', document.getElementById('footer-version').textContent === TL.VERSION,
      document.getElementById('footer-version').textContent);
    document.getElementById('settings-close')._listeners['click'][0]();
    check('settings overlay closes', !document.getElementById('settings-overlay').classList.contains('open'));
  } catch (e) { sErr = e; }
  check('settings panel flow does not throw', !sErr, sErr && sErr.stack || '');

  await sleep(150);
  console.log('\n' + (failures === 0 ? 'SMOKE TEST PASSED ✔' : 'SMOKE TEST: ' + failures + ' FAILURE(S) ✘'));
  process.exit(failures === 0 ? 0 : 1);
})();
