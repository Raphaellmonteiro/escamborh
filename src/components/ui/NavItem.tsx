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
      className={`group relative w-full flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-2xl border text-left transition-all active:opacity-90 ${
        active
          ? 'border-zinc-900 bg-zinc-900 text-white shadow-lg shadow-zinc-900/15'
          : attention
            ? 'border-amber-300/80 bg-amber-50 text-amber-900 shadow-lg shadow-amber-500/10 hover:border-amber-400 hover:bg-amber-50'
          : 'border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900'
      }`}
    >
      <span
        className={`absolute left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full transition-all ${
          active ? 'bg-white/90' : attention ? 'bg-amber-500/90' : 'bg-transparent group-hover:bg-zinc-300'
        }`}
      />
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
          active
            ? 'border-white/10 bg-white/12 text-white'
            : attention
              ? 'border-amber-200 bg-white text-amber-700'
            : 'border-zinc-200 bg-zinc-50 text-zinc-500 group-hover:border-zinc-300 group-hover:bg-white group-hover:text-zinc-700'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 font-semibold tracking-tight">{label}</span>
      <span className="flex items-center gap-2 shrink-0">
        {typeof badgeCount === 'number' && badgeCount > 0 ? (
          <span
            className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black leading-none ${
              active
                ? 'bg-white/15 text-white'
                : attention
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : null}
        <span
          className={`h-2.5 w-2.5 rounded-full transition-all ${
            active
              ? 'bg-white/90 ring-4 ring-white/10'
              : attention
                ? 'bg-amber-500 ring-4 ring-amber-500/20 animate-pulse'
                : 'bg-zinc-200 group-hover:bg-zinc-300'
          }`}
        />
      </span>
    </button>
  );
}

// --- TELA DE LOGIN ---

