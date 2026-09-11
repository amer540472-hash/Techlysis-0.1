/* Techlysis — environment resolution.
 *
 * Load order (index.html): env.runtime.js -> env.js -> everything else.
 * Resolution priority: window.__TECHLYSIS_ENV, then localStorage overrides.
 */
'use strict';

window.TL = window.TL || {};

TL.env = (function () {
  var runtime = window.__TECHLYSIS_ENV || {};

  function ls(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function pick(key, lsKey) {
    var local = ls(lsKey);
    if (local !== null && local !== '') return local;
    if (runtime[key]) return runtime[key];
    return '';
  }

  var env = {
    TWELVE_DATA_API_KEY: pick('TWELVE_DATA_API_KEY', 'tl.twelveDataKey'),
    SUPABASE_URL: pick('SUPABASE_URL', 'tl.supabaseUrl'),
    SUPABASE_ANON_KEY: pick('SUPABASE_ANON_KEY', 'tl.supabaseAnonKey')
  };

  env.hasTwelveData = !!env.TWELVE_DATA_API_KEY;
  env.hasSupabase = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);

  /* update runtime env from Settings → Keys (persists to localStorage only). */
  function setLocal(key, val) {
    try { localStorage.setItem(key, val == null ? '' : String(val)); } catch (e) { /* ignore */ }
    refresh();
  }

  function refresh() {
    env.TWELVE_DATA_API_KEY = pick('TWELVE_DATA_API_KEY', 'tl.twelveDataKey');
    env.SUPABASE_URL = pick('SUPABASE_URL', 'tl.supabaseUrl');
    env.SUPABASE_ANON_KEY = pick('SUPABASE_ANON_KEY', 'tl.supabaseAnonKey');
    env.hasTwelveData = !!env.TWELVE_DATA_API_KEY;
    env.hasSupabase = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  }

  return {
    env: env,
    refresh: refresh,
    setLocal: setLocal
  };
})();
