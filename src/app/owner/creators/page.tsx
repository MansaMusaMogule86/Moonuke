import Link from "next/link";
import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";

export default async function OwnerCreatorsPage() {
  const viewer = await requireViewer("owner.creators.view");
  const { creators, overview } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="creators-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
              Section 9 · Creator Independence & Governance
            </p>
            <h2 id="creators-heading" className="mt-1 font-display text-[26px] text-ivory">
              Creator Directory & Independence Safeguards
            </h2>
          </div>
          <Link
            href="/admin/creators"
            className="rounded-full border border-gold/45 bg-gold/10 px-4 py-2 text-[12px] font-medium text-ivory hover:bg-gold/20"
          >
            Open Verification Console →
          </Link>
        </div>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Creators operate independently inside Creator Studio. Contractual creator earnings ({overview.creatorContractualShareBps / 100}%
          share) cannot be silently altered or redirected to platform owners.
        </p>

        {creators.length === 0 ? (
          <p className="mt-6 text-[13px] text-stone">No creators registered in the database yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.16em] text-stone">
                  <th className="py-3 pr-4">Creator</th>
                  <th className="py-3 px-4">Discipline</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4">Visibility</th>
                  <th className="py-3 px-4 text-right">Active Subscribers</th>
                  <th className="py-3 pl-4 text-right">Published Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {creators.map((c) => (
                  <tr key={c.user_id}>
                    <td className="py-3.5 pr-4">
                      <span className="font-medium text-ivory">{c.display_name}</span>
                      <span className="ml-2 font-mono text-[12px] text-stone">@{c.handle}</span>
                    </td>
                    <td className="py-3.5 px-4 text-stone">{c.discipline}</td>
                    <td className="py-3.5 px-4">
                      <span className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] uppercase tracking-[0.12em] text-gold-soft">
                        {c.verification_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-stone">{c.published ? c.visibility : "draft"}</td>
                    <td className="py-3.5 px-4 text-right font-mono text-ivory">{c.active_subscribers}</td>
                    <td className="py-3.5 pl-4 text-right font-mono text-ivory">{c.published_posts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

