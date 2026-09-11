/* Techlysis — small utilities (no dependencies) */
'use strict';

window.TL = window.TL || {};

TL.utils = (function () {

  /* ----- formatting ----- */
  function fmtPrice(v, asset) {
    if (v == null || !isFinite(v)) return '—';
    var a = asset ? (TL.ASSETS[asset] || {}) : {};
    var p = a.pip || 0.01;
    var decimals = Math.max(0, Math.ceil(-Math.log10(p)));
    decimals = Math.min(6, Math.max(0, decimals));
    return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtNum(v, d) {
    if (v == null || !isFinite(v)) return '—';
    d = (d == null) ? 2 : d;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtInt(v) {
    return (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString('en-US');
  }

  function fmtPct(v, d) {
    if (v == null || !isFinite(v)) return '—';
    d = (d == null) ? 2 : d;
    return v.toFixed(d) + '%';
  }

  function fmtTime(t, tf) {
    if (!t) return '—';
    var d = new Date(t);
    if (tf === '1d') {
      return d.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10) + ' ' + d.toISOString().slice(11, 16) + ' UTC';
  }

  function fmtTimeShort(t, tf) {
    if (!t) return '—';
    var d = new Date(t);
    if (tf === '1d') return d.toISOString().slice(0, 10);
    return d.toISOString().slice(11, 16);
  }

  /* ----- math ----- */
  function round(v, d) {
    var m = Math.pow(10, d == null ? 2 : d);
    return Math.round(v * m) / m;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function avg(arr) {
    var s = 0, n = 0;
    for (var i = 0; i < arr.length; i++) { if (arr[i] != null && isFinite(arr[i])) { s += arr[i]; n++; } }
    return n ? s / n : NaN;
  }

  function sum(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] || 0);
    return s;
  }

  /* ----- deterministic PRNG (seeded) ----- */
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededRandom(str) {
    return mulberry32(hashString(str));
  }

  /* ----- deep merge for settings ----- */
  function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function deepMerge(base, over) {
    var out = {};
    var key;
    for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    for (key in over) {
      if (Object.prototype.hasOwnProperty.call(over, key)) {
        if (isObject(base[key]) && isObject(over[key])) out[key] = deepMerge(base[key], over[key]);
        else if (Array.isArray(base[key]) && Array.isArray(over[key])) out[key] = over[key].slice();
        else out[key] = over[key];
      }
    }
    return out;
  }

  /* ----- DOM helpers ----- */
  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return {
    fmtPrice: fmtPrice,
    fmtNum: fmtNum,
    fmtInt: fmtInt,
    fmtPct: fmtPct,
    fmtTime: fmtTime,
    fmtTimeShort: fmtTimeShort,
    round: round,
    clamp: clamp,
    avg: avg,
    sum: sum,
    hashString: hashString,
    mulberry32: mulberry32,
    seededRandom: seededRandom,
    deepMerge: deepMerge,
    isObject: isObject,
    el: el,
    esc: esc,
    debounce: debounce,
    copyToClipboard: copyToClipboard,
    download: download
  };
})();
