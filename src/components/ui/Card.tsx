import React from 'react';

// --- COMPONENTES AUXILIARES ---

export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div
    className={`overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm shadow-zinc-950/[0.04] ring-1 ring-black/[0.03] [.admin-dark_&]:!rounded-xl [.admin-dark_&]:!border-zinc-800 [.admin-dark_&]:!bg-zinc-900 [.admin-dark_&]:!shadow-md [.admin-dark_&]:ring-0 ${className}`}
  >
    {children}
  </div>
);

export const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "", 
  disabled = false,
  type = "button"
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) => {
  const variants = {
    primary:
      'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 active:bg-zinc-900 [.admin-dark_&]:bg-emerald-600 [.admin-dark_&]:hover:bg-emerald-500 [.admin-dark_&]:active:bg-emerald-600 [.admin-dark_&]:shadow-emerald-900/20',
    secondary:
      'bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-200 active:bg-zinc-300 [.admin-dark_&]:bg-zinc-800 [.admin-dark_&]:text-zinc-200 [.admin-dark_&]:hover:bg-zinc-700 [.admin-dark_&]:active:bg-zinc-800',
    danger:
      'bg-red-50 text-red-700 shadow-sm hover:bg-red-100 active:bg-red-100 [.admin-dark_&]:bg-red-600 [.admin-dark_&]:text-white [.admin-dark_&]:hover:bg-red-500 [.admin-dark_&]:active:bg-red-600',
    ghost:
      'text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 [.admin-dark_&]:text-zinc-300 [.admin-dark_&]:hover:bg-zinc-800 [.admin-dark_&]:active:bg-zinc-800/80',
    success:
      'bg-emerald-600 text-white shadow-sm shadow-emerald-900/10 hover:bg-emerald-700 active:bg-emerald-800 [.admin-dark_&]:bg-emerald-600 [.admin-dark_&]:hover:bg-emerald-500 [.admin-dark_&]:active:bg-emerald-600',
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] disabled:active:scale-100 [.admin-dark_&]:focus-visible:ring-emerald-500/35 [.admin-dark_&]:ring-offset-zinc-950 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input = ({ label, ...props }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>}
    <input
      {...props}
      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
    />
  </div>
);

// --- TELAS PRINCIPAIS ---