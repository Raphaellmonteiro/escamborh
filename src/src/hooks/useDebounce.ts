import { useState, useEffect } from 'react';

/**
 * Debounce a value. Useful for search inputs to avoid
 * recomputing filters on every keystroke.
 * @param value - The value to debounce
 * @param delay - Delay in ms (default 250)
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
