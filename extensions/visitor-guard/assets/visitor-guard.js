(function () {
  "use strict";

  var context = window.__visitorGuard;
  if (!context) return;

  var MASK_TIMEOUT_MS = 4000;
  var STORAGE = { visitor: "vg_vc", admin: "vg_at", pass: "vg_cp" };

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
  // Set when the page reloads after the browser check: vg_ck marks the
  // reload, vg_cp carries the pass when local storage is unavailable.
  var justChecked = params.has("vg_ck");
  var urlPass = params.get("vg_cp");

  if (!context.enabled && !inviteToken && !whitelistToken) {
    unmask();
    return;
  }

  // Remove our own parameters from the address bar once read.
  if (inviteToken || whitelistToken || justChecked || urlPass) {
    ["vg_admin", "vg_whitelist", "vg_ck", "vg_cp"].forEach(function (key) {
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

    // window.stop() can end parsing before the body exists; make one then.
    if (!document.body) document.documentElement.appendChild(document.createElement("body"));
    document.body.innerHTML = "";
    document.body.appendChild(page);
    document.title = action.header;
    unmask();
  }

  // Browser check: find a number whose SHA-256 hash with the server's nonce
  // starts with enough zero bits, send it back, keep the pass and reload.
  var CHECK_BATCH = 512;
  var CHECK_MAX_TRIES = 1 << 24;

  function zeroBits(buffer) {
    var bytes = new Uint8Array(buffer);
    var bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) {
        bits += 8;
        continue;
      }
      return bits + Math.clz32(bytes[i]) - 24;
    }
    return bits;
  }

  function solveCheck(nonce, difficulty) {
    var encoder = new TextEncoder();
    var start = 0;
    function batch() {
      if (start > CHECK_MAX_TRIES) return Promise.reject(new Error("no answer"));
      var tries = [];
      for (var n = start; n < start + CHECK_BATCH; n++) {
        tries.push(window.crypto.subtle.digest("SHA-256", encoder.encode(nonce + ":" + n)));
      }
      var first = start;
      start += CHECK_BATCH;
      return Promise.all(tries).then(function (hashes) {
        for (var i = 0; i < hashes.length; i++) {
          if (zeroBits(hashes[i]) >= difficulty) return first + i;
        }
        // Let the page paint between batches so the spinner keeps turning.
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 0);
        }).then(batch);
      });
    }
    return batch();
  }

  function showCheckPage(action) {
    var parts = String(action.challenge || "").split(".");
    var canCheck = parts.length === 4 && window.crypto && window.crypto.subtle && window.TextEncoder;
    // Checked a moment ago and still not let in (the pass was not kept, or
    // the visitor's IP changed): show the block message instead of looping.
    if (!canCheck || justChecked) {
      showBlockPage({ type: "CUSTOM_INFO", header: action.header, message: action.message });
      return;
    }
    try {
      window.stop();
    } catch (error) {
      // Older browsers.
    }
    var page = el(
      "div",
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:#f6f6f7;color:#202223;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    );
    var card = el(
      "div",
      "max-width:480px;width:100%;padding:40px 32px;text-align:center;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);",
    );
    var spinner = el(
      "div",
      "width:40px;height:40px;margin:0 auto 20px;border:4px solid #e3e3e3;border-top-color:#202223;border-radius:50%;animation:vg-spin 1s linear infinite;",
    );
    var spin = el("style", null, "@keyframes vg-spin{to{transform:rotate(360deg)}}");
    var title = el("h1", "margin:0 0 12px;font-size:24px;line-height:1.3;", "Checking your browser");
    var note = el(
      "p",
      "margin:0;font-size:16px;line-height:1.6;opacity:.85;",
      "This takes a few seconds. You will be taken to the store automatically.",
    );
    (document.head || document.documentElement).appendChild(spin);
    card.appendChild(spinner);
    card.appendChild(title);
    card.appendChild(note);
    page.appendChild(card);
    if (!document.body) document.documentElement.appendChild(document.createElement("body"));
    document.body.innerHTML = "";
    document.body.appendChild(page);
    document.title = "Checking your browser";
    unmask();

    function failed() {
      showBlockPage({ type: "CUSTOM_INFO", header: action.header, message: action.message });
    }

    solveCheck(parts[0], Number(parts[1]))
      .then(function (answer) {
        var answerQuery = new URLSearchParams(query);
        answerQuery.set("ch", action.challenge);
        answerQuery.set("cx", String(answer));
        return fetch(context.proxyPath + "/verdict?" + answerQuery.toString(), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
      })
      .then(function (response) {
        return response.ok ? response.json() : {};
      })
      .then(function (result) {
        if (!result.passToken) return failed();
        store(STORAGE.pass, result.passToken);
        var next = new URLSearchParams(params);
        next.set("vg_ck", "1");
        if (read(STORAGE.pass) !== result.passToken) next.set("vg_cp", result.passToken);
        window.location.replace(window.location.pathname + "?" + next.toString() + window.location.hash);
      })
      .catch(failed);
  }

  function hideSection(selector) {
    var style = document.createElement("style");
    style.textContent = selector + "{display:none!important}";
    document.head.appendChild(style);
    unmask();
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
      return;
    }

    var action = result.action;
    if (action.type === "REDIRECT" && action.redirectUrl) {
      window.location.replace(action.redirectUrl);
    } else if (action.type === "HIDE_SECTION" && action.sectionSelector) {
      hideSection(action.sectionSelector);
    } else if (action.type === "CHALLENGE") {
      showCheckPage(action);
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
    cp: urlPass || read(STORAGE.pass),
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
