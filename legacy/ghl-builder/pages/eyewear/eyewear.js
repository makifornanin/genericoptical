/*
 * Eyewear — page script (GoHighLevel-ready)
 * Paste wrapped in a script tag in this page's Settings → Tracking Code → Footer (or a Custom Code
 * element at the bottom of the page). Requires the site-wide scripts incl. oc-catalogue.js.
 */
(window.OC_QUEUE = window.OC_QUEUE || []).push(function (oc) {
  var esc = oc.esc;

  oc.register("catalogue", function (el) {
    var on = { signal: oc.signal };
    var all = oc.products();
    var cats = oc.list("catalogue.categories").filter(function (c) {
      return all.some(function (p) {
        return p.category === c.id;
      });
    });
    var state = { cat: oc.query("category"), q: oc.query("q") || "" };
    if (!cats.some(function (c) { return c.id === state.cat; })) state.cat = null;

    var pills = el.querySelector("[data-oc-pills]");
    var search = el.querySelector("[data-oc-search]");
    var grid = el.querySelector("[data-oc-grid]");
    var status = el.querySelector("[data-oc-status]");
    var empty = el.querySelector("[data-oc-empty]");
    search.value = state.q;

    function haystack(p) {
      return [p.name, p.brand, oc.categoryLabel(p.category), p.description]
        .concat((p.variants || []).map(function (v) { return v.label; }))
        .join(" ")
        .toLowerCase();
    }
    function matches(p) {
      if (state.cat && p.category !== state.cat) return false;
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      var text = haystack(p);
      return words.every(function (w) { return text.indexOf(w) >= 0; });
    }
    function syncUrl() {
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete("category");
        url.searchParams.delete("q");
        if (state.cat) url.searchParams.set("category", state.cat);
        if (state.q) url.searchParams.set("q", state.q);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      } catch (e) {
        /* file:// or a sandboxed frame: filtering still works */
      }
    }
    function renderPills() {
      var count = function (id) {
        return all.filter(function (p) { return !id || p.category === id; }).length;
      };
      pills.innerHTML = [{ id: null, label: "Everything" }]
        .concat(cats)
        .map(function (c) {
          return '<button type="button" class="oc-pill" data-cat="' + esc(c.id || "") + '" aria-pressed="' + (state.cat === c.id) + '">' + esc(c.label) + '<span class="oc-pill__count">' + count(c.id) + "</span></button>";
        })
        .join("");
    }
    function render() {
      var shown = all.filter(matches);
      grid.innerHTML = shown.map(function (p) { return "<li>" + oc.productCard(p) + "</li>"; }).join("");
      grid.hidden = !shown.length;
      empty.hidden = Boolean(shown.length);
      var what = state.cat ? oc.categoryLabel(state.cat).toLowerCase() : "products";
      status.textContent = state.q
        ? shown.length + (shown.length === 1 ? " result" : " results") + " for “" + state.q + "”" + (state.cat ? " in " + what : "")
        : "Showing " + shown.length + " " + (shown.length === 1 && !state.cat ? "product" : what);
      Array.prototype.forEach.call(pills.querySelectorAll(".oc-pill"), function (b) {
        b.setAttribute("aria-pressed", String((b.getAttribute("data-cat") || null) === state.cat));
      });
    }

    pills.addEventListener("click", function (e) {
      var b = e.target.closest(".oc-pill");
      if (!b) return;
      state.cat = b.getAttribute("data-cat") || null;
      syncUrl();
      render();
    }, on);
    var timer;
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = search.value.trim();
        syncUrl();
        render();
      }, 120);
    }, on);
    el.querySelector("[data-oc-clear]").addEventListener("click", function () {
      state.cat = null;
      state.q = "";
      search.value = "";
      syncUrl();
      render();
      search.focus();
    }, on);

    var store = oc.val("links.store", "");
    var callout = el.querySelector("[data-oc-store-callout]");
    if (store && callout) {
      callout.hidden = false;
      callout.innerHTML = 'Some items can be bought online with live stock in our <a class="oc-text-link" href="' + esc(oc.link(store)) + '">online store</a>.';
    }

    renderPills();
    render();
  });
});
