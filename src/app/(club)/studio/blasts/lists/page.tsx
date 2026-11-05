import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth/request";
import { memberDirectory, myLists } from "@/server/services/blasts";
import { AddMember, DeleteList, NewList, RemoveMember } from "./ListForms";

export const metadata: Metadata = { title: "Lists · Blasts" };

export default async function ListsPage() {
  const viewer = await requireViewer("club.discover");
  if (viewer.role !== "creator") notFound();
  const [lists, dir] = [await myLists(viewer), await memberDirectory(viewer)];
  return (
    <div className="mx-auto max-w-[900px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      <Link href="/studio/blasts" className="text-[13px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">← Blasts</Link>
      <h1 className="mt-6 font-display text-[44px] leading-none tracking-[-0.03em] text-ivory md:text-[64px]">Custom lists</h1>
      <p className="mt-4 max-w-2xl text-[14px] text-stone">Group your current and past members. Followers who never joined can&apos;t be listed individually — they stay private to you.</p>
      <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6"><NewList /></div>
      <div className="mt-6 space-y-6">
        {lists.map((l) => (
          <section key={l.id} aria-labelledby={`l-${l.id}`} className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id={`l-${l.id}`} className="font-display text-[24px] text-ivory">{l.name} <span className="text-[14px] text-ash">({l.members.length})</span></h2>
              <DeleteList listId={l.id} name={l.name} />
            </div>
            {l.members.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {l.members.map((m) => (
                  <li key={m.fanId} className="flex items-center gap-1 rounded-full border border-line-strong pl-3 text-[13px] text-ivory">
                    {m.alias}<RemoveMember listId={l.id} fanId={m.fanId} alias={m.alias} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4"><AddMember listId={l.id} options={dir.filter((d) => !l.members.some((m) => m.fanId === d.fan_id)).map((d) => ({ id: d.fan_id, alias: d.alias }))} /></div>
          </section>
        ))}
      </div>
    </div>
  );
}
