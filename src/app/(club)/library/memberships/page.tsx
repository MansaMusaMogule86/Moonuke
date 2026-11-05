import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LibraryHeader } from "@/components/fan/LibraryHeader";
import { MembershipCard } from "@/components/fan/MembershipCard";
import { requireViewer } from "@/server/auth/request";
import { mySubscriptions } from "@/server/services/fan";

export const metadata: Metadata = { title: "Memberships · Library" };

export default async function MembershipsPage() {
  const viewer = await requireViewer("club.follow");
  if (viewer.role !== "member" && viewer.role !== "creator") notFound();
  const subs = await mySubscriptions(viewer);
  const current = subs.filter((s) => s.state !== "ended");
  const past = subs.filter((s) => s.state === "ended");
  return (
    <div className="mx-auto max-w-[1000px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <LibraryHeader title="Memberships" intro="Cancelling ends a membership at the close of its current period; you keep access until then. Payments aren't active yet, so nothing renews, charges or refunds automatically." />
      <section aria-labelledby="current-h" className="mt-10">
        <h2 id="current-h" className="font-display text-[28px] text-ivory">Current</h2>
        {current.length === 0 ? <p className="mt-4 text-[15px] text-stone">No current memberships.</p> : (
          <div className="mt-5 space-y-4">{current.map((m) => <MembershipCard key={m.id} m={m} />)}</div>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-h" className="mt-12">
          <h2 id="past-h" className="font-display text-[28px] text-ivory">Past</h2>
          <div className="mt-5 space-y-4">{past.map((m) => <MembershipCard key={m.id} m={m} />)}</div>
        </section>
      )}
    </div>
  );
}
