/* Techlysis — composite bias engine + executive narrative.
 * Consumes indicators, SMC, volume profile & fib and produces a single
 * explainable bull/bear score (-100 .. +100) plus a written summary.
 */
'use strict';

window.TL = window.TL || {};

TL.analysis = (function () {

  function nearestAboveBelow(price, levels) {
    var above = [], below = [];
    for (var i = 0; i < levels.length; i++) {
      var l = levels[i];
      if (l.price > price) above.push(l);
      else if (l.price < price) below.push(l);
    }
    above.sort(function (a, b) { return a.price - b.price; });
    below.sort(function (a, b) { return b.price - a.price; });
    return { above: above, below: below };
  }

  function buildKeyLevels(price, ind, smc, vp, fib) {
    var levels = [];

    // classic pivots
    if (ind.pivots) {
      var pv = ind.pivots;
      levels.push({ price: pv.r1, label: 'Pivot R1', type: 'pivot' });
      levels.push({ price: pv.r2, label: 'Pivot R2', type: 'pivot' });
      levels.push({ price: pv.r3, label: 'Pivot R3', type: 'pivot' });
      levels.push({ price: pv.p, label: 'Pivot P', type: 'pivot' });
      levels.push({ price: pv.s1, label: 'Pivot S1', type: 'pivot' });
      levels.push({ price: pv.s2, label: 'Pivot S2', type: 'pivot' });
      levels.push({ price: pv.s3, label: 'Pivot S3', type: 'pivot' });
    }

    // S/R clusters
    for (var i = 0; i < smc.sr.length; i++) {
      var s = smc.sr[i];
      levels.push({ price: s.price, label: (s.type === 'resistance' ? 'Resistance' : 'Support') + ' (' + s.touches + ' touches)', type: 'sr' });
    }

    // supply/demand
    for (var j = 0; j < smc.supply.length; j++) {
      var sup = smc.supply[j];
      levels.push({ price: sup.top, label: 'Supply zone', type: 'supply' });
      levels.push({ price: sup.bottom, label: 'Supply base', type: 'supply' });
    }
    for (var k = 0; k < smc.demand.length; k++) {
      var dem = smc.demand[k];
      levels.push({ price: dem.bottom, label: 'Demand zone', type: 'demand' });
      levels.push({ price: dem.top, label: 'Demand top', type: 'demand' });
    }

    // order blocks
    for (var o = 0; o < smc.orderBlocks.length; o++) {
      var ob = smc.orderBlocks[o];
      levels.push({ price: ob.top, label: (ob.type === 'bull' ? 'Bull OB' : 'Bear OB') + ' top', type: 'ob' });
      levels.push({ price: ob.bottom, label: (ob.type === 'bull' ? 'Bull OB' : 'Bear OB') + ' base', type: 'ob' });
    }

    // FVG edges
    for (var f = 0; f < smc.fvg.length; f++) {
      var fvg = smc.fvg[f];
      levels.push({ price: fvg.top, label: 'FVG top', type: 'fvg' });
      levels.push({ price: fvg.bottom, label: 'FVG bottom', type: 'fvg' });
    }

    // volume profile
    if (vp) {
      levels.push({ price: vp.vah, label: 'VP VAH', type: 'vp' });
      levels.push({ price: vp.poc, label: 'VP POC', type: 'vp' });
      levels.push({ price: vp.val, label: 'VP VAL', type: 'vp' });
    }

    // fib
    if (fib) {
      for (var fr = 0; fr < fib.ret.length; fr++) {
        levels.push({ price: fib.ret[fr].price, label: 'Fib ' + (fib.ret[fr].ratio * 100) + '%', type: 'fib' });
      }
      for (var fe = 0; fe < fib.ext.length; fe++) {
        levels.push({ price: fib.ext[fe].price, label: 'Fib ext ' + (fib.ext[fe].ratio * 100) + '%', type: 'fib' });
      }
    }

    // moving averages
    var ma = ind.last;
    if (ma.ema21 != null) levels.push({ price: ma.ema21, label: 'EMA21', type: 'ema' });
    if (ma.ema50 != null) levels.push({ price: ma.ema50, label: 'EMA50', type: 'ema' });
    if (ma.ema200 != null) levels.push({ price: ma.ema200, label: 'EMA200', type: 'ema' });
    if (ma.vwap != null) levels.push({ price: ma.vwap, label: 'VWAP', type: 'vwap' });

    // dedupe close duplicates
    var seen = {};
    var clean = [];
    for (var d = 0; d < levels.length; d++) {
      var key = levels[d].price.toFixed(8) + '|' + levels[d].label;
      if (seen[key]) continue;
      seen[key] = true;
      clean.push(levels[d]);
    }

    var nb = nearestAboveBelow(price, clean);
    return {
      resistances: nb.above.slice(0, 10),
      supports: nb.below.slice(0, 10),
      all: clean
    };
  }

  /* ---------------- bias factors ---------------- */
  function trendSignal(ind) {
    var l = ind.last;
    var s = 0;
    if (l.ema9 != null && l.ema21 != null) s += l.ema9 > l.ema21 ? 1 : -1;
    if (l.ema21 != null && l.ema50 != null) s += l.ema21 > l.ema50 ? 1 : -1;
    if (l.ema50 != null && l.ema200 != null) s += l.ema50 > l.ema200 ? 1 : -1;
    return s; // -3..3
  }

  function computeBias(ctx) {
    var ind = ctx.ind, smc = ctx.smc, vp = ctx.vp, price = ctx.price;
    var l = ind.last;
    var factors = [];
    var weighted = 0, weightTotal = 0;
    function add(label, score, weight) {
      factors.push({ label: label, score: score, weight: weight });
      weighted += score * weight;
      weightTotal += Math.abs(weight);
    }

    // EMA stack
    var ts = trendSignal(ind);
    if (l.ema9 != null) {
      add('EMA9 vs EMA21 ' + (l.ema9 > l.ema21 ? 'bullish cross' : 'bearish cross'),
        l.ema9 > l.ema21 ? 1 : -1, 2);
    }
    if (l.ema21 != null && l.ema50 != null) {
      add('EMA21 vs EMA50 ' + (l.ema21 > l.ema50 ? 'stacked up' : 'stacked down'),
        l.ema21 > l.ema50 ? 1 : -1, 2);
    }
    if (l.ema50 != null && l.ema200 != null) {
      add('EMA50 vs EMA200 ' + (l.ema50 > l.ema200 ? 'golden' : 'death'),
        l.ema50 > l.ema200 ? 1 : -1, 2);
    }
    if (l.ema200 != null) {
      add('Price vs EMA200 ' + (price > l.ema200 ? 'above' : 'below'),
        price > l.ema200 ? 1 : -1, 1);
    }

    // RSI
    if (l.rsi != null) {
      var rsiScore = 0;
      if (l.rsi >= 70) rsiScore = -0.5;
      else if (l.rsi <= 30) rsiScore = 0.5;
      else if (l.rsi >= 55) rsiScore = 0.4;
      else if (l.rsi <= 45) rsiScore = -0.4;
      add('RSI ' + l.rsi.toFixed(1), rsiScore, 1.5);
    }

    // MACD
    if (l.macdHist != null) {
      var macdScore = l.macdHist > 0 ? 0.6 : -0.6;
      add('MACD histogram ' + (l.macdHist > 0 ? 'positive' : 'negative'), macdScore, 1.5);
    }

    // ADX / DI trend strength
    if (l.adx != null && ind.adx.pdi && ind.adx.ndi) {
      var lpdi = TL.indicators.last(ind.adx.pdi);
      var lndi = TL.indicators.last(ind.adx.ndi);
      if (lpdi != null && lndi != null) {
        var diScore = lpdi > lndi ? 0.6 : -0.6;
        if (l.adx < 20) diScore *= 0.4;
        add('ADX ' + l.adx.toFixed(0) + ' (' + (lpdi > lndi ? '+DI > -DI' : '-DI > +DI') + ')', diScore, 1.2);
      }
    }

    // Stochastic
    if (l.stochK != null && l.stochD != null) {
      var st = l.stochK > l.stochD ? 0.4 : -0.4;
      add('Stochastic ' + (l.stochK > l.stochD ? 'K>D' : 'K<D'), st, 0.8);
    }

    // VWAP
    if (l.vwap != null) {
      add('Price vs VWAP ' + (price > l.vwap ? 'above' : 'below'), price > l.vwap ? 0.6 : -0.6, 1.2);
    }

    // market structure
    var lastStruct = smc.structure.length ? smc.structure[smc.structure.length - 1] : null;
    if (lastStruct) {
      var stScore = (lastStruct.type === 'HH' || lastStruct.type === 'HL') ? 0.7 : -0.7;
      add('Last structure ' + lastStruct.type, stScore, 1.6);
    }
    var recentBos = smc.bos.length ? smc.bos[smc.bos.length - 1] : null;
    if (recentBos) {
      add('Recent BOS ' + recentBos.dir, recentBos.dir === 'bull' ? 0.8 : -0.8, 1.6);
    }

    // volume profile position
    if (vp) {
      if (price > vp.vah) add('Price above VAH (acceptance above value)', 0.6, 1.2);
      else if (price < vp.val) add('Price below VAL (acceptance below value)', -0.6, 1.2);
      else add('Price inside value area', 0, 0.5);
    }

    // pivot position
    if (ind.pivots) {
      add('Price vs daily pivot P', price > ind.pivots.p ? 0.4 : -0.4, 0.8);
    }

    var score = weightTotal ? Math.round((weighted / weightTotal) * 100) : 0;
    score = TL.utils.clamp(score, -100, 100);

    return { score: score, factors: factors };
  }

  function labelFor(score) {
    if (score >= 60) return 'STRONG BULL';
    if (score >= 30) return 'BULL';
    if (score >= 12) return 'MILD BULL';
    if (score <= -60) return 'STRONG BEAR';
    if (score <= -30) return 'BEAR';
    if (score <= -12) return 'MILD BEAR';
    return 'NEUTRAL';
  }

  function narrative(bias, ctx) {
    var parts = [];
    var pos = bias.factors.filter(function (f) { return f.score > 0; }).sort(function (a, b) { return Math.abs(b.weight * b.score) - Math.abs(a.weight * a.score); });
    var neg = bias.factors.filter(function (f) { return f.score < 0; }).sort(function (a, b) { return Math.abs(b.weight * b.score) - Math.abs(a.weight * a.score); });

    var intro = 'Composite bias is ' + bias.score + '/100 (' + labelFor(bias.score) + '). ';
    parts.push(intro);

    if (pos.length) {
      parts.push('Bullish drivers: ' + pos.slice(0, 4).map(function (f) { return f.label; }).join('; ') + '.');
    }
    if (neg.length) {
      parts.push('Bearish pressures: ' + neg.slice(0, 4).map(function (f) { return f.label; }).join('; ') + '.');
    }

    var atr = ctx.smc.atr;
    parts.push('ATR(14) is ' + TL.utils.fmtPrice(atr, ctx.asset) + ' — ' +
      (atr > ctx.price * 0.008 ? 'elevated volatility; size down and widen stops.' : 'moderate volatility; standard stop logic applies.'));

    if (ctx.supplyZone && ctx.demandZone) {
      parts.push('Key liquidity: nearest supply near ' + TL.utils.fmtPrice(ctx.supplyZone, ctx.asset) +
        ' and nearest demand near ' + TL.utils.fmtPrice(ctx.demandZone, ctx.asset) + '.');
    }

    return parts.join(' ');
  }

  /* ---------------- master run ---------------- */
  function run(asset, timeframe, bars, tools, dataInfo) {
    var ind = TL.indicators.compute(bars, tools);
    var smc = TL.smc.compute(bars, tools);
    var vp = TL.volumeProfile.compute(bars, tools.vp);
    var fib = TL.fibonacci.compute(bars, smc.swings, tools.fib);

    var price = bars[bars.length - 1].close;
    var keyLevels = buildKeyLevels(price, ind, smc, vp, fib);

    // nearest zone helpers
    var supplyZone = null, demandZone = null;
    if (keyLevels.resistances.length) {
      for (var i = 0; i < keyLevels.resistances.length; i++) {
        if (keyLevels.resistances[i].type === 'supply') { supplyZone = keyLevels.resistances[i].price; break; }
      }
    }
    if (keyLevels.supports.length) {
      for (var j = 0; j < keyLevels.supports.length; j++) {
        if (keyLevels.supports[j].type === 'demand') { demandZone = keyLevels.supports[j].price; break; }
      }
    }

    var ctx = {
      asset: asset, timeframe: timeframe, price: price,
      ind: ind, smc: smc, vp: vp, fib: fib,
      supplyZone: supplyZone, demandZone: demandZone
    };
    var bias = computeBias(ctx);
    var text = narrative(bias, ctx);

    return {
      asset: asset,
      timeframe: timeframe,
      data: dataInfo || {},
      bars: bars,
      price: price,
      indicators: ind,
      smc: smc,
      vp: vp,
      fib: fib,
      keyLevels: keyLevels,
      bias: bias,
      biasLabel: labelFor(bias.score),
      narrative: text,
      generatedAt: new Date().toISOString()
    };
  }

  return {
    run: run,
    labelFor: labelFor,
    nearestAboveBelow: nearestAboveBelow
  };
})();
