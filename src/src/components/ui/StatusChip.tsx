import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatusChipVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info';

type Rounded = 'full' | 'md' | 'lg' | 'xl';

const VARIANT_CLASS: Record<StatusChipVariant, string> = {
  neutral:
    'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200',
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200',
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200',
};

const SIZE_CLASS = {
  sm: 'gap-0.5 px-1.5 py-0.5 text-[10px] [&_svg]:size-2.5',
  md: 'gap-1 px-2 py-0.5 text-[11px] [&_svg]:size-3',
} as const;

const ROUNDED_CLASS: Record<Rounded, string> = {
  full: 'rounded-full',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

export type StatusChipProps = {
  children: ReactNode;
  variant?: StatusChipVariant;
  /** Sobrescree cores da variant (ex.: cyan, violet, laranja). */
  toneClassName?: string;
  size?: keyof typeof SIZE_CLASS;
  icon?: LucideIcon;
  className?: string;
  title?: string;
  uppercase?: boolean;
  emphasis?: 'black' | 'bold' | 'semibold';
  rounded?: Rounded;
};

/** Chip / badge de status para listas admin e cards de pedido. */
export function StatusChip({
  children,
  variant = 'neutral',
  toneClassName,
  size = 'sm',
  icon: Icon,
  className = '',
  title,
  uppercase = true,
  emphasis = 'black',
  rounded = 'full',
}: StatusChipProps) {
  const color = toneClassName ?? VARIANT_CLASS[variant];
  const font =
    emphasis === 'bold' ? 'font-bold' : emphasis === 'semibold' ? 'font-semibold' : 'font-black';
  const track = uppercase ? 'uppercase tracking-wide' : '';

  return (
    <span
      className={`inline-flex items-center border ${font} ${track} ${SIZE_CLASS[size]} ${ROUNDED_CLASS[rounded]} ${color} ${className}`.trim()}
      title={title}
    >
      {Icon ? <Icon className="shrink-0" strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </span>
  );
}
