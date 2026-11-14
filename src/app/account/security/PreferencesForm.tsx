"use client";

import { useActionState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { idle } from "@/lib/forms";
import { saveUserPreferencesAction } from "@/server/actions/fan";
import type { UserPreferences } from "@/server/services/fan";

export function PreferencesForm({ initial }: { initial: UserPreferences }) {
  const [state, action] = useActionState(saveUserPreferencesAction, idle);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-line bg-obsidian/50 p-4">
        <div>
          <p className="text-[14px] font-medium text-ivory">New posts from subscribed creators</p>
          <p className="mt-0.5 text-[12px] text-stone">
            Get notified when a Diva creator you subscribe to publishes a new post.
          </p>
        </div>
        <input
          type="checkbox"
          name="notifyNewPosts"
          defaultChecked={initial.notifyNewPosts}
          className="mt-1 h-4 w-4 accent-[#c9a46b]"
        />
      </label>

      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-line bg-obsidian/50 p-4">
        <div>
          <p className="text-[14px] font-medium text-ivory">Private messages & exclusive unlocks</p>
          <p className="mt-0.5 text-[12px] text-stone">
            Get notified when you receive a direct message or unlockable message from a creator.
          </p>
        </div>
        <input
          type="checkbox"
          name="notifyMessages"
          defaultChecked={initial.notifyMessages}
          className="mt-1 h-4 w-4 accent-[#c9a46b]"
        />
      </label>

      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-md)] border border-line bg-obsidian/50 p-4">
        <div>
          <p className="text-[14px] font-medium text-ivory">Subscription & purchase receipts</p>
          <p className="mt-0.5 text-[12px] text-stone">
            Receive confirmation notices for subscription renewals and individual unlocks.
          </p>
        </div>
        <input
          type="checkbox"
          name="notifyBilling"
          defaultChecked={initial.notifyBilling}
          className="mt-1 h-4 w-4 accent-[#c9a46b]"
        />
      </label>

      <div className="pt-1">
        <Submit variant="outline">Save notification preferences</Submit>
      </div>
    </form>
  );
}

