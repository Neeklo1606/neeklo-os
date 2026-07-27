import { cn } from '../../lib/utils';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'lg';
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-700';
  if (score >= 40) return 'text-amber-700';
  return 'text-red-600';
}

export function ScoreBadge({ score, size = 'sm', className }: ScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono font-semibold',
        size === 'lg' ? 'text-2xl' : 'text-[13px]',
        scoreColor(clamped),
        className,
      )}
    >
      <svg
        className={cn('shrink-0', size === 'lg' ? 'h-3 w-3' : 'h-2 w-2')}
        viewBox="0 0 8 8"
        fill="currentColor"
      >
        <circle cx="4" cy="4" r="4" />
      </svg>
      {clamped}
    </span>
  );
}