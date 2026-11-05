import { createHash } from "node:crypto";
import { checkText, sanitizeCopy } from "@/server/ai/safety";
import { AppError } from "@/server/errors";
import { linkFromUrl, type SocialLink } from "./social";

/**
 * Profile import parser — local, deterministic, no network.
 *
 * Accepts either pasted text or the contents of a small export file (JSON or
 * plain text). Platform-agnostic: it looks for familiar field names rather
 * than any one platform's format. Only display name, tagline, bio and links
 * are extracted; images are ignored until media storage exists.
 */
export const IMPORT_MAX_CHARS = 20_000;
export const IMPORT_MAX_LINKS = 8;
const LIMITS = { displayName: 60, tagline: 160, bio: 2000 } as const;

export type ImportedProfile = {
  fields: { displayName?: string; tagline?: string; bio?: string };
  links: SocialLink[];
  /** Human-readable notes about what was skipped. Never contains the raw input. */
  warnings: string[];
};

const KEYS = {
  displayName: ["display_name", "displayname", "display name", "name", "full_name", "fullname", "full name"],
  tagline: ["tagline", "headline", "subtitle"],
  bio: ["bio", "biography", "about", "description", "summary"],
  links: ["links", "link", "website", "websites", "url", "external_url", "external url", "homepage", "socials"],
};
const keyOf = (k: string) => k.trim().toLowerCase().replace(/[-\s]+/g, (m) => (m.includes("-") ? "_" : " "));
const fieldFor = (k: string) => {
  const n = keyOf(k);
  return (Object.keys(KEYS) as (keyof typeof KEYS)[]).find((f) => KEYS[f].includes(n) || KEYS[f].includes(n.replace(/ /g, "_")));
};

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

type Raw = { displayName?: string; tagline?: string; bio?: string; urls: string[] };

/** Breadth-first walk so the shallowest match wins; bounded in depth and size. */
function fromJson(data: unknown): Raw {
  const raw: Raw = { urls: [] };
  const queue: { v: unknown; key?: string; depth: number }[] = [{ v: data, depth: 0 }];
  let seen = 0;
  while (queue.length && seen++ < 5000) {
    const { v, key, depth } = queue.shift()!;
    const field = key ? fieldFor(key) : undefined;
    if (typeof v === "string") {
      if (field === "links") raw.urls.push(v);
      else if (field && raw[field] === undefined && v.trim()) raw[field] = v;
      else for (const m of v.match(URL_IN_TEXT) ?? []) raw.urls.push(m);
      continue;
    }
    if (depth >= 8 || v === null || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const item of v) queue.push({ v: item, key: field === "links" ? key : undefined, depth: depth + 1 });
      continue;
    }
    const obj = v as Record<string, unknown>;
    // Export shape `{ "Name": { "value": "…" } }` — treat `value`/`href` as the parent key's value.
    for (const inner of ["value", "href", "url"]) {
      if (key && typeof obj[inner] === "string") queue.push({ v: obj[inner], key, depth: depth + 1 });
    }
    for (const [k, child] of Object.entries(obj)) if (!["value", "href"].includes(k) || !key) queue.push({ v: child, key: k, depth: depth + 1 });
  }
  return raw;
}

const LABEL = /^\s*([A-Za-z][A-Za-z _-]{1,20}?)\s*[:：]\s*(.*)$/;

function fromText(text: string): Raw {
  const raw: Raw = { urls: [] };
  const unlabelled: string[] = [];
  let current: keyof typeof KEYS | undefined;
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.match(URL_IN_TEXT) ?? []) raw.urls.push(m);
    const m = LABEL.exec(line);
    const field = m ? fieldFor(m[1]) : undefined;
    if (m && field) {
      current = field;
      if (field !== "links" && raw[field] === undefined) raw[field] = m[2];
      continue;
    }
    if (current === "bio" && raw.bio !== undefined) raw.bio += `\n${line}`;
    else if (!current) unlabelled.push(line);
  }
  // Nothing labelled: first short line is the name, the rest is the bio.
  if (raw.displayName === undefined && raw.bio === undefined && raw.tagline === undefined) {
    const lines = unlabelled.map((l) => l.replace(URL_IN_TEXT, "").trim());
    const first = lines.findIndex(Boolean);
    if (first >= 0 && lines[first].length <= LIMITS.displayName) {
      raw.displayName = lines[first];
      raw.bio = lines.slice(first + 1).join("\n");
    } else {
      raw.bio = lines.join("\n");
    }
  }
  return raw;
}

