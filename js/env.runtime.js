/* Techlysis — runtime environment stub.
 *
 * This file is intentionally committed EMPTY. The GitHub Actions workflow
 * (.github/workflows/pages.yml) overwrites it on deploy with the real values
 * from GitHub Secrets, producing e.g.:
 *
 *   window.__TECHLYSIS_ENV = {
 *     TWELVE_DATA_API_KEY: "…",
 *     SUPABASE_URL: "…",
 *     SUPABASE_ANON_KEY: "…"
 *   };
 *
 * NEVER place a Supabase `service_role` key here or anywhere in the repo.
 * See js/env.runtime.example.js for the exact shape.
 */
window.__TECHLYSIS_ENV = window.__TECHLYSIS_ENV || {};
