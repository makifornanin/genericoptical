# Assets

| Folder | Contents | Use |
|---|---|---|
| `brand/favicon.ico` | Sample favicon | Website Settings → Favicon (replace with the business's icon) |
| `products/*.svg` | 51 line illustrations on the stone tile background (400×300, 0.5–2 KB each): frames in 8 shapes × 4 colours, sunglasses in 4 shapes × 3 lens colours, a contact-lens box, accessories (cloth, case, solution bottle, cord), Rx lens, eye exam | Sample product images for the showcase. Replace with real product photos (ideally 1024×1024, WebP/JPG, under 200 KB). |

## Using them in GHL

1. **Upload:** GHL → **Media Storage** → a folder, then upload the files you use.
2. **Copy each file's public link.** GHL hosts media on its own domains, with a unique URL per file.
3. **Point the site at them** in `scripts/oc-config.js`:
   ```js
   assets: {
     base: "",
     map: {
       "products/frame-rectangle-black.svg": "https://assets.cdn.filesafe.space/…/abc.svg",
       // … one line per file in use
     },
   },
   ```
   Or, if you host the `assets/` folder yourself (hosted-files variant), set `base: "https://YOUR-FILE-HOST/optical-site/assets/"` and skip the map.
4. **Logo:** set `business.logo` to its URL. Leave it empty to show the round initial mark.

## Where the paths come from

Product images are referenced in `scripts/oc-catalogue.js` as `products/<file>.svg`. When you switch to photos, use full URLs there. `assets.map` is then unnecessary for those.
