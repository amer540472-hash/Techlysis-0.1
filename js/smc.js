/* Techlysis — Smart-Money-Concepts layer: swings, structure, BOS,
 * support/resistance, supply & demand zones, fair value gaps, order blocks.
 */
'use strict';

window.TL = window.TL || {};

TL.smc = (function () {

  /* ---------------- swings ---------------- */
  function findSwings(bars, strength) {
    strength = Math.max(1, strength || 2);
    var highs = [], lows = [];
    var n = bars.length;
    for (var i = strength; i < n - strength; i++) {
      var isHigh = true, isLow = true;
      for (var k = i - strength; k <= i + strength; k++) {
        if (k === i) continue;
        if (bars[k].high >= bars[i].high) isHigh = false;
        if (bars[k].low <= bars[i].low) isLow = false;
      }
      if (isHigh) highs.push({ i: i, price: bars[i].high });
      if (isLow) lows.push({ i: i, price: bars[i].low });
    }
    return { highs: highs, lows: lows };
  }

  function mergeSwings(swings) {
    var pts = [];
    for (var i = 0; i < swings.highs.length; i++) pts.push({ i: swings.highs[i].i, price: swings.highs[i].price, type: 'high' });
    for (var j = 0; j < swings.lows.length; j++) pts.push({ i: swings.lows[j].i, price: swings.lows[j].price, type: 'low' });
    pts.sort(function (a, b) { return a.i - b.i; });
    return pts;
  }

  /* ---------------- market structure (HH/HL/LH/LL) ---------------- */
  function structure(bars, swings) {
    var pts = mergeSwings(swings);
    var lastHigh = null, lastLow = null;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p.type === 'high') {
        var hLabel = (lastHigh == null) ? 'HH' : (p.price > lastHigh.price ? 'HH' : 'LH');
        out.push({ i: p.i, price: p.price, type: hLabel, swing: 'high' });
        lastHigh = p;
      } else {
        var lLabel = (lastLow == null) ? 'HL' : (p.price > lastLow.price ? 'HL' : 'LL');
        out.push({ i: p.i, price: p.price, type: lLabel, swing: 'low' });
        lastLow = p;
      }
    }
    return out;
  }

  /* ---------------- break of structure ---------------- */
  function detectBOS(bars, swings) {
    var events = [];
    var n = bars.length;
    var highs = swings.highs.slice();
    var lows = swings.lows.slice();
    // bullish BOS: a later close exceeds a prior swing high
    for (var a = 0; a < highs.length; a++) {
      var sh = highs[a];
      for (var j = sh.i + 1; j < n; j++) {
        if (bars[j].close > sh.price) {
          events.push({ i: j, price: sh.price, dir: 'bull', level: sh.i });
          break;
        }
      }
    }
    for (var b = 0; b < lows.length; b++) {
      var sl = lows[b];
      for (var k = sl.i + 1; k < n; k++) {
        if (bars[k].close < sl.price) {
          events.push({ i: k, price: sl.price, dir: 'bear', level: sl.i });
          break;
        }
      }
    }
    events.sort(function (x, y) { return x.i - y.i; });
    // dedupe same bar+dir (keep one)
    var seen = {};
    var dedup = [];
    for (var c = 0; c < events.length; c++) {
      var key = events[c].i + ':' + events[c].dir;
      if (!seen[key]) { seen[key] = true; dedup.push(events[c]); }
    }
    return dedup;
  }

  /* ---------------- support / resistance clusters ---------------- */
  function clusterLevels(prices, tolerance) {
    var sorted = prices.slice().sort(function (a, b) { return a - b; });
    var clusters = [];
    for (var i = 0; i < sorted.length; i++) {
      var placed = false;
      for (var j = 0; j < clusters.length; j++) {
        if (Math.abs(sorted[i] - clusters[j].price) <= tolerance) {
          clusters[j].touches++;
          clusters[j].price = (clusters[j].price * (clusters[j].touches - 1) + sorted[i]) / clusters[j].touches;
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ price: sorted[i], touches: 1 });
    }
    return clusters.filter(function (c) { return c.touches >= 2; });
  }

  function srLevels(bars, swings, atr) {
    var last = bars[bars.length - 1];
    var tolerance = Math.max((atr && isFinite(atr)) ? atr * 0.35 : 0, last.close * 0.0012);
    var highPrices = swings.highs.map(function (s) { return s.price; });
    var lowPrices = swings.lows.map(function (s) { return s.price; });
    // add classic pivot candidate touches are handled separately
    var res = clusterLevels(highPrices, tolerance).map(function (c) {
      return { price: c.price, touches: c.touches, type: 'resistance' };
    });
    var sup = clusterLevels(lowPrices, tolerance).map(function (c) {
      return { price: c.price, touches: c.touches, type: 'support' };
    });
    var all = res.concat(sup);
    all.sort(function (a, b) { return b.price - a.price; });
    // tag major levels
    all.forEach(function (l) { l.major = l.touches >= 3; });
    return all;
  }

  /* ---------------- supply / demand zones ---------------- */
  function avgBody(bars) {
    var s = 0;
    for (var i = 0; i < bars.length; i++) s += Math.abs(bars[i].close - bars[i].open);
    return s / bars.length;
  }

  function supplyDemand(bars, lookback, strength) {
    var ab = avgBody(bars);
    if (!(ab > 0)) ab = 1;
    var supply = [], demand = [];
    var n = bars.length;
    for (var i = 1; i < n - lookback - 1; i++) {
      var b = bars[i];
      // SUPPLY: bullish base candle then impulsive down move
      if (b.close > b.open) {
        var minLow = Infinity, bearishCount = 0;
        for (var k = 1; k <= lookback; k++) {
          var c = bars[i + k];
          if (c.low < minLow) minLow = c.low;
          if (c.close < c.open) bearishCount++;
        }
        var drop = b.close - minLow;
        if (drop > strength * ab && bearishCount >= Math.ceil(lookback * 0.6)) {
          supply.push({ top: b.high, bottom: b.low, strength: drop / ab, baseI: i });
        }
      }
      // DEMAND: bearish base candle then impulsive up move
      if (b.close < b.open) {
        var maxHigh = -Infinity, bullishCount = 0;
        for (var m = 1; m <= lookback; m++) {
          var d = bars[i + m];
          if (d.high > maxHigh) maxHigh = d.high;
          if (d.close > d.open) bullishCount++;
        }
        var rise = maxHigh - b.close;
        if (rise > strength * ab && bullishCount >= Math.ceil(lookback * 0.6)) {
          demand.push({ top: b.high, bottom: b.low, strength: rise / ab, baseI: i });
        }
      }
    }
    return { supply: supply, demand: demand };
  }

  /* merge overlapping zones & compute "freshness" (price hasn't retested) */
  function mergeZones(zones) {
    var out = [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      var merged = false;
      for (var j = 0; j < out.length; j++) {
        var o = out[j];
        var overlap = Math.max(0, Math.min(z.top, o.top) - Math.max(z.bottom, o.bottom));
        var h1 = z.top - z.bottom, h2 = o.top - o.bottom;
        if (overlap > 0.5 * Math.min(h1, h2)) {
          o.top = Math.max(z.top, o.top);
          o.bottom = Math.min(z.bottom, o.bottom);
          o.strength += z.strength;
          o.baseI = Math.min(o.baseI, z.baseI);
          merged = true;
          break;
        }
      }
      if (!merged) out.push(z);
    }
    out.sort(function (a, b) { return b.strength - a.strength; });
    return out;
  }

  /* A zone is "fresh" (unmitigated) when price has not RETURNED to it after
   * fully leaving it. The impulsive departure bar usually still overlaps the
   * zone, so a plain "any touch" scan would mark everything mitigated; we
   * only count a re-entry that happens after a bar closes entirely outside
   * the zone. The current (last) bar is excluded from the scan so a zone
   * being tested right now still counts as fresh — that first touch is
   * exactly what makes it tradable. */
  function markFresh(zones, bars) {
    var scanEnd = Math.max(0, bars.length - 1); // exclusive
    return zones.map(function (z) {
      var left = false;      // price fully departed the zone at some point
      var revisited = false; // ...and later traded back into it
      for (var i = z.baseI + 1; i < scanEnd; i++) {
        var b = bars[i];
        if (!left) {
          if (b.low > z.top || b.high < z.bottom) left = true;
        } else if (b.high >= z.bottom && b.low <= z.top) {
          revisited = true;
          break;
        }
      }
      z.fresh = !revisited;
      return z;
    });
  }

  /* ---------------- fair value gaps ---------------- */
  function findFVG(bars, lookback) {
    var fvgs = [];
    var n = bars.length;
    var start = Math.max(1, n - lookback - 2);
    for (var i = start; i < n - 1; i++) {
      var a = bars[i - 1], c = bars[i + 1];
      if (!a || !c) continue;
      // bullish FVG: gap up leaving price between c1.high and c3.low
      if (a.high < c.low) {
        fvgs.push({ top: c.low, bottom: a.high, type: 'bull', i: i });
      }
      // bearish FVG: gap down
      if (a.low > c.high) {
        fvgs.push({ top: a.low, bottom: c.high, type: 'bear', i: i });
      }
    }
    // mark filled if price traded back into the gap since formation
    return fvgs.map(function (f) {
      f.filled = false;
      for (var j = f.i + 1; j < n; j++) {
        if (bars[j].low <= f.bottom && bars[j].high >= f.top) { f.filled = true; break; }
      }
      return f;
    });
  }

  /* ---------------- order blocks ---------------- */
  function findOrderBlocks(bars, atrArr, lookback, mult) {
    var obs = [];
    var n = bars.length;
    for (var i = 1; i < n - lookback - 1; i++) {
      var b = bars[i];
      var ref = atrArr[i] || 0.0001;
      // bullish OB: last bearish candle before impulsive up move
      if (b.close < b.open) {
        var maxHigh = -Infinity;
        for (var k = 1; k <= lookback; k++) maxHigh = Math.max(maxHigh, bars[i + k].high);
        if (maxHigh - b.close > mult * ref) {
          obs.push({ top: b.high, bottom: b.low, type: 'bull', strength: (maxHigh - b.close) / ref, baseI: i });
        }
      }
      // bearish OB: last bullish candle before impulsive down move
      if (b.close > b.open) {
        var minLow = Infinity;
        for (var m = 1; m <= lookback; m++) minLow = Math.min(minLow, bars[i + m].low);
        if (b.close - minLow > mult * ref) {
          obs.push({ top: b.high, bottom: b.low, type: 'bear', strength: (b.close - minLow) / ref, baseI: i });
        }
      }
    }
    // dedupe by baseI
    var seen = {};
    obs = obs.filter(function (o) {
      if (seen[o.baseI]) return false;
      seen[o.baseI] = true;
      return true;
    });
    obs = markFresh(obs, bars);
    obs.sort(function (a, b) { return b.strength - a.strength; });
    return obs;
  }

  /* ---------------- master compute ---------------- */
  function compute(bars, tools) {
    tools = tools || {};
    var t = TL.utils.deepMerge({
      swings: { strength: 2 },
      fvg: { lookback: 5 }
    }, tools);

    var swings = findSwings(bars, t.swings.strength);
    var struct = structure(bars, swings);
    var bos = detectBOS(bars, swings);
    var atr = TL.indicators.atrArr(bars.map(function (b) { return b.high; }),
      bars.map(function (b) { return b.low; }),
      bars.map(function (b) { return b.close; }), 14);
    var lastATR = TL.indicators.last(atr) || (bars[bars.length - 1].close * 0.005);

    var sr = srLevels(bars, swings, lastATR);

    var sd = supplyDemand(bars, 4, 1.5);
    var supply = mergeZones(sd.supply);
    var demand = mergeZones(sd.demand);
    supply = markFresh(supply, bars).slice(0, 6);
    demand = markFresh(demand, bars).slice(0, 6);

    var fvgs = findFVG(bars, t.fvg.lookback);
    var orderBlocks = findOrderBlocks(bars, atr, 3, 1.2).slice(0, 8);

    // major highs/lows = most extreme swing points in view
    var majorHighs = swings.highs.slice().sort(function (a, b) { return b.price - a.price; }).slice(0, 3);
    var majorLows = swings.lows.slice().sort(function (a, b) { return a.price - b.price; }).slice(0, 3);

    return {
      swings: swings,
      structure: struct,
      bos: bos,
      sr: sr,
      supply: supply,
      demand: demand,
      fvg: fvgs,
      orderBlocks: orderBlocks,
      majorHighs: majorHighs,
      majorLows: majorLows,
      atr: lastATR
    };
  }

  return {
    findSwings: findSwings,
    structure: structure,
    detectBOS: detectBOS,
    srLevels: srLevels,
    supplyDemand: supplyDemand,
    findFVG: findFVG,
    findOrderBlocks: findOrderBlocks,
    compute: compute
  };
})();
