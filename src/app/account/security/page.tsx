import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { listSessions } from "@/server/services/account";
import { mfaStatus } from "@/server/services/mfa";
import { MfaManage, MfaSetup, PasswordForm, RevokeOthersForm, RevokeSessionForm } from "./SecurityForms";

export const metadata: Metadata = { title: "Account security" };

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
  const [mfa, sessions] = await Promise.all([mfaStatus(viewer), listSessions(viewer)]);
  const mustEnrol = viewer.role === "owner" && !mfa.enrolled;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <p className="eyebrow mb-5">Account · {viewer.alias}</p>
      <h1 className="font-display text-[52px] leading-[0.98] tracking-[-0.03em] text-ivory md:text-[84px]">
        Keys & <em className="text-metal">doors.</em>
      </h1>

      {mustEnrol && (
        <p role="alert" className="mt-8 max-w-2xl rounded-[var(--radius-md)] border border-gold/45 bg-gold/[0.07] px-5 py-4 text-[15px] leading-relaxed text-gold-soft">
          Two-step sign-in is required for the owner account. Set it up below to unlock the House{setup === "required" ? "" : "."}
          {setup === "required" ? " — every owner page stays closed until you do." : ""}
        </p>
      )}

      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="mfa-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="mfa-h" className="font-display text-[30px] text-ivory">Two-step sign-in</h2>
            <Badge tone={mfa.enrolled ? "vip" : "neutral"}>{mfa.enrolled ? "On" : "Off"}</Badge>
            {mfa.mandatory && <Badge tone="member">Required for owner</Badge>}
          </div>
          <p className="mt-3 text-[14px] leading-relaxed text-stone">
            A 6-digit code from an authenticator app (1Password, Google Authenticator, Authy…) after your password.
          </p>
          <div className="mt-8">
            {mfa.enrolled ? <MfaManage recoveryLeft={mfa.recoveryCodesLeft} mandatory={mfa.mandatory} /> : <MfaSetup />}
          </div>
        </section>

        <section aria-labelledby="pw-h" className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
          <h2 id="pw-h" className="font-display text-[30px] text-ivory">Password</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-stone">Changing it signs out every other session.</p>
          <div className="mt-8">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section aria-labelledby="sess-h" className="mt-6 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="sess-h" className="font-display text-[30px] text-ivory">Signed-in sessions</h2>
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
