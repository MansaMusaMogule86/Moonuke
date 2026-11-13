import { requireViewer } from "@/server/auth/request";
import { getOwnerDashboardData } from "@/server/services/ownerFinance";

export default async function OwnerAuditPage() {
  const viewer = await requireViewer("owner.audit.view");
  const { auditEvents } = await getOwnerDashboardData(viewer);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-[#100e14]/90 p-6 md:p-8" aria-labelledby="audit-heading">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-soft">
          Section 5, 7 & 8 · Append-Only Governance Trail
        </p>
        <h2 id="audit-heading" className="mt-1 font-display text-[26px] text-ivory">
          Financial Audit History
        </h2>
        <p className="mt-2 max-w-[68ch] text-[13px] text-stone">
          Every owner enrollment, waterfall calculation, destination update, approval, rejection, and simulated payout is
          recorded in an append-only PostgreSQL table (`app.financial_audit_events`) protected by database triggers.
        </p>

        {auditEvents.length === 0 ? (
          <p className="mt-6 text-[13px] text-stone">No financial audit events recorded yet.</p>
        ) : (
          <ul className="mt-6 divide-y divide-line text-[13px]">
            {auditEvents.map((ev) => (
              <li key={ev.id} className="py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-medium text-gold-soft">{ev.event_type}</span>
                    {ev.owner_id && (
                      <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ivory">
                        {ev.owner_id}
                      </span>
                    )}
                    <span className="ml-2 text-[12px] text-stone">
                      {ev.resource_type} {ev.resource_id ? `(${ev.resource_id})` : ""}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-stone">{ev.created_at.toISOString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

