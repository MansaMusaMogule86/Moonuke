"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

/**
 * Bottom sheet built on Vaul (Radix Dialog underneath): focus trap,
 * Escape to close, drag-to-dismiss with velocity, scroll lock.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[2px]" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[80] mx-auto flex max-h-[92dvh] max-w-xl flex-col rounded-t-[28px] border border-b-0 border-line-strong bg-ink-2 outline-none"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        >
          <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-ivory/20" />
          <div className="px-6 pb-2 pt-5">
            <Drawer.Title className="font-display text-2xl text-ivory">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-1 text-sm text-stone">{description}</Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="overflow-y-auto px-6 pb-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
