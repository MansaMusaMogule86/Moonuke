"use client";

import { useEffect, useRef } from "react";
import { rememberRecruitmentAction } from "@/server/actions/creators";
import { idle } from "@/lib/forms";

/**
 * Remembers a validated recruitment code in a cookie so it survives until
 * the house issues an invitation and the creator applies. One shot per page
 * view; failures are silent because the code can also be entered by hand.
 */
export function RememberRecruitment({ code }: { code: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const fd = new FormData();
    fd.set("recruitCode", code);
    rememberRecruitmentAction(idle, fd).catch(() => {});
  }, [code]);
  return null;
}
