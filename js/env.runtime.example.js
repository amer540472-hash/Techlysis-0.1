/* Techlysis — EXAMPLE runtime environment.
 *
 * Copy this file to js/env.runtime.js if you want to hard-code keys for local
 * testing (or better: paste them in the in-app Settings → Keys panel, which
 * stores them in your browser's localStorage only).
 *
 * The app resolves configuration in this order:
 *   1. window.__TECHLYSIS_ENV   (set by js/env.runtime.js)
 *   2. localStorage overrides   (Settings → Keys panel)
 *
 * SECURITY: only ever use the Supabase ANON key here. The `service_role`
 * key has full database access and must never appear in any front-end file,
 * GitHub Pages artifact, or committed file.
 */
window.__TECHLYSIS_ENV = {
  TWELVE_DATA_API_KEY: 'your_twelve_data_api_key_here',
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'your_supabase_anon_key_here'
};
