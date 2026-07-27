import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  User,
  Tag,
  Calendar,
  DollarSign,
  Target,
  Gauge,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { useLeadsStore } from '../lib/stores/leadsStore';
import { STATUS_COLUMNS } from '../data/mock';
import { StatusPill } from '../components/ui/StatusPill';
import { BentoCard } from '../components/ui/BentoCard';
import { AppShell } from '../components/AppShell';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-card-red text-accent-red ring-accent-red/20',
  medium: 'bg-card-amber text-accent-amber ring-accent-amber/20',
  low: 'bg-card-slate text-text-muted ring-text-subtle/20',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-text-subtle" />
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-text-primary">{value}</p>
      </div>
    </div>
  );
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getLeadById = useLeadsStore((s) => s.getLeadById);

  const lead = useMemo(() => (id ? getLeadById(id) : undefined), [id, getLeadById]);

  if (!lead) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
          <User className="h-16 w-16 text-text-subtle" />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Лид не найден
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Проверьте ссылку или вернитесь к списку лидов
          </p>
          <button
            onClick={() => navigate('/leads')}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            К списку лидов
          </button>
        </div>
      </AppShell>
    );
  }

  const statusCol = STATUS_COLUMNS.find((c) => c.key === lead.status);

  const header = (
    <header className="border-b border-[rgba(0,0,0,0.055)] bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/leads')}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-text-body transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg shadow-sm"
            style={{
              background: statusCol
                ? `linear-gradient(135deg, ${statusCol.color}dd, ${statusCol.color}88)`
                : undefined,
            }}
          >
            <User className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary">{lead.name}</h1>
            <p className="text-[10px] text-text-muted">{lead.company}</p>
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <AppShell header={header}>
      <div className="grid grid-cols-12 gap-[14px]">
        {/* WIDE — Lead info card */}
        <BentoCard className="col-span-12 p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
            {/* Avatar */}
            <div className="flex shrink-0">
              <div className="h-20 w-20 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 shadow-sm">
                <img
                  src={lead.avatar}
                  alt={lead.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=2563eb&color=fff&size=80`;
                  }}
                />
              </div>
            </div>

            {/* Details grid */}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-text-primary">
                  {lead.name}
                </h2>
                <StatusPill status={lead.status} />
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${PRIORITY_COLORS[lead.priority]}`}
                >
                  {PRIORITY_LABELS[lead.priority]}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-muted">{lead.company}</p>

              <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailItem icon={Mail} label="Email" value={lead.email} />
                <DetailItem icon={Phone} label="Телефон" value={lead.phone} />
                <DetailItem
                  icon={Building2}
                  label="Компания"
                  value={lead.company}
                />
                <DetailItem
                  icon={DollarSign}
                  label="Сумма сделки"
                  value={formatCurrency(lead.value)}
                />
                <DetailItem
                  icon={Target}
                  label="Ответственный"
                  value={lead.assignedTo}
                />
                <DetailItem
                  icon={Calendar}
                  label="Создан"
                  value={formatDate(lead.createdAt)}
                />
                <DetailItem
                  icon={Gauge}
                  label="Приоритет"
                  value={PRIORITY_LABELS[lead.priority] ?? lead.priority}
                />
              </div>

              {/* Tags */}
              {lead.tags.length > 0 && (
                <div className="mt-6 flex items-start gap-2.5">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle" />
                  <div className="flex flex-wrap gap-1.5">
                    {lead.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* SMALL × 4 — Stat cards */}
        {([
          {
            label: 'Приоритет',
            value: PRIORITY_LABELS[lead.priority] ?? lead.priority,
            icon: Gauge,
            color:
              lead.priority === 'high'
                ? 'text-accent-red bg-card-red'
                : lead.priority === 'medium'
                  ? 'text-accent-amber bg-card-amber'
                  : 'text-text-body bg-page',
          },
          {
            label: 'Сумма сделки',
            value: formatCurrency(lead.value),
            icon: DollarSign,
            color: 'text-accent-green bg-card-green',
          },
          {
            label: 'Ответственный',
            value: lead.assignedTo,
            icon: Target,
            color: 'text-accent-bright bg-card-blue',
          },
          {
            label: 'Создан',
            value: formatDate(lead.createdAt),
            icon: Calendar,
            color: 'text-blue-600 bg-blue-50',
          },
        ] as const).map((stat) => (
          <BentoCard key={stat.label} className="col-span-3 flex items-center gap-3 p-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.color}`}
            >
              <stat.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-text-primary">
                {stat.value}
              </p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </div>
          </BentoCard>
        ))}
      </div>
    </AppShell>
  );
}