"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals items from `target` one at a time, every `intervalMs`, even when many
 * arrive at once (a batch from the agent or the final bulk payload). Returns the
 * currently visible slice and whether it is still catching up.
 */
export function useStaggeredReveal<T>(target: T[], intervalMs = 350) {
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If the target shrank/reset (new research run), snap back.
    if (target.length < count) {
      setCount(target.length);
      return;
    }
    if (count >= target.length) return;

    timer.current = setTimeout(() => setCount((c) => Math.min(c + 1, target.length)), intervalMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [target.length, count, intervalMs]);

  return { visible: target.slice(0, count), revealing: count < target.length };
}
