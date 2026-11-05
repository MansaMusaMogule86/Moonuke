import type { PortraitStudy } from "@/components/ui/Portrait";

/**
 * Development-only seed content. Fictional people, SFW placeholder studies.
 * Replace with real onboarding data in Phase 4.
 */
export const categories = [
  { slug: "couture", label: "Couture & Fashion", sort: 1 },
  { slug: "movement", label: "Movement", sort: 2 },
  { slug: "music", label: "Music", sort: 3 },
  { slug: "beauty", label: "Beauty & Ritual", sort: 4 },
  { slug: "photography", label: "Photography", sort: 5 },
  { slug: "art", label: "Art & Studio", sort: 6 },
  { slug: "lifestyle", label: "Lifestyle", sort: 7 },
];

type SeedCreator = {
  handle: string;
  name: string;
  discipline: string;
  category: string;
  city: string;
  tagline: string;
  bio: string;
  visibility?: "listed" | "discreet" | "private";
  featured?: boolean;
  study: PortraitStudy;
  memberCents: number;
  vipCents: number;
  vipSeats?: number;
};

export const creators: SeedCreator[] = [
  { handle: "isadora", name: "Isadora Lune", discipline: "Couture & Muse", category: "couture", city: "Paris", featured: true,
    tagline: "Fittings, ateliers, and the looks that never reach the runway.",
    bio: "Muse to three ateliers on the Left Bank. The Circle sees the pins, the chalk lines and the 6 a.m. fittings — the parts that never make the campaign.",
    study: { hair: "wrap", light: "left", tilt: -4, adorn: "hoops", glow: 0.9 }, memberCents: 1500, vipCents: 4800, vipSeats: 150 },
  { handle: "kaiasol", name: "Kaia Sol", discipline: "Movement", category: "movement", city: "Lisbon", featured: true,
    tagline: "Private classes at dawn. Form, breath, discipline.",
    bio: "Former principal dancer. Members get the full programme; VIPs get form checks, by name.",
    study: { hair: "bun", light: "right", tilt: 3, adorn: "collar", glow: 0.7 }, memberCents: 1200, vipCents: 3000, vipSeats: 80 },
  { handle: "valentin", name: "Valentin Ash", discipline: "Composer", category: "music", city: "Berlin",
    tagline: "Unreleased scores, studio nights, first listens.",
    bio: "Film composer. Sketches, stems and the cues that were cut.",
    study: { hair: "crop", light: "left", tilt: 2, adorn: "none", glow: 0.55 }, memberCents: 900, vipCents: 2400 },
  { handle: "zara", name: "Zara Okafor", discipline: "Beauty & Ritual", category: "beauty", city: "Lagos", featured: true,
    tagline: "Gold-leaf rituals and the slow art of looking after yourself.",
    bio: "Make-up artist and ritualist. Weekly rituals for members; private consultations for VIP.",
    study: { hair: "long", light: "right", tilt: -2, adorn: "crown", glow: 0.85 }, memberCents: 1400, vipCents: 3600, vipSeats: 200 },
  { handle: "mireille", name: "Mireille Dusk", discipline: "Photographer", category: "photography", city: "Marrakesh",
    tagline: "Contact sheets, outtakes, and the frames she keeps.",
    bio: "Shoots on film, edits by candlelight. Every contact sheet, eventually.",
    study: { hair: "long", light: "left", tilt: 4, adorn: "hoops", glow: 0.6 }, memberCents: 1000, vipCents: 2800 },
  { handle: "aurelio", name: "Aurelio Voss", discipline: "Sculptor", category: "art", city: "Florence",
    tagline: "Bronze, wax, and the long wait in between.",
    bio: "Lost-wax bronzes from a 14th-century foundry. Members follow every piece from wax to patina.",
    study: { hair: "crop", light: "right", tilt: -3, adorn: "collar", glow: 0.5 }, memberCents: 1100, vipCents: 4200, vipSeats: 40 },
  { handle: "selene", name: "Selene Marr", discipline: "Vocalist", category: "music", city: "London",
    tagline: "Late sets and first takes.",
    bio: "Jazz vocalist. Rehearsal tapes for members, the green room for VIPs.",
    study: { hair: "long", light: "left", tilt: -5, adorn: "crown", glow: 0.75 }, memberCents: 800, vipCents: 2600 },
  { handle: "noor", name: "Noor Haddad", discipline: "Perfumer", category: "beauty", city: "Dubai",
    tagline: "Notes from the organ — oud, amber, and patience.",
    bio: "Independent perfumer. Formula diaries, trials, and the bottles that never ship.",
    study: { hair: "wrap", light: "right", tilt: 2, adorn: "hoops", glow: 0.8 }, memberCents: 1600, vipCents: 5200, vipSeats: 60 },
  { handle: "theo", name: "Théo Lancaster", discipline: "Tailor", category: "couture", city: "Milan",
    tagline: "Bespoke, one stitch at a time.",
    bio: "Savile Row trained, Milan based. Pattern drafting, fittings, and the cloth room.",
    study: { hair: "crop", light: "left", tilt: 1, adorn: "none", glow: 0.6 }, memberCents: 1300, vipCents: 3400 },
  { handle: "ines", name: "Inès Varga", discipline: "Pilates", category: "movement", city: "Barcelona",
    tagline: "Reformer at sunrise, recovery at dusk.",
    bio: "Studio owner and teacher. Weekly programmes and private corrections.",
    study: { hair: "bun", light: "left", tilt: -2, adorn: "none", glow: 0.65 }, memberCents: 1000, vipCents: 2200 },
  // Visibility test fixtures
  { handle: "amaya", name: "Amaya Reyes", discipline: "Collector", category: "lifestyle", city: "Madrid", visibility: "discreet",
    tagline: "A discreet room — shared by link only.",
    bio: "Private collection, by introduction.",
    study: { hair: "long", light: "right", tilt: 3, adorn: "collar", glow: 0.7 }, memberCents: 2000, vipCents: 6000, vipSeats: 25 },
  { handle: "orsolya", name: "Orsolya Fenn", discipline: "Painter", category: "art", city: "Budapest", visibility: "private",
    tagline: "Subscribers only.",
    bio: "Private studio. Visible only to current members.",
    study: { hair: "bun", light: "right", tilt: -1, adorn: "crown", glow: 0.6 }, memberCents: 1800, vipCents: 4000 },
];

