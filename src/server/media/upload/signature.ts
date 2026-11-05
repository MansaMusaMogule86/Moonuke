/**
 * File-signature ("magic bytes") detection. The declared MIME type is never
 * trusted: a file is accepted only if its bytes match an allowed type AND the
 * declared type agrees. Pure; no dependencies.
 */
export type MediaKind = "image" | "video" | "audio";
export type Sniffed = { mime: string; kind: MediaKind };

const at = (b: Uint8Array, off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v);
const ascii = (b: Uint8Array, off: number, s: string) => at(b, off, [...s].map((c) => c.charCodeAt(0)));

export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length < 12) return null;
  if (at(b, 0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", kind: "image" };
  if (at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", kind: "image" };
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a")) return { mime: "image/gif", kind: "image" };
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return { mime: "image/webp", kind: "image" };
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return { mime: "audio/wav", kind: "audio" };
  if (ascii(b, 4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (/^(M4A |M4B )$/.test(brand)) return { mime: "audio/mp4", kind: "audio" };
    if (/^(qt  )$/.test(brand)) return { mime: "video/quicktime", kind: "video" };
    if (/^(isom|iso2|mp41|mp42|avc1|dash|M4V )$/.test(brand)) return { mime: "video/mp4", kind: "video" };
    if (/^(heic|heix|mif1)$/.test(brand)) return null; // HEIC not accepted (no safe server-side decode yet)
  }
  if (at(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", kind: "video" };
  if (ascii(b, 0, "OggS")) return { mime: "audio/ogg", kind: "audio" };
  if (ascii(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", kind: "audio" };
  return null;
}

/** Size limits per kind (defaults; confirm U1). */
export const LIMITS: Record<MediaKind, number> = {
  image: 25 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
};

const ALIASES: Record<string, string> = { "image/jpg": "image/jpeg", "audio/x-wav": "audio/wav", "audio/mp3": "audio/mpeg", "audio/x-m4a": "audio/mp4" };

export type Verdict = { ok: true; sniffed: Sniffed } | { ok: false; reason: string };

export function validateFile(head: Uint8Array, declaredMime: string, sizeBytes: number): Verdict {
  const s = sniff(head);
  if (!s) return { ok: false, reason: "This file type isn't supported." };
  const declared = ALIASES[declaredMime.toLowerCase()] ?? declaredMime.toLowerCase();
  if (declared !== s.mime) return { ok: false, reason: "The file's contents don't match its type." };
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) return { ok: false, reason: "The file is empty." };
  if (sizeBytes > LIMITS[s.kind]) return { ok: false, reason: `That ${s.kind} is too large.` };
  return { ok: true, sniffed: s };
}
