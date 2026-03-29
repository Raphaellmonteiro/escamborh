import { useMemo, useSyncExternalStore } from 'react';

/** Alinhado ao Tailwind default: `md` = 768px, `lg` = 1024px */
export const BREAKPOINT_MD_PX = 768;
export const BREAKPOINT_LG_PX = 1024;

function subscribe(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

function getWidthSnapshot() {
  return window.innerWidth;
}

function getWidthServerSnapshot() {
  return BREAKPOINT_LG_PX;
}

/**
 * Breakpoints para layout responsivo sem duplicar telas.
 * - mobile: &lt; 768px
 * - tablet: 768px–1023px
 * - desktop: ≥ 1024px
 */
export function useBreakpoint() {
  const width = useSyncExternalStore(subscribe, getWidthSnapshot, getWidthServerSnapshot);
  return useMemo(
    () => ({
      width,
      isMobile: width < BREAKPOINT_MD_PX,
      isTablet: width >= BREAKPOINT_MD_PX && width < BREAKPOINT_LG_PX,
      isDesktop: width >= BREAKPOINT_LG_PX,
    }),
    [width]
  );
}
