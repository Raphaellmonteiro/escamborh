import React, { Component, type ErrorInfo, type ReactNode } from 'react';

function isLikelyChunkOrAssetLoadError(error: unknown): boolean {
  const msg = String(error instanceof Error ? error.message : error);
  return (
    /Failed to fetch dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
    || /ChunkLoadError/i.test(msg)
    || /Loading chunk \d+ failed/i.test(msg)
  );
}

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Evita tela preta quando um lazy() falha (chunk 404/HTML no lugar de JS, deploy, cache).
 */
export default class ChunkLoadErrorBoundary extends Component<Props, State> {
  declare readonly props: Readonly<Props>;

  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[ChunkLoadErrorBoundary]', error.message, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      const chunk = isLikelyChunkOrAssetLoadError(this.state.error);
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-fp-app px-6 py-12 text-center">
          <p className="max-w-md text-sm font-semibold text-fptext-primary">
            {chunk
              ? 'Não foi possível carregar uma parte do sistema (atualização ou rede).'
              : 'Algo inesperado impediu de exibir esta tela.'}
          </p>
          <p className="max-w-md text-xs text-fptext-muted">
            Recarregar a página costuma resolver, principalmente após uma atualização da Pratory.
          </p>
          <button
            type="button"
            className="rounded-xl bg-fp-accent px-5 py-2.5 text-sm font-bold text-zinc-950 transition-opacity hover:opacity-90"
            onClick={() => {
              window.location.reload();
            }}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
