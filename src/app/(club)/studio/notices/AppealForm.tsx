"use client";

import { useActionState } from "react";
import { FormMessage, Submit, TextArea } from "@/components/forms";
import { idle } from "@/lib/forms";
import { fileAppealAction } from "@/server/actions/compliance";

export function AppealForm({ noticeId }: { noticeId: string }) {
  const [state, action] = useActionState(fileAppealAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="noticeId" value={noticeId} />
      <TextArea label="Why should this decision change?" name="body" rows={4} maxLength={2000} defaultValue={state.values?.body} error={state.fields?.body} hint="You can appeal each decision once." />
      <Submit variant="outline" className="h-10 px-4 text-[13px]">Send appeal</Submit>
    </form>
  );
}
