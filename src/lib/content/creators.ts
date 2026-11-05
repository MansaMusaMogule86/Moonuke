import type { PortraitStudy } from "@/components/ui/Portrait";

/**
 * Marketing showcase data for the public homepage.
 * Public pages only ever show safe-for-work cover imagery and teaser copy;
 * age-restricted media is served from the authenticated app (Phase 2+).
 * Prices are display values — checkout prices are always resolved server-side.
 */
export type ShowcaseCreator = {
  handle: string;
  name: string;
  discipline: string;
  city: string;
  members: string;
  vipFrom: number;
  study: PortraitStudy;
  line: string;
};

export const showcase: ShowcaseCreator[] = [
  {
    handle: "isadora",
    name: "Isadora Lune",
    discipline: "Couture & Muse",
    city: "Paris",
    members: "12.4k",
    vipFrom: 48,
    study: { hair: "wrap", light: "left", tilt: -4, adorn: "hoops", glow: 0.9 },
    line: "Fittings, ateliers, and the looks that never reach the runway.",
  },
  {
    handle: "kaiasol",
    name: "Kaia Sol",
    discipline: "Movement",
    city: "Lisbon",
    members: "8.1k",
    vipFrom: 30,
    study: { hair: "bun", light: "right", tilt: 3, adorn: "collar", glow: 0.7 },
    line: "Private classes at dawn. Form, breath, discipline.",
  },
  {
    handle: "valentin",
    name: "Valentin Ash",
    discipline: "Composer",
    city: "Berlin",
    members: "5.6k",
    vipFrom: 24,
    study: { hair: "crop", light: "left", tilt: 2, adorn: "none", glow: 0.55 },
    line: "Unreleased scores, studio nights, first listens.",
  },
  {
    handle: "zara",
    name: "Zara Okafor",
    discipline: "Beauty & Ritual",
    city: "Lagos",
    members: "19.8k",
    vipFrom: 36,
    study: { hair: "long", light: "right", tilt: -2, adorn: "crown", glow: 0.85 },
    line: "Gold-leaf rituals and the slow art of looking after yourself.",
  },
  {
    handle: "mireille",
    name: "Mireille Dusk",
    discipline: "Photographer",
    city: "Marrakesh",
    members: "7.3k",
    vipFrom: 28,
    study: { hair: "long", light: "left", tilt: 4, adorn: "hoops", glow: 0.6 },
    line: "Contact sheets, outtakes, and the frames she keeps.",
  },
];

export type Tier = {
  key: "follow" | "member" | "vip";
  name: string;
  numeral: string;
  price: string;
  cadence: string;
  promise: string;
  inclusions: string[];
};

export const tiers: Tier[] = [
  {
    key: "follow",
    name: "Follow",
    numeral: "I",
    price: "Free",
    cadence: "always",
    promise: "Stand at the door. See the public face of the work.",
    inclusions: ["Public posts and announcements", "Drop notifications", "Pay-per-view unlocks"],
  },
  {
    key: "member",
    name: "Member",
    numeral: "II",
    price: "From $9",
    cadence: "per month",
    promise: "Step inside. The full feed, without the noise.",
    inclusions: ["Every member post and story", "Private messages", "Member-only drops", "Archive access"],
  },
  {
    key: "vip",
    name: "VIP",
    numeral: "III",
    price: "Set by creator",
    cadence: "limited seats",
    promise: "The inner room. Few seats, held by name — your alias.",
    inclusions: ["Everything in Member", "Priority replies", "First access to drops", "VIP-only vault", "Gifts & recognition"],
  },
];
