/*
 * Lensmere Optical — standalone reference behaviour (plain JS, no dependencies).
 * Works from file:// (double-click). Each block is independent; copy only what you need
 * into a GHL custom-code element.
 *
 * 1. Mobile menu toggle        (original: site-header.tsx, React state)
 * 2. Open / closed badge       (original: openStatus() in site-ui.tsx, rendered on the server)
 * 3. Eyewear category filter   (original: /eyewear?category=… links, filtered on the server)
 * 4. Booking picker mock       (original: booking-form.tsx — live slots from the database)
 * 5. Form submit guard         (original forms post to Next.js server actions)
 * FAQ accordions need no JS: they are native <details>/<summary> elements.
 */
(function () {
  "use strict";

  /* 1. Mobile menu ------------------------------------------------------------ */
  var toggle = document.querySelector("[data-menu-toggle]");
  var menu = document.getElementById("site-mobile-nav");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open menu" : "Close menu");
      menu.hidden = open;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        toggle.click();
        toggle.focus();
      }
    });
  }

  /* 2. Open / closed badge ------------------------------------------------------
   * <span class="status-badge" data-hours='{"mon":["10:00","19:00"],…,"sun":null}'
   *       data-timezone="Asia/Manila" data-status-label="#id-of-label">Open</span>
   * The static HTML already contains a sensible fallback; this only refreshes it. */
  var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var DAY_LABEL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
  function to12h(hm) {
    var p = hm.split(":").map(Number);
    var suffix = p[0] >= 12 ? "pm" : "am";
    var hh = p[0] % 12 || 12;
    return p[1] ? hh + ":" + String(p[1]).padStart(2, "0") + suffix : hh + suffix;
  }
  function nowIn(tz) {
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    var get = function (t) {
      return (parts.find(function (x) { return x.type === t; }) || {}).value;
    };
    return { day: get("weekday").toLowerCase().slice(0, 3), hm: get("hour") + ":" + get("minute") };
  }
  function openStatus(hours, tz) {
    var n = nowIn(tz);
    var d = hours[n.day];
    if (d && n.hm >= d[0] && n.hm < d[1]) return { open: true, label: "Open now · until " + to12h(d[1]) };
    if (d && n.hm < d[0]) return { open: false, label: "Closed · opens " + to12h(d[0]) + " today" };
    var idx = DAYS.indexOf(n.day);
    for (var i = 1; i <= 7; i++) {
      var day = DAYS[(idx + i) % 7];
      if (hours[day]) return { open: false, label: "Closed · opens " + (i === 1 ? "tomorrow" : DAY_LABEL[day]) + " " + to12h(hours[day][0]) };
    }
    return { open: false, label: "Closed" };
  }
  document.querySelectorAll(".status-badge[data-hours]").forEach(function (badge) {
    try {
      var s = openStatus(JSON.parse(badge.getAttribute("data-hours")), badge.getAttribute("data-timezone") || "Asia/Manila");
      badge.setAttribute("data-open", String(s.open));
      badge.lastChild.textContent = s.open ? "Open" : "Closed";
      var label = document.querySelector(badge.getAttribute("data-status-label"));
      if (label) label.textContent = s.label;
    } catch (e) {
      /* keep the static fallback */
    }
  });

  /* 3. Eyewear category filter (products.html?category=Frames) ------------------ */
  var catNav = document.querySelector("[data-category-nav]");
  if (catNav) {
    var params = new URLSearchParams(location.search);
    var active = params.get("category");
    var cards = document.querySelectorAll("[data-category]");
    var known = Array.prototype.some.call(cards, function (c) { return c.getAttribute("data-category") === active; });
    if (!known) active = null;
    cards.forEach(function (c) {
      c.hidden = Boolean(active) && c.getAttribute("data-category") !== active;
    });
    catNav.querySelectorAll("a").forEach(function (a) {
      var cat = a.getAttribute("data-filter") || null;
      if (cat === active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  /* 4. Booking picker mock: toggles the selected look only (no availability) ------ */
  document.querySelectorAll("[data-choice-group]").forEach(function (group) {
    var attr = group.getAttribute("data-choice-attr") || "aria-pressed";
    group.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn || btn.disabled || !group.contains(btn)) return;
      group.querySelectorAll("button").forEach(function (b) {
        b.setAttribute(attr, String(b === btn));
      });
    });
  });

  /* 5. Forms are visual references only --------------------------------------- */
  document.querySelectorAll("form[data-static-form]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector("[data-static-note]");
      if (note) note.hidden = false;
    });
  });
})();
