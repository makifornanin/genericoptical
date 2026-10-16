/*
 * Product detail — page script (GoHighLevel-ready)
 * Paste wrapped in a script tag in this page's Settings → Tracking Code → Footer (or a Custom Code
 * element at the bottom of the page). Requires the site-wide scripts incl. oc-catalogue.js.
 * The product is chosen with ?p=<product-id>; links from the catalogue already include it.
 */
(window.OC_QUEUE = window.OC_QUEUE || []).push(function (oc) {
  var esc = oc.esc;

  function category(id) {
    return oc.list("catalogue.categories").filter(function (c) {
      return c.id === id;
    })[0] || { id: id, label: id };
  }

  oc.register("product", function (el) {
    var body = el.querySelector("[data-oc-product-body]");
    var id = oc.query("p");
    var all = oc.products();
    var p = all.filter(function (x) {
      return x.id === id;
    })[0];

    if (!p) {
      body.innerHTML =
        '<div class="oc-empty" style="margin-top:24px"><p>' +
        (id ? "We couldn't find that product — it may no longer be listed online." : "Choose a frame, sunglasses or lenses from the eyewear page to see the details here.") +
        '</p><a class="oc-btn oc-btn--brand" href="' + esc(oc.link(oc.val("links.eyewear", "/eyewear"))) + '">Browse eyewear</a></div>';
      return;
    }

    var cat = category(p.category);
    var business = oc.val("business.name", "");
    document.title = p.name + (business ? " · " + business : "");
    var images = (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);
    var variants = p.variants || [];
    var selected = variants.length === 1 ? 0 : -1;
    var service = oc.list("services").filter(function (s) {
      return s.id === cat.bookService && s.enabled !== false && s.bookable;
    })[0];

    body.innerHTML =
      '<div class="oc-product__layout">' +
      '<div class="oc-product__gallery">' +
      '<div class="oc-art oc-art--r28"><img data-oc-main-img src="' + esc(oc.asset(images[0])) + '" alt="' + esc(p.name) + '" width="400" height="300" fetchpriority="high"></div>' +
      (images.length > 1
        ? '<div class="oc-thumbs" role="group" aria-label="Product images">' +
          images
            .map(function (src, i) {
              return '<button type="button" class="oc-thumb" data-img="' + esc(src) + '" aria-pressed="' + (i === 0) + '"><img src="' + esc(oc.asset(src)) + '" alt="' + esc(p.name + " — image " + (i + 1)) + '" width="84" height="63" loading="lazy"></button>';
            })
            .join("") +
          "</div>"
        : "") +
      "</div>" +
      "<div>" +
      '<p class="oc-eyebrow">' + esc(p.brand) + " · " + esc(cat.label) + "</p>" +
      '<h1 class="oc-product__title">' + esc(p.name) + "</h1>" +
      (oc.val("catalogue.showPrices", true) !== false && typeof p.price === "number" ? '<p class="oc-product__price" data-oc-price>' + oc.priceHtml(p, "oc-product__from") + "</p>" : "") +
      (p.description ? '<p class="oc-product__desc">' + esc(p.description) + "</p>" : "") +
      (variants.length
        ? '<p class="oc-product__label" id="oc-variants-label">' + (variants.length > 1 ? "Available in — choose one to ask about it" : "Available in") + "</p>" +
          '<div class="oc-chips" role="group" aria-labelledby="oc-variants-label">' +
          variants
            .map(function (v, i) {
              return '<button type="button" class="oc-chip" data-variant="' + i + '" aria-pressed="' + (i === selected) + '">' + esc(v.label) + (typeof v.price === "number" && v.price !== p.price ? ' <span class="oc-chip__price">' + esc(oc.money(v.price)) + "</span>" : "") + "</button>";
            })
            .join("") +
          "</div>"
        : "") +
      '<p class="oc-availability">' + oc.icon("info") + "<span>" + esc(p.storeUrl ? "Available to order online with live stock — or ask us to reserve it in branch for a try-on." : p.note || oc.val("catalogue.availabilityNote", "")) + "</span></p>" +
      (p.note && p.storeUrl ? '<p class="oc-availability">' + oc.icon("info") + "<span>" + esc(p.note) + "</span></p>" : "") +
      '<div class="oc-product__actions">' +
      '<button type="button" class="oc-btn oc-btn--brand oc-btn--lg" data-oc-ask aria-expanded="false" aria-controls="oc-product-inquiry">Ask about this</button>' +
      (service ? '<a class="oc-btn oc-btn--outline oc-btn--lg" href="' + esc(oc.link(oc.val("links.booking", "/book") + "?service=" + encodeURIComponent(service.id))) + '">' + esc(cat.bookLabel || "Book an appointment") + "</a>" : "") +
      (p.storeUrl ? '<a class="oc-btn oc-btn--accent oc-btn--lg" href="' + esc(p.storeUrl) + '">' + oc.icon("store") + "Buy online</a>" : "") +
      "</div>" +
      '<div class="oc-product__inquiry" id="oc-product-inquiry" hidden>' +
      '<p class="oc-product__label">Asking about <strong data-oc-asking></strong></p>' +
      '<div class="oc-embed-card" style="margin-top:12px"><div class="oc-embed" data-oc-inquiry-embed></div></div>' +
      "</div>" +
      "</div></div>";

    var related = all
      .filter(function (x) {
        return x.category === p.category && x.id !== p.id;
      })
      .slice(0, 4);
    if (related.length) {
      body.insertAdjacentHTML(
        "beforeend",
        '<section class="oc-related" aria-labelledby="oc-related-title"><h2 class="oc-related__title" id="oc-related-title">More ' + esc(cat.label.toLowerCase()) + '</h2><ul class="oc-product-grid oc-product-grid--4">' +
          related.map(function (x) { return "<li>" + oc.productCard(x, { compact: true }) + "</li>"; }).join("") +
          "</ul></section>",
      );
    }

    var mainImg = body.querySelector("[data-oc-main-img]");
    var panel = body.querySelector("#oc-product-inquiry");
    var ask = body.querySelector("[data-oc-ask]");
    var asking = body.querySelector("[data-oc-asking]");
    var embed = body.querySelector("[data-oc-inquiry-embed]");

    function label() {
      return selected >= 0 ? p.name + " (" + variants[selected].label + ")" : p.name;
    }
    function loadForm() {
      asking.textContent = label();
      var params = {};
      params[oc.val("forms.productQueryKey", "product_name")] = label();
      params[oc.val("forms.kindQueryKey", "inquiry_kind")] = "product_inquiry";
      params[oc.val("forms.pageQueryKey", "source_page")] = oc.currentPath() + "?p=" + p.id;
      oc.embedForm(embed, "product", params, "Product inquiry — " + p.name);
    }
    function showImage(src) {
      if (!src) return;
      mainImg.src = oc.asset(src);
      body.querySelectorAll(".oc-thumb").forEach(function (t) {
        t.setAttribute("aria-pressed", String(t.getAttribute("data-img") === src));
      });
    }

    body.querySelectorAll(".oc-thumb").forEach(function (t) {
      t.addEventListener("click", function () {
        showImage(t.getAttribute("data-img"));
      });
    });
    body.querySelectorAll(".oc-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        selected = Number(chip.getAttribute("data-variant"));
        body.querySelectorAll(".oc-chip").forEach(function (c) {
          c.setAttribute("aria-pressed", String(c === chip));
        });
        var v = variants[selected];
        if (v.image) showImage(v.image);
        var price = body.querySelector("[data-oc-price]");
        if (price && typeof v.price === "number") price.textContent = oc.money(v.price);
        if (!panel.hidden) loadForm();
      });
    });
    ask.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      ask.setAttribute("aria-expanded", String(open));
      if (open) {
        loadForm();
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    if (oc.query("ask") === "1") ask.click();
  });
});
