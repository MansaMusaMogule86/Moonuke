# MOONUKE

A private creator club. Black and gold. Phase 1 covers the visual identity, design system, public homepage and responsive navigation.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build && pnpm start
```

## Verify

```bash
pnpm lint           # TypeScript, strict
pnpm test           # Vitest: token parity, WCAG contrast budgets, component behaviour
pnpm smoke          # Needs a running server (BASE=http://localhost:3000). Playwright interactions + axe-core WCAG 2.1 AA
pnpm screens        # Desktop (1440) + mobile (390) screenshots into ./screenshots
```

## Structure

```
src/
  app/                  routes: /  and  /design-system
  styles/tokens.css     design tokens (source of truth)
  lib/tokens.ts         JS mirror of tokens + contrast helper
  components/brand/     Symbol (the Diamond Ring), Wordmark
  components/ui/        Button, Badge, Field, Segmented, Sheet, Skeleton, Portrait, Reveal
  components/layout/    SiteHeader (pill nav + mobile bottom sheet), SiteFooter
  components/home/      Hero, HeroCarousel, Ribbon, Circle, Tiers, Vault, Privacy, ForCreators, Closing
docs/design-system.md   rules, tokens, components, motion
scripts/                screenshots + e2e smoke
tests/                  unit tests
```

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Identity, design system, homepage, navigation | **Done** |
| 2 | Discovery, profiles, VIP presentation, locked content | Next |
| 3 | Fan app, vault, messaging, account | Planned |
| 4 | Creator studio, Blasts, analytics, earnings | Planned |
| 5 | Auth, Supabase, RLS, media storage, moderation | Planned |
| 6 | Payment adapters, wallet auth, ledger, checkout simulations | Planned |
| 7 | E2E, hardening, performance, release prep | Planned |

The homepage is public marketing. It contains no age-restricted media. Payments are **not active**. The Vault's unlock sheet is a presentation demo, and its checkout button is disabled.
