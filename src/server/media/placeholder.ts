import "server-only";
import type { PortraitStudy } from "@/components/ui/Portrait";

/**
 * Standalone SVG of a portrait study, served by the private media route as a
 * stand-in for real assets. Mirrors <Study/> in components/ui/Portrait.tsx.
 * Phase 5 replaces this with streaming from private object storage.
 * All inputs are validated enums / numbers — nothing user-controlled is interpolated as markup.
 */
export function studySvg(s: PortraitStudy): string {
  const hair = (["long", "bun", "crop", "wrap"] as const).includes(s.hair) ? s.hair : "long";
  const left = s.light !== "right";
  const tilt = clamp(Number(s.tilt ?? 0), -15, 15);
  const glow = clamp(Number(s.glow ?? 0.6), 0, 1);
  const adorn = (["hoops", "crown", "collar", "none"] as const).includes(s.adorn ?? "none") ? s.adorn ?? "none" : "none";
  const lx = left ? 0.18 : 0.82;
  const [x1, x2] = left ? [0, 1] : [1, 0];
  const G = "url(#gold)";

  const hairBack =
    hair === "long" ? `<path d="M92 150 C 80 70, 220 60, 208 150 C 214 230, 232 300, 246 360 L 54 360 C 70 300, 86 230, 92 150 Z" fill="url(#hair)"/>`
    : hair === "bun" ? `<circle cx="150" cy="70" r="30" fill="url(#hair)"/>` : "";
  const hairFront =
    hair === "long" ? `<path d="M100 146 C 96 90, 140 76, 160 84 C 190 90, 206 112, 202 150 C 190 118, 168 104, 140 106 C 118 110, 106 126, 100 146 Z" fill="url(#hair)"/>`
    : hair === "bun" ? `<path d="M100 140 C 98 96, 128 82, 150 82 C 176 82, 204 98, 200 140 C 188 110, 170 100, 150 100 C 128 100, 110 112, 100 140 Z" fill="url(#hair)"/>`
    : hair === "crop" ? `<path d="M100 136 C 96 92, 126 80, 152 80 C 182 80, 206 98, 200 136 C 192 114, 176 104, 150 104 C 126 104, 108 114, 100 136 Z" fill="url(#hair)"/>`
    : `<path d="M96 132 C 92 70, 208 70, 204 132 C 196 108, 104 108, 96 132 Z" fill="url(#hair)"/>` +
      [0, 1, 2, 3, 4].map((i) => `<path d="M${100 + i} ${122 - i * 9} C 120 ${100 - i * 9}, 180 ${100 - i * 9}, ${200 - i} ${122 - i * 9}" fill="none" stroke="${G}" stroke-width="1.1" opacity="${(0.75 - i * 0.08).toFixed(2)}"/>`).join("");
  const adornment =
    adorn === "hoops" ? `<circle cx="100" cy="186" r="11" fill="none" stroke="${G}" stroke-width="1.6"/><circle cx="200" cy="186" r="11" fill="none" stroke="${G}" stroke-width="1.6" opacity="0.55"/>`
    : adorn === "collar" ? `<path d="M118 282 C 132 304, 168 304, 182 282" fill="none" stroke="${G}" stroke-width="1.4"/><path d="M112 288 C 130 318, 170 318, 188 288" fill="none" stroke="${G}" stroke-width="1" opacity="0.6"/><circle cx="150" cy="314" r="2.4" fill="#f1dcaa"/>`
    : adorn === "crown" ? `<path d="M106 98 L 118 78 L 132 92 L 150 70 L 168 92 L 182 78 L 194 98" fill="none" stroke="${G}" stroke-width="1.4" stroke-linejoin="round"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="bg" cx="${lx}" cy="0.3" r="0.9"><stop offset="0" stop-color="#3a2f1a" stop-opacity="${glow}"/><stop offset="0.45" stop-color="#14110c"/><stop offset="1" stop-color="#050505"/></radialGradient>
<linearGradient id="skin" x1="${x1}" y1="0" x2="${x2}" y2="0"><stop offset="0" stop-color="#6d5a3c"/><stop offset="0.16" stop-color="#2a2219"/><stop offset="0.55" stop-color="#0e0c0a"/><stop offset="1" stop-color="#070707"/></linearGradient>
<linearGradient id="rim" x1="${x1}" y1="0" x2="${x2}" y2="0"><stop offset="0" stop-color="#f1dcaa" stop-opacity="0.95"/><stop offset="0.3" stop-color="#d6b56d" stop-opacity="0.35"/><stop offset="0.6" stop-color="#d6b56d" stop-opacity="0"/></linearGradient>
<linearGradient id="hair" x1="${x1}" y1="0" x2="${x2}" y2="0.4"><stop offset="0" stop-color="#3b2f20"/><stop offset="0.25" stop-color="#120f0b"/><stop offset="1" stop-color="#050505"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6f33"/><stop offset="0.45" stop-color="#f1dcaa"/><stop offset="1" stop-color="#a88b45"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
<filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
</defs>
<rect width="300" height="400" fill="url(#bg)"/>
<ellipse cx="${lx * 300}" cy="120" rx="90" ry="140" fill="#d6b56d" opacity="${(0.1 * glow).toFixed(3)}" filter="url(#haze)"/>
<g transform="rotate(${tilt} 150 200)">
${hairBack}
<path d="M18 420 C 26 330, 84 292, 126 276 L 174 276 C 216 292, 274 330, 282 420 Z" fill="url(#skin)"/>
<path d="M128 205 C 130 240, 126 262, 120 282 L 180 282 C 174 262, 170 240, 172 205 Z" fill="url(#skin)"/>
<ellipse cx="150" cy="222" rx="30" ry="12" fill="#050505" opacity="0.7" filter="url(#soft)"/>
<ellipse cx="150" cy="150" rx="50" ry="66" fill="url(#skin)"/>
${hairFront}
<ellipse cx="150" cy="150" rx="50" ry="66" fill="none" stroke="url(#rim)" stroke-width="2.2"/>
<path d="M18 420 C 26 330, 84 292, 126 276 M 174 276 C 216 292, 274 330, 282 420" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
${adornment}
</g>
</svg>`;
}

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
