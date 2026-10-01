import { useEffect, useRef, useState } from "react";

/**
 * Holds on to the last non-null value for `delay` ms after it clears.
 *
 * A docked panel that unmounts the moment its target goes null leaves an empty
 * box behind to animate, so the collapse reads as the contents blinking out
 * and *then* the column closing. Rendering the lingering value instead keeps
 * the panel intact for exactly as long as the collapse takes.
 *
 * A new value arriving during the wait cancels it, so switching panels is
 * immediate and only closing is deferred.
 */
export function useLingeringValue<T>(value: T | null, delay: number): T | null {
  const [lingering, setLingering] = useState<T | null>(value);
  // React 19 requires an explicit initial value; `useRef<T>()` no longer
  // implies `T | undefined`.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timeoutRef.current);

    if (value !== null) {
      setLingering(value);
      return;
    }

    timeoutRef.current = setTimeout(() => setLingering(null), delay);
    return () => clearTimeout(timeoutRef.current);
  }, [value, delay]);

  return value ?? lingering;
}
