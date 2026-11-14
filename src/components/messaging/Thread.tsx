"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { CheckoutButton } from "@/components/club/CheckoutButton";
import { ReportButton } from "@/components/club/SafetyButtons";
import { FormMessage, Submit } from "@/components/forms";
import { LockGlyph } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/forms";
import { sendMessageAction } from "@/server/actions/messaging";
import type { ChatMessage } from "@/server/services/messaging";

const MAX = 2000;
const POLL_MS = 4000;
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MEDIA_KIND_LABELS: Record<string, string> = {
  text: "Exclusive Note",
  image: "Exclusive Photo",
  set: "Exclusive Photo Set",
  video: "Exclusive Video Note",
  audio: "Exclusive Voice Note",
};

/**
 * Conversation view.
 * Locked paid messages sent by a creator never include `body` from the server
 * until unlocked; unlocking via CheckoutButton re-fetches `/api/messages/[id]`
 * and reveals the full message in place.
 */
export function Thread({
  conversationId,
  initial,
  canSend,
  blockedReason,
  peerName,
  side = "fan",
}: {
  conversationId: string;
  initial: ChatMessage[];
  canSend: boolean;
  blockedReason: string | null;
  peerName: string;
  side?: "fan" | "creator";
}) {
  const [messages, setMessages] = useState(initial);
  const [state, action] = useActionState(sendMessageAction, idle);
  const [draft, setDraft] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [priceDollars, setPriceDollars] = useState("8");
  const [mediaKind, setMediaKind] = useState<"text" | "image" | "set" | "video" | "audio">("text");
  const [clientKey, setClientKey] = useState(newKey);
  const list = useRef<HTMLOListElement>(null);
  const last = messages[messages.length - 1]?.at;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const refreshAllMessages = useCallback(async () => {
    const r = await fetch(`/api/messages/${conversationId}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const { messages: full } = (await r.json()) as { messages: ChatMessage[] };
    if (Array.isArray(full)) setMessages(full);
  }, [conversationId]);

  // Poll for new messages while visible.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const after = messagesRef.current[messagesRef.current.length - 1]?.at;
      const r = await fetch(`/api/messages/${conversationId}${after ? `?after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const { messages: fresh } = (await r.json()) as { messages: ChatMessage[] };
      if (fresh.length) setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    };
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [conversationId]);

  // After a send: refresh messages, clear the draft, rotate the idempotency key.
  useEffect(() => {
    if (state.status === "success" && state.data?.id) {
      setDraft("");
      setPreviewText("");
      setIsPaid(false);
      setClientKey(newKey());
      void refreshAllMessages();
    } else if (state.status === "error" && state.values?.body !== undefined) {
      setDraft(state.values.body);
    }
  }, [state, refreshAllMessages]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [last]);

  return (
    <div className="flex min-h-[60svh] flex-col">
      {messages.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-ash">No messages yet. Say hello.</p>
      ) : (
        <ol ref={list} aria-label={`Conversation with ${peerName}`} aria-live="polite" className="flex-1 space-y-4 py-6">
          {messages.map((m) => {
            const isPaidMessage = m.priceCents != null;
            const isLocked = isPaidMessage && !m.unlocked;
            const kindBadge = MEDIA_KIND_LABELS[m.mediaKind ?? "text"] ?? "Exclusive Message";

            return (
              <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                {isLocked ? (
                  <div className="w-full max-w-[92%] rounded-[var(--radius-lg)] border border-gold/45 bg-[radial-gradient(ellipse_at_20%_0%,rgba(201,164,107,0.16),transparent_70%),#130f18] p-5 text-ivory shadow-[0_16px_40px_-20px_rgba(0,0,0,0.85)] md:max-w-[74%]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/[0.1] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gold-soft">
                        <LockGlyph className="h-3.5 w-3.5" />
                        {kindBadge}
                      </span>
                      <span className="font-display text-[22px] text-gold-soft">{m.priceLabel}</span>
                    </div>

                    <p className="mt-3 text-[14px] leading-relaxed text-ivory/90">
                      {m.previewText ?? "Exclusive message from this creator."}
                    </p>
                    <p className="mt-1.5 text-[12px] text-stone">
                      Locked paid message from <strong className="text-ivory">{peerName}</strong>. Unlock once to reveal the full message permanently.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
                      <CheckoutButton
                        target={{ kind: "message", id: m.id }}
                        size="sm"
                        variant="gold"
                        onUnlocked={() => {
                          void refreshAllMessages();
                        }}
                      >
                        Unlock message for {m.priceLabel}
                      </CheckoutButton>
                      <span className="text-[11px] text-ash">{time(m.at)}</span>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "group max-w-[85%] rounded-[var(--radius-lg)] px-4 py-3.5 md:max-w-[72%]",
                      isPaidMessage
                        ? "border border-emerald-500/35 bg-emerald-500/[0.06] text-ivory"
                        : m.mine
                          ? "bg-gold/[0.14] text-ivory"
                          : "border border-line bg-ink-2 text-ivory",
                    )}
                  >
                    {isPaidMessage && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300">
                          {m.mine ? `Paid Message · ${m.priceLabel}` : `Unlocked · ${m.priceLabel}`}
                        </span>
                        <span className="text-[11px] text-stone">{kindBadge}</span>
                      </div>
                    )}
                    {isPaidMessage && m.previewText && (
                      <p className="mb-1.5 text-[12px] italic text-stone">Preview: {m.previewText}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-ash">
                        <span className="sr-only">{m.mine ? "You" : peerName}, </span>
                        {time(m.at)}
                        {m.status === "held" && " · being checked by the house"}
                      </p>
                      {!m.mine && m.status === "sent" && (
                        <ReportButton targetType="message" targetId={m.id} label="message" compact />
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] border-t border-line bg-ink/95 py-4 backdrop-blur md:bottom-0">
        {canSend ? (
          <form action={action} className="space-y-3" noValidate>
            <FormMessage state={state} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="clientKey" value={clientKey} />
            {side === "creator" && (
              <div className="rounded-[var(--radius-md)] border border-line bg-obsidian/60 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-ivory">
                  <span className="font-medium">Send as locked paid message</span>
                  <input
                    type="checkbox"
                    name="isPaid"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="h-4 w-4 accent-[#c9a46b]"
                  />
                </label>
                {isPaid && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="msg-preview" className="block text-[11px] uppercase tracking-[0.16em] text-stone">
                        Safe preview shown before purchase
                      </label>
                      <input
                        id="msg-preview"
                        name="previewText"
                        type="text"
                        maxLength={280}
                        value={previewText}
                        onChange={(e) => setPreviewText(e.target.value)}
                        placeholder="e.g. Backstage acoustic note & lyrics sheet"
                        className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line-strong bg-ink px-3 text-[13px] text-ivory placeholder:text-ash focus:border-gold focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="msg-price" className="block text-[11px] uppercase tracking-[0.16em] text-stone">
                          Price ($ USD)
                        </label>
                        <input
                          id="msg-price"
                          name="priceDollars"
                          type="number"
                          min={1}
                          max={1000}
                          value={priceDollars}
                          onChange={(e) => setPriceDollars(e.target.value)}
                          className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line-strong bg-ink px-3 text-[13px] text-ivory focus:border-gold focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="msg-kind" className="block text-[11px] uppercase tracking-[0.16em] text-stone">
                          Type
                        </label>
                        <select
                          id="msg-kind"
                          name="mediaKind"
                          value={mediaKind}
                          onChange={(e) => setMediaKind(e.target.value as typeof mediaKind)}
                          className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-line-strong bg-ink px-2 text-[13px] text-ivory focus:border-gold focus:outline-none"
                        >
                          <option value="text">Note</option>
                          <option value="image">Photo</option>
                          <option value="set">Photo Set</option>
                          <option value="video">Video</option>
                          <option value="audio">Voice</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <label htmlFor="msg-body" className="sr-only">
              Message {peerName}
            </label>
            <div className="flex items-end gap-3">
              <textarea
                id="msg-body"
                name="body"
                rows={2}
                maxLength={MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && draft.trim() && !isPaid) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={isPaid ? "Write the exclusive unlocked message content…" : `Write a message to ${peerName}…`}
                aria-describedby="msg-help"
                className="min-h-[52px] flex-1 resize-none rounded-[var(--radius-md)] border border-line-strong bg-ink/40 px-4 py-3 text-[16px] text-ivory placeholder:text-ash outline-none focus:border-gold"
              />
              <Submit className="h-[52px] px-5">{isPaid ? `Send ($${priceDollars || "0"})` : "Send"}</Submit>
            </div>
            <p id="msg-help" className="flex justify-between text-[11px] text-ash">
              <span>Links and external contact details cannot be shared.</span>
              <span aria-hidden>
                {draft.length}/{MAX}
              </span>
            </p>
          </form>
        ) : (
          <p className="text-[14px] text-stone">{blockedReason}</p>
        )}
      </div>
    </div>
  );
}
