import { cn } from '../../lib/utils';

interface StatusPillProps {
  status: string;
  label?: string;
  color?: string;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#059669',
  inactive: '#6B7280',
  lead: '#D97706',
  'closed-won': '#059669',
  'closed-lost': '#DC2626',
  paused: '#D97706',
  draft: '#6B7280',
  completed: '#3B82F6',
  new: '#2563EB',
  contacted: '#D97706',
  qualified: '#059669',
  proposal: '#2563EB',
  won: '#059669',
  lost: '#DC2626',
  high: '#DC2626',
  medium: '#D97706',
  approved: '#2563EB',
  queued: '#2563EB',
  sent: '#059669',
  replied: '#D97706',
  skipped: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  inactive: 'Неактивна',
  lead: 'Потенциальная',
  'closed-won': 'Закрыта',
  'closed-lost': 'Потеряна',
  paused: 'На паузе',
  draft: 'Черновик',
  completed: 'Завершена',
  new: 'Новый',
  contacted: 'Связались',
  qualified: 'Квалифицирован',
  proposal: 'Предложение',
  won: 'Выигран',
  lost: 'Проигран',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
  approved: 'Одобрено',
  queued: 'В очереди',
  sent: 'Отправлено',
  replied: 'Ответил',
  skipped: 'Пропущен',
};

export function StatusPill({
  status,
  label,
  color,
  className,
}: StatusPillProps) {
  const dotColor = color ?? STATUS_COLORS[status] ?? '#6B7280';
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium',
        className,
      )}
      style={{ color: dotColor }}
    >
      <span
        className="h-[5px] w-[5px] shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {displayLabel}
    </span>
  );
}