"use client";

import { useActionState } from "react";
import { FormMessage, Select, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { ageScopeAction, removeRuleAction, setRuleAction } from "@/server/actions/access";

const small = "h-10 px-4 text-[13px]";

export function RuleForm() {
  const [state, action] = useActionState(setRuleAction, idle);
  const v = state.status === "success" ? {} : state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Country (2 letters, XX = unknown)" name="country" maxLength={2} defaultValue={v.country} error={state.fields?.country} />
        <Select key={`r-${v.rule ?? ""}`} label="Rule" name="rule" defaultValue={v.rule ?? ""} error={state.fields?.rule}>
          <option value="" disabled>Choose one</option>
          <option value="age_assurance">Require an age check</option>
          <option value="block">Not available</option>
        </Select>
        <Field label="Note (law or reason)" name="note" maxLength={300} defaultValue={v.note} />
      </div>
      <Submit variant="outline" className={small}>Save rule</Submit>
    </form>
  );
}

export function RemoveRule({ country }: { country: string }) {
  const [state, action] = useActionState(removeRuleAction, idle);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action}>
      <input type="hidden" name="country" value={country} />
      <Submit variant="ghost" className={small}>Remove</Submit>
    </form>
  );
}

export function AgeScope({ scope }: { scope: "listed" | "everywhere" }) {
  const [state, action] = useActionState(ageScopeAction, idle);
  const current = state.data?.scope ?? scope;
  return (
    <form action={action} className="space-y-3">
      <p className="text-[14px] text-stone">Age checks will apply to: <strong className="text-ivory">{current === "everywhere" ? "everyone" : "listed countries only"}</strong></p>
      <Submit name="scope" value={current === "everywhere" ? "listed" : "everywhere"} variant="outline" className={small}>
        {current === "everywhere" ? "Listed countries only" : "Everyone"}
      </Submit>
      <FormMessage state={state} />
    </form>
  );
}
