/**
 * Diva Fans design tokens for JS consumers (Motion, canvas, charts).
 * The CSS source of truth lives in src/styles/tokens.css — keep in sync.
 * tests/tokens.test.ts verifies parity and contrast budgets.
 */
export const color = {
  ink: "#08080b",
  ink2: "#121217",
  ink3: "#1a1921",
  ink4: "#24232c",
  gold: "#d8b86b",
  goldSoft: "#f2dda6",
  goldMuted: "#a88b45",
  pink: "#ff3cac",
  pinkSoft: "#ff6fc0",
  ivory: "#f6f2eb",
  stone: "#b9b4c0",
  ash: "#948f9c",
  success: "#9ccba2",
  danger: "#e8a07f",
} as const;

export const ease = {
  /** Arrivals: elements entering the stage. */
  out: [0.16, 1, 0.3, 1] as const,
  /** State changes: toggles, sheets, tabs. */
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const duration = {
  press: 0.14,
  hover: 0.26,
  sheet: 0.52,
  reveal: 0.8,
} as const;

/** Spring used for anything that is dragged or thrown (sheets, carousels). */
export const spring = { type: "spring", stiffness: 260, damping: 32, mass: 0.9 } as const;

/** WCAG relative luminance contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
