import type { AssistInput, AssistOutput, ProfileAssistant, Tone } from "./types";

/**
 * Local, deterministic profile drafting — no network, no cost, no data
 * leaves the server. Good enough to give a creator a polished starting point.
 */
const OFFER_DEFAULT: Record<Tone, string> = {
  refined: "the work in progress, the decisions behind it, and the pieces kept for the few",
  warm: "the everyday moments, the process and the people who make it",
  playful: "the outtakes, the experiments and the things that didn't make the cut",
  minimal: "process, outtakes, first looks",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function draftFromTemplate(input: AssistInput): AssistOutput {
  const discipline = input.discipline.trim().toLowerCase();
  const kws = input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 4);
  const place = input.city?.trim();
  const offering = input.offering?.trim() || OFFER_DEFAULT[input.tone];

  // Phrased so any discipline reads naturally, whether it's a craft ("ceramics") or a person ("dancer").
  const at = place ? ` — ${place}` : "";
  const tagA = {
    refined: `${cap(discipline)}, in private${at}.`,
    warm: `${cap(discipline)}${place ? ` in ${place}` : ""}, up close.`,
    playful: `${cap(discipline)} by day. The good stuff after hours.`,
    minimal: `${cap(discipline)}${place ? `. ${place}` : ""}. ${kws.length ? cap(listJoin(kws.slice(0, 2))) + "." : "Members only."}`,
  }[input.tone];
  const tagB = kws.length
    ? `${cap(listJoin(kws.slice(0, 3)))} — shared with the Circle first.`
    : `${cap(discipline)}, shared with the Circle first.`;
  const tagC = `${cap(offering.split(",")[0].trim())}. By invitation.`;

  const voice: Record<Tone, string> = {
    refined: `I'm ${input.displayName}, ${/^[aeiou]/.test(discipline) ? "an" : "a"} ${discipline}${place ? ` working in ${place}` : ""}. This room is where the work slows down: ${offering}.`,
    warm: `Hi, I'm ${input.displayName}. I'm ${/^[aeiou]/.test(discipline) ? "an" : "a"} ${discipline}${place ? ` based in ${place}` : ""}, and this is the closest you'll get to the studio — ${offering}.`,
    playful: `${input.displayName} here — ${discipline}${place ? `, ${place}` : ""}, and occasional chaos. Inside: ${offering}.`,
    minimal: `${input.displayName}. ${cap(discipline)}${place ? `, ${place}` : ""}. Inside: ${offering}.`,
  };
  const middle = kws.length ? ` Expect ${listJoin(kws)}.` : "";
  const close: Record<Tone, string> = {
    refined: " Members see everything as it happens; the VIP room gets it first, and by name.",
    warm: " Members get the full story; VIPs get it first, with a little more of me.",
    playful: " Members get the lot. VIPs get it first — and the bits I probably shouldn't share.",
    minimal: " Members: everything. VIP: first.",
  };
  return { taglines: [tagA, tagB, tagC].map((t) => t.replace(/\s+/g, " ").trim()), bio: `${voice[input.tone]}${middle}${close[input.tone]}` };
}

export const templateAssistant: ProfileAssistant = {
  id: "template",
  external: false,
  model: null,
  async draft(input) {
    return draftFromTemplate(input);
  },
};
