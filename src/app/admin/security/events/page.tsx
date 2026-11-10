import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireViewer } from "@/server/auth/request";
import { EVENT_TYPES, listEvents, PAGE_SIZE, SEVERITIES } from "@/server/services/securityMonitor";
import { EVENT_LABEL, EventList } from "../shared";

export const metadata: Metadata = { title: "Security events" };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filters = z.object({
  type: z.enum(EVENT_TYPES).optional().catch(undefined),
  severity: z.enum(SEVERITIES).optional().catch(undefined),
  country: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  account: z.email().max(254).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const input = "mt-2 h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-ink-3 px-3 text-[14px] text-ivory";

export default async function SecurityEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer("security.view");
  const raw = await searchParams;
  const f = filters.parse(Object.fromEntries(Object.keys(filters.shape).map((k) => [k, one(raw[k])])));
  const { rows, total } = await listEvents(viewer, f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, page })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/admin/security/events?${p}`;
  };

  return (
    <div>
      <Link href="/admin/security" className="text-[13px] text-gold-soft underline underline-offset-4">← Security</Link>
      <h1 className="mt-4 font-display text-[40px] leading-none text-ivory md:text-[56px]">
        Event <em className="text-metal">explorer</em>
      </h1>

      <form role="search" action="/admin/security/events" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-[13px] text-stone lg:col-span-2">
          Event type
          <select name="type" defaultValue={f.type ?? ""} className={input}>
            <option value="">All</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-stone">
          Severity
          <select name="severity" defaultValue={f.severity ?? ""} className={input}>
            <option value="">All</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-[13px] text-stone">
          Country (ISO code)
          <input name="country" defaultValue={f.country ?? ""} maxLength={2} className={input} />
        </label>
        <label className="text-[13px] text-stone">
          From
          <input type="date" name="from" defaultValue={f.from ?? ""} className={input} />
        </label>
        <label className="text-[13px] text-stone">
          To
          <input type="date" name="to" defaultValue={f.to ?? ""} className={input} />
        </label>
        <label className="text-[13px] text-stone sm:col-span-2 lg:col-span-4">
          Account email (searches are audited)
          <input type="email" name="account" defaultValue={f.account ?? ""} className={input} />
        </label>
        <div className="flex items-end gap-3 sm:col-span-2">
          <button type="submit" className="h-11 rounded-full border border-line-strong px-5 text-[14px] text-ivory hover:border-gold/60">Apply filters</button>
          <Link href="/admin/security/events" className="text-[13px] text-stone underline underline-offset-4">Clear</Link>
        </div>
      </form>

      <p className="mt-8 text-[13px] text-ash" aria-live="polite">{total} {total === 1 ? "event" : "events"} · page {Math.min(f.page, pages)} of {pages}</p>
      <EventList rows={rows} />
      <nav aria-label="Pagination" className="mt-6 flex gap-4 text-[14px]">
        {f.page > 1 && <Link href={link(f.page - 1)} className="text-gold-soft underline underline-offset-4">Previous</Link>}
        {f.page < pages && <Link href={link(f.page + 1)} className="text-gold-soft underline underline-offset-4">Next</Link>}
      </nav>
    </div>
  );
}
