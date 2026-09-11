/* Techlysis — ⚙ Settings slide-over panel (Keys | Tools | Account | Help).
 * Schema-driven so every tool option is declared once and rendered + bound.
 */
'use strict';

window.TL = window.TL || {};

TL.settingsPanel = (function () {

  var TOOLS_SCHEMA = [
    { section: 'Fibonacci', fields: [
      { path: 'tools.fib.showRet', label: 'Show retracements', type: 'checkbox' },
      { path: 'tools.fib.showExt', label: 'Show extensions', type: 'checkbox' },
      { path: 'tools.fib.ratios', label: 'Retracement ratios (csv)', type: 'text' },
      { path: 'tools.fib.extRatios', label: 'Extension ratios (csv)', type: 'text' }
    ]},
    { section: 'Chart', fields: [
      { path: 'tools.chart.defaultBars', label: 'Default visible bars', type: 'number', min: 20, max: 500 },
      { path: 'tools.chart.scrollSpeed', label: 'Scroll speed (bars/step)', type: 'number', min: 1, max: 50, step: 1 },
      { path: 'tools.chart.zoomSpeed', label: 'Zoom speed', type: 'number', min: 1.05, max: 3, step: 0.05 },
      { path: 'tools.chart.candleGap', label: 'Candle gap', type: 'number', min: 0, max: 0.5, step: 0.05 }
    ]},
    { section: 'Volume profile', fields: [
      { path: 'tools.vp.bins', label: 'Bins', type: 'number', min: 10, max: 200, step: 1 },
      { path: 'tools.vp.valueArea', label: 'Value-area %', type: 'number', min: 0.5, max: 0.9, step: 0.05 },
      { path: 'tools.vp.width', label: 'Profile width (px)', type: 'number', min: 20, max: 120, step: 5 }
    ]},
    { section: 'Swings & FVG', fields: [
      { path: 'tools.swings.strength', label: 'Swing strength', type: 'number', min: 1, max: 10, step: 1 },
      { path: 'tools.fvg.lookback', label: 'FVG lookback (bars)', type: 'number', min: 3, max: 60, step: 1 }
    ]},
    { section: 'Bollinger & RSI', fields: [
      { path: 'tools.bb.period', label: 'BB period', type: 'number', min: 5, max: 100, step: 1 },
      { path: 'tools.bb.mult', label: 'BB multiplier', type: 'number', min: 0.5, max: 5, step: 0.1 },
      { path: 'tools.rsi.period', label: 'RSI period', type: 'number', min: 2, max: 100, step: 1 },
      { path: 'tools.rsi.ob', label: 'RSI overbought', type: 'number', min: 50, max: 95, step: 1 },
      { path: 'tools.rsi.os', label: 'RSI oversold', type: 'number', min: 5, max: 50, step: 1 }
    ]},
    { section: 'Trade plan', fields: [
      { path: 'tools.trade.riskFill', label: 'Default entry fill', type: 'select', options: [['market', 'Market'], ['limit', 'Limit at nearest level']] },
      { path: 'tools.trade.showTP2', label: 'Show TP2', type: 'checkbox' },
      { path: 'tools.trade.showTP3', label: 'Show TP3', type: 'checkbox' }
    ]}
  ];

  var ACCOUNT_SCHEMA = [
    { path: 'risk.account', label: 'Account size ($)', type: 'number', min: 0, step: 100 },
    { path: 'risk.riskPct', label: 'Risk per trade (%)', type: 'number', min: 0.1, max: 10, step: 0.1 },
    { path: 'risk.slAtrMult', label: 'SL × ATR multiplier', type: 'number', min: 0.5, max: 5, step: 0.1 },
    { path: 'risk.tpRR', label: 'TP R-multiples (csv)', type: 'text' }
  ];

  var currentTab = 'keys';

  function open(tab) {
    currentTab = tab || currentTab || 'keys';
    document.getElementById('settings-overlay').classList.add('open');
    activateTab(currentTab);
  }

  function close() {
    document.getElementById('settings-overlay').classList.remove('open');
  }

  function activateTab(name) {
    currentTab = name;
    var tabs = document.querySelectorAll('#settings-tabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === name);
    }
    var panes = document.querySelectorAll('#settings-panes .pane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle('active', panes[j].getAttribute('data-pane') === name);
    }
  }

  /* ---------- form helpers ---------- */
  function renderSchema(schema, targetEl) {
    var html = '';
    for (var s = 0; s < schema.length; s++) {
      html += '<div class="st-section">' + TL.utils.esc(schema[s].section) + '</div>';
      for (var f = 0; f < schema[s].fields.length; f++) {
        var field = schema[s].fields[f];
        var val = TL.store.getPath(field.path, '');
        html += '<div class="st-field"><label for="st-' + field.path.replace(/\./g, '_') + '">' + TL.utils.esc(field.label) + '</label>';
        if (field.type === 'checkbox') {
          html += '<input type="checkbox" id="st-' + field.path.replace(/\./g, '_') + '" data-path="' + field.path + '" data-type="checkbox"' + (val ? ' checked' : '') + '>';
        } else if (field.type === 'select') {
          html += '<select id="st-' + field.path.replace(/\./g, '_') + '" data-path="' + field.path + '" data-type="select">';
          for (var o = 0; o < field.options.length; o++) {
            html += '<option value="' + field.options[o][0] + '"' + (val === field.options[o][0] ? ' selected' : '') + '>' + TL.utils.esc(field.options[o][1]) + '</option>';
          }
          html += '</select>';
        } else {
          var attrs = '';
          if (field.min != null) attrs += ' min="' + field.min + '"';
          if (field.max != null) attrs += ' max="' + field.max + '"';
          if (field.step != null) attrs += ' step="' + field.step + '"';
          html += '<input type="' + (field.type === 'number' ? 'number' : 'text') + '" id="st-' + field.path.replace(/\./g, '_') + '" data-path="' + field.path + '" data-type="' + field.type + '" value="' + TL.utils.esc(String(val)) + '"' + attrs + '>';
        }
        html += '</div>';
      }
    }
    targetEl.innerHTML = html;
  }

  function readSchema(schema) {
    var patch = {};
    for (var s = 0; s < schema.length; s++) {
      for (var f = 0; f < schema[s].fields.length; f++) {
        var field = schema[s].fields[f];
        var input = document.getElementById('st-' + field.path.replace(/\./g, '_'));
        if (!input) continue;
        var val;
        if (field.type === 'checkbox') val = input.checked;
        else if (field.type === 'select') val = input.value;
        else if (field.type === 'number') val = parseFloat(input.value);
        else val = input.value;
        if (isNaN(val) && field.type === 'number') val = TL.store.getPath(field.path, 0);
        setPath(patch, field.path, val);
      }
    }
    return patch;
  }

  function setPath(obj, path, val) {
    var parts = path.split('.');
    var node = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = val;
  }

  /* ---------- keys tab ---------- */
  function renderKeys() {
    var s = TL.store.get();
    document.getElementById('keys-tools').innerHTML =
      '<div class="st-field"><label for="key-twelve">Twelve Data API key</label>' +
      '<input type="text" id="key-twelve" placeholder="api key (primary FX/commodities source)" value="' + TL.utils.esc(s.keys.twelveDataKey) + '"></div>' +
      '<div class="st-field"><label for="key-supabase-url">Supabase URL</label>' +
      '<input type="text" id="key-supabase-url" placeholder="https://xxx.supabase.co" value="' + TL.utils.esc(s.keys.supabaseUrl) + '"></div>' +
      '<div class="st-field"><label for="key-supabase-anon">Supabase anon key</label>' +
      '<input type="text" id="key-supabase-anon" placeholder="anon (public) key" value="' + TL.utils.esc(s.keys.supabaseAnonKey) + '"></div>' +
      '<p class="st-note">Keys are stored ONLY in this browser (localStorage) unless you deploy via GitHub Actions, which injects secrets into js/env.runtime.js. Never paste a Supabase <code>service_role</code> key anywhere.</p>';
  }

  function saveKeys() {
    var twelve = document.getElementById('key-twelve').value.trim();
    var url = document.getElementById('key-supabase-url').value.trim();
    var anon = document.getElementById('key-supabase-anon').value.trim();
    TL.env.setLocal('tl.twelveDataKey', twelve);
    TL.env.setLocal('tl.supabaseUrl', url);
    TL.env.setLocal('tl.supabaseAnonKey', anon);
    TL.store.update({ keys: { twelveDataKey: twelve, supabaseUrl: url, supabaseAnonKey: anon } });
    TL.supabase.init();
    TL.events.emit('keys-updated');
  }

  /* ---------- account tab ---------- */
  function renderAccount() {
    var s = TL.store.get();
    var tpRR = Array.isArray(s.risk.tpRR) ? s.risk.tpRR.join(',') : s.risk.tpRR;
    document.getElementById('account-tools').innerHTML =
      '<div class="st-field"><label for="acc-account">Account size ($)</label><input type="number" id="acc-account" min="0" step="100" value="' + s.risk.account + '"></div>' +
      '<div class="st-field"><label for="acc-risk">Risk per trade (%)</label><input type="number" id="acc-risk" min="0.1" max="10" step="0.1" value="' + s.risk.riskPct + '"></div>' +
      '<div class="st-field"><label for="acc-sl">SL × ATR multiplier</label><input type="number" id="acc-sl" min="0.5" max="5" step="0.1" value="' + s.risk.slAtrMult + '"></div>' +
      '<div class="st-field"><label for="acc-tprr">TP R-multiples (csv)</label><input type="text" id="acc-tprr" value="' + TL.utils.esc(String(tpRR)) + '"></div>';
  }

  function saveAccount() {
    var tpRR = document.getElementById('acc-tprr').value.split(',').map(function (x) { return parseFloat(x.trim()); }).filter(function (n) { return isFinite(n) && n > 0; });
    if (!tpRR.length) tpRR = [2, 3, 5];
    TL.store.update({
      risk: {
        account: parseFloat(document.getElementById('acc-account').value) || 0,
        riskPct: parseFloat(document.getElementById('acc-risk').value) || 1,
        slAtrMult: parseFloat(document.getElementById('acc-sl').value) || 1.5,
        tpRR: tpRR
      }
    });
  }

  /* ---------- help tab ---------- */
  function renderHelp() {
    document.getElementById('help-content').innerHTML =
      '<h4>Running locally</h4><p>Open <code>index.html</code> directly, or serve the folder: <code>python3 -m http.server</code> then visit <code>http://localhost:8000</code>.</p>' +
      '<h4>Data sources</h4><p>FX &amp; commodities cascade: Twelve Data (key) → Yahoo → Stooq → synthetic demo. Crypto: Binance → Twelve Data → Yahoo → CoinGecko → synthetic demo. The badge shows the active source.</p>' +
      '<h4>Keys &amp; Supabase</h4><p>Set keys in the <b>Keys</b> tab for local testing. Cloud sync (settings + journal) needs a Supabase project — see <code>SETUP_KEYS.md</code> and run <code>SUPABASE_SCHEMA.sql</code> in the SQL editor.</p>' +
      '<h4>Shortcuts</h4><p>Drag = pan · wheel = zoom · Shift+wheel = scroll · arrows = pan · +/- = zoom · double-click = fit all · <b>Fit</b> / <b>1:1</b> buttons.</p>' +
      '<div class="disclaimer">' + TL.utils.esc(TL.DISCLAIMER) + '</div>' +
      '<p class="st-note">Techlysis v' + TL.VERSION + ' — pure HTML/CSS/JS, no build step.</p>';
  }

  /* ---------- lifecycle ---------- */
  function renderAll() {
    renderKeys();
    renderSchema(TOOLS_SCHEMA, document.getElementById('tools-tools'));
    renderAccount();
    renderHelp();
  }

  function applyTools() {
    var patch = readSchema(TOOLS_SCHEMA);
    TL.store.update(patch);
    TL.events.emit('tools-applied');
    TL.toast && TL.toast('Tools applied — analysis re-run');
    if (TL.supabase.signedIn()) TL.supabase.pushSettings(TL.store.get());
  }

  function applyAccount() {
    saveAccount();
    TL.events.emit('tools-applied');
    TL.toast && TL.toast('Account settings saved');
    if (TL.supabase.signedIn()) TL.supabase.pushSettings(TL.store.get());
  }

  function applyKeys() {
    saveKeys();
    TL.toast && TL.toast('Keys saved to this browser');
  }

  function resetDefaults() {
    TL.store.reset();
    TL.store.syncKeysFromEnv();
    renderAll();
    TL.events.emit('tools-applied');
    TL.toast && TL.toast('Settings reset to defaults');
  }

  function init() {
    renderAll();
    var overlay = document.getElementById('settings-overlay');
    document.getElementById('btn-settings').addEventListener('click', function () { open(); });
    document.getElementById('settings-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    var tabs = document.querySelectorAll('#settings-tabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { activateTab(this.getAttribute('data-tab')); });
    }
    document.getElementById('btn-apply-tools').addEventListener('click', applyTools);
    document.getElementById('btn-apply-account').addEventListener('click', applyAccount);
    document.getElementById('btn-apply-keys').addEventListener('click', applyKeys);
    document.getElementById('btn-reset-settings').addEventListener('click', resetDefaults);
  }

  return {
    init: init,
    open: open,
    close: close,
    renderAll: renderAll,
    applyTools: applyTools,
    applyAccount: applyAccount,
    applyKeys: applyKeys
  };
})();
