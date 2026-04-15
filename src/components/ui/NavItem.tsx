import React from 'react';

type NavItemProps = {
  active?: boolean;
  attention?: boolean;
  badgeCount?: number;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
};

export default function NavItem({ active = false, attention = false, badgeCount, onClick, icon, label }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full min-w-0 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all active:opacity-90 min-h-[44px] lg:min-h-[48px] lg:gap-3 lg:px-4 lg:py-3 ${
        active
          ? 'border-[#EA1D2C] bg-[#EA1D2C] text-white shadow-lg shadow-[#EA1D2C]/22'
          : attention
            ? 'border-amber-300/80 bg-amber-50 text-amber-900 shadow-lg shadow-amber-500/10 hover:border-amber-400 hover:bg-amber-50'
          : 'border-fp-border/90 bg-fp-card text-fptext-secondary hover:border-fp-border hover:bg-fp-hover hover:text-fptext-primary'
      }`}
    >
      <span
        className={`absolute left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full transition-all ${
          active ? 'bg-white/90' : attention ? 'bg-amber-500/90' : 'bg-transparent group-hover:bg-fp-border'
        }`}
      />
      <span
        className={`flowpdv-nav-item-icon-slot inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all lg:h-10 lg:w-10 ${
          active
            ? 'border-white/15 bg-white/14 text-white'
            : attention
              ? 'border-amber-200 bg-fp-card text-amber-700'
            : 'border-fp-border bg-fp-secondary text-fptext-muted group-hover:border-fp-border group-hover:bg-fp-card group-hover:text-fptext-primary'
        }`}
      >
        <span className="flex h-full w-full items-center justify-center text-[16px] leading-none tracking-normal [.flowpdv-dark_&]:text-[15px]" aria-hidden>
          {icon}
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold leading-snug tracking-tight lg:text-sm">
        {label}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {typeof badgeCount === 'number' && badgeCount > 0 ? (
          <span
            className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black leading-none ${
              active
                ? 'bg-white/18 text-white'
                : attention
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-fp-secondary text-fptext-secondary'
            }`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : null}
        <span
          className={`h-2.5 w-2.5 rounded-full transition-all ${
            active
              ? 'bg-white/90 ring-4 ring-white/12'
              : attention
                ? 'bg-amber-500 ring-4 ring-amber-500/20 animate-pulse'
                : 'bg-fp-border/80 group-hover:bg-fptext-muted/35'
          }`}
        />
      </span>
    </button>
  );
}

// --- TELA DE LOGIN ---

