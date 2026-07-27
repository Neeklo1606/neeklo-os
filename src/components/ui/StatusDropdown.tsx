import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface StatusOption {
  value: string;
  label: string;
  color: string;
}

interface StatusDropdownProps {
  current: string;
  options: StatusOption[];
  onChange: (newValue: string) => void;
  /** Optional label to show in toast messages (e.g. company name) */
  itemLabel?: string;
  className?: string;
}

function getDotColor(value: string, options: StatusOption[]): string {
  return options.find((o) => o.value === value)?.color ?? '#6B7280';
}

function getLabel(value: string, options: StatusOption[]): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function StatusDropdown({
  current,
  options,
  onChange,
  itemLabel,
  className,
}: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (newValue: string) => {
      if (newValue === current) {
        setOpen(false);
        return;
      }
      const prevValue = current;
      const prevLabel = getLabel(prevValue, options);
      const newLabel = getLabel(newValue, options);

      // Apply the change immediately
      onChange(newValue);
      setOpen(false);

      // Show toast with undo
      toast(`${itemLabel ? `«${itemLabel}»: ` : ''}${prevLabel} → ${newLabel}`, {
        action: {
          label: 'Отменить',
          onClick: () => {
            // Revert
            onChange(prevValue);
          },
        },
        duration: 5000,
      });
    },
    [current, onChange, options, itemLabel],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const dotColor = getDotColor(current, options);
  const displayLabel = getLabel(current, options);

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-all hover:bg-muted hover:shadow-md min-h-[44px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {displayLabel}
        <ChevronDown className="h-3 w-3 text-text-subtle" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-lg"
          role="listbox"
        >
          {options.map((opt) => {
            const selected = opt.value === current;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors min-h-[44px]',
                  selected
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}