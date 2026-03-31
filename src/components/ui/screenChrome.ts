/**
 * Tokens de layout/typografia compartilhados entre telas admin (Pedidos, Operação, Delivery)
 * e modais do PDV — evita divergência de hierarquia visual sem alterar fluxos.
 */

/** Título principal de tela (Pedidos, Operação, Delivery). */
export const adminScreenTitleClass =
  'text-base sm:text-lg md:text-xl 2xl:text-2xl font-black text-fptext-primary';

/** Subtítulo sob o título (tom e espaçamento alinhados). */
export const adminScreenSubtitleClass =
  'text-sm text-fptext-muted mt-0.5';

/** Linha do cabeçalho: empilha no mobile, alinha no desktop; gap menor em telas baixas/largas estreitas. */
export const adminScreenHeaderRowClass =
  'flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0';

/** Padding de página — denso em notebook/tablet; `2xl` alinha ao desktop largo. */
export const adminScreenPagePaddingClass =
  'p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-3 sm:pb-3 md:p-4 md:pb-4 lg:p-4 lg:pb-4 xl:p-5 xl:pb-5 2xl:p-6 2xl:pb-6';

/** Rótulos de filtro / campo em cards (tamanho mínimo legível). */
export const adminFormLabelClass =
  'text-xs font-bold text-fptext-muted uppercase tracking-wider';

/** Título de modal em fundo escuro (PDV). */
export const posModalTitleClass = 'text-base font-black text-zinc-100';

/** Rótulo de campo em modal escuro (PDV). */
export const posModalFormLabelClass =
  'text-xs font-bold uppercase tracking-wider text-zinc-500';

/** Título de modal em fundo claro (ex.: mesas). */
export const lightModalTitleClass = 'text-lg sm:text-xl font-black text-zinc-900';

/** Rótulo de seção em caps (chips / faixas de filtro). */
export const adminSectionEyebrowClass =
  'text-xs font-bold uppercase tracking-[0.18em] text-fptext-muted';

/** Texto auxiliar discreto ao lado de ações do header (ex.: limite de carga). */
export const adminScreenMetaHintClass =
  'text-xs font-semibold text-fptext-muted';

// ─── Superfícies operacionais (listas de pedidos, delivery, produtos, estoque) ───

/** Card principal com elevação leve (pedido ativo, painel, tabela embutida). */
export const adminOpsSurfaceCardClass =
  'min-w-0 max-w-full rounded-2xl border border-fp-border bg-fp-card shadow-sm shadow-zinc-950/[0.04]';

/**
 * Linha ou célula de grade sem sombra marcada (lista densa, card de produto em grade).
 * Combine com `hover:border-zinc-300` onde já existir.
 */
export const adminOpsListRowClass =
  'rounded-2xl border border-fp-border bg-fp-card';

/** Painel interno / métricas / linha de item dentro de um card. */
export const adminOpsInsetPanelClass =
  'rounded-xl border border-fp-border bg-fp-secondary/90';

/** Área tracejada compacta (coluna kanban, tabela vazia embutida). */
export const adminOpsDashedWellClass =
  'rounded-xl border border-dashed border-fp-border bg-fp-secondary';

/** Estado vazio principal (lista sem itens na página). */
export const adminOpsDashedEmptyClass =
  'rounded-3xl border-2 border-dashed border-fp-border bg-fp-secondary/90';

/**
 * Faixa de filtros agrupados — evita o `ring` do `Card` e alinha sombra/borda aos demais blocos operacionais.
 */
export const adminOpsFilterCardClass =
  'min-w-0 max-w-full rounded-2xl border border-fp-border bg-fp-secondary shadow-sm shadow-zinc-950/[0.04]';

/** Blocos de formulário / resumo em fundo zinc (painéis internos em Produtos). */
export const adminOpsMutedBlockClass =
  'min-w-0 max-w-full rounded-2xl border border-fp-border bg-fp-secondary px-3 py-2 sm:px-4 sm:py-2.5 2xl:py-3';
