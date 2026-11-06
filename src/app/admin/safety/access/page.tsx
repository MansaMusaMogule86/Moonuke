import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { featureEnabled } from "@/server/flags";
import { listRules } from "@/server/services/access";
import { SafetyNav, when } from "../SafetyNav";
import { AgeScope, RemoveRule, RuleForm } from "./AccessForms";

export const metadata: Metadata = { title: "Access rules · House" };

export default async function AccessPage() {
  const owner = await requireViewer("moderation.review");
  const { rules, scope } = await listRules(owner);
  const age = featureEnabled("age_assurance");
  const geo = featureEnabled("geo_restrictions");
  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">Access rules</h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Regional rules and age checks. You can prepare rules now; none of them takes effect until the feature is approved and switched on in the
        server configuration. Which countries need what is a legal decision, so nothing is filled in for you.
      </p>
      <SafetyNav current="access" />
      <div className="mt-8 flex flex-wrap gap-2" data-testid="access-status">
        <Badge tone={geo ? "live" : "neutral"}>Regional rules: {geo ? "on" : "off (awaiting approval)"}</Badge>
        <Badge tone={age ? "live" : "neutral"}>Age checks: {age ? "on" : "off (awaiting approval)"}</Badge>
      </div>
      <section aria-labelledby="scope-h" className="mt-8 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5">
        <h2 id="scope-h" className="font-display text-[22px] text-ivory">Where age checks apply</h2>
        <div className="mt-3"><AgeScope scope={scope} /></div>
      </section>
      <section aria-labelledby="rules-h" className="mt-8">
        <h2 id="rules-h" className="font-display text-[28px] text-ivory">Country rules</h2>
        {rules.length === 0 ? <p className="mt-4 text-[14px] text-ash">No rules. Everyone is treated the same.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {rules.map((r) => (
              <li key={r.country} className="flex flex-wrap items-center justify-between gap-3 py-4 text-[14px]">
                <span>
                  <span className="font-mono text-ivory">{r.country}</span> · {r.rule === "block" ? "Not available" : "Age check required"}
                  <span className="block text-[13px] text-stone">{r.note ? `${r.note} · ` : ""}updated {when(r.updated_at)}</span>
                </span>
                <RemoveRule country={r.country} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-5"><RuleForm /></div>
      </section>
    </div>
  );
}
