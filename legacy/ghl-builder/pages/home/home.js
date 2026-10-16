/*
 * Home — page script (GoHighLevel-ready)
 * Paste wrapped in a script tag in this page's Settings → Tracking Code → Footer (or a Custom Code
 * element at the bottom of the page). Requires the site-wide oc-config.js, oc-catalogue.js and
 * oc-site.js; load order does not matter (it queues itself on window.OC_QUEUE).
 */
(window.OC_QUEUE = window.OC_QUEUE || []).push(function (oc) {
  var esc = oc.esc;

  function services() {
    return oc.list("services").filter(function (s) {
      return s && s.enabled !== false;
    });
  }
  function serviceLink(s) {
    return s.bookable ? oc.link(oc.val("links.booking", "/book") + "?service=" + encodeURIComponent(s.id)) : oc.link(oc.val("links.contact", "/contact"));
  }
  function priceText(s) {
    return typeof s.price === "number" ? oc.money(s.price) : s.priceLabel || "Price on request";
  }

  oc.register("home-hero", function (el) {
    var cat = oc.products();
    var byId = {};
    cat.forEach(function (p) {
      byId[p.id] = p;
    });
    var picks = oc.list("hero.products").map(function (id) {
      return byId[id];
    }).filter(Boolean);
    if (picks.length < 3) {
      picks = picks.concat(cat.filter(function (p) {
        return p.featured && picks.indexOf(p) < 0;
      })).slice(0, 3);
    }
    var art = el.querySelector("[data-oc-hero-art]");
    if (art && picks.length) {
      art.innerHTML = picks
        .map(function (p, i) {
          var img = '<img src="' + esc(oc.asset(p.image)) + '" alt="' + esc(p.name) + '" width="400" height="300"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + ">";
          if (i === 0) return '<a class="oc-hero-art__main" href="' + esc(oc.productUrl(p)) + '"><div class="oc-art oc-art--hero">' + img + "</div></a>";
          return '<a href="' + esc(oc.productUrl(p)) + '"><div class="oc-art oc-art--r20">' + img + '</div><p class="oc-hero-art__name">' + esc(p.name) + '</p><p class="oc-hero-art__price">' + oc.priceHtml(p, "") + "</p></a>";
        })
        .join("");
    }
    var stats = el.querySelector("[data-oc-stats]");
    if (stats && oc.val("hero.stats", true) !== false) {
      var eyewear = cat.filter(function (p) {
        return p.category === "frames" || p.category === "sunglasses";
      }).length;
      var exam = services().filter(function (s) {
        return s.bookable && s.duration;
      })[0];
      var items = [];
      if (oc.list("branches").length) items.push([oc.list("branches").length === 1 ? "Branch" : "Branches", String(oc.list("branches").length)]);
      if (eyewear) items.push(["Frames & eyewear", String(eyewear)]);
      if (exam) items.push([exam.id === "eye-exam" ? "Eye exam" : exam.name, exam.duration + " min"]);
      stats.innerHTML = items
        .map(function (s) {
          return "<div><dt>" + esc(s[0]) + "</dt><dd>" + esc(s[1]) + "</dd></div>";
        })
        .join("");
      stats.style.gridTemplateColumns = "repeat(" + Math.max(items.length, 1) + ", minmax(0, 1fr))";
      stats.hidden = !items.length;
    }
  });

  oc.register("service-rows", function (el) {
    var rows = services().filter(function (s) {
      return s.featured;
    });
    el.innerHTML = rows
      .map(function (s, i) {
        return (
          "<li>" +
          '<span class="oc-service-rows__num">' + String(i + 1).padStart(2, "0") + "</span>" +
          '<div><h3 class="oc-service-rows__name">' + esc(s.name) + '</h3><p class="oc-service-rows__desc">' + esc(s.description) + "</p></div>" +
          '<div class="oc-service-rows__meta">' +
          '<span class="oc-service-rows__duration">' + (s.duration ? oc.icon("clock", "oc-icon--muted") + esc(s.duration + " minutes") : "") + "</span>" +
          '<span class="oc-service-rows__price">' + esc(priceText(s)) + "</span>" +
          '<a class="oc-underline-link" href="' + esc(serviceLink(s)) + '">' + (s.bookable ? "Book" : "Ask us") + '<span class="oc-sr-only"> — ' + esc(s.name) + "</span>" + oc.icon("up", "oc-icon--sm") + "</a>" +
          "</div></li>"
        );
      })
      .join("");
  });

  oc.register("featured-products", function (el) {
    var picks = oc
      .products()
      .filter(function (p) {
        return p.featured;
      })
      .sort(function (a, b) {
        return a.featured - b.featured;
      })
      .slice(0, 8);
    el.innerHTML = picks
      .map(function (p) {
        return "<li>" + oc.productCard(p, { compact: true }) + "</li>";
      })
      .join("");
  });

  oc.register("testimonials", function (el) {
    var t = oc.val("testimonials", {}) || {};
    var items = (t.items || []).filter(function (q) {
      return q && q.quote;
    });
    if (t.enabled === false || !items.length) {
      el.hidden = true;
      return;
    }
    var sample = el.querySelector("[data-oc-sample]");
    if (sample) sample.hidden = !t.sample;
    var box = el.querySelector("[data-oc-quotes]");
    box.innerHTML = items
      .slice(0, 3)
      .map(function (q) {
        return (
          '<li><figure class="oc-quote"><blockquote class="oc-quote__text"><p>“' + esc(q.quote) + "”</p></blockquote>" +
          '<figcaption class="oc-quote__by"><span><span class="oc-quote__name">' + esc(q.name) + "</span>" + (q.context ? ' <span class="oc-quote__context">· ' + esc(q.context) + "</span>" : "") + "</span>" +
          (t.sample ? '<span class="oc-tag oc-tag--warn">Sample</span>' : "") +
          "</figcaption></figure></li>"
        );
      })
      .join("");
  });

  oc.register("branch-cards", function (el) {
    var branches = oc.list("branches");
    if (!branches.length) {
      el.hidden = true;
      return;
    }
    var title = el.querySelector("[data-oc-branches-title]");
    if (title) title.textContent = branches.length === 1 ? "Visit us." : branches.length + " branches, one standard of care.";
    el.querySelector("[data-oc-branch-list]").innerHTML = branches
      .map(function (b) {
        var st = oc.openStatus(b.hours);
        var book = oc.link(oc.val("links.booking", "/book") + "?branch=" + encodeURIComponent(b.id));
        return (
          '<li class="oc-branch-card">' +
          '<div class="oc-branch-card__top"><h3 class="oc-branch-card__name">' + esc(b.name) + "</h3>" +
          (st ? '<span class="oc-status" data-open="' + st.open + '">' + (st.open ? "Open" : "Closed") + "</span>" : "") + "</div>" +
          (st ? '<p class="oc-branch-card__status">' + esc(st.label) + "</p>" : "") +
          '<div class="oc-branch-card__info">' +
          "<p>" + oc.icon("pin") + "<span>" + esc((b.address || []).join(", ")) + "</span></p>" +
          (b.phone ? "<p>" + oc.icon("phone") + '<a href="' + esc(oc.telHref(b.phone)) + '">' + esc(b.phone) + "</a></p>" : "") +
          "</div>" +
          '<ul class="oc-branch-card__hours">' + oc.hoursRows(b.hours) + "</ul>" +
          '<div class="oc-branch-card__actions"><a class="oc-btn oc-btn--brand" href="' + esc(book) + '">Book here<span class="oc-sr-only"> — ' + esc(b.name) + "</span></a>" +
          (b.mapUrl ? '<a class="oc-btn oc-btn--outline" href="' + esc(b.mapUrl) + '" target="_blank" rel="noopener">Map<span class="oc-sr-only"> of ' + esc(b.name) + " (opens in a new tab)</span></a>" : "") +
          "</div></li>"
        );
      })
      .join("");
  });

  oc.register("faq-mini", function (el) {
    el.innerHTML = oc
      .list("faqs")
      .slice(0, 4)
      .map(function (f) {
        return '<details><summary>' + esc(f.q) + ' <span class="oc-plus" aria-hidden="true">+</span></summary><p class="oc-faq-mini__answer">' + esc(f.a) + "</p></details>";
      })
      .join("");
  });
});
