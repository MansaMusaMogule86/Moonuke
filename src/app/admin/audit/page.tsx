import type { Metadata } from "next";
import { requireViewer } from "@/server/auth/request";
import { listAudit } from "@/server/services/admin";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const viewer = await requireViewer("audit.view");
  const rows = await listAudit(viewer, 200);

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        The <em className="text-metal">ledger of doors</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] text-stone">Append-only. The database rejects any edit or deletion. Latest 200 events.</p>
      <div className="mt-8 overflow-x-auto rounded-[var(--radius-lg)] border border-line">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead className="bg-ink-2 text-stone">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Actor</th>
              <th scope="col" className="px-4 py-3 font-medium">Action</th>
              <th scope="col" className="px-4 py-3 font-medium">Target</th>
              <th scope="col" className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-stone">{new Date(r.at).toLocaleString("en-GB")}</td>
                <td className="px-4 py-3 text-ivory">{r.actor_alias ?? "—"}</td>
                <td className="px-4 py-3"><code className="text-gold-soft">{r.action}</code></td>
                <td className="px-4 py-3 text-stone">{r.target_type ? `${r.target_type} ${r.target_id?.slice(0, 8) ?? ""}` : "—"}</td>
                <td className="max-w-[20rem] truncate px-4 py-3 text-ash">{Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
