import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { appSecret } from "@/server/env";

// =====================================================================
// Encryption at rest for sensitive safety records: takedown requester
// contact details, participant identity, consent signatures.
// AES-256-GCM with a key derived per purpose from APP_SECRET (HKDF), so a
// ciphertext from one purpose can't be opened as another.
// Production should move this to a managed key (KMS): see DECISION_REGISTER.
// =====================================================================

export type SealPurpose = "takedown-contact" | "participant-identity" | "consent-signature";

const key = (purpose: SealPurpose) => Buffer.from(hkdfSync("sha256", appSecret(), Buffer.alloc(0), `safety-${purpose}-v1`, 32));

export function seal(purpose: SealPurpose, value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(purpose), iv);
  c.setAAD(Buffer.from(purpose));
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return ["s1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}

export function unseal<T>(purpose: SealPurpose, sealed: string): T {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "s1" || !iv || !tag || !ct) throw new Error("unknown sealed format");
  const d = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(purpose));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8")) as T;
}

/** Keyed hash for deduplication and rate limiting (never reversible, never shown). */
export const keyedHash = (kind: string, value: string) => createHmac("sha256", appSecret()).update(`${kind}:${value}`).digest("hex");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Human-friendly reference like TD-K7QXM2PA9D (10 base32 characters, 50 bits). */
export function reference(prefix: "TD" | "SG"): string {
  const b = randomBytes(10);
  return `${prefix}-${Array.from(b, (x) => B32[x % 32]).join("")}`;
}
