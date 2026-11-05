"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { FormMessage, Select, Submit } from "@/components/forms";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { listAction } from "@/server/actions/blasts";

function useRefreshing() {
  const router = useRouter();
  const [state, action] = useActionState(async (p: Parameters<typeof listAction>[0], fd: FormData) => {
    const r = await listAction(p, fd);
    if (r.status === "success") router.refresh();
    return r;
  }, idle);
  return [state, action] as const;
}

export function NewList() {
  const [state, action] = useRefreshing();
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="intent" value="create" />
      <Field label="New list name" name="name" className="min-w-[220px] flex-1" error={state.fields?.name} />
      <Submit variant="outline">Create list</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

export function AddMember({ listId, options }: { listId: string; options: { id: string; alias: string }[] }) {
  const [state, action] = useRefreshing();
  if (options.length === 0) return <p className="text-[13px] text-ash">Everyone eligible is already on this list.</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="intent" value="add" />
      <input type="hidden" name="listId" value={listId} />
      <Select label="Add a member" name="fanId" className="min-w-[220px] flex-1">
        {options.map((o) => <option key={o.id} value={o.id}>{o.alias}</option>)}
      </Select>
      <Submit variant="ghost" className="h-11 px-4 text-[13px]">Add</Submit>
      <FormMessage state={state} className="w-full" />
    </form>
  );
}

export function RemoveMember({ listId, fanId, alias }: { listId: string; fanId: string; alias: string }) {
  const [, action] = useRefreshing();
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="remove" />
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="fanId" value={fanId} />
      <Submit variant="quiet" className="h-8 px-2 text-[12px]">Remove<span className="sr-only"> {alias}</span></Submit>
    </form>
  );
}

export function DeleteList({ listId, name }: { listId: string; name: string }) {
  const [, action] = useRefreshing();
  return (
    <form action={action}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="listId" value={listId} />
      <Submit variant="quiet" className="h-9 px-3 text-[13px]">Delete list<span className="sr-only"> {name}</span></Submit>
    </form>
  );
}
