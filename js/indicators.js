/* Techlysis — technical indicators (pure JS, arrays aligned to bars) */
'use strict';

window.TL = window.TL || {};

TL.indicators = (function () {

  /* fill nulls helper */
  function nz(len, val) {
    var a = new Array(len);
    for (var i = 0; i < len; i++) a[i] = val;
    return a;
  }

  function smaArr(values, period) {
    var out = nz(values.length, null);
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function emaArr(values, period) {
    var out = nz(values.length, null);
    if (values.length < period) return out;
    var k = 2 / (period + 1);
    var seed = 0;
    for (var i = 0; i < period; i++) seed += values[i];
    var prev = seed / period;
    out[period - 1] = prev;
    for (var j = period; j < values.length; j++) {
      prev = values[j] * k + prev * (1 - k);
      out[j] = prev;
    }
    return out;
  }

  function rsiArr(closes, period) {
    var out = nz(closes.length, null);
    if (closes.length <= period) return out;
    var gain = 0, loss = 0;
    for (var i = 1; i <= period; i++) {
      var ch0 = closes[i] - closes[i - 1];
      if (ch0 >= 0) gain += ch0; else loss -= ch0;
    }
    var avgGain = gain / period, avgLoss = loss / period;
    function rsi(g, l) {
      if (g === 0 && l === 0) return 50;      // perfectly flat market
      return l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    out[period] = rsi(avgGain, avgLoss);
    for (var j = period + 1; j < closes.length; j++) {
      var ch = closes[j] - closes[j - 1];
      avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
      out[j] = rsi(avgGain, avgLoss);
    }
    return out;
  }

  function macdArr(closes, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var ef = emaArr(closes, fast);
    var es = emaArr(closes, slow);
    var macd = nz(closes.length, null);
    for (var i = 0; i < closes.length; i++) {
      if (ef[i] != null && es[i] != null) macd[i] = ef[i] - es[i];
    }
    // signal line = EMA of macd, seeded at the first defined macd value
    var firstIdx = macd.findIndex(function (v) { return v != null; });
    var sigArr = nz(closes.length, null);
    var hist = nz(closes.length, null);
    if (firstIdx >= 0) {
      var k = 2 / (signal + 1);
      var seed = 0, n = 0;
      for (var a = firstIdx; a < firstIdx + signal && a < closes.length; a++) { seed += macd[a] || 0; n++; }
      var prev = n ? seed / n : 0;
      for (var b = firstIdx; b < closes.length; b++) {
        if (b === firstIdx + signal - 1) sigArr[b] = prev;
        else if (b >= firstIdx + signal) {
          prev = (macd[b] || 0) * k + prev * (1 - k);
          sigArr[b] = prev;
        }
      }
      for (var c = 0; c < closes.length; c++) {
        if (macd[c] != null && sigArr[c] != null) hist[c] = macd[c] - sigArr[c];
      }
    }
    return { macd: macd, signal: sigArr, hist: hist };
  }

  function stochArr(highs, lows, closes, k, d) {
    k = k || 14; d = d || 3;
    var kArr = nz(closes.length, null);
    for (var i = k - 1; i < closes.length; i++) {
      var hh = -Infinity, ll = Infinity;
      for (var j = i - k + 1; j <= i; j++) {
        if (highs[j] > hh) hh = highs[j];
        if (lows[j] < ll) ll = lows[j];
      }
      kArr[i] = (hh === ll) ? 50 : 100 * (closes[i] - ll) / (hh - ll);
    }
    var dArr = nz(closes.length, null);
    for (var m = k - 1 + d - 1; m < closes.length; m++) {
      var s = 0;
      for (var q = m - d + 1; q <= m; q++) s += kArr[q];
      dArr[m] = s / d;
    }
    return { k: kArr, d: dArr };
  }

  function trArr(highs, lows, closes) {
    var tr = nz(closes.length, 0);
    for (var i = 1; i < closes.length; i++) {
      var h = Math.abs(highs[i] - lows[i]);
      var a = Math.abs(highs[i] - closes[i - 1]);
      var b = Math.abs(lows[i] - closes[i - 1]);
      tr[i] = Math.max(h, a, b);
    }
    return tr;
  }

  function atrArr(highs, lows, closes, period) {
    period = period || 14;
    var tr = trArr(highs, lows, closes);
    var out = nz(closes.length, null);
    if (closes.length <= period) return out;
    var sum = 0;
    for (var i = 1; i <= period; i++) sum += tr[i];
    var prev = sum / period;
    out[period] = prev;
    for (var j = period + 1; j < closes.length; j++) {
      prev = (prev * (period - 1) + tr[j]) / period;
      out[j] = prev;
    }
    return out;
  }

  function adxArr(highs, lows, closes, period) {
    period = period || 14;
    var len = closes.length;
    var pdi = nz(len, null), ndi = nz(len, null), adx = nz(len, null);
    if (len <= period * 2) return { adx: adx, pdi: pdi, ndi: ndi };
    var tr = nz(len, 0), pdm = nz(len, 0), ndm = nz(len, 0);
    for (var i = 1; i < len; i++) {
      tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      var up = highs[i] - highs[i - 1];
      var dn = lows[i - 1] - lows[i];
      pdm[i] = (up > dn && up > 0) ? up : 0;
      ndm[i] = (dn > up && dn > 0) ? dn : 0;
    }
    var sTR = 0, sPDM = 0, sNDM = 0;
    for (var a = 1; a <= period; a++) { sTR += tr[a]; sPDM += pdm[a]; sNDM += ndm[a]; }
    var aTR = sTR, aPDM = sPDM, aNDM = sNDM;
    var dxArr = nz(len, null);
    function calc(j) {
      var p = (aTR === 0) ? 0 : 100 * aPDM / aTR;
      var n = (aTR === 0) ? 0 : 100 * aNDM / aTR;
      pdi[j] = p; ndi[j] = n;
      var dxx = (p + n === 0) ? 0 : 100 * Math.abs(p - n) / (p + n);
      dxArr[j] = dxx;
    }
    calc(period);
    for (var b = period + 1; b < len; b++) {
      aTR = aTR - aTR / period + tr[b];
      aPDM = aPDM - aPDM / period + pdm[b];
      aNDM = aNDM - aNDM / period + ndm[b];
      calc(b);
    }
    // ADX = Wilder-smoothed DX (period)
    var sDX = 0, nDX = 0;
    for (var c = period; c < period * 2; c++) { if (dxArr[c] != null) { sDX += dxArr[c]; nDX++; } }
    var aDX = nDX ? sDX / nDX : 0;
    var start = period * 2 - 1;
    adx[start] = aDX;
    for (var e = start + 1; e < len; e++) {
      aDX = (aDX * (period - 1) + (dxArr[e] == null ? 0 : dxArr[e])) / period;
      adx[e] = aDX;
    }
    return { adx: adx, pdi: pdi, ndi: ndi };
  }

  function vwapArr(bars) {
    var out = nz(bars.length, null);
    var cumPV = 0, cumV = 0;
    for (var i = 0; i < bars.length; i++) {
      var tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
      var v = bars[i].volume || 0;
      cumPV += tp * v;
      cumV += v;
      out[i] = cumV > 0 ? cumPV / cumV : null;
    }
    return out;
  }

  function bollingerArr(closes, period, mult) {
    period = period || 20; mult = mult == null ? 2 : mult;
    var mid = smaArr(closes, period);
    var up = nz(closes.length, null), lo = nz(closes.length, null);
    for (var i = period - 1; i < closes.length; i++) {
      var s = 0;
      for (var j = i - period + 1; j <= i; j++) s += closes[j];
      var mean = s / period;
      var ss = 0;
      for (var k = i - period + 1; k <= i; k++) { var d = closes[k] - mean; ss += d * d; }
      var sd = Math.sqrt(ss / period);
      up[i] = mean + mult * sd;
      lo[i] = mean - mult * sd;
    }
    return { upper: up, middle: mid, lower: lo };
  }

  /* Classic floor pivots computed from the PREVIOUS calendar day. */
  function classicPivots(bars) {
    if (!bars || bars.length < 2) return null;
    var byDay = {};
    for (var i = 0; i < bars.length; i++) {
      var d = new Date(bars[i].time).toISOString().slice(0, 10);
      (byDay[d] = byDay[d] || []).push(bars[i]);
    }
    var days = Object.keys(byDay).sort();
    var src;
    if (days.length >= 2) {
      src = byDay[days[days.length - 2]];
    } else {
      src = bars.slice(0, bars.length - 1);
      if (!src.length) src = [bars[0]];
    }
    var H = -Infinity, L = Infinity, C = 0;
    for (var j = 0; j < src.length; j++) {
      if (src[j].high > H) H = src[j].high;
      if (src[j].low < L) L = src[j].low;
      C = src[j].close;
    }
    var P = (H + L + C) / 3;
    return {
      day: days.length >= 2 ? days[days.length - 2] : null,
      p: P, r1: 2 * P - L, s1: 2 * P - H,
      r2: P + (H - L), s2: P - (H - L),
      r3: H + 2 * (P - L), s3: L - 2 * (H - P),
      high: H, low: L, close: C
    };
  }

  function last(arr) {
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
    return null;
  }

  function compute(bars, tools) {
    tools = tools || {};
    var t = TL.utils.deepMerge({
      bb: { period: 20, mult: 2 },
      rsi: { period: 14, ob: 70, os: 30 }
    }, tools || {});
    var closes = bars.map(function (b) { return b.close; });
    var highs = bars.map(function (b) { return b.high; });
    var lows = bars.map(function (b) { return b.low; });

    var ema9 = emaArr(closes, 9);
    var ema21 = emaArr(closes, 21);
    var ema50 = emaArr(closes, 50);
    var ema200 = emaArr(closes, 200);
    var sma20 = smaArr(closes, 20);
    var bb = bollingerArr(closes, t.bb.period, t.bb.mult);
    var vwap = vwapArr(bars);
    var rsi = rsiArr(closes, t.rsi.period);
    var macd = macdArr(closes, 12, 26, 9);
    var stoch = stochArr(highs, lows, closes, 14, 3);
    var adx = adxArr(highs, lows, closes, 14);
    var atr = atrArr(highs, lows, closes, 14);

    return {
      ema9: ema9,
      ema21: ema21,
      ema50: ema50,
      ema200: ema200,
      sma20: sma20,
      bb: bb,
      vwap: vwap,
      rsi: rsi,
      macd: macd,
      stoch: stoch,
      adx: adx,
      atr: atr,
      pivots: classicPivots(bars),
      last: {
        rsi: last(rsi),
        atr: last(atr),
        adx: last(adx.adx),
        macd: last(macd.macd),
        macdSignal: last(macd.signal),
        macdHist: last(macd.hist),
        stochK: last(stoch.k),
        stochD: last(stoch.d),
        ema9: last(ema9),
        ema21: last(ema21),
        ema50: last(ema50),
        ema200: last(ema200),
        sma20: last(sma20),
        bbUpper: last(bb.upper),
        bbMiddle: last(bb.middle),
        bbLower: last(bb.lower),
        vwap: last(vwap)
      }
    };
  }

  return {
    smaArr: smaArr,
    emaArr: emaArr,
    rsiArr: rsiArr,
    macdArr: macdArr,
    stochArr: stochArr,
    atrArr: atrArr,
    adxArr: adxArr,
    vwapArr: vwapArr,
    bollingerArr: bollingerArr,
    classicPivots: classicPivots,
    compute: compute,
    last: last
  };
})();
