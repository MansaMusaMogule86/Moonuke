import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { appSecret } from "@/server/env";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(pw: string, salt: Buffer, len: number, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, len, { N: n, r, p, maxmem: 256 * n * r }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** 256-bit URL-safe random token. */
export const randomToken = () => randomBytes(32).toString("base64url");

export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest();

export function hmac(data: string): string {
  return createHmac("sha256", appSecret()).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Keyed hash so audit logs can correlate an IP without storing it. */
export const hashIp = (ip: string | null) => (ip ? hmac(`ip:${ip}`).slice(0, 22) : null);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, Number(n), Number(r), Number(p));
  return timingSafeEqual(key, expected);
}

/** Pre-computed hash used to equalise timing when an email does not exist. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-moonuke"));
