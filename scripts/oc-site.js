/*
 * Optical customer website — core script (GoHighLevel-ready)
 * ===================================================================
 * Paste wrapped in a script tag in GHL → Sites → Websites → (site) → Settings → Tracking Code →
 * **Footer**, once per website. Requires window.OC_CONFIG (scripts/oc-config.js, Header box).
 *
 * What it does
 *  - applies the business theme colours, fills [data-oc-text]/[data-oc-href]/… bindings;
 *  - renders the header and footer blocks from the config (nav, branches, hours, social);
 *  - embeds NATIVE GHL forms and calendars with GHL's official widget code, or shows a clearly
 *    labelled placeholder while no form/calendar ID is configured (it never fakes a working form);
 *  - runs page renderers registered by the page scripts (pages/<page>/<page>.js) through
 *    window.OC_QUEUE, in any load order;
 *  - watches the page for custom-code blocks inserted later (GHL renders some elements after load).
 *
 * Safety: no network calls except loading GHL's own form_embed.js and the configured iframes; no
 * cookies or storage; no globals besides window.OCSite / window.OC_QUEUE. Plain ES2017, no libraries.
 */
(function () {
  "use strict";
  if (window.OCSite) return; // pasted twice: keep the first copy

  var CONFIG = window.OC_CONFIG || {};
  var PREVIEW = window.OC_PREVIEW || null; // set only by the local preview build
  var renderers = {};
  var warned = {};

  /* ── Utilities ──────────────────────────────────────────────────────────── */
  function get(obj, path) {
    return String(path)
      .split(".")
      .reduce(function (o, k) {
        return o == null ? undefined : o[k];
      }, obj);
  }
  function isMergeTag(v) {
    return typeof v === "string" && /\{\{\s*[\w.\- ]+\s*\}\}/.test(v);
  }
  /** Config value, treating "" / null / an unreplaced GHL merge tag as missing. */
  function val(path, fallback) {
    var v = get(CONFIG, path);
    if (v === undefined || v === null || v === "") return fallback;
    if (isMergeTag(v)) {
      if (!warned[path]) {
        warned[path] = true;
        if (window.console) console.warn("[OCSite] OC_CONFIG." + path + " still contains a GHL merge tag (" + v + "); using the fallback. Check the custom value exists.");
      }
      return fallback;
    }
    return v;
  }
  function list(path) {
    var v = get(CONFIG, path);
    return Array.isArray(v) ? v : [];
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isExternal(href) {
    return /^(https?:|mailto:|tel:|#|javascript:)/i.test(href);
  }
  /** Site link. In the local preview, GHL paths ("/eyewear") are mapped to preview files. */
  function link(href) {
    if (!href) return "#";
    if (isExternal(href) || !PREVIEW || !PREVIEW.pages) return href;
    var parts = href.split(/(?=[?#])/);
    var path = parts[0] === "" ? "/" : parts[0];
    var file = PREVIEW.pages[path];
    return file ? file + parts.slice(1).join("") : href;
  }
  function asset(path) {
    if (!path) return "";
    if (/^(https?:)?\/\//i.test(path) || /^data:/i.test(path)) return path;
    var map = get(CONFIG, "assets.map") || {};
    if (map[path]) return map[path];
    var base = val("assets.base", "");
    if (base) return base.replace(/\/?$/, "/") + path;
    if (PREVIEW && PREVIEW.assetBase) return PREVIEW.assetBase + path;
    return path;
  }
  function money(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    try {
      return new Intl.NumberFormat(val("business.locale", "en-PH"), { style: "currency", currency: val("business.currency", "PHP") }).format(n);
    } catch (e) {
      return String(n);
    }
  }
  function telHref(phone) {
    return "tel:" + String(phone || "").replace(/[^\d+]/g, "");
  }
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  function query(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }
  function normalizePath(p) {
    p = String(p || "/").split(/[?#]/)[0];
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p || "/";
  }
  function currentPath() {
    if (PREVIEW && PREVIEW.current) return PREVIEW.current;
    return normalizePath(window.location.pathname);
  }
  function isCurrent(href) {
    if (!href || isExternal(href)) return false;
    var here = currentPath();
    var target = normalizePath(href);
    if (target === here) return true;
    // The product page belongs to the Eyewear section.
    return target === normalizePath(val("links.eyewear", "/eyewear")) && here === normalizePath(val("links.product", "/eyewear-item"));
  }

  var ICONS = {
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    up: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    store: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  };
  function icon(name, cls) {
    return '<svg class="oc-icon' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  /* ── Hours ──────────────────────────────────────────────────────────────── */
  var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var DAY_SHORT = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  var DAY_LONG = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  function to12h(hm) {
    var p = String(hm).split(":").map(Number);
    var suffix = p[0] >= 12 ? "pm" : "am";
    var h = p[0] % 12 || 12;
    return p[1] ? h + ":" + String(p[1]).padStart(2, "0") + suffix : h + suffix;
  }
  /** [{days: "Mon – Sat", time: "10am – 7pm"}] grouping consecutive days with identical hours. */
  function groupedHours(hours) {
    hours = hours || {};
    var out = [];
    DAYS.forEach(function (d) {
      var h = hours[d];
      var time = h ? to12h(h[0]) + " – " + to12h(h[1]) : "Closed";
      var last = out[out.length - 1];
      if (last && last.time === time) last.end = d;
      else out.push({ start: d, end: d, time: time });
    });
    return out.map(function (g) {
      return { days: g.start === g.end ? DAY_SHORT[g.start] : DAY_SHORT[g.start] + " – " + DAY_SHORT[g.end], time: g.time };
    });
  }
  function hoursRows(hours) {
    return groupedHours(hours)
      .map(function (g) {
        return '<li class="oc-hours-row"><span>' + esc(g.days) + '</span><span class="oc-hours-row__time">' + esc(g.time) + "</span></li>";
      })
      .join("");
  }
  function nowIn(tz) {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var pick = function (t) {
      var x = parts.filter(function (p) {
        return p.type === t;
      })[0];
      return x ? x.value : "";
    };
    return { day: pick("weekday").toLowerCase().slice(0, 3), hm: pick("hour") + ":" + pick("minute") };
  }
  function openStatus(hours) {
    try {
      var n = nowIn(val("business.timezone", "Asia/Manila"));
      var today = hours && hours[n.day];
      if (today && n.hm >= today[0] && n.hm < today[1]) return { open: true, label: "Open now · until " + to12h(today[1]) };
      if (today && n.hm < today[0]) return { open: false, label: "Closed · opens " + to12h(today[0]) + " today" };
      var idx = DAYS.indexOf(n.day);
      for (var i = 1; i <= 7; i++) {
        var d = DAYS[(idx + i) % 7];
        if (hours && hours[d]) return { open: false, label: "Closed · opens " + (i === 1 ? "tomorrow" : DAY_LONG[d]) + " " + to12h(hours[d][0]) };
      }
    } catch (e) {
      /* invalid time zone: no badge */
    }
    return null;
  }

  /* ── Theme ──────────────────────────────────────────────────────────────── */
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var rgb = [0, 2, 4].map(function (i) {
      var c = parseInt(m[1].substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }
  function inkFor(hex) {
    var L = luminance(hex);
    if (L === null) return null;
    var onWhite = 1.05 / (L + 0.05);
    var onInk = (L + 0.05) / (luminance("#18191b") + 0.05);
    return onInk >= onWhite ? "#18191b" : "#ffffff";
  }
  function applyTheme() {
    var root = document.documentElement;
    [
      ["brand", "--oc-theme-brand"],
      ["accent", "--oc-theme-accent"],
      ["canvas", "--oc-theme-canvas"],
    ].forEach(function (pair) {
      var c = val("theme." + pair[0], "");
      if (!c || luminance(c) === null) return;
      root.style.setProperty(pair[1], c);
      if (pair[0] !== "canvas") root.style.setProperty(pair[1] + "-ink", inkFor(c));
    });
  }

  /* ── Bindings ([data-oc-*] attributes in the HTML blocks) ───────────────── */
  function bind(root) {
    root.querySelectorAll("[data-oc-text]").forEach(function (el) {
      var v = val(el.getAttribute("data-oc-text"), null);
      if (v !== null && typeof v !== "object") el.textContent = v;
    });
    root.querySelectorAll("[data-oc-href]").forEach(function (el) {
      var v = val(el.getAttribute("data-oc-href"), null);
      if (v) el.setAttribute("href", link(v));
    });
    root.querySelectorAll("[data-oc-tel]").forEach(function (el) {
      var v = val(el.getAttribute("data-oc-tel"), null);
      if (!v) return;
      el.setAttribute("href", telHref(v));
      if (!el.hasAttribute("data-oc-keep-text")) el.textContent = v;
    });
    root.querySelectorAll("[data-oc-mailto]").forEach(function (el) {
      var v = val(el.getAttribute("data-oc-mailto"), null);
      if (!v) return;
      el.setAttribute("href", "mailto:" + v);
      if (!el.hasAttribute("data-oc-keep-text")) el.textContent = v;
    });
    root.querySelectorAll("[data-oc-show]").forEach(function (el) {
      el.hidden = !val(el.getAttribute("data-oc-show"), false);
    });
    root.querySelectorAll("[data-oc-hide]").forEach(function (el) {
      el.hidden = Boolean(val(el.getAttribute("data-oc-hide"), false));
    });
    root.querySelectorAll("[data-oc-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
    // Static links inside blocks are written as GHL paths; map them for the local preview only.
    if (PREVIEW && PREVIEW.pages) {
      root.querySelectorAll("a[href^='/']").forEach(function (a) {
        a.setAttribute("href", link(a.getAttribute("href")));
      });
    }
  }

  /* ── Native GHL embeds ──────────────────────────────────────────────────── */
  var loadedScripts = {};
  function loadScript(src) {
    if (!src || loadedScripts[src]) return;
    loadedScripts[src] = true;
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.body.appendChild(s);
  }
  /** A config value may be an ID or a full widget URL; returns the widget URL or "". */
  function widgetUrl(value, base) {
    if (!value) return "";
    if (/^https:\/\//i.test(value)) return value;
    if (/^[A-Za-z0-9_-]{6,}$/.test(value) && base) return base.replace(/\/?$/, "/") + value;
    return "";
  }
  function idFromUrl(url) {
    var m = /\/([A-Za-z0-9_-]+)(?:[?#].*)?$/.exec(url);
    return m ? m[1] : "embed";
  }
  function withParams(url, params) {
    var qs = Object.keys(params || {})
      .filter(function (k) {
        return params[k];
      })
      .map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      })
      .join("&");
    return qs ? url + (url.indexOf("?") < 0 ? "?" : "&") + qs : url;
  }
  function placeholder(opts) {
    return (
      '<div class="oc-placeholder" role="note" data-oc-placeholder="' + esc(opts.kind) + '">' +
      '<span class="oc-placeholder__kind">' + icon(opts.icon || "info", "oc-icon--sm") + esc(opts.badge) + "</span>" +
      '<p class="oc-placeholder__title">' + esc(opts.title) + "</p>" +
      "<p>" + opts.body + "</p>" +
      (opts.fields && opts.fields.length ? '<ul class="oc-placeholder__fields">' + opts.fields.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") +
      "</div>"
    );
  }
  /** Native GHL form (official inline-embed iframe + form_embed.js). */
  function embedForm(el, key, params, title) {
    var src = widgetUrl(val("forms." + key, "") || (key !== "contact" ? val("forms.contact", "") : ""), val("forms.widgetBase", ""));
    if (!src) {
      el.innerHTML = placeholder({
        kind: "form",
        badge: "GHL form",
        icon: "mail",
        title: title || "Website inquiry form",
        body: "The native GoHighLevel form appears here on the published site. Set <code>OC_CONFIG.forms." + esc(key) + "</code> to the form's ID or embed URL (see ghl-setup-guide.md → Forms). Nothing is sent from this placeholder.",
        fields: ["Full name", "Email", "Mobile number", "I'm interested in", "Preferred branch", "Message", "SMS / marketing consent"].concat(params && params[val("forms.productQueryKey", "product_name")] ? ["Product: " + params[val("forms.productQueryKey", "product_name")] + " (hidden field)"] : []),
      });
      return false;
    }
    var id = idFromUrl(src);
    var h = Number(val("forms.height", 760)) || 760;
    var url = withParams(src, params);
    el.innerHTML =
      '<iframe src="' + esc(url) + '" title="' + esc(title || "Inquiry form") + '" id="inline-' + esc(id) + '" style="width:100%;height:' + h + 'px;border:none;border-radius:4px"' +
      ' data-layout="{\'id\':\'INLINE\'}" data-trigger-type="alwaysShow" data-trigger-value="" data-activation-type="alwaysActivated" data-activation-value=""' +
      ' data-deactivation-type="neverDeactivate" data-deactivation-value="" data-form-name="' + esc(title || "Inquiry form") + '" data-height="' + h + '"' +
      ' data-layout-iframe-id="inline-' + esc(id) + '" data-form-id="' + esc(id) + '" loading="lazy"></iframe>';
    loadScript(val("forms.embedScript", ""));
    return true;
  }
  /** Native GHL calendar (official booking-widget iframe + form_embed.js). */
  function embedCalendar(el, value, label) {
    var src = widgetUrl(value, val("booking.widgetBase", ""));
    if (!src) {
      el.innerHTML = placeholder({
        kind: "calendar",
        badge: "GHL calendar",
        icon: "calendar",
        title: label ? "Booking calendar — " + label : "Booking calendar",
        body: "The native GoHighLevel calendar (service, date, time and booking form) appears here on the published site. Set the calendar in <code>OC_CONFIG.branches[].calendar</code> or <code>OC_CONFIG.booking.defaultCalendar</code> (see ghl-setup-guide.md → Calendars). No booking can be made from this placeholder.",
      });
      return false;
    }
    var id = idFromUrl(src);
    var h = Number(val("booking.height", 820)) || 820;
    el.innerHTML = '<iframe src="' + esc(src) + '" title="' + esc(label ? "Book an appointment — " + label : "Book an appointment") + '" id="' + esc(id) + '_oc" scrolling="no" style="width:100%;min-height:' + h + 'px;border:none;overflow:hidden" loading="lazy"></iframe>';
    loadScript(val("booking.embedScript", ""));
    return true;
  }

  /* ── Catalogue helpers (shared by the Home, Eyewear and Product pages) ──── */
  function products() {
    var c = window.OC_CATALOGUE;
    return c && Array.isArray(c.products) ? c.products : [];
  }
  function categoryLabel(id) {
    var cat = list("catalogue.categories").filter(function (c) {
      return c.id === id;
    })[0];
    return cat ? cat.label : id;
  }
  function productUrl(p) {
    return link(val("links.product", "/eyewear-item") + "?p=" + encodeURIComponent(p.id));
  }
  function priceHtml(p, cls) {
    if (val("catalogue.showPrices", true) === false || typeof p.price !== "number") return "";
    var from = (p.variants || []).length > 1 ? '<span class="' + (cls || "oc-product-card__from") + '">from </span>' : "";
    return from + esc(money(p.price));
  }
  function productCard(p, opts) {
    opts = opts || {};
    var variants = (p.variants || []).length;
    return (
      '<a class="oc-product-card" href="' + esc(productUrl(p)) + '">' +
      '<div class="oc-art"><img src="' + esc(asset(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" width="400" height="300"></div>' +
      '<div class="oc-product-card__row"><div class="oc-product-card__text">' +
      '<p class="oc-product-card__name oc-truncate">' + esc(p.name) + "</p>" +
      '<p class="oc-product-card__meta oc-truncate">' + esc(p.brand) + " · " + esc(categoryLabel(p.category)) + "</p></div>" +
      '<p class="oc-product-card__price">' + priceHtml(p) + "</p></div>" +
      (opts.compact || (variants < 2 && !p.storeUrl) ? "" : '<p class="oc-product-card__foot">' + (variants > 1 ? "<span>" + variants + " options</span>" : "") + (p.storeUrl ? '<span class="oc-tag oc-tag--pos">Online</span>' : "") + "</p>") +
      "</a>"
    );
  }

  /* ── Header & footer ────────────────────────────────────────────────────── */
  function brandMark(el) {
    var logo = val("business.logo", "");
    var name = val("business.name", "");
    if (logo) {
      el.classList.add("oc-brand__mark--logo");
      el.innerHTML = '<img src="' + esc(asset(logo)) + '" alt="" height="32">';
    } else if (name) {
      el.textContent = name.trim().charAt(0).toUpperCase();
    }
  }
  function navLinks(items, mobile) {
    return items
      .map(function (n) {
        var cur = isCurrent(n.href) ? ' aria-current="page"' : "";
        var a = '<a href="' + esc(link(n.href)) + '"' + cur + ">" + esc(n.label) + "</a>";
        return mobile ? "<li>" + a + "</li>" : a;
      })
      .join("");
  }
  renderers.header = function (el) {
    var promo = el.querySelector("[data-oc-promo]");
    if (promo) {
      var on = val("promo.enabled", false) && (val("promo.text", "") || val("promo.strong", ""));
      promo.hidden = !on;
      if (on) {
        var href = val("promo.href", "");
        promo.innerHTML =
          (val("promo.strong", "") ? "<strong>" + esc(val("promo.strong", "")) + "</strong> " : "") +
          esc(val("promo.text", "")) +
          (href && val("promo.linkLabel", "") ? ' <a href="' + esc(link(href)) + '">' + esc(val("promo.linkLabel", "")) + "</a>" : "");
      }
    }
    el.querySelectorAll("[data-oc-brand-mark]").forEach(brandMark);
    el.querySelectorAll("[data-oc-brand-home]").forEach(function (a) {
      a.setAttribute("href", link(val("links.home", "/")));
      a.setAttribute("aria-label", val("business.name", "Home") + " home");
    });
    var nav = list("nav");
    var desktop = el.querySelector("[data-oc-nav]");
    var mobile = el.querySelector("[data-oc-mobile-nav-list]");
    if (nav.length && desktop) desktop.innerHTML = navLinks(nav, false);
    if (nav.length && mobile) mobile.innerHTML = navLinks(nav, true);
    if (!nav.length) {
      el.querySelectorAll("[data-oc-nav] a, [data-oc-mobile-nav-list] a").forEach(function (a) {
        if (isCurrent(a.getAttribute("href"))) a.setAttribute("aria-current", "page");
      });
    }
    el.querySelectorAll("[data-oc-cta]").forEach(function (a) {
      a.setAttribute("href", link(val("headerCta.href", val("links.booking", "/book"))));
      a.textContent = val("headerCta.label", a.textContent);
    });
    var toggle = el.querySelector("[data-oc-menu-toggle]");
    var menu = el.querySelector("[data-oc-mobile-nav]");
    if (toggle && menu) {
      var set = function (open) {
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        menu.hidden = !open;
      };
      var on = { signal: api.signal };
      set(false);
      toggle.addEventListener("click", function () {
        set(toggle.getAttribute("aria-expanded") !== "true");
      }, on);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
          set(false);
          toggle.focus();
        }
      }, on);
      menu.addEventListener("click", function (e) {
        if (e.target.closest("a")) set(false);
      }, on);
    }
  };
  renderers.footer = function (el) {
    el.querySelectorAll("[data-oc-footer-branches]").forEach(function (box) {
      var branches = list("branches").slice(0, 3);
      if (!branches.length) return;
      box.innerHTML = branches
        .map(function (b) {
          return (
            '<div><p class="oc-eyebrow oc-eyebrow--inherit">' + esc(b.name) + "</p>" +
            '<p class="oc-footer__address">' + (b.address || []).map(esc).join("<br>") + "</p>" +
            '<ul class="oc-footer__hours">' + hoursRows(b.hours) + "</ul></div>"
          );
        })
        .join("");
    });
    el.querySelectorAll("[data-oc-footer-nav]").forEach(function (box) {
      var items = list("nav").concat([
        { label: "Privacy", href: val("links.privacy", "/privacy") },
        { label: "Terms", href: val("links.terms", "/terms") },
      ]);
      box.innerHTML = items
        .map(function (n) {
          return '<a href="' + esc(link(n.href)) + '">' + esc(n.label) + "</a>";
        })
        .join("");
    });
    el.querySelectorAll("[data-oc-social]").forEach(function (box) {
      var items = list("social").filter(function (s) {
        return s && s.href && !isMergeTag(s.href);
      });
      box.hidden = !items.length;
      box.innerHTML = items
        .map(function (s) {
          return '<a href="' + esc(s.href) + '" rel="noopener" target="_blank">' + esc(s.label) + '<span class="oc-sr-only"> (opens in a new tab)</span></a>';
        })
        .join("");
    });
    el.querySelectorAll("[data-oc-staff-login]").forEach(function (a) {
      var href = val("links.staffLogin", "");
      a.hidden = !href;
      if (href) a.setAttribute("href", href);
    });
  };

  /* Generic renderers usable on any page */
  renderers["embed-form"] = function (el) {
    var key = el.getAttribute("data-form") || "contact";
    var params = {};
    params[val("forms.kindQueryKey", "inquiry_kind")] = el.getAttribute("data-kind") || "contact";
    params[val("forms.pageQueryKey", "source_page")] = currentPath();
    embedForm(el, key, params, el.getAttribute("data-title") || "Website inquiry form");
  };
  renderers["embed-calendar"] = function (el) {
    var branchId = el.getAttribute("data-branch");
    var b = list("branches").filter(function (x) {
      return x.id === branchId;
    })[0];
    embedCalendar(el, (b && val("branches." + list("branches").indexOf(b) + ".calendar", "")) || val("booking.defaultCalendar", ""), b ? b.name : "");
  };

  /* ── Registry, queue and lifecycle ──────────────────────────────────────── */
  function run(el) {
    var name = el.getAttribute("data-oc-render");
    var fn = renderers[name];
    if (!fn || el.getAttribute("data-oc-done") === "1") return;
    el.setAttribute("data-oc-done", "1");
    // GHL's hydration can patch a block back to its original HTML; when it is rendered again, the
    // listeners from the previous render are removed first (renderers pass oc.signal to them).
    if (el.__ocAbort) el.__ocAbort.abort();
    el.__ocAbort = window.AbortController ? new AbortController() : null;
    api.signal = el.__ocAbort ? el.__ocAbort.signal : undefined;
    try {
      fn(el, api);
      bind(el);
    } catch (e) {
      el.removeAttribute("data-oc-done");
      if (window.console) console.error("[OCSite] renderer \"" + name + "\" failed:", e);
    }
  }
  function init(root) {
    root = root || document;
    var targets = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll("[data-oc-render]")) : [];
    if (root.getAttribute && root.getAttribute("data-oc-render")) targets.unshift(root);
    targets.forEach(run);
    if (root.querySelectorAll) bind(root === document ? document.body || document : root);
  }
  function register(name, fn) {
    renderers[name] = fn;
    if (document.readyState !== "loading") init(document);
  }

  var api = {
    config: CONFIG,
    preview: PREVIEW,
    val: val,
    list: list,
    esc: esc,
    link: link,
    asset: asset,
    money: money,
    telHref: telHref,
    slugify: slugify,
    query: query,
    icon: icon,
    hoursRows: hoursRows,
    groupedHours: groupedHours,
    openStatus: openStatus,
    embedForm: embedForm,
    embedCalendar: embedCalendar,
    widgetUrl: widgetUrl,
    products: products,
    categoryLabel: categoryLabel,
    productUrl: productUrl,
    productCard: productCard,
    priceHtml: priceHtml,
    currentPath: currentPath,
    register: register,
    init: init,
    signal: undefined, // AbortSignal for listeners added by the renderer that is currently running
  };
  window.OCSite = api;

  // Page scripts queue their setup functions; run the ones queued so far and any pushed later.
  var queue = window.OC_QUEUE || [];
  function drain(fn) {
    try {
      if (typeof fn === "function") fn(api);
    } catch (e) {
      if (window.console) console.error("[OCSite] page script failed:", e);
    }
  }
  queue.forEach(drain);
  window.OC_QUEUE = { push: function (fn) { drain(fn); if (document.readyState !== "loading") init(document); } };

  function start() {
    applyTheme();
    init(document);
    // GHL websites hydrate after load (official "hydrationDone" event); render anything the
    // hydration replaced. With "Optimize JavaScript" on, GHL delays this until the first interaction.
    document.addEventListener("hydrationDone", function () {
      init(document);
    });
    // GHL can render custom-code elements after the initial load (and the builder re-renders
    // them): render any block that appears later, once.
    if (window.MutationObserver && document.body) {
      new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === 1 && (n.hasAttribute("data-oc-render") || n.querySelector("[data-oc-render]:not([data-oc-done])"))) init(n);
          });
        });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
