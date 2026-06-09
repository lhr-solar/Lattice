import { useEffect } from "react";

/** Clear a transient message after `ms` milliseconds (default 5s). */
export function useAutoDismiss<T>(
  value: T | null | undefined,
  clear: () => void,
  ms = 5000,
): void {
  useEffect(() => {
    if (value == null) return;
    const timer = setTimeout(clear, ms);
    return () => clearTimeout(timer);
  }, [value, clear, ms]);
}
