/* Techlysis — fixed-range volume profile (POC / VAH / VAL / HVN / LVN) */
'use strict';

window.TL = window.TL || {};

TL.volumeProfile = (function () {

  function compute(bars, tools) {
    tools = tools || {};
    var t = TL.utils.deepMerge({ bins: 40, valueArea: 0.7, width: 60 }, tools);
    var bins = Math.max(10, Math.min(200, t.bins || 40));
    var valueAreaPct = TL.utils.clamp(t.valueArea || 0.7, 0.5, 0.9);

    if (!bars || !bars.length) return null;

    var min = Infinity, max = -Infinity;
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].low < min) min = bars[i].low;
      if (bars[i].high > max) max = bars[i].high;
    }
    if (!isFinite(min) || !isFinite(max) || max <= min) return null;

    var step = (max - min) / bins;
    var binPrice = new Array(bins);
    var binVol = new Array(bins).fill(0);
    for (var b = 0; b < bins; b++) {
      binPrice[b] = min + step * (b + 0.5);
    }

    var totalVolume = 0;
    for (var k = 0; k < bars.length; k++) {
      var bar = bars[k];
      var vol = bar.volume || 0;
      if (vol <= 0) continue;
      var range = (bar.high - bar.low) || 1;
      var idx = Math.min(bins - 1, Math.max(0, Math.floor((bar.close - min) / step)));
      // simple attribution: full volume to close's bin (close approximation)
      var closeIdx = idx;
      binVol[closeIdx] += vol;
      totalVolume += vol;
    }
    if (totalVolume <= 0) {
      // synthetic volumes have values, but guard anyway
      for (var g = 0; g < bins; g++) binVol[g] = 1;
      totalVolume = bins;
    }

    // POC = highest volume bin
    var pocIdx = 0;
    for (var p = 1; p < bins; p++) if (binVol[p] > binVol[pocIdx]) pocIdx = p;
    var poc = binPrice[pocIdx];

    // value area: expand outward from POC until target % of volume captured
    var targetVol = totalVolume * valueAreaPct;
    var lo = pocIdx, hi = pocIdx;
    var captured = binVol[pocIdx];
    while (captured < targetVol && (lo > 0 || hi < bins - 1)) {
      var down = lo > 0 ? binVol[lo - 1] : -Infinity;
      var up = hi < bins - 1 ? binVol[hi + 1] : -Infinity;
      if (down >= up && lo > 0) { lo--; captured += binVol[lo]; }
      else if (hi < bins - 1) { hi++; captured += binVol[hi]; }
      else if (lo > 0) { lo--; captured += binVol[lo]; }
      else break;
    }
    var vah = binPrice[hi];
    var val = binPrice[lo];

    // HVN / LVN thresholds relative to mean bin volume
    var mean = totalVolume / bins;
    var hvn = [], lvn = [];
    for (var h = 0; h < bins; h++) {
      if (binVol[h] >= mean * 1.6) hvn.push(binPrice[h]);
      if (binVol[h] <= mean * 0.3) lvn.push(binPrice[h]);
    }

    return {
      bins: binPrice.map(function (price, i) { return { price: price, volume: binVol[i] }; }),
      minPrice: min,
      maxPrice: max,
      poc: poc,
      vah: vah,
      val: val,
      hvn: hvn,
      lvn: lvn,
      totalVolume: totalVolume,
      valueAreaPct: valueAreaPct,
      width: t.width
    };
  }

  /* find the nearest VP level to a given price (for trade targeting) */
  function nearestLevel(vp, price, kind) {
    if (!vp) return null;
    var list = [];
    if (kind === 'poc') list = [vp.poc];
    else if (kind === 'vah') list = [vp.vah];
    else if (kind === 'val') list = [vp.val];
    else if (kind === 'hvn') list = vp.hvn || [];
    else if (kind === 'lvn') list = vp.lvn || [];
    if (!list.length) return null;
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(list[i] - price);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  return { compute: compute, nearestLevel: nearestLevel };
})();
