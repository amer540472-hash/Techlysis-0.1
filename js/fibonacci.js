/* Techlysis — Fibonacci retracements & extensions, auto-anchored to the
 * most recent significant swing leg (from the SMC swing points).
 */
'use strict';

window.TL = window.TL || {};

TL.fibonacci = (function () {

  function parseList(str, fallback) {
    if (!str || !String(str).trim()) return fallback.slice();
    return String(str).split(',').map(function (s) {
      return parseFloat(s.trim());
    }).filter(function (n) { return isFinite(n); });
  }

  /* choose the anchor leg: most recent swing low + swing high by index */
  function findLeg(swings) {
    if (!swings) return null;
    var hi = swings.highs && swings.highs.length ? swings.highs[swings.highs.length - 1] : null;
    var lo = swings.lows && swings.lows.length ? swings.lows[swings.lows.length - 1] : null;
    if (!hi || !lo) return null;
    if (hi.i > lo.i) {
      return { start: { price: lo.price, i: lo.i }, end: { price: hi.price, i: hi.i }, dir: 'up' };
    }
    return { start: { price: hi.price, i: hi.i }, end: { price: lo.price, i: lo.i }, dir: 'down' };
  }

  function compute(bars, swings, tools) {
    tools = tools || {};
    var t = TL.utils.deepMerge({
      ratios: '0.236,0.382,0.5,0.618,0.786',
      extRatios: '1.272,1.414,1.618,2.0,2.618'
    }, tools);

    var ratios = parseList(t.ratios, [0.236, 0.382, 0.5, 0.618, 0.786]);
    var extRatios = parseList(t.extRatios, [1.272, 1.414, 1.618, 2.0, 2.618]);

    var leg = findLeg(swings);
    if (!leg) {
      // fall back to range anchors
      var hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
      for (var i = 0; i < bars.length; i++) {
        if (bars[i].high > hi) { hi = bars[i].high; hiI = i; }
        if (bars[i].low < lo) { lo = bars[i].low; loI = i; }
      }
      leg = hiI > loI
        ? { start: { price: lo, i: loI }, end: { price: hi, i: hiI }, dir: 'up' }
        : { start: { price: hi, i: hiI }, end: { price: lo, i: loI }, dir: 'down' };
    }

    var span = leg.end.price - leg.start.price;
    var ret = ratios.map(function (r) {
      return { ratio: r, price: leg.end.price - r * span };
    });
    var ext = extRatios.map(function (r) {
      return { ratio: r, price: leg.end.price + r * span * (leg.dir === 'up' ? 1 : -1) };
    });

    return {
      start: leg.start,
      end: leg.end,
      dir: leg.dir,
      ret: ret,
      ext: ext,
      ratios: ratios,
      extRatios: extRatios
    };
  }

  /* nearest fib level to a price (for trade targeting / confluence) */
  function nearest(fib, price, side) {
    if (!fib) return null;
    var all = [];
    var i;
    for (i = 0; i < fib.ret.length; i++) all.push({ price: fib.ret[i].price, ratio: fib.ret[i].ratio, kind: 'ret' });
    for (i = 0; i < fib.ext.length; i++) all.push({ price: fib.ext[i].price, ratio: fib.ext[i].ratio, kind: 'ext' });
    if (side === 'above') all = all.filter(function (l) { return l.price >= price; });
    if (side === 'below') all = all.filter(function (l) { return l.price <= price; });
    if (!all.length) return null;
    var best = null, bestD = Infinity;
    for (var j = 0; j < all.length; j++) {
      var d = Math.abs(all[j].price - price);
      if (d < bestD) { bestD = d; best = all[j]; }
    }
    return best;
  }

  return { compute: compute, nearest: nearest, parseList: parseList };
})();
