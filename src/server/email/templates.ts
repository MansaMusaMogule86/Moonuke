import "server-only";
import { brand } from "@/config/brand";

export type Rendered = { template: string; subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** One restrained, dark, inline-styled layout. All dynamic values are escaped. */
function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }, footnote?: string): string {
  const p = paragraphs.map((t) => `<p style="margin:0 0 16px;font:16px/1.6 Georgia,serif;color:#f6f0e6">${esc(t)}</p>`).join("");
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#d6b56d;color:#050505;text-decoration:none;font:600 15px/1 Arial,sans-serif;padding:16px 28px;border-radius:999px">${esc(cta.label)}</a></p>
       <p style="margin:0 0 16px;font:13px/1.6 Arial,sans-serif;color:#aaa39a">Or paste this link into your browser:<br><span style="color:#e8cc91;word-break:break-all">${esc(cta.url)}</span></p>`
    : "";
  const foot = footnote ? `<p style="margin:24px 0 0;font:12px/1.6 Arial,sans-serif;color:#8a847b">${esc(footnote)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#050505;padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 0 28px;font:500 13px/1 Georgia,serif;letter-spacing:.3em;color:#d6b56d;text-transform:uppercase">${esc(brand.name)}</td></tr>
<tr><td style="padding:0 0 20px;font:400 30px/1.15 Georgia,serif;color:#f6f0e6">${esc(title)}</td></tr>
<tr><td>${p}${button}${foot}</td></tr>
<tr><td style="padding:32px 0 0;border-top:1px solid #222;font:12px/1.6 Arial,sans-serif;color:#8a847b">${esc(brand.name)} — ${esc(brand.tagline)}. Adults 18+. You received this because of activity on your account or an invitation addressed to you.</td></tr>
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
        `The house has invited you to join ${brand.name} as a ${p.role}.`,
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

  approved: (p: { alias: string; url: string }) =>
    make("account_approved", `Welcome to ${brand.name}`, `Welcome, ${p.alias}.`, ["The house has approved your account. The Circle is open to you."], { label: "Sign in", url: p.url }),

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
      "If this wasn't you, reset your password immediately and contact the house.",
    );
  },

  verificationSubmitted: (p: { url: string }) =>
    make("verification_submitted", `${brand.name}: a creator submitted verification`, "A creator is ready for review.", ["A creator completed their profile and attestations and is waiting for verification."], { label: "Review creators", url: p.url }),

  creatorVerified: (p: { alias: string; url: string }) =>
    make("creator_verified", `Your ${brand.name} profile is live`, `You're verified, ${p.alias}.`, ["The house has verified your account and published your profile to members."], { label: "Open your studio", url: p.url }),

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
  safeguardingAlert: (p: { reference: string; url: string }) =>
    make(
      "safeguarding_alert",
      `${brand.name}: urgent safeguarding case ${p.reference}`,
      "An urgent safeguarding case was opened.",
      ["The content was withheld and preserved automatically. A trained person must assess it now.", "Do not download, forward or copy the content."],
      { label: "Open safeguarding", url: p.url },
      "Details are intentionally not included in email.",
    ),
};

export type SecurityEvent = "password_changed" | "mfa_enabled" | "mfa_disabled" | "recovery_code_used" | "sessions_revoked" | "owner_signin";
