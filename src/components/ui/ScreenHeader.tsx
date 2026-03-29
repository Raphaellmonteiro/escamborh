import type { ReactNode } from 'react';
import {
  adminScreenHeaderRowClass,
  adminScreenSubtitleClass,
  adminScreenTitleClass,
} from './screenChrome';

const HEADER_ROW_FROM = {
  sm: adminScreenHeaderRowClass,
  md: 'flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between',
  lg: 'flex min-w-0 flex-col gap-2 sm:gap-3 lg:flex-row lg:items-center lg:justify-between',
} as const;

export type ScreenHeaderProps = {
  title: ReactNode;
  /** Texto curto: recebe `adminScreenSubtitleClass` automaticamente. */
  subtitle?: ReactNode;
  /** Conteúdo à direita antes das ações (ex.: meta com `adminScreenMetaHintClass`). */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Quando o bloco passa de coluna para linha (default `sm` = token screenChrome). */
  rowFrom?: keyof typeof HEADER_ROW_FROM;
  /** Pedidos (lista) usa `h2`; Operação / Delivery usam `h1`. */
  titleAs?: 'h1' | 'h2';
  /** Classes no elemento do título (ex.: `flex items-center gap-2`). */
  titleClassName?: string;
};

/**
 * Topo padronizado de telas admin — empilha no mobile, linha a partir do breakpoint (`rowFrom`).
 */
export function ScreenHeader({
  title,
  subtitle,
  meta,
  actions,
  className = '',
  rowFrom = 'sm',
  titleAs = 'h2',
  titleClassName = '',
}: ScreenHeaderProps) {
  const TitleTag = titleAs;
  const showTrailing = meta != null || actions != null;
  const titleCls = [adminScreenTitleClass, titleClassName].filter(Boolean).join(' ');
  const rowCls = HEADER_ROW_FROM[rowFrom];

  return (
    <div className={[rowCls, className].filter(Boolean).join(' ')}>
      <div className="min-w-0">
        <TitleTag className={titleCls}>{title}</TitleTag>
        {subtitle != null && subtitle !== '' ? (
          typeof subtitle === 'string' || typeof subtitle === 'number' ? (
            <p className={adminScreenSubtitleClass}>{subtitle}</p>
          ) : (
            subtitle
          )
        ) : null}
      </div>
      {showTrailing ? (
        <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
