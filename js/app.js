/* Techlysis — application orchestrator. Wires header, chart, report, toggles,
 * settings, auth, journal and data fetching together. No build step.
 */
'use strict';

window.TL = window.TL || {};

TL.app = (function () {

  var currentAnalysis = null;
  var currentTrade = null;
  var currentData = null;

  var OVERLAY_LABELS = [
    ['candles', 'Candles'], ['volume', 'Volume'],
    ['ema9', 'EMA9'], ['ema21', 'EMA21'], ['ema50', 'EMA50'], ['ema200', 'EMA200'],
    ['sma20', 'SMA20'], ['bb', 'Bollinger'], ['vwap', 'VWAP'], ['pivots', 'Pivots'],
    ['swings', 'Swings'], ['structure', 'Structure'], ['bos', 'BOS'], ['sr', 'S/R'],
    ['supply', 'Supply'], ['demand', 'Demand'], ['fvg', 'FVG'], ['orderBlocks', 'Order blocks'],
    ['vp', 'Vol profile'], ['fib', 'Fibonacci'], ['tradeLevels', 'Trade levels']
  ];

  /* ---------------- status & badges ---------------- */
  function setStatus(state, text) {
    var dot = document.getElementById('status-dot');
    var label = document.getElementById('status-text');
    dot.className = 'dot ' + state;
    label.textContent = text;
  }

  function sourceBadgeClass(source) {
    switch (source) {
      case 'Binance': return 'badge-binance';
      case 'Twelve Data': return 'badge-twelve';
      case 'Yahoo': return 'badge-yahoo';
      case 'Stooq': return 'badge-stooq';
      case 'CoinGecko': return 'badge-cg';
      default: return 'badge-demo';
    }
  }

  function updateSourceBadge(data) {
    var el = document.getElementById('source-badge');
    el.textContent = data.source;
    el.className = 'badge ' + sourceBadgeClass(data.source);
    el.title = data.detail || data.source;
    document.getElementById('bars-count').textContent = data.count + ' bars';
  }

  function updateEnvBadges() {
    var t = document.getElementById('badge-twelve');
    if (TL.env.env.hasTwelveData) { t.className = 'badge badge-twelve on'; t.textContent = '12D ✓'; }
    else { t.className = 'badge badge-off'; t.textContent = '12D off'; }

    var s = document.getElementById('badge-supabase');
    var signed = TL.supabase.signedIn();
    if (TL.env.env.hasSupabase) {
      s.className = 'badge badge-supabase ' + (signed ? 'on' : '');
      s.textContent = signed ? 'Supabase ✓' : 'Supabase · guest';
    } else {
      s.className = 'badge badge-off';
      s.textContent = 'Supabase off';
    }
    document.getElementById('auth-status').textContent = signed ? TL.supabase.userEmail() : 'guest';
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    var holder = document.getElementById('toast-holder');
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    holder.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2600);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
  }
  TL.toast = toast;

  /* ---------------- header controls ---------------- */
  function buildSelect(id, options, selected) {
    var el = document.getElementById(id);
    el.innerHTML = options.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === selected ? ' selected' : '') + '>' + TL.utils.esc(o[1]) + '</option>';
    }).join('');
    return el;
  }

  function wireHeader() {
    var s = TL.store.get();
    buildSelect('sel-asset', TL.ASSET_KEYS.map(function (k) { return [k, TL.ASSETS[k].name + ' · ' + k]; }), s.asset);
    buildSelect('sel-tf', TL.TF_KEYS.map(function (t) { return [t, t]; }), s.timeframe);
    buildSelect('sel-bars', TL.BAR_COUNTS.map(function (b) { return [String(b), b + ' bars']; }), String(s.barCount));

    document.getElementById('sel-asset').addEventListener('change', function () {
      TL.store.update({ asset: this.value });
      TL.events.emit('asset-changed');
    });
    document.getElementById('sel-tf').addEventListener('change', function () {
      TL.store.update({ timeframe: this.value });
      TL.events.emit('asset-changed');
    });
    document.getElementById('sel-bars').addEventListener('change', function () {
      TL.store.update({ barCount: parseInt(this.value, 10) });
      TL.events.emit('asset-changed');
    });

    document.getElementById('btn-analyze').addEventListener('click', function () { analyze(); });
    document.getElementById('btn-refresh').addEventListener('click', function () { analyze(); });
  }

  /* ---------------- overlay toggles ---------------- */
  function wireOverlays() {
    var holder = document.getElementById('overlay-toggles');
    holder.innerHTML = OVERLAY_LABELS.map(function (pair) {
      var key = pair[0], label = pair[1];
      return '<label class="toggle"><input type="checkbox" data-key="' + key + '"' +
        (TL.store.get().overlays[key] ? ' checked' : '') + '><span>' + label + '</span></label>';
    }).join('');
    holder.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('change', function () {
        var key = this.getAttribute('data-key');
        TL.store.setPath('overlays.' + key, this.checked);
        if (key === 'tradeLevels') applyTradeOverlay();
        TL.chart.redraw();
        if (TL.supabase.signedIn()) TL.supabase.pushSettings(TL.store.get());
      });
    });

    // indicator subchart selector
    var ind = document.getElementById('sel-indicator');
    ind.value = TL.store.get().indicator || 'RSI';
    ind.addEventListener('change', function () {
      TL.store.update({ indicator: this.value });
      TL.chart.setIndicator(this.value);
    });

    // trade overlay selector
    var tp = document.getElementById('sel-trade-overlay');
    tp.value = TL.store.getPath('tradeOverlay', 'off');
    tp.addEventListener('change', function () {
      TL.store.update({ tradeOverlay: this.value });
      applyTradeOverlay();
    });
    applyTradeOverlay();
  }

  function applyTradeOverlay() {
    var mode = TL.store.getPath('tradeOverlay', 'off');
    var enabled = TL.store.get().overlays.tradeLevels !== false;
    var plan = null, show = false;
    if (currentTrade && enabled) {
      if (mode === 'long') { plan = currentTrade.long; show = true; }
      else if (mode === 'short') { plan = currentTrade.short; show = true; }
    }
    TL.chart.setTradePlan(plan, show);
  }

  /* ---------------- chart buttons ---------------- */
  function wireChartButtons() {
    document.getElementById('btn-pan-left').addEventListener('click', function () { TL.chart.panBars(-(TL.store.get().tools.chart.scrollSpeed || 2) * 2); });
    document.getElementById('btn-pan-right').addEventListener('click', function () { TL.chart.panBars((TL.store.get().tools.chart.scrollSpeed || 2) * 2); });
    document.getElementById('btn-zoom-in').addEventListener('click', function () { TL.chart.zoomIn(); });
    document.getElementById('btn-zoom-out').addEventListener('click', function () { TL.chart.zoomOut(); });
    document.getElementById('btn-fit').addEventListener('click', function () { TL.chart.fit(); });
    document.getElementById('btn-11').addEventListener('click', function () { TL.chart.oneToOne(); });
  }

  /* ---------------- report tabs ---------------- */
  function wireTabs() {
    var tabs = document.querySelectorAll('#report-tabs .rtab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('#report-tabs .rtab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var name = tab.getAttribute('data-tab');
        document.querySelectorAll('.report-pane').forEach(function (p) {
          p.classList.toggle('active', p.id === 'tab-' + name);
        });
      });
    });

    document.getElementById('btn-copy-report').addEventListener('click', function () {
      var pane = document.querySelector('.report-pane.active');
      var text = pane ? pane.innerText : '';
      TL.utils.copyToClipboard(text).then(function () { toast('Report copied to clipboard'); });
    });
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
  }

  /* ---------------- journal ---------------- */
  function saveJournalEntry(direction) {
    if (!currentAnalysis || !currentTrade) return;
    var plan = direction === 'long' ? currentTrade.long : currentTrade.short;
    var entry = {
      time: new Date().toISOString(),
      asset: currentAnalysis.asset,
      timeframe: currentAnalysis.timeframe,
      direction: direction,
      entry: plan.entry,
      stop: plan.sl,
      targets: [plan.tp1 && plan.tp1.price, plan.tp2 && plan.tp2.price, plan.tp3 && plan.tp3.price],
      rr: plan.rr,
      planText: TL.report.planText(currentAnalysis, currentTrade),
      notes: ''
    };
    var journal = TL.store.get().journal || [];
    journal.unshift(entry);
    journal = journal.slice(0, 200);
    TL.store.update({ journal: journal });
    if (TL.supabase.signedIn()) {
      TL.supabase.pushJournalEntry(entry).then(function () { toast('Journal saved + synced'); }).catch(function () { toast('Journal saved locally'); });
    } else {
      toast('Journal saved locally');
    }
  }

  function openJournal() {
    var modal = document.getElementById('journal-modal');
    var list = document.getElementById('journal-list');
    var journal = TL.store.get().journal || [];
    if (!journal.length) {
      list.innerHTML = '<p class="muted">No journal entries yet. Use “Save to journal” on the Trade Entry tab.</p>';
    } else {
      list.innerHTML = journal.map(function (e, i) {
        return '<div class="jr-entry"><div class="jr-head">' +
          '<span class="pill ' + (e.direction === 'long' ? 'bull' : 'bear') + '">' + TL.utils.esc(e.direction.toUpperCase()) + '</span>' +
          '<b>' + TL.utils.esc(e.asset) + ' · ' + TL.utils.esc(e.timeframe) + '</b>' +
          '<span class="muted">' + TL.utils.fmtTime(new Date(e.time).getTime(), '1h') + '</span>' +
          '</div><div class="jr-row">Entry ' + TL.utils.fmtPrice(e.entry, e.asset) + ' · SL ' + TL.utils.fmtPrice(e.stop, e.asset) + ' · RR ' + Number(e.rr).toFixed(2) + '</div>' +
          '<button class="btn btn-sm jr-del" data-i="' + i + '">Delete</button></div>';
      }).join('');
      list.querySelectorAll('.jr-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = parseInt(this.getAttribute('data-i'), 10);
          var j = TL.store.get().journal || [];
          j.splice(idx, 1);
          TL.store.update({ journal: j });
          openJournal();
        });
      });
    }
    modal.classList.add('open');
  }

  function wireJournal() {
    document.getElementById('btn-journal').addEventListener('click', openJournal);
    document.getElementById('journal-close').addEventListener('click', function () {
      document.getElementById('journal-modal').classList.remove('open');
    });
    document.getElementById('journal-clear').addEventListener('click', function () {
      TL.store.update({ journal: [] });
      openJournal();
    });
    document.getElementById('btn-pull-journal').addEventListener('click', function () {
      if (!TL.supabase.signedIn()) { toast('Sign in to sync journal'); return; }
      TL.supabase.pullJournal().then(function (res) {
        if (res.data && res.data.length) {
          var local = TL.store.get().journal || [];
          var cloud = res.data.map(function (r) {
            return {
              time: r.created_at, asset: r.asset, timeframe: r.timeframe,
              direction: r.direction, entry: r.entry_price, stop: r.stop_price,
              targets: r.targets, rr: r.rr, planText: r.plan_text, notes: r.notes
            };
          });
          // de-dupe by content (cloud created_at differs from the local save time)
          var seen = {};
          function keyOf(e) {
            return [e.asset, e.timeframe, e.direction, Number(e.entry), Number(e.stop)].join('|');
          }
          var merged = [];
          cloud.concat(local).forEach(function (e) {
            var k = keyOf(e);
            if (seen[k]) return;
            seen[k] = true;
            merged.push(e);
          });
          TL.store.update({ journal: merged.slice(0, 200) });
          openJournal();
          toast('Journal pulled from cloud');
        } else toast('No cloud journal rows');
      }).catch(function (e) { toast('Pull failed: ' + (e.message || e)); });
    });
    // delegate plan buttons
    document.getElementById('report-content').addEventListener('click', function (e) {
      if (e.target && e.target.id === 'btn-copy-plan') {
        TL.utils.copyToClipboard(TL.report.planText(currentAnalysis, currentTrade)).then(function () { toast('Plan text copied'); });
      }
      if (e.target && e.target.id === 'btn-save-journal') {
        if (!currentTrade || !currentTrade.long || !currentTrade.short) { toast('Run an analysis first', 'warn'); return; }
        saveJournalEntry(currentTrade.long.rr >= currentTrade.short.rr ? 'long' : 'short');
      }
    });
  }

  /* ---------------- auth ---------------- */
  function openAuth() {
    document.getElementById('auth-modal').classList.add('open');
    updateAuthUI();
  }

  function updateAuthUI() {
    var signed = TL.supabase.signedIn();
    document.getElementById('auth-form').style.display = signed ? 'none' : 'block';
    document.getElementById('auth-signed').style.display = signed ? 'block' : 'none';
    if (signed) {
      document.getElementById('auth-email').textContent = TL.supabase.userEmail();
    }
    updateEnvBadges();
  }

  function wireAuth() {
    document.getElementById('auth-status').addEventListener('click', openAuth);
    document.getElementById('auth-close').addEventListener('click', function () {
      document.getElementById('auth-modal').classList.remove('open');
    });
    document.getElementById('auth-signin').addEventListener('click', function () {
      var email = document.getElementById('auth-email-input').value.trim();
      var pass = document.getElementById('auth-pass-input').value;
      if (!email || !pass) { toast('Enter email and password'); return; }
      TL.supabase.signIn(email, pass).then(function (res) {
        if (res.error) { toast('Sign in failed: ' + res.error.message); return; }
        toast('Signed in');
        updateAuthUI();
        pullCloudSettings();
      }).catch(function (e) { toast('Sign in failed: ' + (e.message || e)); });
    });
    document.getElementById('auth-signup').addEventListener('click', function () {
      var email = document.getElementById('auth-email-input').value.trim();
      var pass = document.getElementById('auth-pass-input').value;
      if (!email || !pass) { toast('Enter email and password'); return; }
      if (pass.length < 6) { toast('Password must be ≥ 6 characters'); return; }
      TL.supabase.signUp(email, pass).then(function (res) {
        if (res.error) { toast('Sign up failed: ' + res.error.message); return; }
        toast('Sign up OK — check your email to confirm, then sign in');
      }).catch(function (e) { toast('Sign up failed: ' + (e.message || e)); });
    });
    document.getElementById('auth-signout').addEventListener('click', function () {
      TL.supabase.signOut().then(function () { toast('Signed out'); updateAuthUI(); });
    });
    TL.supabase.onAuthChange(function () { updateAuthUI(); if (TL.supabase.signedIn()) pullCloudSettings(); });
  }

  function pullCloudSettings() {
    TL.supabase.pullSettings().then(function (res) {
      if (res.data && res.data.settings) {
        var remote = res.data.settings;
        // merge remote over local for a subset of keys (only defined values)
        var patch = {};
        ['overlays', 'tools', 'risk'].forEach(function (k) {
          if (remote[k] && typeof remote[k] === 'object') patch[k] = remote[k];
        });
        if (TL.ASSET_KEYS.indexOf(remote.asset) >= 0) patch.asset = remote.asset;
        if (TL.TF_KEYS.indexOf(remote.timeframe) >= 0) patch.timeframe = remote.timeframe;
        if (remote.barCount && TL.BAR_COUNTS.indexOf(remote.barCount) >= 0) patch.barCount = remote.barCount;
        TL.store.update(patch);
        syncUIFromSettings();
        toast('Cloud settings pulled');
      }
    }).catch(function () { /* ignore */ });
  }

  /* ---------------- analysis pipeline ---------------- */
  var analyzeSeq = 0; // guards against out-of-order results when the user
                      // switches asset/timeframe while a fetch is in flight

  async function analyze() {
    var seq = ++analyzeSeq;
    var s = TL.store.get();
    var asset = s.asset, tf = s.timeframe, count = s.barCount;
    setStatus('loading', 'Fetching ' + asset + ' ' + tf + '…');

    var data;
    try {
      data = await TL.data.fetch(asset, tf, count);
    } catch (e) {
      if (seq !== analyzeSeq) return;
      setStatus('error', 'Data error');
      toast('Data fetch failed: ' + (e.message || e));
      return;
    }
    if (seq !== analyzeSeq) return; // a newer request superseded this one

    updateSourceBadge(data);
    if (data.synthetic) {
      toast('Live sources unavailable — using synthetic demo data', 'warn');
    } else if (data.errors && data.errors.length) {
      toast('Fell back after ' + data.errors.length + ' source error(s)', 'warn');
    }

    var analysis = TL.analysis.run(asset, tf, data.bars, s.tools, data);
    var trade = TL.trade.analyze(analysis, s.tools, s.risk);
    currentAnalysis = analysis;
    currentTrade = trade;
    currentData = data;

    TL.chart.setData(data.bars, asset, tf);
    TL.chart.setAnalysis(analysis);
    applyTradeOverlay();
    TL.report.renderAll(analysis, trade);

    setStatus(data.synthetic ? 'demo' : 'ok', data.synthetic ? 'Demo data' : 'Ready · ' + data.source);
    updateEnvBadges();

    // optional lightweight cloud snapshot when signed in
    if (TL.supabase.signedIn()) {
      var st2 = TL.store.get();
      TL.supabase.saveAnalysisSnapshot(asset, tf, {
        price: analysis.price,
        bias: analysis.bias.score,
        biasLabel: analysis.biasLabel,
        decision: trade.decision.banner,
        source: data.source
      }).then(function () {
        TL.supabase.pushSettings({
          asset: st2.asset, timeframe: st2.timeframe, barCount: st2.barCount,
          overlays: st2.overlays, tools: st2.tools, risk: st2.risk
        });
      }).catch(function () {});
    }
  }

  /* ---------------- UI sync ---------------- */
  function syncUIFromSettings() {
    var st = TL.store.get();
    document.getElementById('sel-asset').value = st.asset;
    document.getElementById('sel-tf').value = st.timeframe;
    document.getElementById('sel-bars').value = String(st.barCount);
    document.getElementById('sel-indicator').value = st.indicator || 'RSI';
    document.getElementById('sel-trade-overlay').value = TL.store.getPath('tradeOverlay', 'off');
    document.querySelectorAll('#overlay-toggles input').forEach(function (input) {
      input.checked = !!st.overlays[input.getAttribute('data-key')];
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    TL.store.load();
    TL.store.syncKeysFromEnv();
    TL.supabase.init();

    wireHeader();
    wireOverlays();
    wireChartButtons();
    wireTabs();
    wireJournal();
    wireAuth();
    TL.settingsPanel.init();

    TL.chart.init({
      container: document.getElementById('chart-container'),
      canvas: document.getElementById('chart-canvas'),
      legendEl: document.getElementById('chart-legend'),
      tooltipEl: document.getElementById('chart-tooltip')
    });

    TL.events.on('asset-changed', function () {
      // persist last asset/tf to cloud
      if (TL.supabase.signedIn()) {
        var st3 = TL.store.get();
        TL.supabase.pushSettings({
          asset: st3.asset, timeframe: st3.timeframe, barCount: st3.barCount,
          overlays: st3.overlays, tools: st3.tools, risk: st3.risk
        });
      }
      analyze();
    });
    TL.events.on('tools-applied', function () {
      syncUIFromSettings(); // keep header selects & toggles in sync after resets/edits
      if (currentData) analyze();
    });
    TL.events.on('keys-updated', updateEnvBadges);
    TL.events.on('auth-changed', updateEnvBadges);

    updateEnvBadges();
    setStatus('idle', 'Press Analyze');

    var verEl = document.getElementById('footer-version');
    if (verEl) verEl.textContent = TL.VERSION;

    analyze();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    analyze: analyze,
    getAnalysis: function () { return currentAnalysis; },
    getTrade: function () { return currentTrade; },
    getData: function () { return currentData; }
  };
})();
