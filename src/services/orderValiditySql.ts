/**
 * Predicado SQL reutilizável: pedido válido para métricas e agregações
 * (não cancelado por `cancelado_at` nem por `status`).
 */
export function buildValidOrderSqlClause(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}cancelado_at IS NULL AND LOWER(COALESCE(${prefix}status,'')) <> 'cancelado'`;
}
