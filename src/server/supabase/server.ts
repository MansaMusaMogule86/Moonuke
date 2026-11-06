import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/server/env";

/**
 * Server-side Supabase client (prepared, NOT used).
 *
 * The app's sign-in, sessions and database stay on the current implementation
 * while AUTH_PROVIDER=own. This factory refuses to run until the owner
 * approves the switch (A3) and AUTH_PROVIDER=supabase is set, which production
 * also refuses today (productionProblems). See docs/supabase-auth-migration.md.
 *
 * There is deliberately no browser client: every read and write stays on the
 * server, behind requireViewer() and RLS through asViewer().
 */
export async function supabaseServer() {
  const e = env();
  if (e.AUTH_PROVIDER !== "supabase") throw new Error("Supabase isn't active (AUTH_PROVIDER=own). The switch needs approval (A3).");
  if (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Supabase URL and publishable key are not configured.");
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there.
        }
      },
    },
  });
}
