/** Feature switches (brief 4.3). Every flag defaults to ON; set it to false in js/config.js to roll a feature back. */
(function (PGC) {
  'use strict';
  const NAMES = ['ROOMMATES', 'SAFETY_FILTERS', 'PG_MANAGER', 'TRUE_COST', 'COMPARE', 'ADV_FILTERS', 'MAP'];
  const on = (name) => {
    const flags = (window.PGC_CONFIG && window.PGC_CONFIG.FEATURES) || {};
    return flags[name] !== false;
  };
  PGC.features = { on, NAMES };
})(window.PGC);
