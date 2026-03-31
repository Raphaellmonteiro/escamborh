import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <motion.div
            initial={{ scale: 0.93, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.93, opacity: 0 }}
            className={`my-auto flex max-h-[min(92dvh,100svh)] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl border border-fp-border bg-fp-card shadow-2xl sm:rounded-2xl ${wide ? 'max-w-2xl' : 'max-w-md'} pb-[max(0.5rem,env(safe-area-inset-bottom))] ${className}`.trim()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-fp-border px-4 py-3 2xl:px-6 2xl:py-4">
              <h3 className="min-w-0 pr-2 text-base font-black text-fptext-primary 2xl:text-lg">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-fptext-muted transition-colors hover:bg-fp-hover 2xl:p-1.5"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 2xl:px-6 2xl:py-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
