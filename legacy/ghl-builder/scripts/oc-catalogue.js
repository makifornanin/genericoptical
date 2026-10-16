/*
 * Optical customer website — product showcase data
 * ===================================================================
 * Display data for the custom-code catalogue (Eyewear page, product page, featured products).
 * It is NOT an inventory database: it holds no stock, and prices are display prices.
 *  - Source of truth for products, prices and stock is the management dashboard.
 *  - Live stock and online checkout belong to the native GHL store, which the dashboard keeps in
 *    sync (Settings → Integrations → GoHighLevel → Products / Inventory in the dashboard).
 *  - Regenerate this file from the dashboard's product CSV export with
 *      node tools/catalogue-from-csv.mjs <export.csv> > scripts/oc-catalogue.js
 *    whenever the published range changes (see tools/README.md).
 *
 * Needed only on the Home, Eyewear and Eyewear-item (product) pages: it is included in those pages'
 * page-script element (ghl-ready/pages/<page>/99-page-script.html), before the page script.
 *
 * Fields: id (URL-safe, used in /product?p=<id>), name, brand, category (matches
 * OC_CONFIG.catalogue.categories), price (lowest, currency units), description, image, images[],
 * variants[{label, price?, image?}], featured (1-8 = position on the home page), storeUrl (optional
 * link to the product in the GHL online store), note (optional).
 *
 * Sample data for the fictional demo business "Lensmere Optical".
 */
