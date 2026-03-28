import type { LucideIcon } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  /** Painel admin (html sem classe `dark` — cores zinc escuras fixas). */
  variant?: 'default' | 'admin';
  /** Sobrescreve / estende o wrapper do ícone (útil em cartões compactos ou PDV). */
  iconWrapperClassName?: string;
  /** Classes extras no ícone Lucide. */
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

/** Estado vazio padronizado (lista sem itens, busca sem resultado). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className = '',
  variant = 'default',
  iconWrapperClassName = '',
  iconClassName = '',
  titleClassName = '',
  descriptionClassName = '',
}: Props) {
  const admin = variant === 'admin';
  const iconWrapBase = admin
    ? 'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/90 ring-1 ring-zinc-700/90'
    : 'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100/90 ring-1 ring-zinc-200/80 dark:bg-zinc-800/60 dark:ring-zinc-700/80';
  const iconWrapCls = [iconWrapBase, iconWrapperClassName].filter(Boolean).join(' ');
  const iconTone = admin ? 'text-zinc-400' : 'text-zinc-400 dark:text-zinc-500';
  const titleBase = admin ? 'text-white' : 'text-zinc-800 dark:text-zinc-100';
  const descBase = admin ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-400';

  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 py-16 sm:py-20 ${className}`}
      role="status"
    >
      {Icon && (
        <div className={iconWrapCls} aria-hidden>
          <Icon className={`h-8 w-8 stroke-[1.25] ${iconTone} ${iconClassName}`.trim()} />
        </div>
      )}
      <p className={`text-base font-semibold ${titleBase} ${titleClassName}`.trim()}>{title}</p>
      {description ? (
        <p className={`mt-2 max-w-md text-sm leading-relaxed ${descBase} ${descriptionClassName}`.trim()}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
