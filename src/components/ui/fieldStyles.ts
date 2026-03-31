/** Classes compartilhadas para campos alinhados ao tema (tokens --fp-*). */

export const fieldInputClass =
  'w-full rounded-xl border border-fp-border bg-fp-input px-4 py-2.5 text-sm text-fptext-primary placeholder:text-fptext-muted transition-all focus:border-fp-accent focus:outline-none focus:ring-2 focus:ring-[var(--fp-ring)] disabled:cursor-not-allowed disabled:opacity-60';

/** Select nativo — `color-scheme` no tema cuida do contraste do dropdown do SO. */
export const fieldSelectClass = fieldInputClass;

export const fieldLabelClass =
  'text-xs font-semibold uppercase tracking-wider text-fptext-muted';
