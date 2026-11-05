import { brand } from "@/config/brand";
import Link from "next/link";
import type { ReactNode } from "react";
import { Symbol } from "@/components/brand/Symbol";
import { Wordmark } from "@/components/brand/Wordmark";
import { Portrait, type PortraitStudy } from "@/components/ui/Portrait";

/**
 * Two-panel editorial shell for sign-in, invitation and pending screens.
 * Desktop: lit eclipse plate on the left, form on the right. Mobile: form first.
 */
export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  study = { hair: "wrap", light: "left", tilt: -3, adorn: "hoops", glow: 0.95 },
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  study?: PortraitStudy;
}) {
  return (
    <div className="relative min-h-[100svh] overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-10 mx-auto flex h-[72px] max-w-[1600px] items-center px-5 md:px-10">
        <Link href="/" className="flex items-center gap-3 rounded-md">
            <span className="sr-only">{`${brand.name} home`}</span>
          <Symbol size={30} />
          <Wordmark decorative className="text-[15px]" />
        </Link>
      </header>
      <main id="main" className="mx-auto grid min-h-[100svh] max-w-[1600px] md:grid-cols-12">
        <div aria-hidden className="relative hidden md:col-span-6 md:block lg:col-span-7">
          <div className="absolute left-1/2 top-1/2 aspect-square w-[min(38vw,560px)] -translate-x-1/2 -translate-y-1/2">
            <div className="absolute -inset-[8%] rounded-full bg-[conic-gradient(from_210deg,rgb(232_204_145/0.45),rgb(214_181_109/0.04)_25%,rgb(168_139_69/0.2)_50%,rgb(214_181_109/0.02)_72%,rgb(241_220_170/0.5))] opacity-80 blur-2xl" />
            <div className="absolute -inset-[1.2%] rounded-full bg-[conic-gradient(from_200deg,#f1dcaa,#a88b45_25%,#2a2213_50%,#a88b45_75%,#f1dcaa)] opacity-75" />
            <div className="absolute inset-0 overflow-hidden rounded-full bg-ink">
              <Portrait
                alt=""
                study={study}
                className="absolute inset-x-[6%] bottom-[-22%] top-[22%] bg-transparent [mask-image:radial-gradient(closest-side,black_45%,transparent_100%)]"
              />
            </div>
            <div className="absolute left-[14.5%] top-[85.5%] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_24px_10px_rgb(255_246_223/0.55)]" />
          </div>
        </div>
        <div className="flex flex-col justify-center px-5 pb-16 pt-28 md:col-span-6 md:px-12 lg:col-span-5 lg:px-16">
          <p className="eyebrow mb-5">{eyebrow}</p>
          <h1 className="font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ivory md:text-[60px]">{title}</h1>
          {lede && <div className="mt-5 max-w-md text-[16px] leading-relaxed text-stone">{lede}</div>}
          <div className="mt-10 max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
