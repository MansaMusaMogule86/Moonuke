# DivaFans Design System v0.2

The live, interactive reference is at **`/design-system`**. This file covers the rules. v0.2 (2026-11-10) replaced the black-and-gold "private club" look with the DivaFans gold-and-pink identity.

## Principles
1. **Charcoal carries the page.** Black and charcoal surfaces dominate; warm white carries readable content.
2. **Gold and pink, sparingly.** Gold is the brand: the primary action, the active place and VIP. Pink adds personality to one word, a sent message or a small accent. Never paint every border gold or every surface pink.
3. **Editorial outside, efficient inside.** Marketing pages use Bodoni display type and generous space. Dashboards, forms, messages and admin use clear Jost headings, tighter density and plain titles.
4. **Touch first.** Targets are at least 40px (44px for primary mobile controls). On phones, use bottom sheets instead of modals.
5. **Motion supports hierarchy.** Short entrances and feedback only. Content is never hidden waiting for JavaScript, and everything yields to `prefers-reduced-motion`.
6. **Honest claims.** Only promise what the platform enforces. No invented creators, prices, counts or badges; illustrative content is labelled as such.

## Tokens (`src/styles/tokens.css`, mirrored in `src/lib/tokens.ts`)
| Token | Value | Use |
|---|---|---|
| `--mk-ink` | #080709 | Obsidian Black: page background |
| `--mk-ink-2` | #151116 | Charcoal Black: raised surface, alternating sections, cards |
| `--mk-ink-3` | #1E1820 | Elevated surface: inputs, menus, sheets |
| `--mk-ink-4` | #28202B | Hover and pressed on elevated surfaces |
| `--mk-gold` | #D8AD52 | Champagne Gold: primary action, active nav, VIP |
| `--mk-gold-soft` | #F3D58A | Light Gold: hover, focus ring, button sheen |
| `--mk-gold-muted` | #A88743 | Quiet ornament |
| `--mk-pink` | #F52A8B | Neon Pink: selective interactive highlights and accents |
| `--mk-pink-soft` | #FF8BC8 | Soft pink: small pink text, glows |
| `--mk-burgundy` | #34101F | Deep Burgundy: atmospheric shadows and wine surface tints |
| `--mk-ivory` | #F7F0E8 | Ivory White: primary text |
| `--mk-stone` | #BFB5BC | Muted Text: secondary text |
| `--mk-ash` | #9A9098 | Meta text; AA on every surface up to ink-4 (enforced by `tests/tokens.test.ts`) |
| `--mk-container` / `--mk-container-wide` | 1200 / 1440px | Content width / chrome width (`container-page`, `container-wide` utilities) |
| `--mk-gutter`, `--mk-section` | fluid | Side padding and marketing section rhythm (`section-y`) |
| `--mk-shadow-1`, `--mk-shadow-2` | — | Card and raised-panel elevation |
| `--mk-focus` | 2px soft gold | Focus ring, 3px offset |

**Hero.** Cinematic split: live copy and CTAs left; the portrait artwork right (top on mobile, below the header so the logo sits on black). Headline "A Premium Space for *Exclusive* Creators" with a pink-to-champagne gradient on *Exclusive*. Motion is CSS only: staggered `mk-rise` entrances, slow `mk-drift`/`mk-glow` light, and a desktop scroll parallax (`mk-parallax`, scroll-driven, no JavaScript). All of it is off under reduced motion.
**Buttons.** `gold` is a champagne-to-metallic gradient with a fine highlight; the hero adds a small pink glow to its primary action.
**Type.** Jost (sans) for interface and body; Bodoni Moda for selected display moments (hero, section titles, auth titles). Eyebrows: 12px, +22% tracking, uppercase. Both fonts are self-hosted by `next/font`.
**Radius.** 8 / 14 / 20 / 28. The `arch` utility shapes profile plates.
**Motion.** Press 140, hover 260, sheet 520, entrance 800ms; easings `--mk-ease-out` and `--mk-ease-in-out`. Marketing entrances are CSS (`mk-rise`, and `mk-reveal`, which uses scroll-driven animation where supported); in-app reveals use Motion.

## Brand
- **Logo files.** `public/images/brand/diva-fans-logo.png` is the approved master (RGB on pure black, **not transparent**). Derived by cropping only: `diva-fans-logo-trimmed.png` (full lockup, margin trimmed) and `diva-fans-monogram.png` (DF mark). App icons `src/app/icon.png` and `src/app/apple-icon.png` are the monogram on black.
- **Blending.** Logo art always carries the `logo-art` utility (`mix-blend-mode: lighten`): the page surface shows through the black and the gold and pink stay exactly as drawn. Only place it on dark surfaces.
- **Placement.** Headers (site, auth on mobile, signed-in) use the monogram (`Symbol`, 36–40px) beside the text `Wordmark`. The full lockup (`Logo`) needs at least ~88px of height: footer, auth brand panel, design system.
- **Wordmark.** "DIVA FANS" in Bodoni capitals at +30% tracking, never wrapped. Below 14px, use `tone="ivory"`.

## Components (`src/components/ui`, `src/components/brand`)
| Component | Notes |
|---|---|
| `Button` | `gold` / `pink` / `outline` / `ghost` / `quiet`, sizes `sm` (40px) / `md` / `lg`. Supports `arrow` and `loading` (sets aria-busy and disables). `href` renders a Next `Link`. |
| `Badge` | `vip` / `member` / `locked` / `live` / `neutral` |
| `Field` | Underline input. The label is wired to the input, and errors render with `role=alert` plus `aria-describedby`. |
| `Segmented` | A native radio group with a gliding indicator. Arrow keys work. |
| `Sheet` | Bottom sheet built on Vaul/Radix: focus trap, Escape to close, drag to dismiss, safe-area padding. |
| `Skeleton` | Shimmer loading block. Static under reduced motion. |
| `Portrait` | Takes `src` for a real (signed) photo. Without it, draws an abstract cover from the stored cover settings — never a figure. An empty `alt` means decorative. |
| `Reveal` / `ImageReveal` | In-app fade-rise and clip reveals that run once on entering the viewport. |
| `Symbol` / `Logo` / `Wordmark` | Monogram image, full lockup image, text wordmark. |

## Accessibility
- The homepage and `/design-system` are checked against WCAG 2.1 AA with axe-core at 1440 and 390px, and for horizontal overflow at 360, 390, 768, 1024, 1440 and 1920px (`scripts/e2e-smoke.mjs`). Signed-in flows are covered by the phase suites.
- The skip link is the first tab stop. Focus rings are 2px soft gold.
- FAQ uses native `<details>`. `MotionConfig reducedMotion="user"` turns off Motion transforms, and CSS disables entrances and the shimmer.
