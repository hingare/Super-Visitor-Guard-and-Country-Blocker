(function () {
  "use strict";

  var context = window.__visitorGuard;
  if (!context) return;

  var MASK_TIMEOUT_MS = 4000;
  var STORAGE = { visitor: "vg_vc", admin: "vg_at" };

  function unmask() {
    var mask = document.getElementById("visitor-guard-mask");
    if (mask) mask.parentNode.removeChild(mask);
  }

  // The theme editor preview must never be blocked.
  if (context.designMode) {
    unmask();
    return;
  }

  function store(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be blocked (private mode); the visitor just gets a new id.
    }
  }

  function read(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  var params = new URLSearchParams(window.location.search);
  var inviteToken = params.get("vg_admin");
  var whitelistToken = params.get("vg_whitelist");

  if (!context.enabled && !inviteToken && !whitelistToken) {
    unmask();
    return;
  }

  // Remove our own parameters from the address bar once read.
  if (inviteToken || whitelistToken) {
    params.delete("vg_admin");
    params.delete("vg_whitelist");
    var rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? "?" + rest : "") + window.location.hash,
    );
  }

  var timer = window.setTimeout(unmask, MASK_TIMEOUT_MS);

  function el(tag, styles, text) {
    var node = document.createElement(tag);
    if (styles) node.setAttribute("style", styles);
    if (text) node.textContent = text;
    return node;
  }

  var TEMPLATES = {
    classic: {
      page: "background:#f6f6f7;color:#202223;",
      card: "background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);",
      icon: "🔒",
    },
    dark: {
      page: "background:#111827;color:#f9fafb;",
      card: "background:transparent;",
      icon: "⛔",
    },
    region: {
      page: "background:linear-gradient(160deg,#e8f5ee,#f6f6f7);color:#1f2a24;",
      card: "background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);",
      icon: "🌍",
    },
    maintenance: {
      page: "background:#fffaf0;color:#3b2f1e;",
      card: "background:#fff;border:1px solid #f1e3c8;border-radius:16px;",
      icon: "🛠️",
    },
  };

  function showBlockPage(action) {
    var template = action.type === "TEMPLATE" ? TEMPLATES[action.templateId] || TEMPLATES.classic : null;
    try {
      window.stop();
    } catch (error) {
      // Older browsers.
    }

    var page = el(
      "div",
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
        (template ? template.page : "background:#fff;color:#202223;"),
    );
    var card = el(
      "div",
      "max-width:560px;width:100%;padding:40px 32px;text-align:center;" + (template ? template.card : ""),
    );
    if (template) card.appendChild(el("div", "font-size:48px;margin-bottom:16px;", template.icon));
    card.appendChild(el("h1", "margin:0 0 12px;font-size:28px;line-height:1.3;", action.header));
    card.appendChild(el("p", "margin:0;font-size:16px;line-height:1.6;opacity:.85;", action.message));
    page.appendChild(card);

    var mount = function () {
      document.body.innerHTML = "";
      document.body.appendChild(page);
      document.title = action.header;
      unmask();
    };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
  }

  function hideSection(selector) {
    var style = document.createElement("style");
    style.textContent = selector + "{display:none!important}";
    document.head.appendChild(style);
    unmask();
  }

  function apply(result) {
    window.clearTimeout(timer);
    if (result.visitorCode) store(STORAGE.visitor, result.visitorCode);
    if (result.adminToken) store(STORAGE.admin, result.adminToken);
    if (result.clearAdminToken) store(STORAGE.admin, null);

    if (result.redirect) {
      window.location.replace(result.redirect);
      return;
    }
    if (result.verdict !== "BLOCKED" || !result.action) {
      unmask();
      return;
    }

    var action = result.action;
    if (action.type === "REDIRECT" && action.redirectUrl) {
      window.location.replace(action.redirectUrl);
    } else if (action.type === "HIDE_SECTION" && action.sectionSelector) {
      hideSection(action.sectionSelector);
    } else {
      showBlockPage(action);
    }
  }

  var query = new URLSearchParams({
    path: window.location.pathname,
    search: window.location.search,
    host: window.location.hostname,
    url: window.location.href.slice(0, 1000),
    ref: document.referrer.slice(0, 1000),
    pt: context.pageType || "",
    vc: read(STORAGE.visitor),
    at: read(STORAGE.admin),
  });
  if (inviteToken) query.set("vg_admin", inviteToken);
  if (whitelistToken) query.set("vg_whitelist", whitelistToken);

  fetch(context.proxyPath + "/verdict?" + query.toString(), {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(function (response) {
      return response.ok ? response.json() : { verdict: "ALLOWED" };
    })
    .then(apply)
    .catch(function () {
      // Fail open: a network error must never take the store down.
      window.clearTimeout(timer);
      unmask();
    });
})();
