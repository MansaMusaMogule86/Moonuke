"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { confirmEmailAction } from "@/server/actions/auth";

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmailAction.bind(null, token), idle);
  if (state.status === "success") {
    return (
      <div className="space-y-6">
        <FormMessage state={state} />
        <Link href="/signin" className="text-[14px] text-gold-soft underline underline-offset-4">Go to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <Submit className="w-full">Confirm my email</Submit>
    </form>
  );
}
