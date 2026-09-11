/* Techlysis — market data layer.
 *
 * Cascade per asset class, with a labelled source badge and a seeded
 * synthetic demo fallback that always works (offline included). Tries direct
 * fetch first, then public CORS proxies, so the app never hard-crashes.
 */
'use strict';

window.TL = window.TL || {};

TL.data = (function () {

  /* ---------------- low-level fetch with CORS fallback ---------------- */
  async function fetchText(url) {
    var lastErr = null;
    for (var i = 0; i < TL.CORS_PROXIES.length; i++) {
      var target;
      try {
        target = TL.CORS_PROXIES[i](url);
      } catch (e) { continue; }
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 12000);
      try {
        var res = await fetch(target, { signal: ctrl.signal });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        return await res.text();
      } catch (e) {
        lastErr = e;
        continue;
      } finally {
        clearTimeout(timer); // never leave abort timers dangling on failures
      }
    }
    throw lastErr || new Error('Fetch failed: ' + url);
  }

  /* ---------------- helpers ---------------- */
  function sortAsc(bars) { bars.sort(function (a, b) { return a.time - b.time; }); return bars; }

  /* Aggregate `bars` by `factor`, aligned to epoch windows of the target
   * timeframe so e.g. 4h bars start at 00/04/08/12/16/20 UTC regardless of
   * where the source series begins. `stepMs` is the source bar duration. */
  function resample(bars, factor, stepMs) {
    if (!factor || factor <= 1) return bars;
    if (!stepMs || !(stepMs > 0)) {
      // unknown source step: fall back to fixed chunking anchored at the end
      var out = [];
      var offset = bars.length % factor;
      if (offset > 0) {
        out.push(mergeChunk(bars.slice(0, offset)));
      }
      for (var i = offset; i < bars.length; i += factor) {
        out.push(mergeChunk(bars.slice(i, i + factor)));
      }
      return out.filter(Boolean);
    }
    var win = factor * stepMs;
    var res = [];
    var cur = null, curKey = null;
    for (var j = 0; j < bars.length; j++) {
      var b = bars[j];
      var key = Math.floor(b.time / win);
      if (key !== curKey) {
        cur = { time: key * win, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
        res.push(cur);
        curKey = key;
      } else {
        if (b.high > cur.high) cur.high = b.high;
        if (b.low < cur.low) cur.low = b.low;
        cur.close = b.close;
        cur.volume += (b.volume || 0);
      }
    }
    return res;
  }

  function mergeChunk(chunk) {
    if (!chunk || !chunk.length) return null;
    var h = -Infinity, l = Infinity, v = 0;
    for (var j = 0; j < chunk.length; j++) {
      if (chunk[j].high > h) h = chunk[j].high;
      if (chunk[j].low < l) l = chunk[j].low;
      v += chunk[j].volume || 0;
    }
    return { time: chunk[0].time, open: chunk[0].open, high: h, low: l, close: chunk[chunk.length - 1].close, volume: v };
  }

  function parseTwelveDate(dt) {
    if (!dt) return NaN;
    if (dt.length === 10) return Date.parse(dt + 'T00:00:00Z');
    return Date.parse(dt.replace(' ', 'T') + 'Z');
  }

  /* ---------------- source adapters ---------------- */

  async function twelveData(assetKey, fetchTf, need) {
    var cfg = TL.ASSETS[assetKey];
    var key = TL.env.env.TWELVE_DATA_API_KEY;
    if (!key) throw new Error('No Twelve Data API key');
    if (!cfg.twelveData) throw new Error('No Twelve Data symbol');
    var interval = TL.TIMEFRAMES[fetchTf].twelve;
    if (!interval) throw new Error('Twelve Data: unsupported interval ' + fetchTf);
    var out = Math.min(Math.max(need, 30), 5000);
    var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(cfg.twelveData) +
      '&interval=' + interval + '&outputsize=' + out + '&apikey=' + encodeURIComponent(key);
    var text = await fetchText(url);
    var data = JSON.parse(text);
    if (data.status === 'error') throw new Error(data.message || 'Twelve Data error');
    if (!Array.isArray(data.values) || !data.values.length) throw new Error('Twelve Data: empty');
    var bars = data.values.map(function (v) {
      return {
        time: parseTwelveDate(v.datetime),
        open: parseFloat(v.open), high: parseFloat(v.high),
        low: parseFloat(v.low), close: parseFloat(v.close),
        volume: v.volume ? parseFloat(v.volume) : 0
      };
    }).filter(function (b) { return isFinite(b.time) && isFinite(b.close); });
    sortAsc(bars);
    return { bars: bars, source: 'Twelve Data', detail: 'Twelve Data ' + cfg.twelveData + ' ' + interval };
  }

  async function yahoo(assetKey, fetchTf, need) {
    var cfg = TL.ASSETS[assetKey];
    if (!cfg.yahoo) throw new Error('No Yahoo symbol');
    var t = TL.TIMEFRAMES[fetchTf];
    var interval = t.yahoo;
    if (!interval) throw new Error('Yahoo: unsupported interval ' + fetchTf);
    var range = t.yahooRange || '1mo';
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + cfg.yahoo +
      '?interval=' + interval + '&range=' + range + '&includePrePost=false';
    var text = await fetchText(url);
    var data = JSON.parse(text);
    var res = data.chart && data.chart.result && data.chart.result[0];
    if (!res) throw new Error('Yahoo: bad response');
    var ts = res.timestamp || [];
    var q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    var bars = [];
    for (var i = 0; i < ts.length; i++) {
      var o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
      if (o == null || h == null || l == null || c == null) continue;
      bars.push({ time: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: v == null ? 0 : v });
    }
    if (!bars.length) throw new Error('Yahoo: empty');
    sortAsc(bars);
    return { bars: bars, source: 'Yahoo', detail: 'Yahoo ' + cfg.yahoo + ' ' + interval };
  }

  async function stooq(assetKey, fetchTf, need) {
    if (fetchTf !== '1d') throw new Error('Stooq: daily only');
    var cfg = TL.ASSETS[assetKey];
    if (!cfg.stooq) throw new Error('No Stooq symbol');
    var url = 'https://stooq.com/q/d/l/?s=' + cfg.stooq + '&i=d';
    var text = await fetchText(url);
    var lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('Stooq: empty');
    var bars = [];
    for (var i = 1; i < lines.length; i++) {
      var p = lines[i].split(',');
      if (p.length < 5) continue;
      var o = parseFloat(p[1]), h = parseFloat(p[2]), l = parseFloat(p[3]), c = parseFloat(p[4]);
      var v = p[5] ? parseFloat(p[5]) : 0;
      if (!isFinite(o) || !isFinite(c)) continue;
      bars.push({ time: Date.parse(p[0] + 'T00:00:00Z'), open: o, high: h, low: l, close: c, volume: v });
    }
    if (!bars.length) throw new Error('Stooq: no rows');
    sortAsc(bars);
    return { bars: bars, source: 'Stooq', detail: 'Stooq ' + cfg.stooq };
  }

  async function binance(assetKey, fetchTf, need) {
    var cfg = TL.ASSETS[assetKey];
    if (!cfg.binance) throw new Error('No Binance symbol');
    var interval = TL.TIMEFRAMES[fetchTf].binance;
    if (!interval) throw new Error('Binance: unsupported interval ' + fetchTf);
    // klines caps at 1000 rows/request — page backwards when more are needed
    var target = Math.min(Math.max(need, 30), 3000);
    var baseUrl = 'https://api.binance.com/api/v3/klines?symbol=' + cfg.binance + '&interval=' + interval;
    var rows = [];
    var endTime = null;
    while (rows.length < target) {
      var take = Math.min(1000, target - rows.length);
      var url = baseUrl + '&limit=' + take + (endTime ? '&endTime=' + endTime : '');
      var text = await fetchText(url);
      var page = JSON.parse(text);
      if (!Array.isArray(page) || !page.length) break;
      rows = page.concat(rows);
      if (page.length < take) break;           // no more history
      endTime = page[0][0] - 1;                // next page ends before this one
    }
    if (!rows.length) throw new Error('Binance: empty');
    // de-dupe by open time (safety for overlapping pages)
    var seen = {};
    var bars = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (seen[r[0]]) continue;
      seen[r[0]] = true;
      bars.push({ time: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
    }
    sortAsc(bars);
    return { bars: bars, source: 'Binance', detail: 'Binance ' + cfg.binance + ' ' + interval };
  }

  async function coingecko(assetKey, fetchTf, need) {
    var cfg = TL.ASSETS[assetKey];
    if (!cfg.coingecko) throw new Error('No CoinGecko id');
    if (fetchTf !== '1d') throw new Error('CoinGecko: daily OHLC only');
    var days = Math.min(Math.max(Math.ceil(need * 1.5), 30), 365);
    var url = 'https://api.coingecko.com/api/v3/coins/' + cfg.coingecko + '/ohlc?vs_currency=usd&days=' + days;
    var text = await fetchText(url);
    var rows = JSON.parse(text);
    if (!Array.isArray(rows) || !rows.length) throw new Error('CoinGecko: empty');
    var bars = rows.map(function (r) {
      return { time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: 0 };
    });
    sortAsc(bars);
    return { bars: bars, source: 'CoinGecko', detail: 'CoinGecko ' + cfg.coingecko + ' daily' };
  }

  /* ---------------- synthetic demo generator ---------------- */
  var BASE_PRICE = {
    XAUUSD: 2350, EURUSD: 1.085, USOIL: 78.5, GBPJPY: 191.5, BTCUSD: 64000, ETHUSD: 3200
  };
  var VOL_PCT = {
    XAUUSD: 0.28, EURUSD: 0.07, USOIL: 0.8, GBPJPY: 0.14, BTCUSD: 1.4, ETHUSD: 1.9
  };
  var BASE_VOL = {
    XAUUSD: 8000, EURUSD: 50000, USOIL: 40000, GBPJPY: 30000, BTCUSD: 600, ETHUSD: 9000
  };
  var DECIMALS = {
    XAUUSD: 2, EURUSD: 5, USOIL: 2, GBPJPY: 3, BTCUSD: 1, ETHUSD: 2
  };

  function synthetic(assetKey, tfKey, count) {
    var tf = TL.TIMEFRAMES[tfKey];
    // seed changes daily → demo data looks fresh but stays deterministic offline
    var dayKey = new Date().toISOString().slice(0, 10);
    var seed = TL.utils.hashString('synthetic:' + assetKey + ':' + tfKey + ':' + dayKey);
    var rand = TL.utils.mulberry32(seed);
    var base = BASE_PRICE[assetKey] || 100;
    var dec = DECIMALS[assetKey] || 2;
    // per-bar log-return std, normalized so 1h ≈ VOL_PCT%, daily scales up
    var sigma = (VOL_PCT[assetKey] || 0.3) / 100 * Math.sqrt(Math.max(tf.minutes, 1) / 60);
    var warm = 260;
    var total = count + warm;
    var stepMs = tf.minutes * 60000;
    var end = Date.now() - (Date.now() % stepMs);

    var bars = [];
    var logP = Math.log(base);
    var mu = 0;                       // drift regime (bounded)
    var maxMu = sigma * 0.35;         // max trend drift per bar
    for (var i = 0; i < total; i++) {
      var t = end - (total - 1 - i) * stepMs;
      // occasionally shift the trend regime (creates swings/trends)
      if (rand() < 0.02) mu = (rand() - 0.5) * 2 * maxMu;
      mu = TL.utils.clamp(mu * 0.985, -maxMu, maxMu);
      // mean reversion keeps the series tethered to a realistic price level
      logP += (Math.log(base) - logP) * 0.004;
      var ret = (rand() - 0.5) * 2 * sigma + mu;
      var open = Math.exp(logP);
      var close = Math.exp(logP + ret);
      logP = Math.log(close);

      var wick = Math.abs(rand() - 0.5) * sigma * 2.2;
      var high = Math.max(open, close) * (1 + wick * 0.5);
      var low = Math.min(open, close) * (1 - wick * 0.5);
      // occasional volatility spikes
      if (rand() < 0.012) {
        var spike = sigma * (3 + rand() * 5);
        high = Math.max(high, close * (1 + spike));
        low = Math.min(low, close * (1 - spike));
      }
      var volume = Math.round((0.4 + rand() * 1.6) * (BASE_VOL[assetKey] || 10000) * (1 + Math.abs(ret) * 8));

      var d = Math.pow(10, dec);
      bars.push({
        time: t,
        open: Math.round(open * d) / d,
        high: Math.round(high * d) / d,
        low: Math.round(low * d) / d,
        close: Math.round(close * d) / d,
        volume: volume
      });
    }
    return { bars: bars.slice(-count), source: 'synthetic-demo', detail: 'Seeded synthetic demo (offline-safe)' };
  }

  /* ---------------- cascade orchestration ---------------- */
  function sourceChain(assetKey, fetchTf) {
    var cfg = TL.ASSETS[assetKey];
    if (cfg.type === 'crypto') {
      var chain = [binance];
      if (cfg.twelveData) chain.push(twelveData);
      chain.push(yahoo, coingecko);
      return chain;
    }
    // FX & commodities: Twelve Data is primary
    var c = [];
    if (cfg.twelveData) c.push(twelveData);
    c.push(yahoo, stooq);
    return c;
  }

  async function fetch(assetKey, tfKey, count) {
    var asset = TL.ASSETS[assetKey];
    var tf = TL.TIMEFRAMES[tfKey];
    var agg = tf.aggregate;
    var fetchTf = agg ? agg.base : tfKey;
    var need = agg ? count * agg.factor : count;

    var result = null;
    var errors = [];
    var chain = sourceChain(assetKey, fetchTf);
    for (var i = 0; i < chain.length; i++) {
      try {
        var r = await chain[i](assetKey, fetchTf, need);
        if (r && r.bars && r.bars.length > 0) { result = r; break; }
      } catch (e) {
        errors.push(e && e.message ? e.message : String(e));
      }
    }

    if (!result) {
      result = synthetic(assetKey, tfKey, count);
    }
    result.synthetic = (result.source === 'synthetic-demo');

    // Aggregate only live base-timeframe data. The synthetic generator already
    // produces bars at the TARGET timeframe, so resampling it would collapse
    // bars twice (wrong count + wrong bar duration).
    if (agg && result.bars && !result.synthetic) {
      var baseStepMs = TL.TIMEFRAMES[agg.base].minutes * 60000;
      result.bars = resample(result.bars, agg.factor, baseStepMs);
      result.detail = (result.detail || '') + ' → resampled ' + tfKey;
    }

    result.bars = result.bars.slice(-count);
    result.errors = errors;
    result.count = result.bars.length;
    return result;
  }

  return {
    fetch: fetch,
    fetchText: fetchText,
    resample: resample,
    synthetic: synthetic
  };
})();
