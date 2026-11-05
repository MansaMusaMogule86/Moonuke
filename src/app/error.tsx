"use client";

import { useEffect, useRef } from "react";
import { ErrorShell } from "@/components/layout/ErrorShell";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary. Shows only the opaque digest (which matches the
 * server log line), never the message or stack, which could leak internals.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div ref={heading} tabIndex={-1} className="outline-none">
      <ErrorShell eyebrow="Something went wrong" title={<>A moment, <em className="text-metal">please.</em></>}>
        <p>We couldn&apos;t complete that. Nothing you entered was shared. Try again, or come back shortly.</p>
        {error.digest && <p className="text-[12px] text-ash">Reference: <code>{error.digest}</code></p>}
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button href="/" variant="outline">Return home</Button>
        </div>
      </ErrorShell>
    </div>
  );
}