export const memberPerks = ["Every member post", "Full archive", "Member-only drops"];
export const vipPerks = ["Everything in Member", "VIP-only room", "Priority replies", "First access to drops"];

const teasers = {
  preview: ["A first look — open to the whole Circle.", "Studio, 6 a.m."],
  members: ["Members: the full set from this week.", "Behind the work — members only."],
  vip: ["VIP room — before anyone else."],
  ppv: ["Contact sheet No. 14 — 36 frames."],
};
const bodies = {
  preview: "Thank you for being here. This one is open to everyone in the Circle.",
  members: "For members: the full story, unedited. Thank you for staying close.",
  vip: "For the VIP room only. You're the first to see this.",
  ppv: "The full set, as promised. Thank you for unlocking it.",
};

export function postsFor(study: PortraitStudy) {
  const flip = (s: PortraitStudy, i: number): PortraitStudy => ({
    ...s,
    light: i % 2 ? (s.light === "left" ? "right" : "left") : s.light,
    tilt: (s.tilt ?? 0) + (i % 3) - 1,
    glow: Math.min(1, (s.glow ?? 0.6) + (i % 2 ? 0.1 : -0.05)),
  });
  const list: { access: "preview" | "members" | "vip" | "ppv"; teaser: string; body: string; priceCents?: number; kind: "image" | "set" | "video"; count: number }[] = [
    { access: "preview", teaser: teasers.preview[0], body: bodies.preview, kind: "image", count: 1 },
    { access: "members", teaser: teasers.members[0], body: bodies.members, kind: "set", count: 12 },
    { access: "vip", teaser: teasers.vip[0], body: bodies.vip, kind: "image", count: 1 },
    { access: "ppv", teaser: teasers.ppv[0], body: bodies.ppv, priceCents: 1200, kind: "set", count: 36 },
    { access: "members", teaser: teasers.members[1], body: bodies.members, kind: "video", count: 1 },
    { access: "preview", teaser: teasers.preview[1], body: bodies.preview, kind: "image", count: 1 },
  ];
  return list.map((p, i) => ({ ...p, daysAgo: i * 2 + 1, media: [{ study: flip(study, i) }] }));
}
