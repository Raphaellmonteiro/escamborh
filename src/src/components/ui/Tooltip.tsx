import React from 'react';

/**
 * Dica contextual (hover/focus). Prefira `content` curto; para textos longos use modal ou help inline.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}) {
  const pos =
    side === 'top'
      ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
      : 'top-full left-1/2 mt-2 -translate-x-1/2';

  return (
    <span className="group relative inline-flex max-w-full">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} z-50 max-w-[min(16rem,70vw)] scale-95 rounded-lg border border-fp-border bg-fptext-primary px-2.5 py-1.5 text-center text-[11px] font-semibold leading-snug text-fp-card opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100`}
      >
        {content}
      </span>
    </span>
  );
}
