import "server-only";
import { brand } from "@/config/brand";

export type Rendered = { template: string; subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const C = { bg: "#050505", card: "#121217", text: "#f8f5f0", muted: "#b9b4c0", faint: "#948f9c", gold: "#d4af37", goldSoft: "#f5d58a", pink: "#ff2d96", line: "#24232c" };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";

/**
 * One dark, inline-styled, table-based layout (Gmail, Apple Mail, Outlook).
 * All dynamic values are escaped. The logo has alt text, and every message
 * also has a plain-text part.
 */
function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }, footnote?: string): string {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font:16px/1.6 ${SANS};color:${C.text}">${esc(t)}</p>`).join("");
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 20px"><tr><td style="border-radius:999px;background:${C.gold}">
<a href="${esc(cta.url)}" style="display:inline-block;padding:15px 28px;border-radius:999px;font:600 15px/1 ${SANS};color:#050505;text-decoration:none">${esc(cta.label)}</a></td></tr></table>
<p style="margin:0 0 16px;font:13px/1.6 ${SANS};color:${C.muted}">Or paste this link into your browser:<br><span style="color:${C.goldSoft};word-break:break-all">${esc(cta.url)}</span></p>`
    : "";
  const foot = footnote ? `<p style="margin:20px 0 0;font:13px/1.6 ${SANS};color:${C.faint}">${esc(footnote)}</p>` : "";
  const logo = `${brand.siteUrl}${brand.logo.src}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(paragraphs[0] ?? title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td align="center" style="padding:0 0 24px"><img src="${esc(logo)}" width="120" height="97" alt="${esc(brand.name)}" style="display:block;border:0;width:120px;height:auto;color:${C.gold};font:600 18px ${SERIF}"></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:32px 28px">
<h1 style="margin:0 0 20px;font:400 28px/1.2 ${SERIF};color:${C.text}">${esc(title)}</h1>${p}${button}${foot}</td></tr>
<tr><td style="padding:24px 8px 0;font:12px/1.6 ${SANS};color:${C.faint}"><span style="color:${C.pink}">&#9670;</span> ${esc(brand.name)} — ${esc(brand.tagline)}. Accounts are for people aged 18 and over. You received this because of activity on your account or an invitation addressed to you.</td></tr>
</table></td></tr></table></body></html>`;
}

function make(template: string, subject: string, title: string, paragraphs: string[], cta?: { label: string; url: string }, footnote?: string): Rendered {
  const text = [title, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : []), ...(footnote ? ["", footnote] : []), "", `— ${brand.name}`].join("\n");
  return { template, subject, text, html: layout(title, paragraphs, cta, footnote) };
}

const when = (d: Date) => d.toUTCString().replace(" GMT", " UTC");

export const emails = {
  invitation: (p: { url: string; role: "member" | "creator"; expiresAt: Date }) =>
    make(
      "invitation",
      `You're invited to ${brand.name}`,
      "You've been invited.",
      [
        `You've been invited to join ${brand.name} as a ${p.role}.`,
        "Open your personal link to choose an alias and request approval. Every account is reviewed personally before it opens.",
      ],
      { label: "Open your invitation", url: p.url },
      `This link is personal and expires ${when(p.expiresAt)}. If you weren't expecting it, you can ignore this email.`,
    ),

  passwordReset: (p: { url: string; minutes: number }) =>
    make(
      "password_reset",
      `Reset your ${brand.name} password`,
      "Reset your password.",
      ["Someone — hopefully you — asked to reset the password on this account.", `This link works once and expires in ${p.minutes} minutes.`],
      { label: "Choose a new password", url: p.url },
      "If you didn't ask for this, ignore this email; your password stays the same. Two-step sign-in, if enabled, is still required.",
    ),

  /** Welcome to DivaFans: sent only when the owner approves the account. Creators get their onboarding step. */
  approved: (p: { alias: string; url: string; role?: "member" | "creator" }) =>
    p.role === "creator"
      ? make(
          "account_approved",
          `Welcome to ${brand.name}`,
          `Welcome, ${p.alias}.`,
          ["Your creator account has been approved.", "Next, set up your studio: your profile, your Member and VIP levels, and your first posts. Our team reviews your profile before it goes live."],
          { label: "Set up your studio", url: p.url },
        )
      : make("account_approved", `Welcome to ${brand.name}`, `Welcome, ${p.alias}.`, ["Your account has been approved. Sign in to start following creators."], { label: "Sign in", url: p.url }),

  /** After an invitation is redeemed: the account exists and waits for approval; confirm the address. */
  accountCreated: (p: { alias: string; verifyUrl: string }) =>
    make(
      "account_created",
      `Your ${brand.name} account was created`,
      `Thanks for joining, ${p.alias}.`,
      ["Your account was created and is waiting for our team's approval. We'll email you as soon as it opens.", "Please confirm this is your email address."],
      { label: "Confirm my email", url: p.verifyUrl },
      "This link is personal and expires in 7 days. If you didn't create an account, you can ignore this email.",
    ),

  /** Account-specific: a completed sign-in from a kind of device not seen before on this account. */
  newDevice: (p: { at: Date; device: string; country: string | null; url: string }) =>
    make(
      "security_new_device",
      `${brand.name} security: new sign-in on your account`,
      "New sign-in to your account",
      [`Your account was signed in from ${p.device}${p.country ? ` (approximate location: ${p.country})` : ""}.`, `Time: ${when(p.at)}.`, "If this was you, there's nothing to do."],
      { label: "Review your sessions", url: p.url },
      "Not you? Change your password and sign out other sessions from your security settings.",
    ),

  /** Account-specific: repeated failed sign-ins against this account. */
  failedAttempts: (p: { count: number; minutes: number; url: string }) =>
    make(
      "security_failed_attempts",
      `${brand.name} security: failed sign-in attempts`,
      "Several failed sign-in attempts",
      [`There were ${p.count} failed attempts to sign in to your account in ${p.minutes} minutes.`, "Your account was not accessed. Sign-in attempts are limited automatically."],
      { label: "Review your security settings", url: p.url },
      "If it wasn't you, consider changing your password and turning on two-step sign-in.",
    ),

  security: (p: { event: SecurityEvent; at: Date; url: string }) => {
    const copy: Record<SecurityEvent, [string, string]> = {
      password_changed: ["Your password was changed", "Your password was just changed and every other session was signed out."],
      mfa_enabled: ["Two-step sign-in is on", "An authenticator app was added to your account."],
      mfa_disabled: ["Two-step sign-in was turned off", "The authenticator app was removed from your account."],
      recovery_code_used: ["A recovery code was used", "One of your two-step recovery codes was used to sign in."],
      sessions_revoked: ["Sessions signed out", "Other sessions on your account were signed out."],
      owner_signin: ["Owner sign-in", "The owner account just completed sign-in."],
    };
    const [title, line] = copy[p.event];
    return make(
      `security_${p.event}`,
      `${brand.name} security: ${title.toLowerCase()}`,
      title,
      [line, `Time: ${when(p.at)}.`],
      { label: "Review account security", url: p.url },
      "If this wasn't you, reset your password now and sign out of your other sessions from your account's security settings.",
    );
  },

  verificationSubmitted: (p: { url: string }) =>
    make("verification_submitted", `${brand.name}: a creator submitted verification`, "A creator is ready for review.", ["A creator completed their profile and attestations and is waiting for verification."], { label: "Review creators", url: p.url }),

  creatorVerified: (p: { alias: string; url: string }) =>
    make("creator_verified", `Your ${brand.name} profile is live`, `You're verified, ${p.alias}.`, ["Our team has verified your account and published your profile to members."], { label: "Open your studio", url: p.url }),

  criticalReport: (p: { reason: string; url: string }) =>
    make(
      "critical_report",
      `${brand.name}: critical report needs review`,
      "A critical report was filed.",
      [`Category: ${p.reason.replace(/_/g, " ")}.`, "Critical reports are placed at the top of the moderation queue and should be reviewed immediately."],
      { label: "Open the moderation queue", url: p.url },
      "Details are intentionally not included in email.",
    ),
  takedownAlert: (p: { category: string; reference: string; dueAt: Date; url: string }) =>
    make(
      "takedown_alert",
      `${brand.name}: takedown notice ${p.reference}`,
      "A takedown notice was received.",
      [`Category: ${p.category.replace(/_/g, " ")}.`, `Decide by ${p.dueAt.toUTCString()} (48 hours from receipt).`],
      { label: "Open takedown notices", url: p.url },
      "Details are intentionally not included in email.",
    ),
  decisionNotice: (p: { url: string }) =>
    make(
      "decision_notice",
      `${brand.name}: a decision about your content`,
      "Our moderation team made a decision about your content.",
      ["You can read the reasons, and appeal if you disagree, in your Studio."],
      { label: "Open notices", url: p.url },
      "Details are intentionally not included in email.",
    ),
  safeguardingAlert: (p: { reference: string; url: string }) =>
    make(
      "safeguarding_alert",
      `${brand.name}: urgent safeguarding case ${p.reference}`,
      "An urgent safeguarding case was opened.",
      ["The content was withheld and preserved automatically. A trained person must assess it now.", "Do not download, forward or copy the content."],
      { label: "Open safeguarding", url: p.url },
      "Details are intentionally not included in email.",
    ),
  /** Immediate security alert. Carries only the alert summary (built from allowlisted fields), never IPs, emails or tokens. */
  securityAlert: (p: { severity: "low" | "medium" | "high" | "critical"; summary: string; at: Date; url: string }) =>
    make(
      "security_alert",
      `${brand.name} security: ${p.severity} alert`,
      `A ${p.severity} security alert needs review.`,
      [p.summary, `Raised at ${when(p.at)}.`],
      { label: "Review in the security console", url: p.url },
      "Sign-in is required, and the console asks for your second factor. Details are intentionally kept out of email.",
    ),
  /** Daily summary: counts only. */
  securityDigest: (p: {
    day: string;
    timezone: string;
    totals: { logins: number; accounts: number; registrations: number; creatorApplications: number; failed: number; alerts: number; high: number; openAlerts: number };
    countries: { country: string; n: number }[];
    url: string;
  }) =>
    make(
      "security_digest",
      `${brand.name} daily security summary · ${p.day}`,
      `Security summary for the 24 hours to ${p.day} (${p.timezone}).`,
      [
        `Successful sign-ins: ${p.totals.logins} across ${p.totals.accounts} accounts.`,
        `New registrations: ${p.totals.registrations}. New creator applications: ${p.totals.creatorApplications}.`,
        `Failed sign-in attempts: ${p.totals.failed}. Alerts raised: ${p.totals.alerts} (${p.totals.high} high or critical).`,
        `Alerts waiting for review: ${p.totals.openAlerts}.`,
        `Approximate countries: ${p.countries.length ? p.countries.map((c) => `${c.country} ${c.n}`).join(", ") : "none recorded"}.`,
      ],
      { label: "Open the security console", url: p.url },
      "Countries come from the hosting provider's network data and are approximate.",
    ),
};

export type SecurityEvent = "password_changed" | "mfa_enabled" | "mfa_disabled" | "recovery_code_used" | "sessions_revoked" | "owner_signin";
