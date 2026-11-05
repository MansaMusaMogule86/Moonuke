export type Tone = "refined" | "warm" | "playful" | "minimal";

/** Everything a provider may see. Deliberately excludes email, legal identity and socials. */
export type AssistInput = {
  displayName: string;
  discipline: string;
  city?: string;
  keywords: string[];
  offering?: string;
  tone: Tone;
};

export type AssistOutput = { taglines: string[]; bio: string };

export interface ProfileAssistant {
  readonly id: "template" | "anthropic";
  /** True when inputs leave this server (requires explicit consent in the UI). */
  readonly external: boolean;
  readonly model: string | null;
  draft(input: AssistInput): Promise<AssistOutput>;
}
