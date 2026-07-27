import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface BentoCardProps {
  variant?: 'white' | 'purple' | 'blue' | 'green' | 'amber' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  children: ReactNode;
  hover?: boolean;
  onClick?: () => void;
}

const variantStyles: Record<string, string> = {
  white: 'bg-white text-foreground',
  purple: 'bg-card-blue text-accent',
  blue: 'bg-card-blue text-accent-blue',
  green: 'bg-card-green text-accent-green',
  amber: 'bg-card-amber text-accent-amber',
  dark: 'bg-bento-dark text-white',
};

const sizeStyles: Record<string, string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
  xl: 'p-7',
  hero: 'p-7',
};

export function BentoCard({
  variant = 'white',
  size = 'md',
  className,
  children,
  hover = false,
  onClick,
}: BentoCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-[2rem] border border-[rgba(0,0,0,0.055)] shadow-sm',
        variantStyles[variant],
        sizeStyles[size],
        hover && 'transition-all hover:shadow-md hover:-translate-y-0.5',
        onClick && 'cursor-pointer',
        className,
      )}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}