(function () {
  "use strict";

  var context = window.__visitorGuard;
  if (!context) return;

  var MASK_TIMEOUT_MS = 4000;
  var STORAGE = { visitor: "vg_vc", admin: "vg_at", geoStay: "vg_geo_stay" };

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

  // Content Protection: no right-click, copying, dragging, text selection
  // or save/print/view-source shortcuts. Devices with Admin Access are exempt.
  function protectContent() {
    var style = document.createElement("style");
    style.id = "visitor-guard-protect";
    style.textContent =
      "body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}" +
      "input,textarea,[contenteditable]{-webkit-user-select:text;user-select:text}" +
      "img{-webkit-user-drag:none;user-drag:none}";
    document.head.appendChild(style);

    var editable = function (target) {
      return target && target.closest && target.closest("input,textarea,[contenteditable]");
    };
    var block = function (event) {
      if (!editable(event.target)) event.preventDefault();
    };
    ["contextmenu", "copy", "cut", "dragstart", "selectstart"].forEach(function (name) {
      document.addEventListener(name, block, true);
    });
    document.addEventListener(
      "keydown",
      function (event) {
        var key = (event.key || "").toLowerCase();
        var modifier = event.ctrlKey || event.metaKey;
        var devtools =
          key === "f12" || (modifier && event.shiftKey && (key === "i" || key === "j" || key === "c"));
        var shortcut = modifier && ["s", "u", "p", "a", "c", "x"].indexOf(key) !== -1;
        if (devtools || (shortcut && !editable(event.target))) event.preventDefault();
      },
      true,
    );
  }

  if (context.contentProtection && !read(STORAGE.admin)) protectContent();

  var params = new URLSearchParams(window.location.search);
  var inviteToken = params.get("vg_admin");
  var whitelistToken = params.get("vg_whitelist");
  // A link back from a regional store can carry vg_stay=1 so the visitor
  // is not sent to that store again.
  var stayHere = params.has("vg_stay");
  if (stayHere) store(STORAGE.geoStay, "1");

  if (!context.enabled && !inviteToken && !whitelistToken) {
    unmask();
    return;
  }

  // Remove our own parameters from the address bar once read.
  if (inviteToken || whitelistToken || stayHere) {
    ["vg_admin", "vg_whitelist", "vg_stay"].forEach(function (key) {
      params.delete(key);
    });
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

  var BRAND_COLOR = /^#[0-9a-fA-F]{6}$/;

  // The merchant's logo and color: the app's own settings first, then the
  // brand set in Shopify. Only used when the merchant turned branding on.
  function brandOf(brand) {
    if (!brand) return null;
    var own = context.brand || {};
    var color = brand.color || own.color || "";
    return {
      logo: brand.logo || own.logo || "",
      color: BRAND_COLOR.test(color) ? color : "",
    };
  }

  function addLogo(card, brand) {
    if (!brand || !brand.logo) return;
    var logo = el("img", "display:block;max-width:180px;max-height:64px;margin:0 auto 20px;object-fit:contain;");
    logo.src = brand.logo;
    logo.alt = "";
    card.appendChild(logo);
  }

  function setLanguage(node, texts) {
    if (!texts) return;
    node.setAttribute("lang", texts.lang);
    node.setAttribute("dir", texts.dir);
  }

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
    var brand = brandOf(action.brand);
    if (brand && brand.color) page.style.borderTop = "6px solid " + brand.color;
    setLanguage(page, action.texts);
    addLogo(card, brand);
    if (template && !(brand && brand.logo)) {
      card.appendChild(el("div", "font-size:48px;margin-bottom:16px;", template.icon));
    }
    card.appendChild(el("h1", "margin:0 0 12px;font-size:28px;line-height:1.3;", action.header));
    card.appendChild(el("p", "margin:0;font-size:16px;line-height:1.6;opacity:.85;", action.message));
    page.appendChild(card);

    // window.stop() can end parsing before the body exists; make one then.
    if (!document.body) document.documentElement.appendChild(document.createElement("body"));
    document.body.innerHTML = "";
    document.body.appendChild(page);
    document.title = action.header;
    unmask();
  }

  function hideSection(selector) {
    var style = document.createElement("style");
    style.textContent = selector + "{display:none!important}";
    document.head.appendChild(style);
    unmask();
  }

  // Geolocation Redirects with "ask first": a banner at the foot of the
  // page. "Stay here" is remembered on this device.
  function showGeoOffer(offer) {
    var brand = brandOf(offer.brand);
    var accent = (brand && brand.color) || "#202223";
    var bar = el(
      "div",
      "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483646;max-width:560px;margin:0 auto;padding:16px 20px;background:#fff;color:#202223;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:12px;",
    );
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", offer.text);
    setLanguage(bar, offer);
    var words = el("div", "flex:1 1 240px;");
    if (offer.country) words.appendChild(el("strong", "display:block;", offer.country));
    words.appendChild(el("span", null, offer.text));
    var go = el(
      "a",
      "padding:8px 16px;border-radius:8px;background:" + accent + ";color:#fff;text-decoration:none;font-weight:600;",
      offer.go,
    );
    go.href = offer.url;
    var stay = el(
      "button",
      "padding:8px 16px;border-radius:8px;border:1px solid #c9cccf;background:#fff;color:#202223;font:inherit;cursor:pointer;",
      offer.stay,
    );
    stay.type = "button";
    stay.addEventListener("click", function () {
      store(STORAGE.geoStay, "1");
      bar.parentNode.removeChild(bar);
    });
    bar.appendChild(words);
    bar.appendChild(go);
    bar.appendChild(stay);
    var add = function () {
      document.body.appendChild(bar);
    };
    if (document.body) add();
    else document.addEventListener("DOMContentLoaded", add);
  }

  // Order filters recognise blocked visitors by this cart attribute, which
  // Shopify copies onto the order. Only carts that hold items are tagged, so
  // browsing never creates a cart.
  var taggedCode = context.cartVisitor || "";

  function sendCartTag(code) {
    if (taggedCode === code) return;
    taggedCode = code;
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
    fetch(root + "cart/update.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ attributes: { _vg_visitor: code } }),
    }).catch(function () {
      taggedCode = "";
    });
  }

  // An empty cart is tagged as soon as the theme adds the first item without
  // a page load (cart drawers, "Buy it now" buttons), so going straight to
  // checkout still carries the visitor id.
  function tagOnFirstAdd(code) {
    if (!window.PerformanceObserver) return;
    try {
      var observer = new PerformanceObserver(function (list) {
        var added = list.getEntries().some(function (entry) {
          return /\/cart\/add(\.js)?(\?|$)/.test(entry.name);
        });
        if (!added) return;
        observer.disconnect();
        sendCartTag(code);
      });
      observer.observe({ type: "resource" });
    } catch (error) {
      // Not supported; the cart is tagged on the next page load instead.
    }
  }

  function tagCart(code) {
    if (!code) return;
    if (context.hasCart) sendCartTag(code);
    else tagOnFirstAdd(code);
  }

  function apply(result) {
    window.clearTimeout(timer);
    if (result.visitorCode) store(STORAGE.visitor, result.visitorCode);
    tagCart(result.visitorCode || read(STORAGE.visitor));
    if (result.adminToken) store(STORAGE.admin, result.adminToken);
    if (result.clearAdminToken) store(STORAGE.admin, null);

    if (result.redirect) {
      window.location.replace(result.redirect);
      return;
    }
    if (result.verdict !== "BLOCKED" || !result.action) {
      unmask();
      if (result.geoOffer) showGeoOffer(result.geoOffer);
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
    ua: navigator.userAgent.slice(0, 500),
    vc: read(STORAGE.visitor),
    at: read(STORAGE.admin),
    gs: read(STORAGE.geoStay),
    lang: (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""])
      .concat(context.locale || "")
      .join(",")
      .slice(0, 200),
  });
  if (inviteToken) query.set("vg_admin", inviteToken);
  if (whitelistToken) query.set("vg_whitelist", whitelistToken);
  // Test parameters (vg_test_country, vg_test_ip, ...) are passed on so a
  // development store can try out the filters; the server ignores them in
  // production.
  params.forEach(function (value, key) {
    if (key.indexOf("vg_test_") === 0) query.set(key, value.slice(0, 100));
  });

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
