import { ErrorShell } from "@/components/layout/ErrorShell";
import { Button } from "@/components/ui/Button";

// Deliberately identical for "doesn't exist" and "not allowed": a 404 never
// confirms that a private profile, post or admin page exists.
export function NotFoundContent({ inShell = false }: { inShell?: boolean }) {
  return (
    <ErrorShell inShell={inShell} eyebrow="404" title={<>Page <em className="text-metal">not found.</em></>}>
      <p>The page may have moved, or it may be private.</p>
      <Button href="/">Return home</Button>
    </ErrorShell>
  );
}
