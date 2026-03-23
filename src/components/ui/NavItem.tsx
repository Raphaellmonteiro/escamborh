import React from 'react';

export default function NavItem({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl transition-all active:opacity-90 ${
        active 
          ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-900/20' 
          : 'text-zinc-500 hover:bg-zinc-100'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// --- TELA DE LOGIN ---

