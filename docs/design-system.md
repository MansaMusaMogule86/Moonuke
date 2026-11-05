# MOONUKE Design System v0.1

The live, interactive reference is at **`/design-system`**. This file covers the rules.

## Principles
1. **Darkness first.** Ink (#050505) covers about 80% of every screen. Negative space is the luxury.
2. **Gold is earned.** Use it for one primary action per view, for premium status (VIP) and for the active nav item. Never use it for decoration alone.
3. **Editorial, not dashboard.** Use asymmetric grids and oversized Bodoni display type. Never build grids of identical cards.
4. **One hand.** Touch targets are at least 44px. On phones, use bottom sheets instead of modals. Keep primary actions within thumb reach.
5. **Motion with meaning.** Arrivals ease out, state changes ease in-out and drags use springs. Every animation respects `prefers-reduced-motion`.
6. **Honest privacy.** Only promise what the platform can enforce. Never claim media is "screenshot-proof".

## Tokens (`src/styles/tokens.css`)
| Token | Value | Use |
|---|---|---|
| `--mk-ink` | #050505 | Background |
| `--mk-ink-2` | #101010 | Secondary background |
| `--mk-ink-3` | #171717 | Elevated surface (sheets, focused cards) |
| `--mk-gold` | #D6B56D | Primary CTA, active nav, premium |
| `--mk-gold-soft` | #E8CC91 | Hover, focus ring, highlight |
| `--mk-gold-muted` | #A88B45 | Hairlines, quiet ornament |
| `--mk-ivory` | #F6F0E6 | Primary text (18:1) |
| `--mk-stone` | #AAA39A | Secondary text (8:1) |
| `--mk-ash` | #8A847B | Meta text. AA on ink and ink-2 (enforced by tests) |
| `--mk-metal` | gradient | Wordmark, display accents and hairlines only |

**Type.** Bodoni Moda is the display face; its italic carries the emphasis. Jost handles UI and body text. Eyebrows are set at 11px, +32% tracking, uppercase.
**Radius.** 8 / 14 / 22 / 32. The `arch` utility shapes portrait plates.
**Motion.** Durations are press 140, hover 260, sheet 520, reveal 900 and hero 1400ms. Two easings: `--mk-ease-out` `(0.16,1,0.3,1)` and `--mk-ease-in-out` `(0.65,0,0.35,1)`. Draggable UI uses the spring 260/32.

## Brand
- **Symbol, "the Diamond Ring".** A total eclipse at second contact: a dark moon, a corona and one point of light. Minimum size is 16px.
- **Wordmark.** Bodoni capitals at +30% tracking. The second O is a hairline "new moon" circle. Below 14px, use `tone="ivory"`.

## Components (`src/components/ui`)
| Component | Notes |
|---|---|
| `Button` | `gold` / `outline` / `ghost` / `quiet`, sizes `sm` / `md` / `lg`. Supports `arrow` and `loading` (sets aria-busy and disables). `href` renders a Next `Link`. |
| `Badge` | `vip` / `member` / `locked` / `live` / `neutral` |
| `Field` | Underline input. The label is wired to the input, and errors render with `role=alert` plus `aria-describedby`. |
| `Segmented` | A native radio group with a gliding indicator. Arrow keys work. |
| `Sheet` | Bottom sheet built on Vaul/Radix: focus trap, Escape to close, drag to dismiss, safe-area padding. |
| `Skeleton` | Slow champagne shimmer. Static under reduced motion. |
| `Portrait` | Takes `src` for real photography. Without it, draws a lit "study" stand-in. An empty `alt` means decorative (`aria-hidden`). |
| `Reveal` / `ImageReveal` | Fade-rise and curtain-clip reveals that run once when the element enters the viewport. |

## Accessibility
- Every route is checked against WCAG 2.1 AA with axe-core at 1440 and 390px (`pnpm smoke`).
- The skip link is the first tab stop. Focus rings are 1.5px soft gold.
- `MotionConfig reducedMotion="user"` turns off transform animations, and CSS pauses the marquee and shimmer.
