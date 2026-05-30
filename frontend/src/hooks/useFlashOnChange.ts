import { useEffect, useRef, useState } from "react";

/**
 * Section V: returns true for `durationMs` whenever `value` changes (after the
 * initial mount). Drives the `.flash` highlight class on state updates. Single
 * source so StatusPanel / cards stay consistent with the --timing-flash token.
 */
export function useFlashOnChange(value: unknown, durationMs = 500): boolean {
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef<unknown>(undefined);
  const initialised = useRef(false);

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      prevRef.current = value;
      return;
    }
    if (value !== prevRef.current) {
      prevRef.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), durationMs);
      return () => clearTimeout(t);
    }
  }, [value, durationMs]);

  return flashing;
}
