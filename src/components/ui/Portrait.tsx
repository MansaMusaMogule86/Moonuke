import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Stored cover settings for creators without a photo. The field names are
 * historical (they once drew a figure); they now only steer an abstract cover.
 */
export type PortraitStudy = {
  hair: "long" | "bun" | "crop" | "wrap";
  /** Side the light comes from. */
  light: "left" | "right";
  /** Angle of the light band, in degrees. */
  tilt?: number;
  /** Accent colour family. */
  adorn?: "hoops" | "crown" | "collar" | "none";
  /** Strength of the accent glow, 0–1. */
  glow?: number;
};

type PortraitProps = {
  /** Real photograph. When omitted an abstract cover is drawn. */
  src?: string;
  alt: string;
  study?: PortraitStudy;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

/**
 * Creator cover plate. Photos come from signed, short-lived media URLs; without
 * one, it draws an abstract cover — never a figure or a fake person.
 */
export function Portrait({ src, alt, study, className, priority, sizes = "(max-width: 768px) 80vw, 33vw" }: PortraitProps) {
  return (
    <div className={cn("relative overflow-hidden bg-ink-2", className)}>
      {src ? (
        <Image src={src} alt={alt} fill preload={priority} sizes={sizes} className="object-cover" />
      ) : (
        <Study alt={alt} {...(study ?? { hair: "long", light: "left" })} />
      )}
    </div>
  );
}

// Accent families: gold, pink, rose-gold and a cool plum, all from the palette.
const ACCENTS = {
  hoops: ["212 175 55", "245 213 138"],
  crown: ["255 45 150", "255 139 200"],
  collar: ["232 160 127", "212 175 55"],
  none: ["150 120 200", "255 139 200"],
} as const;
const SHAPES = { long: "38% 62%", bun: "50% 30%", crop: "62% 40%", wrap: "30% 45%" } as const;

export function Study({ alt, hair, light, tilt = 0, adorn = "none", glow = 0.6 }: PortraitStudy & { alt: string }) {
  const [a, b] = ACCENTS[adorn] ?? ACCENTS.none;
  const x = light === "left" ? "22%" : "78%";
  const strength = Math.min(1, Math.max(0.2, glow));
  return (
    <div
      {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
      className="absolute inset-0"
      style={{
        backgroundColor: "#121217",
        backgroundImage: [
          `radial-gradient(70% 55% at ${x} 18%, rgb(${a} / ${0.3 * strength}), transparent 70%)`,
          `radial-gradient(60% 50% at ${SHAPES[hair] ?? SHAPES.long}, rgb(${b} / ${0.2 * strength}), transparent 72%)`,
          `linear-gradient(${150 + tilt * 4}deg, transparent 40%, rgb(${a} / 0.08) 52%, transparent 64%)`,
          "linear-gradient(180deg, transparent 55%, rgb(5 5 5 / 0.7))",
        ].join(","),
      }}
    />
  );
}
