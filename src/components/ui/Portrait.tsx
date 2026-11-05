import Image from "next/image";
import { useId } from "react";
import { cn } from "@/lib/cn";

export type PortraitStudy = {
  /** Hair silhouette. */
  hair: "long" | "bun" | "crop" | "wrap";
  /** Which side the key light comes from. */
  light: "left" | "right";
  /** Head tilt in degrees. */
  tilt?: number;
  /** Gold adornment. */
  adorn?: "hoops" | "crown" | "collar" | "none";
  /** Warmth of the background glow, 0–1. */
  glow?: number;
};

type PortraitProps = {
  /** Real editorial photograph. When omitted a chiaroscuro study is drawn. */
  src?: string;
  alt: string;
  study?: PortraitStudy;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

/**
 * Portrait plate. Production uses signed, short-lived media URLs (see Phase 5);
 * until real photography is commissioned it renders a lit "study" in the
 * house style — dark figure, single key light, a trace of gold.
 */
export function Portrait({ src, alt, study, className, priority, sizes = "(max-width: 768px) 80vw, 33vw" }: PortraitProps) {
  return (
    <div className={cn("relative overflow-hidden bg-ink-2", className)}>
      {src ? (
        <Image src={src} alt={alt} fill priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <Study alt={alt} {...(study ?? { hair: "long", light: "left" })} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_10%,transparent_40%,rgb(5_5_5/0.75)_100%)]" />
    </div>
  );
}

export function Study({ alt, hair, light, tilt = 0, adorn = "none", glow = 0.6 }: PortraitStudy & { alt: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lx = light === "left" ? 0.18 : 0.82;
  const rimX1 = light === "left" ? 0 : 1;
  const rimX2 = light === "left" ? 1 : 0;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id={`bg-${id}`} cx={lx} cy="0.3" r="0.9">
          <stop offset="0" stopColor="#3a2f1a" stopOpacity={glow} />
          <stop offset="0.45" stopColor="#14110c" stopOpacity="1" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <linearGradient id={`skin-${id}`} x1={rimX1} y1="0" x2={rimX2} y2="0">
          <stop offset="0" stopColor="#6d5a3c" />
          <stop offset="0.16" stopColor="#2a2219" />
          <stop offset="0.55" stopColor="#0e0c0a" />
          <stop offset="1" stopColor="#070707" />
        </linearGradient>
        <linearGradient id={`rim-${id}`} x1={rimX1} y1="0" x2={rimX2} y2="0">
          <stop offset="0" stopColor="#f1dcaa" stopOpacity="0.95" />
          <stop offset="0.3" stopColor="#d6b56d" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#d6b56d" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`hair-${id}`} x1={rimX1} y1="0" x2={rimX2} y2="0.4">
          <stop offset="0" stopColor="#3b2f20" />
          <stop offset="0.25" stopColor="#120f0b" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={`gold-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6f33" />
          <stop offset="0.45" stopColor="#f1dcaa" />
          <stop offset="1" stopColor="#a88b45" />
        </linearGradient>
        <filter id={`soft-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
        <filter id={`haze-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>

      <rect width="300" height="400" fill={`url(#bg-${id})`} />
      {/* key light haze */}
      <ellipse cx={lx * 300} cy="120" rx="90" ry="140" fill="#d6b56d" opacity={0.1 * glow} filter={`url(#haze-${id})`} />

      <g transform={`rotate(${tilt} 150 200)`}>
        {/* hair behind */}
        {hair === "long" && (
          <path d="M92 150 C 80 70, 220 60, 208 150 C 214 230, 232 300, 246 360 L 54 360 C 70 300, 86 230, 92 150 Z" fill={`url(#hair-${id})`} />
        )}
        {hair === "bun" && <circle cx="150" cy="70" r="30" fill={`url(#hair-${id})`} />}

        {/* shoulders */}
        <path
          d="M18 420 C 26 330, 84 292, 126 276 L 174 276 C 216 292, 274 330, 282 420 Z"
          fill={`url(#skin-${id})`}
        />
        {/* neck */}
        <path d="M128 205 C 130 240, 126 262, 120 282 L 180 282 C 174 262, 170 240, 172 205 Z" fill={`url(#skin-${id})`} />
        {/* neck shadow under jaw */}
        <ellipse cx="150" cy="222" rx="30" ry="12" fill="#050505" opacity="0.7" filter={`url(#soft-${id})`} />
        {/* head */}
        <ellipse cx="150" cy="150" rx="50" ry="66" fill={`url(#skin-${id})`} />

        {/* hair front */}
        {hair === "long" && (
          <path d="M100 146 C 96 90, 140 76, 160 84 C 190 90, 206 112, 202 150 C 190 118, 168 104, 140 106 C 118 110, 106 126, 100 146 Z" fill={`url(#hair-${id})`} />
        )}
        {hair === "bun" && (
          <path d="M100 140 C 98 96, 128 82, 150 82 C 176 82, 204 98, 200 140 C 188 110, 170 100, 150 100 C 128 100, 110 112, 100 140 Z" fill={`url(#hair-${id})`} />
        )}
        {hair === "crop" && (
          <path d="M100 136 C 96 92, 126 80, 152 80 C 182 80, 206 98, 200 136 C 192 114, 176 104, 150 104 C 126 104, 108 114, 100 136 Z" fill={`url(#hair-${id})`} />
        )}
        {hair === "wrap" && (
          <>
            <path d="M96 132 C 92 70, 208 70, 204 132 C 196 108, 104 108, 96 132 Z" fill={`url(#hair-${id})`} />
            {[0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={`M${100 + i * 1} ${122 - i * 9} C 120 ${100 - i * 9}, 180 ${100 - i * 9}, ${200 - i} ${122 - i * 9}`}
                fill="none"
                stroke={`url(#gold-${id})`}
                strokeWidth="1.1"
                opacity={0.75 - i * 0.08}
              />
            ))}
          </>
        )}

        {/* rim light along the lit edge */}
        <ellipse cx="150" cy="150" rx="50" ry="66" fill="none" stroke={`url(#rim-${id})`} strokeWidth="2.2" />
        <path
          d="M18 420 C 26 330, 84 292, 126 276 M 174 276 C 216 292, 274 330, 282 420"
          fill="none"
          stroke={`url(#rim-${id})`}
          strokeWidth="1.6"
        />

        {/* gold adornment */}
        {adorn === "hoops" && (
          <>
            <circle cx="100" cy="186" r="11" fill="none" stroke={`url(#gold-${id})`} strokeWidth="1.6" />
            <circle cx="200" cy="186" r="11" fill="none" stroke={`url(#gold-${id})`} strokeWidth="1.6" opacity="0.55" />
          </>
        )}
        {adorn === "collar" && (
          <>
            <path d="M118 282 C 132 304, 168 304, 182 282" fill="none" stroke={`url(#gold-${id})`} strokeWidth="1.4" />
            <path d="M112 288 C 130 318, 170 318, 188 288" fill="none" stroke={`url(#gold-${id})`} strokeWidth="1" opacity="0.6" />
            <circle cx="150" cy="314" r="2.4" fill="#f1dcaa" />
          </>
        )}
        {adorn === "crown" && (
          <path
            d="M106 98 L 118 78 L 132 92 L 150 70 L 168 92 L 182 78 L 194 98"
            fill="none"
            stroke={`url(#gold-${id})`}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        )}
      </g>
    </svg>
  );
}
