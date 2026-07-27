import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  new: 'bg-card-blue text-accent',
  contacted: 'bg-card-amber text-accent-amber',
  qualified: 'bg-card-green text-accent-green',
  proposal: 'bg-card-blue text-accent-blue',
  won: 'bg-card-green text-accent-green',
  lost: 'bg-muted text-muted-foreground',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant] || variantStyles.default,
        className,
      )}
    >
      {children}
    </span>
  );
}