const clip = (s: string | undefined, max: number, oneLine: boolean) => {
  if (!s) return undefined;
  let t = s.replace(CTRL, "");
  if (oneLine) t = t.replace(/\s+/g, " ");
  t = sanitizeCopy(t, max);
  return t || undefined;
};

export function parseImport(input: string): ImportedProfile {
  if (typeof input !== "string" || !input.trim()) throw new AppError("validation", "Paste your profile text or choose a file.", "text");
  if (input.length > IMPORT_MAX_CHARS) throw new AppError("validation", `That's too long — keep it under ${IMPORT_MAX_CHARS.toLocaleString("en")} characters.`, "text");
  const text = input.replace(/^﻿/, "");
  const warnings: string[] = [];

  let raw: Raw;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      raw = fromJson(JSON.parse(trimmed));
    } catch {
      raw = fromText(text);
    }
  } else {
    raw = fromText(text);
  }

  const lengthOf = (s?: string) => (s ? s.replace(/\s+/g, " ").trim().length : 0);
  if (lengthOf(raw.bio) > LIMITS.bio) warnings.push(`The bio was shortened to ${LIMITS.bio} characters.`);
  const fields = {
    displayName: clip(raw.displayName, LIMITS.displayName, true),
    tagline: clip(raw.tagline, LIMITS.tagline, true),
    bio: clip(raw.bio, LIMITS.bio, false),
  };
  for (const k of Object.keys(fields) as (keyof typeof fields)[]) if (fields[k] === undefined) delete fields[k];

  const verdict = checkText(fields.displayName, fields.tagline, fields.bio);
  if (!verdict.ok) throw new AppError("validation", "That copy can't be used on this platform. Remove any reference to minors, youth or non-consent.", "text");

  const links: SocialLink[] = [];
  let insecure = 0;
  let unusable = 0;
  for (const u of raw.urls.map((x) => x.trim().replace(/[.,;!?]+$/, ""))) {
    if (/^http:\/\//i.test(u)) {
      insecure++;
      continue;
    }
    const l = linkFromUrl(u);
    if (!l) {
      unusable++;
      continue;
    }
    if (links.some((x) => x.platform === l.platform && x.handle.toLowerCase() === l.handle.toLowerCase())) continue;
    if (links.length >= IMPORT_MAX_LINKS) {
      warnings.push(`Only the first ${IMPORT_MAX_LINKS} links were kept.`);
      break;
    }
    links.push(l);
  }
  if (insecure) warnings.push(`${insecure} link${insecure > 1 ? "s" : ""} skipped: only secure https:// links can be imported.`);
  if (unusable) warnings.push(`${unusable} link${unusable > 1 ? "s" : ""} skipped: not a recognisable profile address.`);

  if (!Object.keys(fields).length && !links.length) throw new AppError("validation", "We couldn't find a name, bio or links in that. Try labelling lines, e.g. “Name: …” and “Bio: …”.", "text");
  return { fields, links, warnings };
}

/** Stable hash of the parsed result, for duplicate prevention. Never hashes the raw paste. */
export function importHash(p: ImportedProfile): string {
  const canon = JSON.stringify({
    d: p.fields.displayName ?? "",
    t: p.fields.tagline ?? "",
    b: p.fields.bio ?? "",
    l: p.links.map((l) => `${l.platform}:${l.handle.toLowerCase()}`).sort(),
  });
  return createHash("sha256").update(canon).digest("hex");
}
