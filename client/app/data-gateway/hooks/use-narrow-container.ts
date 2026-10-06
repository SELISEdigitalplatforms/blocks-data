import { useEffect, useRef, useState } from "react";

/**
 * Whether the ref'd element's own rendered width has dropped below
 * `threshold`, tracked via ResizeObserver.
 *
 * Not a viewport media query: the schema detail header narrows because the
 * access inspector opens beside it, not because the browser window shrinks,
 * so `window.resize`/Tailwind breakpoints can't see it — only the element's
 * own box can.
 */
export function useNarrowContainer<T extends HTMLElement>(threshold: number) {
  const ref = useRef<T>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsNarrow(entry.contentRect.width < threshold);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isNarrow };
}
