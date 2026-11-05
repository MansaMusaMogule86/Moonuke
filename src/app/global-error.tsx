"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Self-contained: no fonts, no data. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-ink text-ivory">
        <main id="main" className="flex min-h-[100svh] items-center justify-center px-5 text-center">
          <div className="max-w-md">
            <h1 className="text-[32px] leading-tight">Something went wrong.</h1>
            <p className="mt-4 text-[15px] text-stone">Please try again in a moment.</p>
            {error.digest && <p className="mt-3 text-[12px] text-ash">Reference: <code>{error.digest}</code></p>}
            <button type="button" onClick={() => reset()} className="mt-8 rounded-full bg-gold px-6 py-3 text-[15px] text-ink">
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
