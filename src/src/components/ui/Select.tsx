import React, { forwardRef } from 'react';
import { fieldLabelClass, fieldSelectClass } from './fieldStyles';

type NativeSelect = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<
  HTMLSelectElement,
  NativeSelect & { label?: string }
>(function Select({ label, className = '', children, ...props }, ref) {
  return (
    <div className="space-y-1.5">
      {label ? <label className={fieldLabelClass}>{label}</label> : null}
      <select ref={ref} className={`${fieldSelectClass} ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
});
