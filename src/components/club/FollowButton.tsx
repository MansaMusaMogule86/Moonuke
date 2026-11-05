"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { followAction } from "@/server/actions/club";

export function FollowButton({ creatorId, handle, following }: { creatorId: string; handle: string; following: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        size="lg"
        variant={optimistic ? "outline" : "ghost"}
        className={optimistic ? "" : "border border-line-strong"}
        aria-pressed={optimistic}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            setOptimistic(!optimistic);
            const r = await followAction(creatorId, !optimistic, handle);
            if (!r.ok) setError(r.message ?? "Something went wrong.");
          })
        }
      >
        {optimistic ? "Following" : "Follow"}
      </Button>
      {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
