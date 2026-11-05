import { z } from "zod";

export const email = z.string().trim().toLowerCase().min(3).max(254).email("Enter a valid email address.");
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(200, "That password is too long.");
export const alias = z
  .string()
  .trim()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._'-]{1,30}[\p{L}\p{N}]$/u, "3–32 letters or numbers; spaces, dots, dashes and apostrophes are fine inside.");
export const invitableRole = z.enum(["member", "creator"]);
export const uuid = z.string().uuid();
export const note = z.string().trim().max(500).optional().transform((v) => (v ? v : undefined));

export const applySchema = z.object({
  alias,
  email,
  password,
  adult: z.literal("on", { message: "You must confirm you are 18 or older." }),
  terms: z.literal("on", { message: "Please accept the house rules." }),
});

export const signinSchema = z.object({ email, password: z.string().min(1).max(200) });

export const forgotSchema = z.object({ email });
export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export const createInvitationSchema = z.object({
  role: invitableRole,
  email: z.union([email, z.literal("")]).optional().transform((v) => (v ? v : undefined)),
  maxUses: z.coerce.number().int().min(1).max(100),
  expiresInDays: z.coerce.number().int().min(1).max(30),
  note,
});

export const referralSchema = z.object({
  inviteeName: z.string().trim().min(1, "Add their name.").max(80),
  inviteeEmail: email,
  role: invitableRole,
  relationship: z.string().trim().min(10, "Tell the house a little more (10+ characters).").max(500),
});

export const decisionSchema = z.object({ id: uuid, note });

export const discoverSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: z.string().regex(/^[a-z-]{2,32}$/).optional().catch(undefined),
  sort: z.enum(["featured", "newest", "members"]).optional().catch(undefined),
});

/** Flatten zod errors into { field: message } for forms. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "_");
    out[k] ??= issue.message;
  }
  return out;
}
