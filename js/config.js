/**
 * PGConnect runtime configuration.
 *
 * API_URL
 *   ''  (empty)  -> Local mode. A browser-only backend (js/local-api.js) implements the same
 *                   endpoints documented for the FastAPI service and keeps data in localStorage.
 *   'https://host' -> Online mode. Every request goes to `${API_URL}/api/...` (the FastAPI backend).
 *
 * Never put secrets in this file: it is served to every visitor.
 */
window.PGC_CONFIG = {
  API_URL: '',
  SHOW_DEMO_LOGINS: true, // set false in production
  CHAT_POLL_MS: 4000,
  PAGE_SIZE: 12,

  // Upgrade feature switches. Set one to false to hide that feature (links, buttons, sections) and redirect
  // its route home. Data already saved stays. See README "Feature switches".
  FEATURES: {
    ROOMMATES: true, SAFETY_FILTERS: true, PG_MANAGER: true, TRUE_COST: true, COMPARE: true, ADV_FILTERS: true, MAP: true,
  },
  // Local backend: create the sample PGs, sample owners, sample roommate profiles and groups. false = skip them
  // (the five original PGs are still backfilled with the new optional fields).
  SEED_SAMPLE_PGS: true,
};
