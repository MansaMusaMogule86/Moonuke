import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { brand } from "@/config/brand";
import type { AssistInput, AssistOutput, ProfileAssistant } from "./types";

/**
 * Optional Claude-backed profile drafting. OFF by default (AI_PROVIDER=template).
 * Enabled only when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set — it
 * then incurs API usage cost, so it's an explicit operator decision.
 *
 * Only the AssistInput fields are sent (no email, legal identity, socials).
 * Server-side refusal fallback is enabled ("default" routing) so a policy
 * decline is retried on a suitable model inside the same call.
 */
const Output = z.object({
  taglines: z.array(z.string()).describe("Exactly three distinct taglines, each under 140 characters."),
  bio: z.string().describe("One profile bio of 60-140 words."),
});

const SYSTEM = `You write short profile copy for creators on ${brand.name}, an invitation-only, adults-only membership club with an understated black-and-gold, editorial voice.

Write a profile tagline set and bio from the creator's notes. Requirements:
- Tasteful and non-explicit: this copy is shown on the creator's profile header. Suggest exclusivity and closeness without describing sexual acts.
- Never reference age, youth, school, or anything that could suggest a minor. Never reference non-consent.
- No contact details, links, @handles, prices, or promises about specific content.
- First person for the bio unless the tone is "minimal". Match the requested tone.
- Ground everything in the notes; do not invent credentials, awards, or locations.`;

export function anthropicAssistant(apiKey: string, model: string): ProfileAssistant {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return {
    id: "anthropic",
    external: true,
    model,
    async draft(input: AssistInput): Promise<AssistOutput> {
      const notes = [
        `Display name: ${input.displayName}`,
        `Discipline: ${input.discipline}`,
        input.city ? `City: ${input.city}` : null,
        input.keywords.length ? `Themes: ${input.keywords.join(", ")}` : null,
        input.offering ? `What members get: ${input.offering}` : null,
        `Tone: ${input.tone}`,
      ]
        .filter(Boolean)
        .join("\n");

      const response = await client.beta.messages.parse({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { effort: "low", format: betaZodOutputFormat(Output) },
        messages: [{ role: "user", content: `Creator notes:\n${notes}` }],
      });

      if (response.stop_reason === "refusal") throw new Error("assistant_refused");
      const parsed = response.parsed_output;
      if (!parsed) throw new Error("assistant_unparseable");
      return { taglines: parsed.taglines.slice(0, 3), bio: parsed.bio };
    },
  };
}
