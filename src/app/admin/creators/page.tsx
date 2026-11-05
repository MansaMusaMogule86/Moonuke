import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { verificationQueue } from "@/server/services/creatorOnboarding";
import { verificationProvider } from "@/server/verification";
import { VerificationCard } from "./VerificationCard";

export const metadata: Metadata = { title: "Creators" };

export default async function CreatorsAdminPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await requireViewer("creators.verify");
  const view = (await searchParams).view === "all" ? "all" : "pending";
  const rows = await verificationQueue(viewer, view);
  const vendor = verificationProvider();

  return (
    <div>
      <h1 className="font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Who <em className="text-metal">performs.</em>
      </h1>
      <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-stone">
        An approved creator account stays invisible to members until you verify the creator and publish. Confirm each
        check only after completing it outside the platform.{" "}
        {vendor ? `Provider: ${vendor.id}.` : "No verification provider is connected — reviews are manual."}
      </p>
      <nav aria-label="Creator views" className="mt-8">
        <ul className="inline-flex gap-1 rounded-full border border-line-strong p-1">
          {[
            ["pending", "Awaiting review"],
            ["all", "All creators"],
          ].map(([v, l]) => (
            <li key={v}>
              <Link href={v === "pending" ? "/admin/creators" : "/admin/creators?view=all"} aria-current={view === v ? "page" : undefined} className={cn("block rounded-full px-4 py-2 text-[13px]", view === v ? "bg-gold text-ink" : "text-stone hover:text-ivory")}>
                {l}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-lg)] border border-line p-8 text-center text-[15px] text-stone">No creators waiting.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((r) => (
            <li key={r.user_id}>
              <VerificationCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
