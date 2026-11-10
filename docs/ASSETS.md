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

**Present:**

| Asset | File | Used in |
|---|---|---|
| Approved full logo: gold and electric-pink DF monogram stacked over "DIVA FANS", transparent RGBA PNG, 1373×1145 | `public/images/brand/diva-fans-logo.png` (URL `/images/brand/diva-fans-logo.png`) | The site footer (`src/components/layout/SiteFooter.tsx`) at 112 px tall, through `next/image`, which serves a resized copy. Its path and intrinsic size are in `brand.logo` (`src/config/brand.ts`). |

The logo is a stacked lockup. At header height (about 30 px) its wordmark would be about 5 px tall and unreadable, so the header, auth and club shells keep the compact code-drawn DF monogram and `DIVA FANS` wordmark (`src/components/brand/`). A horizontal logo would let the header use artwork too. The file has some transparent margin (about 15% at the top) and faint semi-transparent specks around the artwork left over from background removal. Neither shows on the black background; both would show on a light one.

Every other folder holds only its `.gitkeep`.

**Still to be supplied** (nothing references these yet, so no page is broken):

| Asset | Destination | Notes |
|---|---|---|
| Horizontal (single-line) logo for the header | `public/images/brand/diva-fans-logo-horizontal.png` | Optional; only if an approved file exists |
| Standalone DF monogram | `public/images/brand/diva-fans-monogram.png` | Only if an approved file exists |
| Standalone wordmark | `public/images/brand/diva-fans-wordmark.png` | Only if an approved file exists |
| Social sharing card, 1200×630 | `public/images/brand/diva-fans-social-card.png` | Only if an approved file exists. Prefer `src/app/opengraph-image.png`, which Next.js wires into Open Graph tags automatically. |

## Metadata and app icons

These live in `src/app/` as Next.js metadata files. They are the single source for each item, so don't add `public/` copies (`public/favicon.ico`, `public/robots.txt`, `public/sitemap.xml` or a `public/manifest.json`):

| Item | File | Notes |
|---|---|---|
| Favicon / app icon | `src/app/icon.svg` | DF monogram on black |
| Apple touch icon | none yet | To add one, place a real 180×180 PNG at `src/app/apple-icon.png`. Never rename an SVG or another format to `.png` or `.ico`. |
| Web app manifest | none yet | Add `src/app/manifest.ts` only once real PNG app icons (192 and 512 px) exist |
| Open Graph image | none yet | See the social card above |
| Title, description, Open Graph, application name | `src/app/layout.tsx`, using `src/config/brand.ts` | Canonical and Open Graph URLs come from `APP_URL` |
| `robots.txt` | `src/app/robots.ts` | Generated |
| `sitemap.xml` | `src/app/sitemap.ts` | Generated |

`src/proxy.ts` adds CSP headers to most requests, including `public/` files. It is not an access control. The CSP allows images, fonts and media from the site's own origin (`'self'`), so files in `public/` load without any CSP change.
