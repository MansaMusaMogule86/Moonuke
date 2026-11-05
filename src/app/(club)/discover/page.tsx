import type { Metadata } from "next";
import Link from "next/link";
import { CreatorPlate } from "@/components/club/CreatorPlate";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { requireViewer } from "@/server/auth/request";
import { discover, listCategories } from "@/server/services/club";
import { discoverSchema } from "@/server/validation";

export const metadata: Metadata = { title: "Discover" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "members", label: "Most members" },
] as const;

export default async function DiscoverPage({ searchParams }: { searchParams: SP }) {
  const viewer = await requireViewer("club.discover");
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const { q, category, sort = "featured" } = discoverSchema.parse({ q: one(raw.q), category: one(raw.category), sort: one(raw.sort) });
  const justBlocked = one(raw.blocked) === "1";

  const [creators, categories] = await Promise.all([discover(viewer, { q, category, sort }), listCategories(viewer)]);
  const filtered = !!(q || category);
  const editorial = !filtered && sort === "featured" && creators.length >= 3;
  const lead = editorial ? creators.slice(0, 3) : [];
  const rest = editorial ? creators.slice(3) : creators;

  const href = (next: Partial<{ q: string; category: string; sort: string }>) => {
    const p = new URLSearchParams();
    const merged = { q, category, sort, ...next };
    if (merged.q) p.set("q", merged.q);
    if (merged.category) p.set("category", merged.category);
    if (merged.sort && merged.sort !== "featured") p.set("sort", merged.sort);
    const s = p.toString();
    return s ? `/discover?${s}` : "/discover";
  };
  const activeCategory = categories.find((c) => c.slug === category);

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-28 pt-14 md:px-10 md:pt-20">
      {justBlocked && (
        <p role="status" className="mb-10 rounded-[var(--radius-md)] border border-gold/35 bg-gold/[0.06] px-4 py-3 text-[14px] text-gold-soft">
          Blocked. You won&apos;t see each other anymore. Manage blocks in{" "}
          <a href="/account/privacy" className="underline underline-offset-4">Account → Privacy</a>.
        </p>
      )}
      <Reveal>
        <p className="eyebrow mb-5">The Circle · {viewer.alias}</p>
        <h1 className="font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-ivory md:text-[112px]">
          {activeCategory ? (
            <em className="text-metal">{activeCategory.label}</em>
          ) : (
            <>
              Discover <em className="text-metal">the Circle</em>
            </>
          )}
        </h1>
      </Reveal>

      {/* Search + filters */}
      <div className="mt-12 grid gap-8 md:mt-16 md:grid-cols-12 md:items-end">
        <form role="search" action="/discover" className="md:col-span-5">
          <label htmlFor="q" className="eyebrow mb-2 block text-stone">Search</label>
          <div className="flex items-center gap-3 border-b border-line-strong pb-2 focus-within:border-gold">
            <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-stone"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="m13.5 13.5 4 4" stroke="currentColor" strokeWidth="1.3" /></svg>
            <input id="q" name="q" type="search" defaultValue={q} maxLength={60} placeholder="Name, discipline, city" className="h-11 min-w-0 flex-1 bg-transparent text-[17px] text-ivory placeholder:text-ash focus:outline-none" />
            {category && <input type="hidden" name="category" value={category} />}
            {sort !== "featured" && <input type="hidden" name="sort" value={sort} />}
            <button type="submit" className="rounded-full px-4 py-2 text-[13px] text-gold transition-colors hover:bg-gold/10">Search</button>
          </div>
        </form>
        <nav aria-label="Sort" className="md:col-span-6 md:col-start-7 md:justify-self-end">
          <ul className="flex flex-wrap gap-1 rounded-full border border-line-strong p-1">
            {SORTS.map((s) => (
              <li key={s.value}>
                <Link
                  href={href({ sort: s.value })}
                  aria-current={sort === s.value ? "true" : undefined}
                  className={cn("block rounded-full px-4 py-2 text-[13px] transition-colors", sort === s.value ? "bg-gold text-ink" : "text-stone hover:text-ivory")}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <nav aria-label="Categories" className="-mx-5 mt-8 overflow-x-auto px-5 md:mx-0 md:px-0">
        <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
          <li>
            <Chip href={href({ category: "" })} active={!category}>All</Chip>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Chip href={href({ category: c.slug })} active={category === c.slug}>{c.label}</Chip>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-10 text-[13px] text-ash" aria-live="polite">
        {creators.length === 0 ? "No creators match." : `${creators.length} ${creators.length === 1 ? "creator" : "creators"}${q ? ` for “${q}”` : ""}`}
      </p>

      {creators.length === 0 ? (
        <div className="mt-10 rounded-[var(--radius-xl)] border border-line p-10 text-center md:p-16">
          <p className="font-display text-[32px] italic text-ivory">Nobody by that name — yet.</p>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-stone">Try a discipline or a city, or clear the filters to see the whole Circle.</p>
          <Link href="/discover" className="mt-6 inline-block rounded-full border border-line-strong px-5 py-2.5 text-[14px] text-ivory hover:border-gold/60">Clear filters</Link>
        </div>
      ) : (
        <>
          {lead.length > 0 && (
            <section aria-label="Featured" className="mt-8 grid gap-x-6 gap-y-12 md:grid-cols-12">
              <div className="md:col-span-6"><CreatorPlate c={lead[0]} size="hero" /></div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:col-span-6 md:grid-cols-2 md:gap-x-6 md:self-end">
                <div className="md:mt-0"><CreatorPlate c={lead[1]} delay={0.08} /></div>
                <div className="md:-mt-24"><CreatorPlate c={lead[2]} delay={0.16} /></div>
              </div>
            </section>
          )}
          <section aria-label={editorial ? "More creators" : "Results"} className={cn("grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-4 md:gap-x-6", lead.length ? "mt-20 md:mt-28" : "mt-8")}>
            {rest.map((c, i) => (
              <div key={c.id} className={cn(editorial && i % 4 === 1 && "md:mt-16", editorial && i % 4 === 3 && "md:mt-8")}>
                <CreatorPlate c={c} delay={(i % 4) * 0.06} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "block whitespace-nowrap rounded-full border px-4 py-2 text-[13px] transition-colors duration-[260ms]",
        active ? "border-gold/60 bg-gold/[0.1] text-gold-soft" : "border-line-strong text-stone hover:border-ivory/30 hover:text-ivory",
      )}
    >
      {children}
    </Link>
  );
}
