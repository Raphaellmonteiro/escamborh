// src/hooks/usePOSKeyboard.ts
// Atalhos de teclado para o PDV
// Como usar: chamar no início da função POSScreen e passar os callbacks
//
// Atalhos:
//   F1 – F8      → acionar produto por índice (top 8 na ordem da lista)
//   F9           → limpar carrinho
//   F10          → abrir/fechar checkout
//   Ctrl + F     → focar campo de busca
//   Ctrl + B     → scanner de código de barras (focar campo de código)
//   Escape       → cancelar pendência (fechar modal de tipo, etc.)
//   Numpad+      → aumentar qty último item do carrinho
//   Numpad-      → diminuir qty último item do carrinho

import { useEffect, useRef } from 'react';

interface UsePOSKeyboardOptions {
  products:          Array<{ id: number; name: string; price: number }>;
  onAddProduct:      (product: any) => void;
  onClearCart:       () => void;
  onToggleCheckout:  () => void;
  onFocusSearch:     () => void;
  onFocusBarcode?:   () => void;
  onEscape?:         () => void;
  onQtyIncrease?:    () => void;
  onQtyDecrease?:    () => void;
  /** Se false, os atalhos ficam desativados (ex: quando modal está aberto) */
  enabled?:          boolean;
}

export function usePOSKeyboard({
  products,
  onAddProduct,
  onClearCart,
  onToggleCheckout,
  onFocusSearch,
  onFocusBarcode,
  onEscape,
  onQtyIncrease,
  onQtyDecrease,
  enabled = true,
}: UsePOSKeyboardOptions) {
  // Refs para callbacks estáveis (evita re-registro do listener a cada render)
  const refs = useRef({ products, onAddProduct, onClearCart, onToggleCheckout, onFocusSearch, onFocusBarcode, onEscape, onQtyIncrease, onQtyDecrease });
  refs.current = { products, onAddProduct, onClearCart, onToggleCheckout, onFocusSearch, onFocusBarcode, onEscape, onQtyIncrease, onQtyDecrease };

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Ignora quando foco está em input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const { products, onAddProduct, onClearCart, onToggleCheckout, onFocusSearch, onFocusBarcode, onEscape, onQtyIncrease, onQtyDecrease } = refs.current;

      // Ctrl+F → focar busca (funciona mesmo em input)
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      // Ctrl+B → focar scanner de código de barras
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        onFocusBarcode?.();
        return;
      }

      if (inInput) return; // resto só fora de inputs

      // F1–F8 → adicionar produto por índice
      const fMatch = e.key.match(/^F([1-8])$/);
      if (fMatch) {
        e.preventDefault();
        const idx = parseInt(fMatch[1]) - 1;
        if (products[idx]) onAddProduct(products[idx]);
        return;
      }

      // F9 → limpar carrinho
      if (e.key === 'F9') {
        e.preventDefault();
        onClearCart();
        return;
      }

      // F10 → checkout
      if (e.key === 'F10') {
        e.preventDefault();
        onToggleCheckout();
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      // Numpad + / -
      if (e.key === '+' || e.key === 'Add')      { e.preventDefault(); onQtyIncrease?.(); return; }
      if (e.key === '-' || e.key === 'Subtract') { e.preventDefault(); onQtyDecrease?.(); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
