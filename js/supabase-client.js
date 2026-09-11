/* Techlysis — Supabase client (optional; guest mode works without it).
 *
 * @supabase/supabase-js UMD is loaded from a CDN in index.html BEFORE this
 * file, exposing `window.supabase.createClient`. Everything here degrades
 * gracefully when Supabase is not configured or the CDN is unreachable.
 */
'use strict';

window.TL = window.TL || {};

TL.supabase = (function () {
  var client = null;
  var session = null;
  var authListeners = [];      // survive lazy client creation (keys added later)
  var subscribedClient = null; // which client the auth subscription is bound to
  var loadRetries = 0;
  var retryTimer = null;

  function configured() {
    return !!(TL.env.env.SUPABASE_URL && TL.env.env.SUPABASE_ANON_KEY);
  }

  function isLoaded() {
    return !!(window.supabase && window.supabase.createClient);
  }

  function init() {
    if (!configured()) { client = null; subscribedClient = null; return null; }
    if (!isLoaded()) {
      // the CDN UMD bundle loads asynchronously (or may be blocked entirely);
      // retry for a short while instead of giving up on first call
      if (loadRetries++ < 30 && !retryTimer) {
        retryTimer = setTimeout(function () { retryTimer = null; init(); }, 400);
      }
      return null;
    }
    loadRetries = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    try {
      if (client && client.removeAllChannels) {
        try { client.removeAllChannels(); } catch (e) { /* ignore */ }
      }
      client = window.supabase.createClient(TL.env.env.SUPABASE_URL, TL.env.env.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      subscribedClient = null;
      subscribeAuth();
      restoreSession();
    } catch (e) {
      console.warn('Supabase init failed', e);
      client = null;
      subscribedClient = null;
    }
    return client;
  }

  function getClient() {
    if (!client && configured()) init();
    return client;
  }

  function subscribeAuth() {
    if (!client || subscribedClient === client) return;
    subscribedClient = client;
    client.auth.onAuthStateChange(function (event, s) {
      session = s || null;
      for (var i = 0; i < authListeners.length; i++) {
        try { authListeners[i](session); } catch (e) { console.error(e); }
      }
      TL.events.emit('auth-changed', session);
    });
  }

  function restoreSession() {
    var c = client;
    if (!c) return;
    c.auth.getSession().then(function (res) {
      session = res && res.data && res.data.session ? res.data.session : null;
      TL.events.emit('auth-changed', session);
    }).catch(function () {
      session = null;
      TL.events.emit('auth-changed', null);
    });
  }

  function signedIn() { return !!session; }

  function userEmail() {
    return session && session.user ? session.user.email : '';
  }

  function userId() {
    return session && session.user ? session.user.id : null;
  }

  /* ---------------- auth ---------------- */
  function signUp(email, password) {
    var c = getClient();
    if (!c) return Promise.reject(new Error('Supabase is not configured.'));
    return c.auth.signUp({ email: email, password: password }).then(function (res) {
      // with email confirmation off, signUp returns a session directly
      if (res && res.data && res.data.session) session = res.data.session;
      return res;
    });
  }

  function signIn(email, password) {
    var c = getClient();
    if (!c) return Promise.reject(new Error('Supabase is not configured.'));
    return c.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      // adopt the session immediately — the UI must not stay "guest" after a
      // successful sign-in even if no auth subscription existed yet
      if (res && res.data && res.data.session) {
        session = res.data.session;
        TL.events.emit('auth-changed', session);
      }
      return res;
    });
  }

  function signOut() {
    var c = getClient();
    if (!c) return Promise.resolve();
    return c.auth.signOut().then(function () {
      session = null;
      TL.events.emit('auth-changed', null);
    });
  }

  function onAuthChange(fn) {
    authListeners.push(fn);
    subscribeAuth(); // binds immediately if a client already exists,
                     // otherwise on the next successful init()
  }

  /* ---------------- cloud sync ---------------- */
  function pushSettings(settingsObj) {
    var c = getClient();
    if (!c || !signedIn()) return Promise.resolve({ skipped: true });
    return c.from('user_settings').upsert({
      user_id: userId(),
      settings: settingsObj,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  }

  function pullSettings() {
    var c = getClient();
    if (!c || !signedIn()) return Promise.resolve({ skipped: true });
    return c.from('user_settings').select('settings').eq('user_id', userId()).maybeSingle();
  }

  function pushJournalEntry(entry) {
    var c = getClient();
    if (!c || !signedIn()) return Promise.resolve({ skipped: true });
    return c.from('trade_journal').insert({
      user_id: userId(),
      asset: entry.asset,
      timeframe: entry.timeframe,
      direction: entry.direction,
      entry_price: entry.entry,
      stop_price: entry.stop,
      targets: entry.targets,
      rr: entry.rr,
      plan_text: entry.planText,
      notes: entry.notes || ''
    });
  }

  function pullJournal() {
    var c = getClient();
    if (!c || !signedIn()) return Promise.resolve({ skipped: true });
    return c.from('trade_journal').select('*').eq('user_id', userId()).order('created_at', { ascending: false }).limit(200);
  }

  function saveAnalysisSnapshot(asset, timeframe, snapshot) {
    var c = getClient();
    if (!c || !signedIn()) return Promise.resolve({ skipped: true });
    return c.from('saved_analyses').insert({
      user_id: userId(),
      asset: asset,
      timeframe: timeframe,
      snapshot: snapshot,
      created_at: new Date().toISOString()
    });
  }

  return {
    init: init,
    getClient: getClient,
    configured: configured,
    isLoaded: isLoaded,
    signedIn: signedIn,
    userEmail: userEmail,
    userId: userId,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    onAuthChange: onAuthChange,
    pushSettings: pushSettings,
    pullSettings: pullSettings,
    pushJournalEntry: pushJournalEntry,
    pullJournal: pullJournal,
    saveAnalysisSnapshot: saveAnalysisSnapshot
  };
})();
