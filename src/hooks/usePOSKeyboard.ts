// src/hooks/usePOSKeyboard.ts
// Atalhos de teclado para o PDV
// Como usar: chamar no início da função POSScreen e passar os callbacks
//
// Atalhos:
//   F1 – F8         → adicionar produto rápido (top 8)
//   Ctrl + F        → focar busca
//   Ctrl + Enter    → finalizar/abrir fluxo de fechamento
//   Ctrl + Shift+C  → abrir/fechar carrinho no mobile
//   Alt + ↑ / ↓     → ajustar quantidade do item selecionado
//   Ctrl + Backspace→ pedir limpeza do carrinho
//   Escape          → fechar modal/overlay atual

import { useEffect, useRef } from 'react';

interface UsePOSKeyboardOptions {
  products:          Array<{ id: number; name: string; price: number }>;
  onAddProduct:      (product: any) => void;
  onClearCart:       () => void;
  onFocusSearch:     () => void;
  onEscape?:         () => void;
  onFinalize?:       () => void;
  onQtyIncrease?:    () => void;
  onQtyDecrease?:    () => void;
  onToggleCart?:     () => void;
  hasBlockingModal?: boolean;
  enabled?:          boolean;
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function usePOSKeyboard({
  products,
  onAddProduct,
  onClearCart,
  onFocusSearch,
  onEscape,
  onFinalize,
  onQtyIncrease,
  onQtyDecrease,
  onToggleCart,
  hasBlockingModal = false,
  enabled = true,
}: UsePOSKeyboardOptions) {
  // Refs para callbacks estáveis (evita re-registro do listener a cada render)
  const refs = useRef({
    products,
    onAddProduct,
    onClearCart,
    onFocusSearch,
    onEscape,
    onFinalize,
    onQtyIncrease,
    onQtyDecrease,
    onToggleCart,
    hasBlockingModal,
  });
  refs.current = {
    products,
    onAddProduct,
    onClearCart,
    onFocusSearch,
    onEscape,
    onFinalize,
    onQtyIncrease,
    onQtyDecrease,
    onToggleCart,
    hasBlockingModal,
  };

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const inInput = isEditableElement(e.target);
      const {
        products,
        onAddProduct,
        onClearCart,
        onFocusSearch,
        onEscape,
        onFinalize,
        onQtyIncrease,
        onQtyDecrease,
        onToggleCart,
        hasBlockingModal,
      } = refs.current;

      // Ctrl+F → focar busca (funciona mesmo em input)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !hasBlockingModal) {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (hasBlockingModal || inInput) return;

      // F1–F8 → adicionar produto por índice
      const fMatch = e.key.match(/^F([1-8])$/);
      if (fMatch) {
        e.preventDefault();
        const idx = parseInt(fMatch[1]) - 1;
        if (products[idx]) onAddProduct(products[idx]);
        return;
      }

      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        onToggleCart?.();
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        onFinalize?.();
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'Backspace') {
        e.preventDefault();
        onClearCart();
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        onQtyIncrease?.();
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        onQtyDecrease?.();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
