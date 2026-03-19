import React from 'react';

// --- COMPONENTES AUXILIARES ---

export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden ${className}`}>
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
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    ghost: 'hover:bg-zinc-100 text-zinc-600',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700'
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
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