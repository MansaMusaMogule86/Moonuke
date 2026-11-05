import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook verification contract. Each real provider adapter implements its
 * own scheme; this generic HMAC-SHA256 helper ("t=<unix>,v1=<hex>" over
 * "<t>.<rawBody>") is what the mock provider uses and documents the
 * properties every adapter must have: raw-body signing, constant-time
 * comparison, and a timestamp tolerance against replay.
 */
export type VerifiedEvent = {
  eventId: string;
  type: "payment.authorized" | "payment.succeeded" | "payment.failed" | "payment.canceled" | "payment.refunded" | "dispute.opened" | "dispute.won" | "dispute.lost";
  providerRef: string;
  amountCents: number;
  currency: string;
};

export function signHmac(secret: string, rawBody: string, t: number): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

export function verifyHmac(secret: string, rawBody: string, header: string | null, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(nowSec - t) > toleranceSec || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
