import "server-only";
import { env } from "@/server/env";
import { anthropicAssistant } from "./anthropic";
import { templateAssistant } from "./template";
import type { ProfileAssistant } from "./types";

/**
 * Configured profile assistant.
 *   AI_PROVIDER=template   (default) local, free, nothing leaves the server
 *   AI_PROVIDER=anthropic  Claude via ANTHROPIC_API_KEY (usage is billed by Anthropic)
 *   AI_PROVIDER=disabled   assistant hidden
 */
let cached: ProfileAssistant | null | undefined;

export function profileAssistant(): ProfileAssistant | null {
  if (cached !== undefined) return cached;
  const e = env();
  if (e.AI_PROVIDER === "disabled") cached = null;
  else if (e.AI_PROVIDER === "anthropic" && e.ANTHROPIC_API_KEY) cached = anthropicAssistant(e.ANTHROPIC_API_KEY, e.AI_MODEL);
  else cached = templateAssistant;
  return cached;
}

export type { AssistInput, AssistOutput, Tone } from "./types";
