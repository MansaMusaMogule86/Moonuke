import "server-only";
import type { Viewer } from "@/server/auth/permissions";
import { env } from "@/server/env";
import { createSession, resolveSession, revokeAllSessions, revokeSession } from "@/server/services/sessions";

/**
 * Authentication provider seam for the planned Supabase Auth migration
 * (docs/supabase-auth-migration.md). Everything that needs "who is this?"
 * goes through resolveSession → Viewer, which already carries role, status,
 * MFA and AAL; authorization (can(), RLS via asViewer) is independent of how
 * identity was established, so swapping providers doesn't touch it.
 *
 * Only "own" is implemented. "supabase" is a stub that refuses: switching
 * needs the §10 answers and owner approval (A3), and production refuses
 * AUTH_PROVIDER=supabase in env.ts.
 */
export interface AuthProvider {
  readonly id: "own" | "supabase";
  resolve(token: string | null | undefined): Promise<Viewer | null>;
  create(userId: string, userAgent: string | null): Promise<string>;
  revoke(token: string): Promise<void>;
  revokeAll(userId: string): Promise<void>;
}

const own: AuthProvider = {
  id: "own",
  resolve: (t) => resolveSession(t),
  create: (u, ua) => createSession(u, ua),
  revoke: async (t) => {
    await revokeSession(t);
  },
  revokeAll: async (u) => {
    await revokeAllSessions(u);
  },
};

const supabaseStub: AuthProvider = {
  id: "supabase",
  resolve: async () => {
    throw new Error("Supabase Auth is prepared but not enabled (A3).");
  },
  create: async () => {
    throw new Error("Supabase Auth is prepared but not enabled (A3).");
  },
  revoke: async () => {
    throw new Error("Supabase Auth is prepared but not enabled (A3).");
  },
  revokeAll: async () => {
    throw new Error("Supabase Auth is prepared but not enabled (A3).");
  },
};

export function authProvider(): AuthProvider {
  return env().AUTH_PROVIDER === "supabase" ? supabaseStub : own;
}
