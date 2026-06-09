/**
 * Estrutura de combo no pedido: cada instância representa uma unidade lógica
 * de um componente dentro do grupo (base para personalização futura).
 */
export type ComboPedidoInstancia = {
  produto_id: number;
  instancia_id: string;
  /**
   * Adicionais do componente: mesmo formato do item normal
   * (`id` do grupo em `produto_grupos_opcao` → `{ id do item em produto_opcao_itens: quantidade }`), após validação.
   * No request JSON podem vir como `selecoes`, `opcoes` ou `adicionais` (mesmo mapa).
   */
  selecoes?: Record<number, Record<number, number>>;
  observacao?: string | null;
  /**
   * Payload bruto no request; removido na resposta persistida após validação.
   * @internal
   */
  selecoes_input?: unknown;
  /** Extensível (evitar duplicar `selecoes` / `observacao` aqui). */
  extras?: Record<string, unknown>;
};

/** grupoId → instâncias. Quantidade do produto P = ocorrências de P na lista. */
export type ComboPedidoPorGrupo = Record<number, ComboPedidoInstancia[]>;
