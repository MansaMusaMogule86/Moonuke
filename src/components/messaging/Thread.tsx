"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, Submit } from "@/components/forms";
import { ReportButton } from "@/components/club/SafetyButtons";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/forms";
import { sendMessageAction } from "@/server/actions/messaging";
import type { ChatMessage } from "@/server/services/messaging";

const MAX = 2000;
const POLL_MS = 4000;
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Conversation view. New messages arrive by polling a participant-only
 * endpoint while the tab is visible (near-real-time; no websockets yet).
 */
export function Thread({ conversationId, initial, canSend, blockedReason, peerName }: { conversationId: string; initial: ChatMessage[]; canSend: boolean; blockedReason: string | null; peerName: string }) {
  const [messages, setMessages] = useState(initial);
  const [state, action] = useActionState(sendMessageAction, idle);
  const [draft, setDraft] = useState("");
  const [clientKey, setClientKey] = useState(newKey);
  const list = useRef<HTMLOListElement>(null);
  const last = messages[messages.length - 1]?.at;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const draftRef = useRef(draft);
  draftRef.current = draft;

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

  // After a send: append, clear the draft, rotate the idempotency key.
  useEffect(() => {
    if (state.status === "success" && state.data?.id) {
      const id = state.data.id;
      setMessages((m) => (m.some((x) => x.id === id) ? m : [...m, { id, mine: true, body: draftRef.current, status: state.data!.status as ChatMessage["status"], at: new Date().toISOString() }]));
      setDraft("");
      setClientKey(newKey());
    } else if (state.status === "error" && state.values?.body !== undefined) {
      setDraft(state.values.body);
    }
  }, [state]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [last]);

  return (
    <div className="flex min-h-[60svh] flex-col">
      {messages.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-ash">No messages yet. Say hello.</p>
      ) : (
        <ol ref={list} aria-label={`Conversation with ${peerName}`} aria-live="polite" className="flex-1 space-y-3 py-6">
          {messages.map((m) => (
            <li key={m.id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
              <div className={cn("group max-w-[85%] rounded-[var(--radius-lg)] px-4 py-3 md:max-w-[70%]", m.mine ? "bg-gold/[0.12] text-ivory" : "border border-line bg-ink-2 text-ivory")}>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="text-[11px] text-ash">
                    <span className="sr-only">{m.mine ? "You" : peerName}, </span>
                    {time(m.at)}
                    {m.status === "held" && " · being checked by the house"}
                  </p>
                  {!m.mine && m.status === "sent" && <ReportButton targetType="message" targetId={m.id} label="message" compact />}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] border-t border-line bg-ink/95 py-4 backdrop-blur md:bottom-0">
        {canSend ? (
          <form action={action} className="space-y-2" noValidate>
            <FormMessage state={state} />
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="clientKey" value={clientKey} />
            <label htmlFor="msg-body" className="sr-only">Message {peerName}</label>
            <div className="flex items-end gap-3">
              <textarea
                id="msg-body"
                name="body"
                rows={2}
                maxLength={MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Write a message"
                aria-describedby="msg-help"
                className="min-h-[52px] flex-1 resize-none rounded-[var(--radius-md)] border border-line-strong bg-ink/40 px-4 py-3 text-[16px] text-ivory placeholder:text-ash outline-none focus:border-gold"
              />
              <Submit className="h-[52px] px-5">Send</Submit>
            </div>
            <p id="msg-help" className="flex justify-between text-[11px] text-ash">
              <span>Text only for now. Links and contact details can&apos;t be shared.</span>
              <span aria-hidden>{draft.length}/{MAX}</span>
            </p>
          </form>
        ) : (
          <p className="text-[14px] text-stone">{blockedReason}</p>
        )}
      </div>
    </div>
  );
}
