import type { LucideIcon } from 'lucide-react';

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  /** Painel admin (html sem classe `dark` — cores zinc escuras fixas). */
  variant?: 'default' | 'admin';
};

/** Estado vazio padronizado (lista sem itens, busca sem resultado). */
export function EmptyState({ icon: Icon, title, description, className = '', variant = 'default' }: Props) {
  const admin = variant === 'admin';
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 py-16 sm:py-20 ${className}`}
      role="status"
    >
      {Icon && (
        <div
          className={
            admin
              ? 'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/90 ring-1 ring-zinc-700/90'
              : 'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100/90 ring-1 ring-zinc-200/80 dark:bg-zinc-800/60 dark:ring-zinc-700/80'
          }
          aria-hidden
        >
          <Icon
            className={`h-8 w-8 stroke-[1.25] ${admin ? 'text-zinc-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          />
        </div>
      )}
      <p className={`text-base font-semibold ${admin ? 'text-white' : 'text-zinc-800 dark:text-zinc-100'}`}>{title}</p>
      {description ? (
        <p
          className={`mt-2 max-w-md text-sm leading-relaxed ${admin ? 'text-zinc-400' : 'text-zinc-500 dark:text-zinc-400'}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
