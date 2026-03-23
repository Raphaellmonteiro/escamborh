import { useState, useMemo, useCallback, useEffect } from 'react';

const DEFAULT_PAGE_SIZE = 30;

/**
 * Paginação por "Carregar mais" — reduz renderização em listas grandes.
 * Exibe pageSize itens inicialmente; loadMore adiciona mais pageSize.
 * Reset automático quando a lista filtrada muda (ex: busca).
 */
export function usePaginatedList<T>(
  items: T[],
  options?: { pageSize?: number }
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  const [visibleCount, setVisibleCount] = useState(pageSize);

  // Reset para primeira página quando a lista filtrada muda
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items, pageSize]);

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
