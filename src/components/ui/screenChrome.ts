/**
 * Tokens de layout/typografia compartilhados entre telas admin (Pedidos, Operação, Delivery)
 * e modais do PDV — evita divergência de hierarquia visual sem alterar fluxos.
 */

/** Título principal de tela (Pedidos, Operação, Delivery). */
export const adminScreenTitleClass =
  'text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-100';

/** Subtítulo sob o título (tom e espaçamento alinhados). */
export const adminScreenSubtitleClass =
  'text-sm text-zinc-500 dark:text-zinc-400 mt-0.5';

/** Linha do cabeçalho: empilha no mobile, alinha no desktop. */
export const adminScreenHeaderRowClass =
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between';

/** Padding de página usado em listas admin (ex.: Pedidos). */
export const adminScreenPagePaddingClass =
  'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 sm:pb-6';

/** Rótulos de filtro / campo em cards (tamanho mínimo legível). */
export const adminFormLabelClass =
  'text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider';

/** Título de modal em fundo escuro (PDV). */
export const posModalTitleClass = 'text-base font-black text-zinc-100';

/** Rótulo de campo em modal escuro (PDV). */
export const posModalFormLabelClass =
  'text-xs font-bold uppercase tracking-wider text-zinc-500';

/** Título de modal em fundo claro (ex.: mesas). */
export const lightModalTitleClass = 'text-lg sm:text-xl font-black text-zinc-900';

/** Rótulo de seção em caps (chips / faixas de filtro). */
export const adminSectionEyebrowClass =
  'text-xs font-bold uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500';

/** Texto auxiliar discreto ao lado de ações do header (ex.: limite de carga). */
export const adminScreenMetaHintClass =
  'text-xs font-semibold text-zinc-500 dark:text-zinc-400';

// ─── Superfícies operacionais (listas de pedidos, delivery, produtos, estoque) ───

/** Card principal com elevação leve (pedido ativo, painel, tabela embutida). */
export const adminOpsSurfaceCardClass =
  'rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-950/[0.04] dark:border-zinc-800 dark:bg-zinc-900';

/**
 * Linha ou célula de grade sem sombra marcada (lista densa, card de produto em grade).
 * Combine com `hover:border-zinc-300` onde já existir.
 */
export const adminOpsListRowClass =
  'rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900';

/** Painel interno / métricas / linha de item dentro de um card. */
export const adminOpsInsetPanelClass =
  'rounded-xl border border-zinc-200 bg-zinc-50/90 dark:border-zinc-700 dark:bg-zinc-800/60';

/** Área tracejada compacta (coluna kanban, tabela vazia embutida). */
export const adminOpsDashedWellClass =
  'rounded-xl border border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80';

/** Estado vazio principal (lista sem itens na página). */
export const adminOpsDashedEmptyClass =
  'rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/90 dark:border-zinc-700 dark:bg-zinc-900/40';

/**
 * Faixa de filtros agrupados — evita o `ring` do `Card` e alinha sombra/borda aos demais blocos operacionais.
 */
export const adminOpsFilterCardClass =
  'rounded-2xl border border-zinc-200/90 bg-zinc-50/95 shadow-sm shadow-zinc-950/[0.04] dark:border-zinc-800 dark:bg-zinc-900/45';

/** Blocos de formulário / resumo em fundo zinc (painéis internos em Produtos). */
export const adminOpsMutedBlockClass =
  'rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40';