window.OC_CATALOGUE = {
  "updated": "2026-10-16",
  "currencyNote": "PHP, VAT inclusive",
  "products": [
    {
      "id": "arden-101",
      "name": "Arden 101",
      "brand": "Arden",
      "category": "frames",
      "price": 2950.0,
      "description": "Hand-polished acetate rectangle frame. Available in black, tortoise.",
      "image": "products/frame-rectangle-black.svg",
      "images": [
        "products/frame-rectangle-black.svg",
        "products/frame-rectangle-tortoise.svg"
      ],
      "variants": [
        {
          "label": "52 · Black",
          "image": "products/frame-rectangle-black.svg"
        },
        {
          "label": "54 · Black",
          "image": "products/frame-rectangle-black.svg"
        },
        {
          "label": "52 · Tortoise",
          "image": "products/frame-rectangle-tortoise.svg"
        },
        {
          "label": "54 · Tortoise",
          "image": "products/frame-rectangle-tortoise.svg"
        }
      ],
      "featured": 1
    },
    {
      "id": "arden-204",
      "name": "Arden 204",
      "brand": "Arden",
      "category": "frames",
      "price": 3450.0,
      "description": "Hand-polished acetate square frame. Available in black, crystal, tortoise.",
      "image": "products/frame-square-black.svg",
      "images": [
        "products/frame-square-black.svg",
        "products/frame-square-crystal.svg",
        "products/frame-square-tortoise.svg"
      ],
      "variants": [
        {
          "label": "51 · Black",
          "image": "products/frame-square-black.svg"
        },
        {
          "label": "51 · Crystal",
          "image": "products/frame-square-crystal.svg"
        },
        {
          "label": "51 · Tortoise",
          "image": "products/frame-square-tortoise.svg"
        }
      ],
      "featured": 2
    },
    {
      "id": "arden-everyday",
      "name": "Arden Everyday",
      "brand": "Arden",
      "category": "frames",
      "price": 1990.0,
      "description": "Hand-polished acetate rectangle frame. Available in black, crystal.",
      "image": "products/frame-rectangle-black.svg",
      "images": [
        "products/frame-rectangle-black.svg",
        "products/frame-rectangle-crystal.svg"
      ],
      "variants": [
        {
          "label": "51 · Black",
          "image": "products/frame-rectangle-black.svg"
        },
        {
          "label": "53 · Black",
          "image": "products/frame-rectangle-black.svg"
        },
        {
          "label": "51 · Crystal",
          "image": "products/frame-rectangle-crystal.svg"
        },
        {
          "label": "53 · Crystal",
          "image": "products/frame-rectangle-crystal.svg"
        }
      ]
    },
    {
      "id": "arden-round-33",
      "name": "Arden Round 33",
      "brand": "Arden",
      "category": "frames",
      "price": 3250.0,
      "description": "Hand-polished acetate round frame. Available in tortoise, black.",
      "image": "products/frame-round-tortoise.svg",
      "images": [
        "products/frame-round-tortoise.svg",
        "products/frame-round-black.svg"
      ],
      "variants": [
        {
          "label": "47 · Tortoise",
          "image": "products/frame-round-tortoise.svg"
        },
        {
          "label": "49 · Tortoise",
          "image": "products/frame-round-tortoise.svg"
        },
        {
          "label": "47 · Black",
          "image": "products/frame-round-black.svg"
        },
        {
          "label": "49 · Black",
          "image": "products/frame-round-black.svg"
        }
      ],
      "featured": 3
    },
    {
      "id": "brio-flex-kids",
      "name": "Brio Flex Kids",
      "brand": "Brio",
      "category": "frames",
      "price": 1950.0,
      "description": "Hand-polished acetate round frame. Available in crystal, tortoise.",
      "image": "products/frame-round-crystal.svg",
      "images": [
        "products/frame-round-crystal.svg",
        "products/frame-round-tortoise.svg"
      ],
      "variants": [
        {
          "label": "44 · Crystal",
          "image": "products/frame-round-crystal.svg"
        },
        {
          "label": "44 · Tortoise",
          "image": "products/frame-round-tortoise.svg"
        }
      ]
    },
    {
      "id": "brio-junior",
      "name": "Brio Junior",
      "brand": "Brio",
      "category": "frames",
      "price": 1850.0,
      "description": "Hand-polished acetate rectangle frame. Available in crystal, black.",
      "image": "products/frame-rectangle-crystal.svg",
      "images": [
        "products/frame-rectangle-crystal.svg",
        "products/frame-rectangle-black.svg"
      ],
      "variants": [
        {
          "label": "46 · Crystal",
          "image": "products/frame-rectangle-crystal.svg"
        },
        {
          "label": "46 · Black",
          "image": "products/frame-rectangle-black.svg"
        }
      ]
    },
    {
      "id": "halden-aviator-rx",
      "name": "Halden Aviator RX",
      "brand": "Halden",
      "category": "frames",
      "price": 4250.0,
      "description": "Lightweight metal aviator frame. Available in gold, black.",
      "image": "products/frame-aviator-gold.svg",
      "images": [
        "products/frame-aviator-gold.svg",
        "products/frame-aviator-black.svg"
      ],
      "variants": [
        {
          "label": "55 · Gold",
          "image": "products/frame-aviator-gold.svg"
        },
        {
          "label": "55 · Black",
          "image": "products/frame-aviator-black.svg"
        }
      ],
      "featured": 5
    },
    {
      "id": "halden-oval",
      "name": "Halden Oval",
      "brand": "Halden",
      "category": "frames",
      "price": 3650.0,
      "description": "Lightweight metal oval frame. Available in gold.",
      "image": "products/frame-oval-gold.svg",
      "images": [
        "products/frame-oval-gold.svg"
      ],
      "variants": [
        {
          "label": "50 · Gold",
          "image": "products/frame-oval-gold.svg"
        }
      ],
      "featured": 6
    },
    {
      "id": "halden-sable",
      "name": "Halden Sable",
      "brand": "Halden",
      "category": "frames",
      "price": 2850.0,
      "description": "Hand-polished acetate oval frame. Available in tortoise, black.",
      "image": "products/frame-oval-tortoise.svg",
      "images": [
        "products/frame-oval-tortoise.svg",
        "products/frame-oval-black.svg"
      ],
      "variants": [
        {
          "label": "49 · Tortoise",
          "image": "products/frame-oval-tortoise.svg"
        },
        {
          "label": "49 · Black",
          "image": "products/frame-oval-black.svg"
        }
      ]
    },
    {
      "id": "halden-wire",
      "name": "Halden Wire",
      "brand": "Halden",
      "category": "frames",
      "price": 3950.0,
      "description": "Lightweight metal round frame. Available in gold.",
      "image": "products/frame-round-gold.svg",
      "images": [
        "products/frame-round-gold.svg"
      ],
      "variants": [
        {
          "label": "48 · Gold",
          "image": "products/frame-round-gold.svg"
        },
        {
          "label": "50 · Gold",
          "image": "products/frame-round-gold.svg"
        }
      ]
    },
    {
      "id": "kiyo-hex",
      "name": "Kiyo Hex",
      "brand": "Kiyo",
      "category": "frames",
      "price": 3150.0,
      "description": "Lightweight metal hexagon frame. Available in gold, black.",
      "image": "products/frame-hexagon-gold.svg",
      "images": [
        "products/frame-hexagon-gold.svg",
        "products/frame-hexagon-black.svg"
      ],
      "variants": [
        {
          "label": "50 · Gold",
          "image": "products/frame-hexagon-gold.svg"
        },
        {
          "label": "50 · Black",
          "image": "products/frame-hexagon-black.svg"
        }
      ],
      "featured": 7
    },
    {
      "id": "kiyo-slim",
      "name": "Kiyo Slim",
      "brand": "Kiyo",
      "category": "frames",
      "price": 2450.0,
      "description": "Lightweight metal rectangle frame. Available in black, gold.",
      "image": "products/frame-rectangle-black.svg",
      "images": [
        "products/frame-rectangle-black.svg",
        "products/frame-rectangle-gold.svg"
      ],
      "variants": [
        {
          "label": "53 · Black",
          "image": "products/frame-rectangle-black.svg"
        },
        {
          "label": "53 · Gold",
          "image": "products/frame-rectangle-gold.svg"
        }
      ]
    },
    {
      "id": "kiyo-titan",
      "name": "Kiyo Titan",
      "brand": "Kiyo",
      "category": "frames",
      "price": 6450.0,
      "description": "Lightweight metal rectangle frame. Available in black.",
      "image": "products/frame-rectangle-black.svg",
      "images": [
        "products/frame-rectangle-black.svg"
      ],
      "variants": [
        {
          "label": "54 · Black",
          "image": "products/frame-rectangle-black.svg"
        }
      ]
    },
    {
      "id": "mesa-cat-9",
      "name": "Mesa Cat 9",
      "brand": "Mesa",
      "category": "frames",
      "price": 3550.0,
      "description": "Hand-polished acetate cateye frame. Available in black, tortoise, crystal.",
      "image": "products/frame-cateye-black.svg",
      "images": [
        "products/frame-cateye-black.svg",
        "products/frame-cateye-tortoise.svg",
        "products/frame-cateye-crystal.svg"
      ],
      "variants": [
        {
          "label": "52 · Black",
          "image": "products/frame-cateye-black.svg"
        },
        {
          "label": "52 · Tortoise",
          "image": "products/frame-cateye-tortoise.svg"
        },
        {
          "label": "52 · Crystal",
          "image": "products/frame-cateye-crystal.svg"
        }
      ]
    },
    {
      "id": "mesa-classic",
      "name": "Mesa Classic",
      "brand": "Mesa",
      "category": "frames",
      "price": 3850.0,
      "description": "Hand-polished acetate browline frame. Available in black, tortoise.",
      "image": "products/frame-browline-black.svg",
      "images": [
        "products/frame-browline-black.svg",
        "products/frame-browline-tortoise.svg"
      ],
      "variants": [
        {
          "label": "51 · Black",
          "image": "products/frame-browline-black.svg"
        },
        {
          "label": "53 · Black",
          "image": "products/frame-browline-black.svg"
        },
        {
          "label": "51 · Tortoise",
          "image": "products/frame-browline-tortoise.svg"
        },
        {
          "label": "53 · Tortoise",
          "image": "products/frame-browline-tortoise.svg"
        }
      ]
    },
    {
      "id": "mesa-studio",
      "name": "Mesa Studio",
      "brand": "Mesa",
      "category": "frames",
      "price": 3350.0,
      "description": "Hand-polished acetate square frame. Available in black, tortoise, crystal.",
      "image": "products/frame-square-black.svg",
      "images": [
        "products/frame-square-black.svg",
        "products/frame-square-tortoise.svg",
        "products/frame-square-crystal.svg"
      ],
      "variants": [
        {
          "label": "50 · Black",
          "image": "products/frame-square-black.svg"
        },
        {
          "label": "52 · Black",
          "image": "products/frame-square-black.svg"
        },
        {
          "label": "50 · Tortoise",
          "image": "products/frame-square-tortoise.svg"
        },
        {
          "label": "52 · Tortoise",
          "image": "products/frame-square-tortoise.svg"
        },
        {
          "label": "50 · Crystal",
          "image": "products/frame-square-crystal.svg"
        },
        {
          "label": "52 · Crystal",
          "image": "products/frame-square-crystal.svg"
        }
      ]
    },
    {
      "id": "solenne-atelier",
      "name": "Solenne Atelier",
      "brand": "Solenne",
      "category": "frames",
      "price": 5950.0,
      "description": "Hand-polished acetate round frame. Available in tortoise, black.",
      "image": "products/frame-round-tortoise.svg",
      "images": [
        "products/frame-round-tortoise.svg",
        "products/frame-round-black.svg"
      ],
      "variants": [
        {
          "label": "49 · Tortoise",
          "image": "products/frame-round-tortoise.svg"
        },
        {
          "label": "49 · Black",
          "image": "products/frame-round-black.svg"
        }
      ]
    },
    {
      "id": "solenne-muse",
      "name": "Solenne Muse",
      "brand": "Solenne",
      "category": "frames",
      "price": 5450.0,
      "description": "Lightweight metal cateye frame. Available in gold.",
      "image": "products/frame-cateye-gold.svg",
      "images": [
        "products/frame-cateye-gold.svg"
      ],
      "variants": [
        {
          "label": "53 · Gold",
          "image": "products/frame-cateye-gold.svg"
        }
      ]
    },
    {
      "id": "vela-air",
      "name": "Vela Air",
      "brand": "Vela",
      "category": "frames",
      "price": 2650.0,
      "description": "Hand-polished acetate oval frame. Available in crystal, black.",
      "image": "products/frame-oval-crystal.svg",
      "images": [
        "products/frame-oval-crystal.svg",
        "products/frame-oval-black.svg"
      ],
      "variants": [
        {
          "label": "51 · Crystal",
          "image": "products/frame-oval-crystal.svg"
        },
        {
          "label": "51 · Black",
          "image": "products/frame-oval-black.svg"
        }
      ]
    },
    {
      "id": "vela-square-pro",
      "name": "Vela Square Pro",
      "brand": "Vela",
      "category": "frames",
      "price": 4650.0,
      "description": "Hand-polished acetate square frame. Available in black, tortoise.",
      "image": "products/frame-square-black.svg",
      "images": [
        "products/frame-square-black.svg",
        "products/frame-square-tortoise.svg"
      ],
      "variants": [
        {
          "label": "53 · Black",
          "image": "products/frame-square-black.svg"
        },
        {
          "label": "53 · Tortoise",
          "image": "products/frame-square-tortoise.svg"
        }
      ]
    },
    {
      "id": "brio-kids-sun",
      "name": "Brio Kids Sun",
      "brand": "Brio",
      "category": "sunglasses",
      "price": 1450.0,
      "description": "UV400 round sunglasses.",
      "image": "products/sun-round-smoke.svg",
      "images": [
        "products/sun-round-smoke.svg"
      ],
      "variants": [
        {
          "label": "Smoke lens",
          "image": "products/sun-round-smoke.svg"
        }
      ],
      "featured": 4
    },
    {
      "id": "halden-pilot",
      "name": "Halden Pilot",
      "brand": "Halden",
      "category": "sunglasses",
      "price": 4450.0,
      "description": "UV400 aviator sunglasses.",
      "image": "products/sun-aviator-brown.svg",
      "images": [
        "products/sun-aviator-brown.svg"
      ],
      "variants": [
        {
          "label": "Brown lens",
          "image": "products/sun-aviator-brown.svg"
        }
      ],
      "featured": 8
    },
    {
      "id": "kiyo-sport-polarised",
      "name": "Kiyo Sport Polarised",
      "brand": "Kiyo",
      "category": "sunglasses",
      "price": 3850.0,
      "description": "UV400 square sunglasses.",
      "image": "products/sun-square-smoke.svg",
      "images": [
        "products/sun-square-smoke.svg",
        "products/sun-square-green.svg"
      ],
      "variants": [
        {
          "label": "Smoke lens",
          "image": "products/sun-square-smoke.svg"
        },
        {
          "label": "Green lens",
          "image": "products/sun-square-green.svg"
        }
      ]
    },
    {
      "id": "mesa-cat-sun",
      "name": "Mesa Cat Sun",
      "brand": "Mesa",
      "category": "sunglasses",
      "price": 3250.0,
      "description": "UV400 cateye sunglasses.",
      "image": "products/sun-cateye-smoke.svg",
      "images": [
        "products/sun-cateye-smoke.svg"
      ],
      "variants": [
        {
          "label": "Smoke lens",
          "image": "products/sun-cateye-smoke.svg"
        }
      ]
    },
    {
      "id": "mesa-coast",
      "name": "Mesa Coast",
      "brand": "Mesa",
      "category": "sunglasses",
      "price": 2950.0,
      "description": "UV400 square sunglasses.",
      "image": "products/sun-square-smoke.svg",
      "images": [
        "products/sun-square-smoke.svg",
        "products/sun-square-brown.svg"
      ],
      "variants": [
        {
          "label": "Smoke lens",
          "image": "products/sun-square-smoke.svg"
        },
        {
          "label": "Brown lens",
          "image": "products/sun-square-brown.svg"
        }
      ]
    },
    {
      "id": "solenne-riviera",
      "name": "Solenne Riviera",
      "brand": "Solenne",
      "category": "sunglasses",
      "price": 4950.0,
      "description": "UV400 aviator sunglasses.",
      "image": "products/sun-aviator-green.svg",
      "images": [
        "products/sun-aviator-green.svg",
        "products/sun-aviator-smoke.svg"
      ],
      "variants": [
        {
          "label": "Green lens",
          "image": "products/sun-aviator-green.svg"
        },
        {
          "label": "Smoke lens",
          "image": "products/sun-aviator-smoke.svg"
        }
      ]
    },
    {
      "id": "vela-drift",
      "name": "Vela Drift",
      "brand": "Vela",
      "category": "sunglasses",
      "price": 2650.0,
      "description": "UV400 round sunglasses.",
      "image": "products/sun-round-brown.svg",
      "images": [
        "products/sun-round-brown.svg",
        "products/sun-round-green.svg"
      ],
      "variants": [
        {
          "label": "Brown lens",
          "image": "products/sun-round-brown.svg"
        },
        {
          "label": "Green lens",
          "image": "products/sun-round-green.svg"
        }
      ]
    },
    {
      "id": "aquasoft-daily-30-pack",
      "name": "AquaSoft Daily (30 pack)",
      "brand": "AquaSoft",
      "category": "contact-lenses",
      "price": 1650.0,
      "description": "Soft contact lenses. Requires a valid contact lens prescription.",
      "image": "products/contact-box.svg",
      "images": [
        "products/contact-box.svg"
      ],
      "variants": [
        {
          "label": "Power -1.00"
        },
        {
          "label": "Power -2.00"
        },
        {
          "label": "Power -3.00"
        },
        {
          "label": "Power -4.50"
        }
      ],
      "note": "Requires a valid contact lens prescription. Ask us about a fitting if you're new to contact lenses."
    },
    {
      "id": "aquasoft-monthly-6-pack",
      "name": "AquaSoft Monthly (6 pack)",
      "brand": "AquaSoft",
      "category": "contact-lenses",
      "price": 1450.0,
      "description": "Soft contact lenses. Requires a valid contact lens prescription.",
      "image": "products/contact-box.svg",
      "images": [
        "products/contact-box.svg"
      ],
      "variants": [
        {
          "label": "Power -1.00"
        },
        {
          "label": "Power -2.00"
        },
        {
          "label": "Power -3.00"
        },
        {
          "label": "Power -4.50"
        }
      ],
      "note": "Requires a valid contact lens prescription. Ask us about a fitting if you're new to contact lenses."
    },
    {
      "id": "aquasoft-toric-monthly-6-pack",
      "name": "AquaSoft Toric Monthly (6 pack)",
      "brand": "AquaSoft",
      "category": "contact-lenses",
      "price": 2350.0,
      "description": "Soft contact lenses. Requires a valid contact lens prescription.",
      "image": "products/contact-box.svg",
      "images": [
        "products/contact-box.svg"
      ],
      "variants": [
        {
          "label": "Power -1.00"
        },
        {
          "label": "Power -2.00"
        },
        {
          "label": "Power -3.00"
        },
        {
          "label": "Power -4.50"
        }
      ],
      "note": "Requires a valid contact lens prescription. Ask us about a fitting if you're new to contact lenses."
    },
    {
      "id": "clearday-bi-weekly-6-pack",
      "name": "ClearDay Bi-weekly (6 pack)",
      "brand": "ClearDay",
      "category": "contact-lenses",
      "price": 990.0,
      "description": "Soft contact lenses. Requires a valid contact lens prescription.",
      "image": "products/contact-box.svg",
      "images": [
        "products/contact-box.svg"
      ],
      "variants": [
        {
          "label": "Power -1.00"
        },
        {
          "label": "Power -2.00"
        },
        {
          "label": "Power -3.00"
        },
        {
          "label": "Power -4.50"
        }
      ],
      "note": "Requires a valid contact lens prescription. Ask us about a fitting if you're new to contact lenses."
    },
    {
      "id": "clearday-silicone-daily-30-pack",
      "name": "ClearDay Silicone Daily (30 pack)",
      "brand": "ClearDay",
      "category": "contact-lenses",
      "price": 2150.0,
      "description": "Soft contact lenses. Requires a valid contact lens prescription.",
      "image": "products/contact-box.svg",
      "images": [
        "products/contact-box.svg"
      ],
      "variants": [
        {
          "label": "Power -1.00"
        },
        {
          "label": "Power -2.00"
        },
        {
          "label": "Power -3.00"
        },
        {
          "label": "Power -4.50"
        }
      ],
      "note": "Requires a valid contact lens prescription. Ask us about a fitting if you're new to contact lenses."
    },
    {
      "id": "microfiber-lens-cloth",
      "name": "Microfiber lens cloth",
      "brand": "Lensmere",
      "category": "accessories",
      "price": 150,
      "description": "Soft, lint-free cloth that cleans lenses without scratching coatings.",
      "image": "products/cloth.svg",
      "images": [
        "products/cloth.svg"
      ],
      "variants": [
        {
          "label": "Grey"
        },
        {
          "label": "Navy"
        }
      ]
    },
    {
      "id": "hard-shell-case",
      "name": "Hard shell case",
      "brand": "Lensmere",
      "category": "accessories",
      "price": 450,
      "description": "Crush-resistant case with a soft lining; fits most optical and sun frames.",
      "image": "products/case-hard.svg",
      "images": [
        "products/case-hard.svg"
      ],
      "variants": [
        {
          "label": "Black"
        },
        {
          "label": "Tan"
        }
      ]
    },
    {
      "id": "lens-cleaning-spray-60-ml",
      "name": "Lens cleaning spray (60 ml)",
      "brand": "ClearDay",
      "category": "accessories",
      "price": 280,
      "description": "Alcohol-free spray, safe for anti-reflective and blue-light coatings.",
      "image": "products/solution-bottle.svg",
      "images": [
        "products/solution-bottle.svg"
      ],
      "variants": [
        {
          "label": "60 ml"
        }
      ]
    },
    {
      "id": "multipurpose-solution-360-ml",
      "name": "Multipurpose solution (360 ml)",
      "brand": "AquaSoft",
      "category": "accessories",
      "price": 520,
      "description": "Cleans, rinses, disinfects and stores soft contact lenses. Includes a lens case.",
      "image": "products/solution-bottle.svg",
      "images": [
        "products/solution-bottle.svg"
      ],
      "variants": [
        {
          "label": "360 ml"
        }
      ]
    },
    {
      "id": "eyewear-cord",
      "name": "Eyewear cord",
      "brand": "Lensmere",
      "category": "accessories",
      "price": 350,
      "description": "Adjustable cord that keeps glasses within reach.",
      "image": "products/accessory.svg",
      "images": [
        "products/accessory.svg"
      ],
      "variants": [
        {
          "label": "Black"
        },
        {
          "label": "Tortoise"
        }
      ]
    }
  ]
};
