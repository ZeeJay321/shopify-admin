/**
 * One shared modal per page, opened for a chosen row: set the target, then
 * show the modal after React has rendered it with that target (so the
 * modal's onShow sees the new props).
 */

import { useEffect, useState } from "react";

type OverlayElement = HTMLElement & { showOverlay?: () => void };

export function useModalTarget<T>(modalId: string) {
  const [target, setTarget] = useState<T | null>(null);
  const [opens, setOpens] = useState(0);

  useEffect(() => {
    if (opens === 0) return;
    (
      document.getElementById(modalId) as OverlayElement | null
    )?.showOverlay?.();
  }, [opens, modalId]);

  return {
    target,
    open: (next: T) => {
      setTarget(next);
      setOpens((n) => n + 1);
    },
  };
}
