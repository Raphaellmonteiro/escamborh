import { useState, useMemo, useCallback, useEffect } from 'react';

const DEFAULT_PAGE_SIZE = 30;

/**
 * Paginação por "Carregar mais" — reduz renderização em listas grandes.
 * Exibe pageSize itens inicialmente; loadMore adiciona mais pageSize.
 * Reset automático quando a lista filtrada muda (ex: busca).
 *
 * `listResetKey` (opcional): quando definido, a paginação só volta ao início se essa
 * chave mudar — útil quando `items` ganha nova referência após refetch mas a ordem
 * e o conjunto de linhas são os mesmos (evita remontar a lista inteira e bugs com lazy img).
 */
export function usePaginatedList<T>(
  items: T[],
  options?: { pageSize?: number; listResetKey?: string }
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const listResetKey = options?.listResetKey;

  const [visibleCount, setVisibleCount] = useState(pageSize);

  const resetEpoch = listResetKey !== undefined ? listResetKey : items;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetEpoch, pageSize]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );

  const hasMore = visibleCount < items.length;
  const totalCount = items.length;

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + pageSize, items.length));
  }, [pageSize, items.length]);

  const reset = useCallback(() => {
    setVisibleCount(pageSize);
  }, [pageSize]);

  return { visibleItems, hasMore, loadMore, reset, totalCount };
}
