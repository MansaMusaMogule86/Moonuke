import "server-only";

// =====================================================================
// NCMEC CyberTipline: preparation only.
//
// This code NEVER contacts NCMEC or any other external service. A trained,
// authorised person reviews the case, decides whether a report is required,
// submits it MANUALLY through the official CyberTipline, and records the
// report number here. Registration as an electronic service provider, the
// reporting procedure and preservation practice must be verified by counsel
// before launch (see docs/DECISION_REGISTER.md, L-5).
// =====================================================================

export type ReportingChannel = { kind: "manual"; submit: () => never };

export const reportingChannel: ReportingChannel = {
  kind: "manual",
  submit() {
    throw new Error("External submission is disabled. Trained staff submit reports manually through the official CyberTipline.");
  },
};

export type CaseForDraft = {
  reference: string;
  source_type: string;
  summary: string;
  created_at: Date;
  status: string;
};
export type HoldForDraft = { object_type: string; object_id: string; placed_at: Date; preserve_until: Date; snapshot: Record<string, unknown> };

/**
 * A structured checklist of what the CyberTipline form asks for, filled from
 * preserved metadata. It contains identifiers, timestamps and fingerprints,
 * never the content itself.
 */
export function buildCyberTiplineDraft(c: CaseForDraft, holds: HoldForDraft[]) {
  const pick = (s: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in s).map((k) => [k, s[k]]));
  return {
    notice: "Draft for manual entry only. Nothing has been sent. Verify every field against the preserved record before submitting.",
    case: { reference: c.reference, source: c.source_type, opened_at: new Date(c.created_at).toISOString(), status: c.status },
    incident: { type: "UNKNOWN — choose in the CyberTipline form after review", summary: c.summary },
    subjects: holds
      .filter((h) => h.object_type === "user")
      .map((h) => pick(h.snapshot, ["id", "alias", "email", "role", "created_at", "last_ip_hash"])),
    content: holds
      .filter((h) => h.object_type !== "user")
      .map((h) => ({
        type: h.object_type,
        id: h.object_id,
        preserved_at: new Date(h.placed_at).toISOString(),
        preserved_until: new Date(h.preserve_until).toISOString(),
        ...pick(h.snapshot, ["creator_id", "sender_id", "created_at", "published_at", "media_hashes"]),
      })),
    to_complete_manually: [
      "Reporter (company) details as registered with NCMEC",
      "Incident type and date/time per the CyberTipline form",
      "Whether the content was viewed by staff, and by whom",
      "Upload of preserved files through the CyberTipline (never by email)",
    ],
  };
}
