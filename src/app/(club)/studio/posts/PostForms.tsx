"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { FormMessage, Select, Submit, TextArea } from "@/components/forms";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { idle } from "@/lib/forms";
import { createPostAction, deletePostAction, updatePostAction } from "@/server/actions/studio";
import type { StudioPost } from "@/server/services/studio";

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → value for <input type="datetime-local"> in the viewer's own time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Composer for a new or existing post. Every rule is re-checked on the server. */
export function PostComposer({ post }: { post?: StudioPost }) {
  const [state, action] = useActionState(post ? updatePostAction : createPostAction, idle);
  const router = useRouter();
  const v = state.values;
  const [access, setAccess] = useState(v?.access ?? post?.access ?? "members");
  const [kind, setKind] = useState(v?.mediaKind ?? post?.mediaKind ?? "image");
  const initialPublish = v?.publish ?? (post ? (post.state === "draft" ? "draft" : post.state === "scheduled" ? "schedule" : "now") : "draft");
  const [publish, setPublish] = useState(initialPublish);
  const [local, setLocal] = useState(v?.scheduleLocal ?? toLocalInput(post?.state === "scheduled" ? post.publishedAt : null));
  const scheduleIso = local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : "";
  const publishId = useId();
  const locked = !!post?.purchased;

  if (state.status === "success") {
    return (
      <div className="space-y-4" data-testid="post-saved">
        <FormMessage state={state} />
        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="outline" onClick={() => router.push("/studio/posts")}>Back to posts</Button>
          {!post && (
            <Button size="sm" variant="ghost" onClick={() => router.push(`/studio/posts/${state.data?.id}`)}>Edit this post</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-7" noValidate>
      <FormMessage state={state} />
      {post && <input type="hidden" name="id" value={post.id} />}
      {locked && (
        <p className="rounded-[var(--radius-md)] border border-line bg-ink/40 px-4 py-3 text-[13px] text-stone">
          Members have bought this post, so who can see it and when it was published are fixed. You can still edit the words and the price for future buyers.
        </p>
      )}
      <Field label="Teaser" name="teaser" defaultValue={v?.teaser ?? post?.teaser} maxLength={140} required hint="Shown to everyone who can see your profile, even before they unlock." error={state.fields?.teaser} />
      <TextArea label="Post" name="body" rows={7} maxLength={5000} defaultValue={v?.body ?? post?.body} hint="Only people with access see this." error={state.fields?.body} />
      <div className="grid gap-7 sm:grid-cols-2">
        <Select label="Who can see it" name="access" value={access} onChange={(e) => setAccess(e.target.value as typeof access)} disabled={locked} error={state.fields?.access}>
          <option value="preview">Everyone who can see your profile</option>
          <option value="members">Members</option>
          <option value="vip">VIP members</option>
          <option value="ppv">Sold individually (pay per view)</option>
        </Select>
        {locked && <input type="hidden" name="access" value={access} />}
        {access === "ppv" ? (
          <Field label="Price (USD)" name="price" inputMode="decimal" defaultValue={v?.price ?? (post?.priceCents != null ? (post.priceCents / 100).toFixed(2) : "")} placeholder="12.00" hint="Payments aren't active yet — no one is charged." error={state.fields?.price} />
        ) : (
          <div />
        )}
        <Select label="Format" name="mediaKind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} error={state.fields?.mediaKind}>
          <option value="image">Single image</option>
          <option value="set">Set</option>
          <option value="video">Video</option>
        </Select>
        {kind === "set" ? (
          <Field label="Pieces in the set" name="mediaCount" type="number" min={2} max={50} defaultValue={v?.mediaCount ?? (post?.mediaKind === "set" ? String(post.mediaCount) : "6")} error={state.fields?.mediaCount} />
        ) : (
          <div />
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ash">Uploads aren&apos;t available yet. Posts show a placeholder study until media storage is approved.</p>

      <fieldset aria-describedby={`${publishId}-h`}>
        <legend className="eyebrow mb-3 text-stone">When</legend>
        <p id={`${publishId}-h`} className="sr-only">Choose whether to keep this as a draft, publish it now, or schedule it.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {([
            ["draft", "Keep as draft"],
            ["now", post?.state === "published" ? "Published" : "Publish now"],
            ["schedule", "Schedule"],
          ] as const).map(([val, label]) => (
            <label key={val} className="flex items-center gap-2 text-[15px] text-ivory">
              <input type="radio" name="publish" value={val} checked={publish === val} onChange={() => setPublish(val)} disabled={locked && val !== "now"} className="h-4 w-4 accent-gold" />
              {label}
            </label>
          ))}
        </div>
        {state.fields?.publish && <p role="alert" className="mt-2 text-[13px] text-danger">{state.fields.publish}</p>}
      </fieldset>
      {publish === "schedule" && (
        <>
          <Field label="Publish at (your local time)" name="scheduleLocal" type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} error={state.fields?.scheduleAt} />
          <input type="hidden" name="scheduleAt" value={scheduleIso} />
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <Submit>{post ? "Save changes" : publish === "now" ? "Publish" : publish === "schedule" ? "Schedule" : "Save draft"}</Submit>
        <Link href="/studio/posts" className="inline-flex h-11 items-center px-3 text-[14px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory">Cancel</Link>
      </div>
    </form>
  );
}

/** Two-step delete. Bought posts can't be deleted (enforced on the server and in the database). */
export function DeletePost({ id, purchased }: { id: string; purchased: boolean }) {
  const [state, action] = useActionState(deletePostAction, idle);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  if (purchased) return <p className="text-[13px] text-ash">This post has been bought, so it can&apos;t be deleted.</p>;
  if (state.status === "success") {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <Button size="sm" variant="outline" onClick={() => router.push("/studio/posts")}>Back to posts</Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FormMessage state={state} />
      {!confirming ? (
        <Button type="button" variant="quiet" size="sm" onClick={() => setConfirming(true)}>Delete post…</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-ivory">Delete this post for good?</p>
          <input type="hidden" name="confirm" value="yes" />
          <Submit variant="outline">Yes, delete</Submit>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
        </div>
      )}
    </form>
  );
}
