const words = ["Members only", "Known by alias", "Invited creators", "Locked means locked", "Adults only", "Private vault"];

/** A slow, quiet ribbon between the hero and the Circle. Paused under reduced motion. */
export function Ribbon() {
  const row = [...words, ...words];
  return (
    <div aria-hidden className="relative overflow-hidden border-y border-line py-5">
      <div className="mk-marquee flex w-max gap-12 whitespace-nowrap">
        {row.map((w, i) => (
          <span key={i} className="flex items-center gap-12 font-display text-[20px] italic text-stone md:text-[26px]">
            {w}
            <span className="h-1 w-1 rounded-full bg-gold" />
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink to-transparent" />
    </div>
  );
}
