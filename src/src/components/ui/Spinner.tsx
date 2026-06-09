type Props = {
  className?: string;
  label?: string;
};

/** Indicador de carregamento inline (botões, linhas de tabela). */
export function Spinner({ className = 'h-5 w-5', label = 'Carregando' }: Props) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100 ${className}`}
      role="status"
      aria-label={label}
    />
  );
}
