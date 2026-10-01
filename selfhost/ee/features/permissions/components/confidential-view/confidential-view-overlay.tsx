// Self-hosted implementation (AGPL). Confidential view: the document is
// blurred except for a spotlight around the pointer (or finger), which makes
// screenshots and over-the-shoulder reading of whole pages harder. The overlay
// never takes pointer events, so navigation keeps working underneath.
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const SPOTLIGHT_RADIUS = 140;
const NAVBAR_HEIGHT = 64;

export function ConfidentialViewOverlay({
  navbarAbove,
  rotation = 0,
}: {
  navbarAbove?: boolean;
  rotation?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const update = (clientX: number, clientY: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      setPoint({ x: clientX - rect.left, y: clientY - rect.top });
    };
    const onMouseMove = (e: MouseEvent) => update(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) update(touch.clientX, touch.clientY);
    };
    const onLeave = () => setPoint(null);

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  // The mask is transparent (content visible) inside the spotlight and opaque
  // (blur applied) everywhere else.
  const mask = point
    ? `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${point.x}px ${point.y}px, transparent 0, transparent 70%, black 100%)`
    : undefined;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-confidential-view
      data-rotation={rotation}
      className={cn(
        "pointer-events-none inset-x-0 bottom-0 z-40 select-none",
        // Page viewers pass navbarAbove: cover the viewport below the nav bar.
        // Other viewers: cover their own (relative) container.
        navbarAbove === undefined ? "absolute" : "fixed",
      )}
      style={{
        top: navbarAbove ? NAVBAR_HEIGHT : 0,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        backgroundColor: "rgba(127, 127, 127, 0.08)",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {!point ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-md bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
            Confidential: move your cursor over the document to read it
          </span>
        </div>
      ) : null}
    </div>
  );
}
