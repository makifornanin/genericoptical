/*
 * Booking — page script (GoHighLevel-ready)
 * Paste wrapped in a script tag in this page's Settings → Tracking Code → Footer (or a Custom Code
 * element at the bottom of the page). Requires the site-wide scripts; load order does not matter.
 *
 * The calendar for a branch + service is resolved as:
 *   services[i].calendars[branchId] → branches[j].calendar → booking.defaultCalendar
 * Each value is a GHL calendar ID or booking-widget URL (OC_CONFIG). This page never stores or
 * submits bookings itself: the native GHL calendar does.
 */
(window.OC_QUEUE = window.OC_QUEUE || []).push(function (oc) {
  var esc = oc.esc;

  oc.register("booking", function (el) {
    var on = { signal: oc.signal };
    var branches = oc.list("branches");
    var services = oc.list("services").filter(function (s) {
      return s && s.enabled !== false && s.bookable;
    });
    var state = {
      branch: oc.query("branch"),
      service: oc.query("service"),
    };
    if (!branches.some(function (b) { return b.id === state.branch; })) state.branch = branches[0] ? branches[0].id : null;
    if (!services.some(function (s) { return s.id === state.service; })) state.service = services[0] ? services[0].id : null;

    var branchStep = el.querySelector('[data-oc-step="branch"]');
    var serviceStep = el.querySelector('[data-oc-step="service"]');
    var branchBox = el.querySelector("[data-oc-branches]");
    var serviceBox = el.querySelector("[data-oc-services]");
    var summary = el.querySelector("[data-oc-summary]");
    var calendar = el.querySelector("[data-oc-calendar]");

    branchStep.hidden = branches.length < 2;
    serviceStep.hidden = services.length < 2;
    var n = 1;
    el.querySelectorAll(".oc-step").forEach(function (step) {
      if (!step.hidden) step.querySelector("[data-oc-step-num]").textContent = String(n++);
    });
    if (branches.length === 2) branchBox.classList.replace("oc-choices--3", "oc-choices--2");

    branchBox.innerHTML = branches
      .map(function (b) {
        return '<button type="button" class="oc-choice" data-branch="' + esc(b.id) + '"><span class="oc-choice__name">' + esc(b.name) + '</span><span class="oc-choice__sub">' + esc((b.address || []).join(", ")) + "</span></button>";
      })
      .join("");
    serviceBox.innerHTML = services
      .map(function (s) {
        var meta = [s.duration ? s.duration + " min" : "", typeof s.price === "number" ? oc.money(s.price) : s.priceLabel || ""].filter(Boolean).join(" · ");
        return '<button type="button" class="oc-choice" data-service="' + esc(s.id) + '"><span class="oc-choice__name">' + esc(s.name) + '</span><span class="oc-choice__sub">' + esc(meta) + "</span></button>";
      })
      .join("");

    function current() {
      var b = branches.filter(function (x) { return x.id === state.branch; })[0] || null;
      var s = services.filter(function (x) { return x.id === state.service; })[0] || null;
      return { b: b, s: s };
    }
    function calendarFor(b, s) {
      var bi = branches.indexOf(b);
      var si = oc.list("services").indexOf(s);
      return (s && b && oc.val("services." + si + ".calendars." + b.id, "")) || (b && oc.val("branches." + bi + ".calendar", "")) || oc.val("booking.defaultCalendar", "");
    }
    var lastCalendar = null;
    function render() {
      var c = current();
      branchBox.querySelectorAll(".oc-choice").forEach(function (btn) {
        btn.setAttribute("aria-pressed", String(btn.getAttribute("data-branch") === state.branch));
      });
      serviceBox.querySelectorAll(".oc-choice").forEach(function (btn) {
        btn.setAttribute("aria-pressed", String(btn.getAttribute("data-service") === state.service));
      });
      summary.innerHTML = c.s || c.b
        ? "<strong>" + esc(c.s ? c.s.name : "Appointment") + "</strong>" + (c.b ? " · " + esc(c.b.name) : "") + (c.s && c.s.duration ? " · " + esc(c.s.duration + " min") : "") + ". Choose a date and time below — the calendar shows live availability."
        : "Choose a date and time below.";
      var cal = calendarFor(c.b, c.s);
      var key = cal + "|" + state.branch + "|" + state.service;
      if (key !== lastCalendar) {
        lastCalendar = key;
        oc.embedCalendar(calendar, cal, [c.b && c.b.name, c.s && c.s.name].filter(Boolean).join(" · "));
      }
      var hoursBranch = el.querySelector("[data-oc-hours-branch]");
      if (hoursBranch) hoursBranch.textContent = c.b && branches.length > 1 ? "· " + c.b.name : "";
      var hours = el.querySelector("[data-oc-hours]");
      if (hours) hours.innerHTML = oc.hoursRows(c.b ? c.b.hours : {});
      var phone = el.querySelector("[data-oc-phone]");
      var number = (c.b && c.b.phone) || oc.val("business.phone", "");
      if (phone && number) {
        phone.textContent = number;
        phone.setAttribute("href", oc.telHref(number));
      }
      try {
        var url = new URL(window.location.href);
        if (state.branch) url.searchParams.set("branch", state.branch);
        if (state.service) url.searchParams.set("service", state.service);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch (e) {
        /* ignore (file:// preview) */
      }
    }

    branchBox.addEventListener("click", function (e) {
      var btn = e.target.closest(".oc-choice");
      if (!btn) return;
      state.branch = btn.getAttribute("data-branch");
      render();
    }, on);
    serviceBox.addEventListener("click", function (e) {
      var btn = e.target.closest(".oc-choice");
      if (!btn) return;
      state.service = btn.getAttribute("data-service");
      render();
    }, on);
    render();
  });
});
