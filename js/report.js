/* Techlysis — report renderer: writes every report tab + copyable plan text. */
'use strict';

window.TL = window.TL || {};

TL.report = (function () {

  var esc = TL.utils.esc;
  var fp = function (v, asset) { return TL.utils.fmtPrice(v, asset); };

  function biasTone(score) {
    if (score > 0) return 'bull';
    if (score < 0) return 'bear';
    return 'neutral';
  }

  function gradeClass(g) {
    return g === 'A' ? 'g-a' : g === 'B' ? 'g-b' : g === 'C' ? 'g-c' : 'g-d';
  }

  /* ---------------- shared pieces ---------------- */
  function headerBlock(analysis) {
    var d = analysis.data || {};
    return '<div class="rp-head">' +
      '<div class="rp-title">' + esc(TL.ASSETS[analysis.asset].name) +
      ' <span class="tk">' + esc(analysis.asset) + '</span> · ' + esc(analysis.timeframe) + '</div>' +
      '<div class="rp-sub">' + esc(d.detail || d.source || '') + ' · ' + esc(String(d.count || 0)) + ' bars · ' +
      'generated ' + TL.utils.fmtTime(new Date(analysis.generatedAt).getTime(), '1h') + '</div>' +
      '</div>';
  }

  function biasCard(analysis, trade) {
    var b = analysis.bias;
    var dec = trade.decision;
    var decCls = dec.tone === 'bull' ? 'dec-long' : dec.tone === 'bear' ? 'dec-short' : 'dec-wait';
    return '<div class="bias-card ' + biasTone(b.score) + '">' +
      '<div class="bias-score">' + (b.score > 0 ? '+' : '') + b.score + '</div>' +
      '<div class="bias-meta">' +
      '<div class="bias-label">' + esc(analysis.biasLabel) + '</div>' +
      '<div class="decision-banner ' + decCls + '">' + esc(dec.banner) + '</div>' +
      '</div>' +
      '<div class="bias-reason">' + esc(dec.reason) + '</div>' +
      '</div>';
  }

  function statGrid(analysis) {
    var l = analysis.indicators.last;
    var smc = analysis.smc;
    var lastStruct = smc.structure.length ? smc.structure[smc.structure.length - 1].type : '—';
    var lastBos = smc.bos.length ? smc.bos[smc.bos.length - 1].dir : '—';
    var cells = [
      ['RSI(14)', l.rsi != null ? l.rsi.toFixed(1) : '—'],
      ['MACD hist', l.macdHist != null ? l.macdHist.toFixed(5) : '—'],
      ['ATR(14)', l.atr != null ? fp(l.atr, analysis.asset) : '—'],
      ['ADX(14)', l.adx != null ? l.adx.toFixed(1) : '—'],
      ['Stoch K/D', l.stochK != null ? l.stochK.toFixed(1) + '/' + l.stochD.toFixed(1) : '—'],
      ['EMA21', l.ema21 != null ? fp(l.ema21, analysis.asset) : '—'],
      ['EMA50', l.ema50 != null ? fp(l.ema50, analysis.asset) : '—'],
      ['VWAP', l.vwap != null ? fp(l.vwap, analysis.asset) : '—'],
      ['Structure', lastStruct],
      ['Last BOS', lastBos]
    ];
    return '<div class="stat-grid">' + cells.map(function (c) {
      return '<div class="stat"><i>' + esc(c[0]) + '</i><b>' + esc(String(c[1])) + '</b></div>';
    }).join('') + '</div>';
  }

  /* ---------------- full report ---------------- */
  function renderFull(analysis, trade) {
    var b = analysis.bias;
    var top = trade.setups.slice(0, 5);
    var html = headerBlock(analysis) + biasCard(analysis, trade) + statGrid(analysis);

    html += '<h3 class="rp-h">Executive narrative</h3><p class="narrative">' + esc(analysis.narrative) + '</p>';

    html += '<h3 class="rp-h">Bias factors</h3><table class="tbl"><thead><tr><th>Factor</th><th>Direction</th></tr></thead><tbody>';
    b.factors.slice().sort(function (a, x) { return Math.abs(x.score * x.weight) - Math.abs(a.score * a.weight); }).forEach(function (f) {
      var dir = f.score > 0 ? '<span class="pill bull">Bull</span>' : f.score < 0 ? '<span class="pill bear">Bear</span>' : '<span class="pill neut">Neutral</span>';
      html += '<tr><td>' + esc(f.label) + '</td><td>' + dir + '</td></tr>';
    });
    html += '</tbody></table>';

    html += '<h3 class="rp-h">Top setups</h3>';
    if (top.length) {
      html += '<div class="setup-list">' + top.map(function (s) {
        return '<div class="setup ' + (s.dir === 'long' ? 'long' : 'short') + '">' +
          '<div class="s-name">' + esc(s.name) + '</div>' +
          '<div class="s-dir">' + (s.dir === 'long' ? 'LONG' : 'SHORT') + '</div>' +
          '<div class="s-meta">Quality ' + s.quality + ' · Confluence ' + s.confluence + '%</div>' +
          '<div class="s-desc">' + esc(s.description) + '</div></div>';
      }).join('') + '</div>';
    } else {
      html += '<p class="muted">No qualifying setups detected at this moment.</p>';
    }

    html += '<h3 class="rp-h">Key levels</h3>' + keyLevelsHTML(analysis);

    html += disclaimerBlock();
    return html;
  }

  function disclaimerBlock() {
    return '<div class="disclaimer">' + esc(TL.DISCLAIMER) + '</div>';
  }

  function keyLevelsHTML(analysis) {
    var kl = analysis.keyLevels;
    var html = '<div class="two-col">';
    html += '<div><h4 class="rp-h">Resistance above</h4><table class="tbl"><thead><tr><th>Level</th><th>Price</th></tr></thead><tbody>';
    if (kl.resistances.length) {
      kl.resistances.forEach(function (l) {
        html += '<tr><td>' + esc(l.label) + '</td><td>' + fp(l.price, analysis.asset) + '</td></tr>';
      });
    } else html += '<tr><td colspan="2" class="muted">None</td></tr>';
    html += '</tbody></table></div>';
    html += '<div><h4 class="rp-h">Support below</h4><table class="tbl"><thead><tr><th>Level</th><th>Price</th></tr></thead><tbody>';
    if (kl.supports.length) {
      kl.supports.forEach(function (l) {
        html += '<tr><td>' + esc(l.label) + '</td><td>' + fp(l.price, analysis.asset) + '</td></tr>';
      });
    } else html += '<tr><td colspan="2" class="muted">None</td></tr>';
    html += '</tbody></table></div></div>';
    return html;
  }

  /* ---------------- trade entry ---------------- */
  function renderTrade(analysis, trade) {
    var html = headerBlock(analysis) + biasCard(analysis, trade);

    html += '<h3 class="rp-h">Ranked setups</h3>';
    if (trade.setups.length) {
      html += '<div class="setup-list">' + trade.setups.map(function (s) {
        return '<div class="setup ' + (s.dir === 'long' ? 'long' : 'short') + '">' +
          '<div class="s-name">' + esc(s.name) + ' <span class="score">' + s.score + '</span></div>' +
          '<div class="s-dir">' + (s.dir === 'long' ? 'LONG' : 'SHORT') + '</div>' +
          '<div class="s-meta">Quality ' + s.quality + ' · Confluence ' + s.confluence + '%</div>' +
          '<div class="s-desc">' + esc(s.description) + '</div></div>';
      }).join('') + '</div>';
    } else html += '<p class="muted">No setups detected — wait for price to reach a level.</p>';

    html += '<h3 class="rp-h">Confluence checklist</h3><table class="tbl"><thead><tr><th>Factor</th><th>Reading</th><th>Grade</th></tr></thead><tbody>';
    trade.confluence.forEach(function (c) {
      html += '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.value != null ? String(c.value) : '—') + '</td>' +
        '<td><span class="grade ' + gradeClass(c.result.grade) + '">' + esc(c.result.grade) + '</span></td></tr>';
    });
    html += '</tbody></table>';

    html += '<div class="two-col">';
    html += planCard(analysis, trade.long, 'LONG');
    html += planCard(analysis, trade.short, 'SHORT');
    html += '</div>';

    html += '<h3 class="rp-h">Position sizing</h3>' + sizingHTML(analysis, trade);

    html += '<h3 class="rp-h">Context</h3>' +
      '<div class="ctx-card"><b>Session / liquidity:</b> ' + esc(trade.sessionTip) + '</div>' +
      '<div class="ctx-card"><b>' + esc(trade.volatility.label) + ':</b> ' + esc(trade.volatility.text) + '</div>';

    html += '<h3 class="rp-h">Pre-trade checklist</h3><ul class="checklist">' +
      trade.checklist.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';

    html += '<div class="btn-row">' +
      '<button class="btn" id="btn-copy-plan">Copy plan text</button>' +
      '<button class="btn" id="btn-save-journal">Save to journal</button>' +
      '</div>';
    html += disclaimerBlock();
    return html;
  }

  function planCard(analysis, plan, title) {
    if (!plan) return '';
    var cls = plan.dir === 'long' ? 'long' : 'short';
    var showTp2 = TL.store.get().tools.trade.showTP2;
    var showTp3 = TL.store.get().tools.trade.showTP3;
    var tps = [plan.tp1, plan.tp2, plan.tp3];
    var tpRows = '';
    for (var i = 0; i < tps.length; i++) {
      if (!tps[i]) continue;
      if (i === 1 && !showTp2) continue;
      if (i === 2 && !showTp3) continue;
      tpRows += '<tr><td>TP' + (i + 1) + '</td><td>' + fp(tps[i].price, analysis.asset) + '</td><td>' + tps[i].rr.toFixed(2) + 'R</td></tr>';
    }
    return '<div class="plan-card ' + cls + '">' +
      '<div class="plan-title">' + title + ' PLAN</div>' +
      '<table class="tbl"><tbody>' +
      '<tr><td>Entry</td><td>' + fp(plan.entry, analysis.asset) + ' <span class="pill">' + esc(plan.entryType) + '</span></td></tr>' +
      (plan.limitEntry != null ? '<tr><td>Limit option</td><td>' + fp(plan.limitEntry, analysis.asset) + '</td></tr>' : '') +
      '<tr><td>Stop loss</td><td>' + fp(plan.sl, analysis.asset) + ' <span class="muted">(' + esc(plan.slBasis) + ')</span></td></tr>' +
      tpRows +
      '<tr><td>Risk / unit</td><td>' + fp(plan.riskPer, analysis.asset) + '</td></tr>' +
      '<tr><td>R:R (TP1)</td><td>' + plan.rr.toFixed(2) + ':1</td></tr>' +
      '</tbody></table></div>';
  }

  function sizingHTML(analysis, trade) {
    var risk = trade.risk || {};
    var riskAmount = (risk.account || 0) * ((risk.riskPct || 1) / 100);
    return '<div class="sizing">' +
      '<div class="stat"><i>Account</i><b>' + TL.utils.fmtNum(risk.account || 0, 2) + '</b></div>' +
      '<div class="stat"><i>Risk %</i><b>' + TL.utils.fmtPct(risk.riskPct || 1, 2) + '</b></div>' +
      '<div class="stat"><i>$ risk</i><b>' + TL.utils.fmtNum(riskAmount, 2) + '</b></div>' +
      '<div class="stat"><i>Long size</i><b>' + TL.utils.fmtNum(trade.long.positionSize, 0) + ' units</b></div>' +
      '<div class="stat"><i>Short size</i><b>' + TL.utils.fmtNum(trade.short.positionSize, 0) + ' units</b></div>' +
      '</div>' +
      '<p class="muted">Position size = $ risk ÷ stop distance (approximate notional units; adjust for pip value on FX).</p>';
  }

  /* ---------------- technical ---------------- */
  function renderTechnical(analysis) {
    var l = analysis.indicators.last;
    var ind = analysis.indicators;
    var html = headerBlock(analysis);
    html += '<h3 class="rp-h">Momentum & trend</h3><table class="tbl"><tbody>';
    html += row('RSI(14)', l.rsi != null ? l.rsi.toFixed(1) : '—', l.rsi != null ? (l.rsi > 70 ? 'overbought' : l.rsi < 30 ? 'oversold' : 'neutral') : '—');
    html += row('MACD', l.macd != null ? l.macd.toFixed(5) : '—', l.macdHist != null ? (l.macdHist > 0 ? 'positive' : 'negative') : '—');
    html += row('MACD signal', l.macdSignal != null ? l.macdSignal.toFixed(5) : '—', '');
    html += row('Stochastic K', l.stochK != null ? l.stochK.toFixed(1) : '—', '');
    html += row('Stochastic D', l.stochD != null ? l.stochD.toFixed(1) : '—', '');
    html += row('ADX(14)', l.adx != null ? l.adx.toFixed(1) : '—', l.adx != null ? (l.adx > 25 ? 'trending' : 'ranging') : '—');
    html += row('+DI', TL.indicators.last(ind.adx.pdi) != null ? TL.indicators.last(ind.adx.pdi).toFixed(1) : '—', '');
    html += row('−DI', TL.indicators.last(ind.adx.ndi) != null ? TL.indicators.last(ind.adx.ndi).toFixed(1) : '—', '');
    html += row('ATR(14)', l.atr != null ? fp(l.atr, analysis.asset) : '—', '');
    html += '</tbody></table>';

    html += '<h3 class="rp-h">Moving averages</h3><table class="tbl"><tbody>';
    html += row('EMA9', l.ema9 != null ? fp(l.ema9, analysis.asset) : '—', '');
    html += row('EMA21', l.ema21 != null ? fp(l.ema21, analysis.asset) : '—', '');
    html += row('EMA50', l.ema50 != null ? fp(l.ema50, analysis.asset) : '—', '');
    html += row('EMA200', l.ema200 != null ? fp(l.ema200, analysis.asset) : '—', '');
    html += row('SMA20', l.sma20 != null ? fp(l.sma20, analysis.asset) : '—', '');
    html += row('VWAP', l.vwap != null ? fp(l.vwap, analysis.asset) : '—', '');
    html += row('Bollinger upper', l.bbUpper != null ? fp(l.bbUpper, analysis.asset) : '—', '');
    html += row('Bollinger middle', l.bbMiddle != null ? fp(l.bbMiddle, analysis.asset) : '—', '');
    html += row('Bollinger lower', l.bbLower != null ? fp(l.bbLower, analysis.asset) : '—', '');
    html += '</tbody></table>';

    html += '<h3 class="rp-h">Classic pivots (prev day)</h3>';
    if (ind.pivots) {
      var p = ind.pivots;
      html += '<table class="tbl"><tbody>' +
        row('R3', fp(p.r3, analysis.asset), '') + row('R2', fp(p.r2, analysis.asset), '') + row('R1', fp(p.r1, analysis.asset), '') +
        row('Pivot', fp(p.p, analysis.asset), '') + row('S1', fp(p.s1, analysis.asset), '') + row('S2', fp(p.s2, analysis.asset), '') + row('S3', fp(p.s3, analysis.asset), '') +
        '</tbody></table>';
    } else html += '<p class="muted">Not enough data for daily pivots.</p>';

    html += disclaimerBlock();
    return html;
  }

  function row(a, b, c) {
    return '<tr><td>' + esc(a) + '</td><td>' + esc(String(b)) + '</td><td class="muted">' + esc(c || '') + '</td></tr>';
  }

  /* ---------------- SMC / zones ---------------- */
  function renderSMC(analysis) {
    var smc = analysis.smc;
    var html = headerBlock(analysis);

    html += '<h3 class="rp-h">Market structure</h3>';
    var struct = smc.structure.slice(-12).reverse();
    if (struct.length) {
      html += '<table class="tbl"><thead><tr><th>Type</th><th>Price</th></tr></thead><tbody>' +
        struct.map(function (s) {
          return '<tr><td><span class="pill ' + ((s.type === 'HH' || s.type === 'HL') ? 'bull' : 'bear') + '">' + esc(s.type) + '</span></td><td>' + fp(s.price, analysis.asset) + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else html += '<p class="muted">No structure detected.</p>';

    html += '<div class="two-col">';
    html += '<div><h4 class="rp-h">Major highs</h4>' + levelList(smc.majorHighs, analysis) + '</div>';
    html += '<div><h4 class="rp-h">Major lows</h4>' + levelList(smc.majorLows, analysis) + '</div>';
    html += '</div>';

    html += '<h3 class="rp-h">Break of structure (BOS)</h3>';
    var bos = smc.bos.slice(-8).reverse();
    if (bos.length) {
      html += '<table class="tbl"><thead><tr><th>Dir</th><th>Level</th></tr></thead><tbody>' +
        bos.map(function (b) {
          return '<tr><td><span class="pill ' + (b.dir === 'bull' ? 'bull' : 'bear') + '">' + esc(b.dir.toUpperCase()) + '</span></td><td>' + fp(b.price, analysis.asset) + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else html += '<p class="muted">No BOS events detected.</p>';

    html += '<h3 class="rp-h">Support / resistance clusters</h3>';
    if (smc.sr.length) {
      html += '<table class="tbl"><thead><tr><th>Type</th><th>Price</th><th>Touches</th></tr></thead><tbody>' +
        smc.sr.map(function (l) {
          return '<tr><td>' + (l.type === 'resistance' ? 'Resistance' : 'Support') + (l.major ? ' ★' : '') + '</td><td>' + fp(l.price, analysis.asset) + '</td><td>' + l.touches + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else html += '<p class="muted">No clusters formed.</p>';

    html += '<div class="two-col">';
    html += '<div><h4 class="rp-h">Supply zones</h4>' + zoneTable(smc.supply, analysis, 'supply') + '</div>';
    html += '<div><h4 class="rp-h">Demand zones</h4>' + zoneTable(smc.demand, analysis, 'demand') + '</div>';
    html += '</div>';

    html += '<h3 class="rp-h">Fair value gaps</h3>';
    var fvgs = smc.fvg.slice(-10).reverse();
    if (fvgs.length) {
      html += '<table class="tbl"><thead><tr><th>Type</th><th>Top</th><th>Bottom</th><th>Status</th></tr></thead><tbody>' +
        fvgs.map(function (g) {
          return '<tr><td>' + (g.type === 'bull' ? 'Bullish' : 'Bearish') + '</td><td>' + fp(g.top, analysis.asset) + '</td><td>' + fp(g.bottom, analysis.asset) + '</td><td>' + (g.filled ? 'filled' : 'open') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else html += '<p class="muted">No FVGs in the lookback window.</p>';

    html += '<h3 class="rp-h">Order blocks</h3>';
    var obs = smc.orderBlocks.slice(0, 8);
    if (obs.length) {
      html += '<table class="tbl"><thead><tr><th>Type</th><th>Top</th><th>Bottom</th><th>Status</th></tr></thead><tbody>' +
        obs.map(function (o) {
          return '<tr><td>' + (o.type === 'bull' ? 'Bullish' : 'Bearish') + '</td><td>' + fp(o.top, analysis.asset) + '</td><td>' + fp(o.bottom, analysis.asset) + '</td><td>' + (o.fresh ? 'unmitigated' : 'mitigated') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else html += '<p class="muted">No order blocks detected.</p>';

    html += disclaimerBlock();
    return html;
  }

  function levelList(points, analysis) {
    if (!points || !points.length) return '<p class="muted">None.</p>';
    return '<div class="pill-row">' + points.map(function (p) {
      return '<span class="pill neut">' + fp(p.price, analysis.asset) + '</span>';
    }).join('') + '</div>';
  }

  function zoneTable(zones, analysis, kind) {
    if (!zones.length) return '<p class="muted">None detected.</p>';
    return '<table class="tbl"><thead><tr><th>Top</th><th>Bottom</th><th>Status</th></tr></thead><tbody>' +
      zones.map(function (z) {
        return '<tr><td>' + fp(z.top, analysis.asset) + '</td><td>' + fp(z.bottom, analysis.asset) + '</td><td>' + (z.fresh ? 'unmitigated' : 'mitigated') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* ---------------- volume profile ---------------- */
  function renderVP(analysis) {
    var vp = analysis.vp;
    var html = headerBlock(analysis);
    if (!vp) { html += '<p class="muted">Volume profile unavailable.</p>'; return html + disclaimerBlock(); }

    html += '<div class="vp-hero">' +
      '<div class="stat"><i>POC</i><b>' + fp(vp.poc, analysis.asset) + '</b></div>' +
      '<div class="stat"><i>VAH</i><b>' + fp(vp.vah, analysis.asset) + '</b></div>' +
      '<div class="stat"><i>VAL</i><b>' + fp(vp.val, analysis.asset) + '</b></div>' +
      '<div class="stat"><i>Value area</i><b>' + Math.round(vp.valueAreaPct * 100) + '%</b></div>' +
      '</div>';

    html += '<h3 class="rp-h">High-volume nodes (HVN)</h3>';
    html += vp.hvn.length ? '<div class="pill-row">' + vp.hvn.map(function (p) { return '<span class="pill bull">' + fp(p, analysis.asset) + '</span>'; }).join('') + '</div>' : '<p class="muted">None.</p>';
    html += '<h3 class="rp-h">Low-volume nodes (LVN)</h3>';
    html += vp.lvn.length ? '<div class="pill-row">' + vp.lvn.map(function (p) { return '<span class="pill bear">' + fp(p, analysis.asset) + '</span>'; }).join('') + '</div>' : '<p class="muted">None.</p>';
    html += '<p class="muted">Total volume: ' + TL.utils.fmtInt(vp.totalVolume) + '. Bins: ' + vp.bins.length + '.</p>';
    html += disclaimerBlock();
    return html;
  }

  /* ---------------- fundamental ---------------- */
  function renderFundamental(analysis) {
    var cfg = TL.ASSETS[analysis.asset];
    var b = cfg.brief;
    var html = headerBlock(analysis);
    html += '<p class="narrative">' + esc(b.headline) + '</p>';
    html += '<h3 class="rp-h">Key drivers</h3><ul class="checklist">' + b.drivers.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>';
    html += '<h3 class="rp-h">Session behavior</h3><ul class="checklist">' + b.sessions.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    html += '<h3 class="rp-h">Correlations</h3><ul class="checklist">' + b.correlations.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';
    html += '<p class="muted">This brief is static educational content — it is NOT live news or a fundamental signal.</p>';
    html += disclaimerBlock();
    return html;
  }

  /* ---------------- key levels ---------------- */
  function renderLevels(analysis) {
    return headerBlock(analysis) + '<h3 class="rp-h">Key levels</h3>' + keyLevelsHTML(analysis) + disclaimerBlock();
  }

  /* ---------------- plan text ---------------- */
  function planText(analysis, trade) {
    var cfg = TL.ASSETS[analysis.asset];
    var lines = [];
    var L = [];
    L.push('Techlysis trade plan — ' + cfg.name + ' (' + analysis.asset + ') ' + analysis.timeframe);
    L.push('Generated: ' + new Date(analysis.generatedAt).toISOString());
    L.push('Source: ' + (analysis.data.detail || analysis.data.source || 'n/a'));
    L.push('Price: ' + fp(analysis.price, analysis.asset));
    L.push('Bias: ' + analysis.biasLabel + ' (' + (analysis.bias.score > 0 ? '+' : '') + analysis.bias.score + '/100)');
    L.push('Decision: ' + trade.decision.banner);
    L.push('');
    L.push('ATR: ' + fp(analysis.smc.atr, analysis.asset) + ' — ' + trade.volatility.label);
    L.push('Session: ' + trade.sessionTip);
    L.push('');
    L.push('== SETUPS ==');
    trade.setups.forEach(function (s, i) {
      L.push((i + 1) + '. ' + s.name.toUpperCase() + ' [' + s.dir + '] quality ' + s.quality + ', confluence ' + s.confluence + '% — ' + s.description);
    });
    L.push('');
    [['LONG', trade.long], ['SHORT', trade.short]].forEach(function (pair) {
      var dir = pair[0], p = pair[1];
      L.push('== ' + dir + ' PLAN ==');
      L.push('Entry: ' + fp(p.entry, analysis.asset) + ' (' + p.entryType + ')' + (p.limitEntry != null ? ' | limit ' + fp(p.limitEntry, analysis.asset) : ''));
      L.push('Stop loss: ' + fp(p.sl, analysis.asset) + ' (' + p.slBasis + ')');
      if (p.tp1) L.push('TP1: ' + fp(p.tp1.price, analysis.asset) + ' (' + p.tp1.rr.toFixed(2) + 'R)');
      if (p.tp2) L.push('TP2: ' + fp(p.tp2.price, analysis.asset) + ' (' + p.tp2.rr.toFixed(2) + 'R)');
      if (p.tp3) L.push('TP3: ' + fp(p.tp3.price, analysis.asset) + ' (' + p.tp3.rr.toFixed(2) + 'R)');
      L.push('Risk per unit: ' + fp(p.riskPer, analysis.asset));
      L.push('');
    });
    L.push('== POSITION SIZING ==');
    L.push('Account: ' + TL.utils.fmtNum(trade.risk.account || 0, 2) + ' | Risk: ' + (trade.risk.riskPct || 1) + '%');
    L.push('$ risk: ' + TL.utils.fmtNum((trade.risk.account || 0) * (trade.risk.riskPct || 1) / 100, 2));
    L.push('Size (long): ' + TL.utils.fmtNum(trade.long.positionSize, 0) + ' units | Size (short): ' + TL.utils.fmtNum(trade.short.positionSize, 0) + ' units');
    L.push('');
    L.push('== PRE-TRADE CHECKLIST ==');
    trade.checklist.forEach(function (c, i) { L.push('[ ] ' + c); });
    L.push('');
    L.push(TL.DISCLAIMER);
    return L.join('\n');
  }

  function renderAll(analysis, trade) {
    var target = function (id) { return document.getElementById(id); };
    setHTML(target('tab-full'), renderFull(analysis, trade));
    setHTML(target('tab-trade'), renderTrade(analysis, trade));
    setHTML(target('tab-technical'), renderTechnical(analysis));
    setHTML(target('tab-smc'), renderSMC(analysis));
    setHTML(target('tab-vp'), renderVP(analysis));
    setHTML(target('tab-fundamental'), renderFundamental(analysis));
    setHTML(target('tab-levels'), renderLevels(analysis));
    TL.events.emit('report-rendered', analysis);
  }

  function setHTML(el, html) { if (el) el.innerHTML = html; }

  return {
    renderAll: renderAll,
    planText: planText
  };
})();
