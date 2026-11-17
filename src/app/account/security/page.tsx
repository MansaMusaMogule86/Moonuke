import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listSessions } from "@/server/services/account";
import { getUserPreferences } from "@/server/services/fan";
import { mfaStatus } from "@/server/services/mfa";
import { resolveWorkspaceIdentity } from "@/server/services/workspace";
import { PreferencesForm } from "./PreferencesForm";
import {
  FanAliasForm,
  MfaManage,
  MfaSetup,
  PasswordForm,
  RevokeOthersForm,
  RevokeSessionForm,
} from "./SecurityForms";

export const metadata: Metadata = { title: "Account Settings" };

/** Coarse, non-identifying description of a user agent. */
function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}
const when = (d: Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const viewer = await requireViewer(undefined, { allowMfaSetup: true });
  const { setup } = await searchParams;
  const [mfa, sessions, prefs] = await Promise.all([
    mfaStatus(viewer),
    listSessions(viewer),
    getUserPreferences(viewer),
  ]);
  const mustEnrol = viewer.role === "owner" && !mfa.enrolled;
  const isFan = viewer.role === "member" || viewer.role === "creator";
  const fanIdentity = resolveWorkspaceIdentity(viewer, "fan");
  const studioIdentity = resolveWorkspaceIdentity(viewer, "studio");

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-28 pt-8 md:px-10 md:pt-12">
      <h1 className="font-display text-[40px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[64px]">
        Account & <em className="text-metal">settings.</em>
      </h1>

      {mustEnrol && (
        <p role="alert" className="mt-6 max-w-2xl rounded-[var(--radius-md)] border border-gold/45 bg-gold/[0.07] px-5 py-4 text-[15px] leading-relaxed text-gold-soft">
          Two-step sign-in is required for the owner account. Set it up below to unlock the House{setup === "required" ? "" : "."}
          {setup === "required" ? " — every owner page stays closed until you do." : ""}
        </p>
      )}

      {/* Fan View Identity & Creator Studio Identity Separation */}
      {isFan && (
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section
            aria-labelledby="fan-alias-h"
            className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="fan-alias-h" className="font-display text-[28px] text-ivory">
                Fan View alias
              </h2>
              <Badge tone="neutral">Fan Identity</Badge>
            </div>
            <p className="mt-2.5 text-[14px] leading-relaxed text-stone">
              {viewer.role === "creator"
                ? `This alias is shown when you browse Fan View, subscribe to other creators, or send fan messages. Your public Creator Studio identity (${studioIdentity.displayName}) is never automatically exposed as your fan alias.`
                : "This alias is shown in Fan View and in private messages with creators. Your private email address is never shown."}
            </p>
            <div className="mt-6">
              <FanAliasForm
                initialFanAlias={fanIdentity.displayName}
                isCreator={viewer.role === "creator"}
              />
            </div>
          </section>

          {viewer.role === "creator" ? (
            <section
              aria-labelledby="creator-id-h"
              className="rounded-[var(--radius-xl)] border border-gold/30 bg-ink-2 p-6 md:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="creator-id-h" className="font-display text-[28px] text-ivory">
                  Creator Studio identity
                </h2>
                <Badge tone="vip">Creator Studio</Badge>
              </div>
              <p className="mt-2.5 text-[14px] leading-relaxed text-stone">
                In Creator Studio and on your public profile, you appear as{" "}
                <strong className="font-medium text-ivory">{studioIdentity.displayName}</strong>.
                You can update your chosen Diva name and public profile in Creator Studio Settings.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/studio/settings"
                  className="inline-flex h-10 items-center rounded-full border border-gold/45 bg-gold/[0.12] px-4 text-[13px] font-medium text-gold-soft hover:bg-gold/[0.2]"
                >
                  Open Creator Studio Settings →
                </Link>
                <Link
                  href="/studio"
                  className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] text-ivory hover:border-gold/50"
                >
                  Go to Creator Studio
                </Link>
              </div>
            </section>
          ) : (
            <section
              id="creator-application"
              aria-labelledby="apply-creator-h"
              className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="apply-creator-h" className="font-display text-[28px] text-ivory">
                  Apply to become a creator
                </h2>
                <Badge tone="member">By invitation & review</Badge>
              </div>
              <p className="mt-2.5 text-[14px] leading-relaxed text-stone">
                Creator Studio is reserved for approved DivaFans creators. If you are a creator
                and would like to open a profile on DivaFans, apply for a creator invitation or
                redeem a creator recruitment link.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex h-10 items-center rounded-full border border-gold/45 bg-gold/[0.12] px-4 text-[13px] font-medium text-gold-soft hover:bg-gold/[0.2]"
                >
                  Apply to become a creator →
                </Link>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Login & Security */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="mfa-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="mfa-h" className="font-display text-[28px] text-ivory">Two-step sign-in</h2>
            <Badge tone={mfa.enrolled ? "vip" : "neutral"}>{mfa.enrolled ? "Enabled" : "Set up"}</Badge>
            {mfa.mandatory && <Badge tone="member">Required for owner</Badge>}
          </div>
          <p className="mt-2.5 text-[14px] leading-relaxed text-stone">
            A 6-digit code from an authenticator app (1Password, Google Authenticator, Authy…) after your password.
          </p>
          <div className="mt-6">
            {mfa.enrolled ? <MfaManage recoveryLeft={mfa.recoveryCodesLeft} mandatory={mfa.mandatory} /> : <MfaSetup />}
          </div>
        </section>

        <section aria-labelledby="pw-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
          <h2 id="pw-h" className="font-display text-[28px] text-ivory">Password</h2>
          <p className="mt-2.5 text-[14px] leading-relaxed text-stone">Changing it signs out every other session.</p>
          <div className="mt-6">
            <PasswordForm />
          </div>
        </section>
      </div>

      {/* Notification Preferences & Billing Management (Fan-relevant settings) */}
      {isFan && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="notif-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
            <h2 id="notif-h" className="font-display text-[28px] text-ivory">Notification preferences</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-stone">
              Choose which activity updates appear in your DivaFans notification feed.
            </p>
            <div className="mt-5">
              <PreferencesForm initial={prefs} />
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="billing-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
              <h2 id="billing-h" className="font-display text-[28px] text-ivory">Billing & payment management</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-stone">
                Manage recurring subscriptions, cancel upcoming renewals, and view receipts for unlocked posts and messages.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/library?tab=subscriptions"
                  className="inline-flex h-10 items-center rounded-full border border-gold/45 bg-gold/[0.1] px-4 text-[13px] text-gold-soft hover:bg-gold/[0.18]"
                >
                  Manage subscriptions
                </Link>
                <Link
                  href="/library?tab=history"
                  className="inline-flex h-10 items-center rounded-full border border-line-strong px-4 text-[13px] text-ivory hover:border-gold/50"
                >
                  Purchase history & receipts
                </Link>
              </div>
            </section>

            <section aria-labelledby="support-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
              <h2 id="support-h" className="font-display text-[28px] text-ivory">Help & support</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-stone">
                Need help with an unlock, subscription, or safety report? Manage blocked accounts and reports here.
                Community rules, terms, and the privacy policy are provided by the house with your invitation.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-[13px]">
                <Link href="/account/privacy" className="rounded-full border border-line-strong px-4 py-2 text-ivory hover:border-gold/50">
                  Privacy & blocked accounts
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Signed-in Sessions */}
      <section aria-labelledby="sess-h" className="mt-6 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="sess-h" className="font-display text-[28px] text-ivory">Signed-in sessions</h2>
          <RevokeOthersForm />
        </div>
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] text-ivory">{device(s.user_agent)}</p>
                  {s.current && <Badge tone="vip">This device</Badge>}
                  {s.mfa && <Badge tone="member">2-step verified</Badge>}
                </div>
                <p className="mt-1 text-[12px] text-ash">Signed in {when(s.created_at)} · last active {when(s.last_seen_at)} · expires {when(s.expires_at)}</p>
              </div>
              {!s.current && <RevokeSessionForm id={s.id} label={device(s.user_agent)} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
