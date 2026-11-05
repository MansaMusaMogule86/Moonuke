import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { requireViewer } from "@/server/auth/request";
import { env } from "@/server/env";
import { listEmailLog } from "@/server/services/admin";

export const metadata: Metadata = { title: "Email" };

const tone = { queued: "neutral", sending: "neutral", sent: "member", failed: "live", suppressed: "locked" } as const;

export default async function EmailLogPage() {
  const viewer = await requireViewer("audit.view");
  const rows = await listEmailLog(viewer);
  const transport = env().EMAIL_TRANSPORT;

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Letters <em className="text-metal">sent</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        Delivery log for transactional email. Message bodies are never shown here; after a real delivery they are
        deleted so one-time links don&apos;t linger. Transport: <code className="text-gold-soft">{transport}</code>
        {transport === "disabled" && " — nothing is sent; deliver invitation links manually."}
        {transport === "dev" && " — development only; messages stay in the local outbox."}
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 text-[14px] text-stone">No email yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="truncate text-[14px] text-ivory">{r.subject}</p>
                <p className="mt-1 break-all text-[12px] text-ash">
                  {r.to_email} · {r.template} · {new Date(r.created_at).toLocaleString("en-GB")}
                  {r.last_error ? ` · ${r.last_error}` : ""}
                </p>
              </div>
              <Badge tone={tone[r.status as keyof typeof tone] ?? "neutral"}>{r.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
