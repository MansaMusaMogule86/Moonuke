# Public assets

Everything under `public/` is served as-is to **anyone, with no sign-in, age check or signed URL**. Put nothing there that a stranger shouldn't download.

## What belongs where

| Folder | Purpose |
|---|---|
| `public/images/brand/` | Approved Diva Fans logo files |
| `public/images/creators/` | Promotional creator images **with written permission for public use** |
| `public/images/illustrations/` | Decorative illustrations used by the interface |
| `public/images/placeholders/` | Generic fallback images that a component actually uses |
| `public/icons/` | Interface SVGs and, if a manifest is added, installable app icons |
| `public/fonts/` | Self-hosted font files with a suitable licence (none today: fonts come from `next/font/google`, which self-hosts them at build time) |
| `public/videos/` | Public promotional video |

Empty folders hold a `.gitkeep` so Git keeps them. Delete it once the folder has a real file.

**Never in `public/`:** creator uploads, paid or locked media, private profile assets, identity or verification documents, exports, internal reports (`reports/` is git-ignored), or secrets. Member and creator media stays in protected storage and is served only through short-lived signed URLs from `/api/media`.

## Paths and URLs

The `public` part is dropped from the URL:

| File | Browser URL |
|---|---|
| `public/images/brand/diva-fans-logo.png` | `/images/brand/diva-fans-logo.png` |
| `public/icons/example-icon.svg` (illustration only) | `/icons/example-icon.svg` |

Never write `/public/...` in a URL or `src` attribute. In components, use `next/image` with an explicit `width` and `height` (or `fill` inside a sized box) and meaningful `alt` text, or `alt=""` when the image is decorative.

**Filenames:** lowercase, words joined by hyphens, prefixed `diva-fans-` for brand files (for example `diva-fans-logo.png`). No spaces, capitals or underscores. To change a file's content, give it a new name: `public/` files are served with `Cache-Control: public, max-age=0`, but CDNs and browsers may still hold the old copy.

## Status

**Present** (all in `public/images/brand/`):

| Asset | File | Notes |
|---|---|---|
| Approved logo (master) | `diva-fans-logo.png` | Gold DF monogram with pink flourish and diamond, over "DIVA FANS". 1254×1254 **RGB on pure black — not transparent**. Kept unchanged as the source file. |
| Trimmed lockup | `diva-fans-logo-trimmed.png` | 1081×877. The master with its empty black margin cropped (16px kept). Footer, auth brand panel, design system. `brand.logo` |
| Monogram | `diva-fans-monogram.png` | 738×738. The DF mark cropped from the master and padded to a square on the same black. Headers, closing section. `brand.monogram` |

Both derived files were produced by cropping and padding only (sharp, bundled with Next.js), with no recolouring. Every use applies the `logo-art` utility (`mix-blend-mode: lighten`) so the black disappears into the dark page surface. Don't place them on light backgrounds; a transparent master would remove that limit.

Every other folder holds only its `.gitkeep`.

**Still to be supplied** (nothing references these yet, so no page is broken):

| Asset | Destination | Notes |
|---|---|---|
| Transparent master logo (PNG with alpha, or SVG) | `public/images/brand/diva-fans-logo.png` | Would allow light backgrounds and drop the blend utility |
| Standalone wordmark artwork | `public/images/brand/diva-fans-wordmark.png` | Optional; headers use the text wordmark today |
| Social sharing card, 1200×630 | `src/app/opengraph-image.png` | Next.js wires it into Open Graph tags automatically |
| Creator photography with public-use permission | `public/images/creators/` | The homepage uses an illustrative preview until real, permitted images exist |

## Metadata and app icons

These live in `src/app/` as Next.js metadata files. They are the single source for each item, so don't add `public/` copies (`public/favicon.ico`, `public/robots.txt`, `public/sitemap.xml` or a `public/manifest.json`):

| Item | File | Notes |
|---|---|---|
| Favicon / app icon | `src/app/icon.png` | 512×512, the monogram at 80% on black (derived from the master) |
| Apple touch icon | `src/app/apple-icon.png` | 180×180, same artwork |
| Web app manifest | none yet | Add `src/app/manifest.ts` if the site should be installable; it can reuse `icon.png` for 512px and needs a real 192px PNG |
| Open Graph image | none yet | See the social card above |
| Title, description, Open Graph, application name | `src/app/layout.tsx`, using `src/config/brand.ts` | Canonical and Open Graph URLs come from `APP_URL` |
| `robots.txt` | `src/app/robots.ts` | Generated |
| `sitemap.xml` | `src/app/sitemap.ts` | Generated |

`src/proxy.ts` adds CSP headers to most requests, including `public/` files. It is not an access control. The CSP allows images, fonts and media from the site's own origin (`'self'`), so files in `public/` load without any CSP change.
