/* Techlysis — settings store (localStorage persistence + cloud sync hooks) */
'use strict';

window.TL = window.TL || {};

TL.store = (function () {
  var LS_KEY = 'tl.settings.v1';

  var settings = null;

  function load() {
    var stored = null;
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (e) { stored = null; }
    settings = TL.utils.deepMerge(TL.DEFAULT_SETTINGS, stored || {});
    return settings;
  }

  function get() {
    if (!settings) load();
    return settings;
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore quota */ }
    if (TL.events) TL.events.emit('settings-saved', settings);
    return settings;
  }

  /* deep-merge a patch into current settings and persist */
  function update(patch) {
    if (!settings) load();
    settings = TL.utils.deepMerge(settings, patch || {});
    save();
    return settings;
  }

  /* set a dotted-path value e.g. "tools.rsi.period" */
  function setPath(path, value) {
    if (!settings) load();
    var parts = path.split('.');
    var node = settings;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    save();
    return settings;
  }

  function getPath(path, fallback) {
    if (!settings) load();
    var parts = path.split('.');
    var node = settings;
    for (var i = 0; i < parts.length; i++) {
      if (node == null) return fallback;
      node = node[parts[i]];
    }
    return (node == null) ? fallback : node;
  }

  function reset() {
    settings = TL.utils.deepMerge(TL.DEFAULT_SETTINGS, {});
    save();
    return settings;
  }

  /* re-apply runtime keys into settings.keys so the Keys UI stays in sync */
  function syncKeysFromEnv() {
    if (!settings) load();
    settings.keys.twelveDataKey = TL.env.env.TWELVE_DATA_API_KEY;
    settings.keys.supabaseUrl = TL.env.env.SUPABASE_URL;
    settings.keys.supabaseAnonKey = TL.env.env.SUPABASE_ANON_KEY;
    return settings;
  }

  return {
    load: load,
    get: get,
    save: save,
    update: update,
    setPath: setPath,
    getPath: getPath,
    reset: reset,
    syncKeysFromEnv: syncKeysFromEnv,
    LS_KEY: LS_KEY
  };
})();

/* Tiny event bus used across modules (declared before heavy modules load). */
TL.events = (function () {
  var map = {};
  return {
    on: function (name, fn) { (map[name] = map[name] || []).push(fn); },
    off: function (name, fn) {
      if (!map[name]) return;
      map[name] = map[name].filter(function (f) { return f !== fn; });
    },
    emit: function (name, payload) {
      (map[name] || []).forEach(function (fn) { try { fn(payload); } catch (e) { console.error(e); } });
    }
  };
})();
