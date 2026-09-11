/* Techlysis — trade-entry toolkit: setup detection, long/short plans,
 * position sizing, confluence checklist, session tips, decision banner.
 */
'use strict';

window.TL = window.TL || {};

TL.trade = (function () {

  /* ---------------- confluence checklist ---------------- */
  function confluenceChecklist(analysis) {
    var ind = analysis.indicators;
    var smc = analysis.smc;
    var vp = analysis.vp;
    var fib = analysis.fib;
    var price = analysis.price;
    var l = ind.last;

    function grade(bullScore) {
      // bullScore in -1..1  → A (bull) .. D (bear)
      if (bullScore >= 0.5) return { grade: 'A', dir: 'bull', text: 'Supportive' };
      if (bullScore >= 0.15) return { grade: 'B', dir: 'bull', text: 'Lean bullish' };
      if (bullScore <= -0.5) return { grade: 'D', dir: 'bear', text: 'Against' };
      if (bullScore <= -0.15) return { grade: 'C', dir: 'bear', text: 'Lean bearish' };
      return { grade: 'C', dir: null, text: 'Neutral' };
    }

    var checks = [];

    // structure
    var lastStruct = smc.structure.length ? smc.structure[smc.structure.length - 1] : null;
    if (lastStruct) {
      var stBull = (lastStruct.type === 'HH' || lastStruct.type === 'HL') ? 1 : -1;
      checks.push({ name: 'Market structure', value: lastStruct.type, result: grade(stBull) });
    } else checks.push({ name: 'Market structure', value: 'n/a', result: { grade: 'C', dir: null, text: 'No data' } });

    // EMAs
    var emaBull = 0, emaN = 0;
    if (l.ema9 != null && l.ema21 != null) { emaBull += l.ema9 > l.ema21 ? 1 : -1; emaN++; }
    if (l.ema21 != null && l.ema50 != null) { emaBull += l.ema21 > l.ema50 ? 1 : -1; emaN++; }
    if (l.ema50 != null && l.ema200 != null) { emaBull += l.ema50 > l.ema200 ? 1 : -1; emaN++; }
    if (emaN) checks.push({ name: 'EMA stack', value: emaBull / emaN, result: grade(emaBull / emaN) });
    else checks.push({ name: 'EMA stack', value: 'n/a', result: { grade: 'C', dir: null, text: 'No data' } });

    // RSI
    if (l.rsi != null) {
      var rsiB = l.rsi > 55 ? 0.6 : (l.rsi < 45 ? -0.6 : (l.rsi > 70 ? -0.3 : (l.rsi < 30 ? 0.3 : 0)));
      checks.push({ name: 'RSI ' + l.rsi.toFixed(1), value: l.rsi, result: grade(rsiB) });
    } else checks.push({ name: 'RSI', value: 'n/a', result: { grade: 'C', dir: null, text: 'No data' } });

    // MACD
    if (l.macdHist != null) {
      checks.push({ name: 'MACD', value: l.macdHist > 0 ? 'hist +' : 'hist −', result: grade(l.macdHist > 0 ? 0.6 : -0.6) });
    } else checks.push({ name: 'MACD', value: 'n/a', result: { grade: 'C', dir: null, text: 'No data' } });

    // ADX
    if (l.adx != null) {
      var lpdi = TL.indicators.last(ind.adx.pdi);
      var lndi = TL.indicators.last(ind.adx.ndi);
      var adxB = lpdi > lndi ? 0.6 : -0.6;
      if (l.adx < 20) adxB *= 0.3;
      checks.push({ name: 'ADX ' + l.adx.toFixed(0), value: l.adx, result: grade(adxB) });
    } else checks.push({ name: 'ADX', value: 'n/a', result: { grade: 'C', dir: null, text: 'No data' } });

    // zones (supply/demand proximity)
    var nearSupply = false, nearDemand = false;
    if (smc.supply.length) {
      for (var i = 0; i < smc.supply.length; i++) {
        if (price <= smc.supply[i].top && price >= smc.supply[i].bottom) nearSupply = true;
      }
    }
    if (smc.demand.length) {
      for (var j = 0; j < smc.demand.length; j++) {
        if (price <= smc.demand[j].top && price >= smc.demand[j].bottom) nearDemand = true;
      }
    }
    if (nearDemand && !nearSupply) checks.push({ name: 'Zones', value: 'In demand', result: grade(0.7) });
    else if (nearSupply && !nearDemand) checks.push({ name: 'Zones', value: 'In supply', result: grade(-0.7) });
    else checks.push({ name: 'Zones', value: 'No zone', result: { grade: 'C', dir: null, text: 'Neutral' } });

    // order blocks
    var obBull = 0, obBear = 0;
    for (var k = 0; k < smc.orderBlocks.length; k++) {
      var ob = smc.orderBlocks[k];
      if (price <= ob.top && price >= ob.bottom) {
        if (ob.type === 'bull') obBull++; else obBear++;
      }
    }
    if (obBull > obBear) checks.push({ name: 'Order blocks', value: 'In bull OB', result: grade(0.6) });
    else if (obBear > obBull) checks.push({ name: 'Order blocks', value: 'In bear OB', result: grade(-0.6) });
    else checks.push({ name: 'Order blocks', value: 'none', result: { grade: 'C', dir: null, text: 'Neutral' } });

    // FVG
    var fvgBull = 0, fvgBear = 0;
    for (var f = 0; f < smc.fvg.length; f++) {
      var g = smc.fvg[f];
      if (price <= g.top && price >= g.bottom && !g.filled) {
        if (g.type === 'bull') fvgBull++; else fvgBear++;
      }
    }
    if (fvgBull > fvgBear) checks.push({ name: 'FVG', value: 'In bull FVG', result: grade(0.6) });
    else if (fvgBear > fvgBull) checks.push({ name: 'FVG', value: 'In bear FVG', result: grade(-0.6) });
    else checks.push({ name: 'FVG', value: 'none', result: { grade: 'C', dir: null, text: 'Neutral' } });

    // volume profile
    if (vp) {
      if (price > vp.vah) checks.push({ name: 'Volume profile', value: 'Above VAH', result: grade(0.5) });
      else if (price < vp.val) checks.push({ name: 'Volume profile', value: 'Below VAL', result: grade(-0.5) });
      else if (price > vp.poc) checks.push({ name: 'Volume profile', value: 'Above POC', result: grade(0.2) });
      else checks.push({ name: 'Volume profile', value: 'Below POC', result: grade(-0.2) });
    }

    // fib
    if (fib) {
      var nearFib = null;
      for (var fi = 0; fi < fib.ret.length; fi++) {
        var d = Math.abs(fib.ret[fi].price - price);
        var tol = smc.atr * 0.6;
        if (d < tol) nearFib = fib.ret[fi].ratio;
      }
      if (nearFib != null && nearFib >= 0.5) checks.push({ name: 'Fib ' + (nearFib * 100) + '%', value: nearFib, result: grade(0.4) });
      else if (nearFib != null) checks.push({ name: 'Fib ' + (nearFib * 100) + '%', value: nearFib, result: grade(0.2) });
      else checks.push({ name: 'Fib', value: 'not at level', result: { grade: 'C', dir: null, text: 'Neutral' } });
    }

    return checks;
  }

  function confluencePct(checks, dir) {
    var total = 0, support = 0;
    for (var i = 0; i < checks.length; i++) {
      var r = checks[i].result;
      if (!r.dir) { if (r.text === 'Neutral' || r.text === 'No data' || r.text === 'none') continue; total++; }
      else total++;
      if (dir === 'long' && r.dir === 'bull') support++;
      if (dir === 'short' && r.dir === 'bear') support++;
    }
    return total ? Math.round((support / total) * 100) : 0;
  }

  /* ---------------- setup detection ---------------- */
  function detectSetups(analysis, tools) {
    var ind = analysis.indicators;
    var smc = analysis.smc;
    var vp = analysis.vp;
    var fib = analysis.fib;
    var price = analysis.price;
    var atr = smc.atr;
    var checks = confluenceChecklist(analysis);
    var setups = [];

    function push(name, dir, quality, desc) {
      if (quality <= 0) return;
      var conf = confluencePct(checks, dir);
      setups.push({
        name: name, dir: dir, quality: quality,
        confluence: conf,
        description: desc,
        score: Math.round(quality * 0.6 + conf * 0.4)
      });
    }

    // 1. demand bounce
    for (var i = 0; i < smc.demand.length; i++) {
      var z = smc.demand[i];
      if (price <= z.top + atr * 0.5 && price >= z.bottom - atr * 0.5) {
        var lastBar = analysis.bars[analysis.bars.length - 1];
        var reject = (lastBar.low < z.top && lastBar.close > z.top) ? 20 : 0;
        push('Demand bounce', 'long', Math.min(100, 55 + reject + (z.fresh ? 15 : 0)),
          'Price is testing a demand zone' + (z.fresh ? ' (unmitigated)' : '') + '; watch for a rejection wick to confirm.');
        break;
      }
    }

    // 2. supply reject
    for (var s = 0; s < smc.supply.length; s++) {
      var zs = smc.supply[s];
      if (price <= zs.top + atr * 0.5 && price >= zs.bottom - atr * 0.5) {
        var lb = analysis.bars[analysis.bars.length - 1];
        var rej = (lb.high > zs.bottom && lb.close < zs.bottom) ? 20 : 0;
        push('Supply reject', 'short', Math.min(100, 55 + rej + (zs.fresh ? 15 : 0)),
          'Price is testing a supply zone' + (zs.fresh ? ' (unmitigated)' : '') + '; a rejection confirms sellers.');
        break;
      }
    }

    // 3. OB retest
    for (var o = 0; o < smc.orderBlocks.length; o++) {
      var ob = smc.orderBlocks[o];
      if (price <= ob.top + atr * 0.3 && price >= ob.bottom - atr * 0.3 && ob.fresh) {
        push('Order-block retest', ob.type === 'bull' ? 'long' : 'short', 50,
          'Price returned to a fresh ' + ob.type + ' order block.');
        break;
      }
    }

    // 4. FVG fill
    for (var f = 0; f < smc.fvg.length; f++) {
      var g = smc.fvg[f];
      if (!g.filled && price <= g.top && price >= g.bottom) {
        push('Fair-value-gap fill', g.type === 'bull' ? 'long' : 'short', 45,
          'Price is filling an unfilled ' + g.type + ' FVG — watch for continuation or reversal.');
        break;
      }
    }

    // 5. EMA21 pullback
    if (ind.last.ema21 != null) {
      var d21 = Math.abs(price - ind.last.ema21);
      if (d21 <= atr * 0.6) {
        var above = price > ind.last.ema21;
        push('EMA21 pullback', above ? 'long' : 'short', 40,
          'Price pulled back to the EMA21 (' + TL.utils.fmtPrice(ind.last.ema21, analysis.asset) + ') in a ' + (above ? 'rising' : 'falling') + ' tape.');
      }
    }

    // 6. BOS / breakout
    var recentBos = smc.bos.length ? smc.bos[smc.bos.length - 1] : null;
    if (recentBos && recentBos.i >= analysis.bars.length - 20) {
      push('BOS / breakout continuation', recentBos.dir === 'bull' ? 'long' : 'short', 55,
        'Recent ' + recentBos.dir + ' break of structure suggests momentum continuation.');
    }

    // 7. VP POC/VAH/VAL
    if (vp) {
      var nearPoc = Math.abs(price - vp.poc) <= atr * 0.6;
      var nearVah = Math.abs(price - vp.vah) <= atr * 0.5;
      var nearVal = Math.abs(price - vp.val) <= atr * 0.5;
      if (nearVal) push('VP VAL test', 'long', 35, 'Price is at the value-area low (VAL) — potential responsive buying.');
      else if (nearVah) push('VP VAH test', 'short', 35, 'Price is at the value-area high (VAH) — potential responsive selling.');
      else if (nearPoc) push('VP POC magnet', price > vp.poc ? 'long' : 'short', 25, 'Price is at the point of control — watch for a rotation decision.');
    }

    // 8. Fib 50/61.8
    if (fib) {
      for (var fr = 0; fr < fib.ret.length; fr++) {
        var r = fib.ret[fr].ratio;
        if (r === 0.5 || r === 0.618) {
          if (Math.abs(fib.ret[fr].price - price) <= atr * 0.5) {
            push('Fib ' + (r * 100) + '% retrace', fib.dir === 'up' ? 'long' : 'short', 40,
              'Price is at the ' + (r * 100) + '% retracement of the last swing leg.');
            break;
          }
        }
      }
    }

    // 9. RSI extremes
    if (ind.last.rsi != null) {
      if (ind.last.rsi <= 30) push('RSI oversold', 'long', 30, 'RSI is oversold — potential mean-reversion bounce.');
      else if (ind.last.rsi >= 70) push('RSI overbought', 'short', 30, 'RSI is overbought — potential mean-reversion fade.');
    }

    setups.sort(function (a, b) { return b.score - a.score; });
    return setups;
  }

  /* ---------------- long / short plans ---------------- */
  function nearestLevel(levels, price, side, tol) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < levels.length; i++) {
      var l = levels[i];
      var d = l.price - price;
      if (side === 'above' && d > 0 && d < bestD) { bestD = d; best = l; }
      if (side === 'below' && d < 0 && -d < bestD) { bestD = -d; best = l; }
    }
    if (best && bestD > tol) best = null;
    return best;
  }

  function snapTP(raw, levels, side, tol) {
    var best = nearestLevel(levels, raw, side, tol);
    return best ? best.price : raw;
  }

  function buildPlan(analysis, dir, risk, tools) {
    var price = analysis.price;
    var atr = analysis.smc.atr;
    var smc = analysis.smc;
    var levels = analysis.keyLevels.all;
    var slMult = risk.slAtrMult || 1.5;
    var rrList = risk.tpRR || [2, 3, 5];

    var swing = dir === 'long'
      ? (smc.swings.lows.length ? smc.swings.lows[smc.swings.lows.length - 1] : null)
      : (smc.swings.highs.length ? smc.swings.highs[smc.swings.highs.length - 1] : null);

    var slRaw = dir === 'long'
      ? (swing ? swing.price : price - atr * slMult) - atr * slMult * 0.5
      : (swing ? swing.price : price + atr * slMult) + atr * slMult * 0.5;

    var sl = dir === 'long' ? Math.min(slRaw, price - atr * slMult) : Math.max(slRaw, price + atr * slMult);

    // limit entry suggestion: nearest zone/ema/fib below (long) or above (short)
    var limitCandidates = [];
    var i;
    for (i = 0; i < smc.demand.length; i++) limitCandidates.push({ price: smc.demand[i].bottom, label: 'demand' });
    for (i = 0; i < smc.supply.length; i++) limitCandidates.push({ price: smc.supply[i].top, label: 'supply' });
    for (i = 0; i < smc.orderBlocks.length; i++) {
      var ob = smc.orderBlocks[i];
      limitCandidates.push({ price: ob.type === 'bull' ? ob.bottom : ob.top, label: 'OB' });
    }
    if (analysis.indicators.last.ema21 != null) limitCandidates.push({ price: analysis.indicators.last.ema21, label: 'EMA21' });
    if (analysis.vp) limitCandidates.push({ price: analysis.vp.poc, label: 'POC' });

    var limitEntry = null, bestD = Infinity;
    for (i = 0; i < limitCandidates.length; i++) {
      var d = limitCandidates[i].price - price;
      if (dir === 'long' && d < 0 && -d < bestD && -d < atr * 2) { bestD = -d; limitEntry = limitCandidates[i].price; }
      if (dir === 'short' && d > 0 && d < bestD && d < atr * 2) { bestD = d; limitEntry = limitCandidates[i].price; }
    }

    var entry = (tools.trade && tools.trade.riskFill === 'limit' && limitEntry != null) ? limitEntry : price;
    var entryType = (entry === price) ? 'market' : 'limit';

    // Guarantee the stop stays a sane distance from the ACTUAL entry: a limit
    // entry can sit on the wrong side of a swing-based stop (e.g. a demand
    // bottom below the long SL), which would produce a negative-risk plan.
    var minDist = atr * slMult;
    if (!(minDist > 0)) minDist = Math.max(Math.abs(entry) * 0.001, 1e-9);
    if (dir === 'long') sl = Math.min(sl, entry - minDist);
    else sl = Math.max(sl, entry + minDist);

    var riskPer = Math.abs(entry - sl);
    var tps = [];
    for (var t = 0; t < rrList.length; t++) {
      var raw = dir === 'long' ? entry + riskPer * rrList[t] : entry - riskPer * rrList[t];
      var snapped = snapTP(raw, levels, dir === 'long' ? 'above' : 'below', atr * 0.75);
      var rr = riskPer ? Math.abs(snapped - entry) / riskPer : 0;
      tps.push({ price: snapped, rr: rr, raw: raw });
    }

    // position size
    var riskAmount = (risk.account || 0) * ((risk.riskPct || 1) / 100);
    var positionSize = riskPer > 0 ? riskAmount / riskPer : 0;

    return {
      dir: dir,
      entry: entry,
      entryType: entryType,
      limitEntry: limitEntry,
      sl: sl,
      slBasis: swing ? ('swing ' + (dir === 'long' ? 'low' : 'high') + ' + ATR buffer') : 'ATR buffer',
      tp1: tps[0], tp2: tps[1], tp3: tps[2],
      riskPer: riskPer,
      rr: tps[0] ? tps[0].rr : 0,
      riskAmount: riskAmount,
      positionSize: positionSize
    };
  }

  /* ---------------- session & volatility ---------------- */
  function sessionTip() {
    var h = new Date().getUTCHours();
    var day = new Date().getUTCDay();
    if (day === 0 || day === 6) {
      return 'Weekend — FX/commodity desks are closed and liquidity is thin; crypto still trades. Widen stops and expect gaps on the reopen.';
    }
    if (h >= 0 && h < 7) return 'Asia session — thinner liquidity; JPY pairs & AUD/NZD flows dominate. Expect ranging unless there is a Tokyo/China catalyst.';
    if (h >= 7 && h < 12) return 'London session — deepest FX liquidity; European data and GBP/EUR flows. Gold is most active here.';
    if (h >= 12 && h < 17) return 'London/NY overlap (13:00–17:00 UTC) — peak liquidity & volatility; best window for breakouts and clean fills.';
    if (h >= 17 && h < 21) return 'New York session — US data & Fed speakers; equities and commodities move; volatility can fade late.';
    return 'Late NY / quiet hours — liquidity thins, spreads widen; prefer patience over chasing.';
  }

  function volatilityRegime(analysis) {
    var pct = (analysis.smc.atr / analysis.price) * 100;
    if (pct < 0.15) return { label: 'LOW volatility', text: 'ATR is tiny relative to price. Ranges compress — favor mean-reversion or stand aside; tighten targets.' };
    if (pct < 0.6) return { label: 'NORMAL volatility', text: 'ATR is in a normal band. Standard SL×ATR and R-multiple targets are appropriate.' };
    if (pct < 1.4) return { label: 'HIGH volatility', text: 'ATR is elevated. Widen stops, reduce size, and expect slippage around news.' };
    return { label: 'EXTREME volatility', text: 'ATR is extreme. Trade small or not at all; respect wide ranges and fast reversals.' };
  }

  function humanChecklist() {
    return [
      'Invalidation (stop) is defined BEFORE entry and placed at structure + ATR buffer.',
      'No high-impact news in the next 30–60 minutes for this asset.',
      'Risk per trade is within the plan (default 1% of account).',
      'Reward-to-risk on TP1 is at least 2:1.',
      'The setup has a catalyst: zone / OB / FVG / EMA / VP level, not just "a feeling".',
      'I am not revenge-trading or averaging into a loser.',
      'Session has liquidity (London/NY overlap is ideal for FX & commodities).',
      'I accept the loss if the stop is hit, without moving it.'
    ];
  }

  /* ---------------- decision banner ---------------- */
  function decision(analysis, longPlan, shortPlan) {
    var score = analysis.bias.score;
    var longRR = (longPlan && longPlan.rr) || 0;
    var shortRR = (shortPlan && shortPlan.rr) || 0;
    if (score >= 30 && longRR >= 1.8) return { banner: 'CONSIDER LONG', tone: 'bull', reason: 'Bullish bias (' + score + ') with R:R ' + longRR.toFixed(1) + ' on the long plan.' };
    if (score <= -30 && shortRR >= 1.8) return { banner: 'CONSIDER SHORT', tone: 'bear', reason: 'Bearish bias (' + score + ') with R:R ' + shortRR.toFixed(1) + ' on the short plan.' };
    if (Math.abs(score) < 30) return { banner: 'WAIT', tone: 'neutral', reason: 'Bias is weak (' + score + '). Wait for stronger structure or a cleaner level.' };
    return { banner: 'MARGINAL', tone: 'neutral', reason: 'Bias present but R:R is sub-optimal; wait for a better entry.' };
  }

  /* ---------------- master ---------------- */
  function analyze(analysis, tools, risk) {
    var checks = confluenceChecklist(analysis);
    var setups = detectSetups(analysis, tools);
    var longPlan = buildPlan(analysis, 'long', risk, tools);
    var shortPlan = buildPlan(analysis, 'short', risk, tools);
    var dec = decision(analysis, longPlan, shortPlan);
    var vol = volatilityRegime(analysis);

    return {
      decision: dec,
      setups: setups,
      long: longPlan,
      short: shortPlan,
      confluence: checks,
      sessionTip: sessionTip(),
      volatility: vol,
      checklist: humanChecklist(),
      risk: risk
    };
  }

  return {
    analyze: analyze,
    confluenceChecklist: confluenceChecklist,
    detectSetups: detectSetups,
    sessionTip: sessionTip,
    humanChecklist: humanChecklist,
    buildPlan: buildPlan
  };
})();
