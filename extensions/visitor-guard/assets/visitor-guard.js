(function () {
  "use strict";

  var context = window.__visitorGuard;
  if (!context) return;

  // The theme editor preview must never be blocked.
  if (context.designMode) return;

  // Phase 2: hide the page, ask the verdict API, then allow, block or redirect.
  document.documentElement.setAttribute("data-visitor-guard", "loaded");
})();
