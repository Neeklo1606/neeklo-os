import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Megaphone,
  Calendar,
  Wallet,
  Target,
  TrendingUp,
  BarChart3,
  Building2,
} from 'lucide-react';
import { type Campaign } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useCampaignsStore } from '../lib/stores/campaignsStore';
import { formatCurrency } from '../lib/utils';
import { StatusPill } from '../components/ui/StatusPill';
import { BentoCard } from '../components/ui/BentoCard';
import { AppShell } from '../components/AppShell';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function DetailItem({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-2.5">
      <Icon className="h-4 w-4 shrink-0 text-text-subtle" />
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        {href ? (
          <a
            href={href}
            className="truncate text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            {value}
          </a>
        ) : (
          <p className="truncate text-sm font-medium text-text-primary">{value}</p>
        )}
      </div>
    </div>
  );

  return content;
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companies = useCompaniesStore((s) => s.companies);
  const campaigns = useCampaignsStore((s) => s.campaigns);

  const campaign: Campaign | undefined = useMemo(
    () => campaigns.find((c) => c.id === id),
    [campaigns, id],
  );

  const company = useMemo(
    () => (campaign ? companies.find((c) => c.id === campaign.companyId) : undefined),
    [campaign, companies],
  );

  if (!campaign) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
          <Megaphone className="h-16 w-16 text-text-subtle" />
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Кампания не найдена
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Проверьте ссылку или вернитесь к списку кампаний
          </p>
          <button
            onClick={() => navigate('/campaigns')}
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            К списку кампаний
          </button>
        </div>
      </AppShell>
    );
  }

  const progress = campaign.budget > 0 ? Math.round((campaign.spent / campaign.budget) * 100) : 0;
  const conversionRate =
    campaign.leadsGenerated > 0
      ? Math.round((campaign.conversions / campaign.leadsGenerated) * 100)
      : 0;

  const header = (
    <header className="border-b border-[rgba(0,0,0,0.055)] bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/campaigns')}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-text-body transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary">
              {campaign.name}
            </h1>
            <p className="text-[10px] text-text-muted">
              {company?.name ?? 'Без компании'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <AppShell header={header}>
      <div className="grid grid-cols-12 gap-[14px]">
        {/* HERO — Budget progress KPI (big % number) */}
        <BentoCard size="xl" className="col-span-4 row-span-2 flex flex-col justify-center">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="min-w-0">
              <p className="text-xs font-medium text-text-muted">Освоение бюджета</p>
            </div>
            <div className="mt-1 text-display">{progress}%</div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex w-full justify-between text-xs text-text-subtle">
              <span>0 ₽</span>
              <span>{formatCurrency(campaign.budget)}</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Потрачено {formatCurrency(campaign.spent)}
            </p>
          </div>
        </BentoCard>

        {/* WIDE — Campaign info (details grid, channels) */}
        <BentoCard className="col-span-8 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-text-primary">
              {campaign.name}
            </h2>
            <StatusPill status={campaign.status} />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-body">
            {campaign.description}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              icon={Building2}
              label="Компания"
              value={company?.name ?? '—'}
              href={company ? `/companies/${company.id}` : undefined}
            />
            <DetailItem
              icon={Calendar}
              label="Дата старта"
              value={formatDate(campaign.startDate)}
            />
            <DetailItem
              icon={Calendar}
              label="Дата окончания"
              value={formatDate(campaign.endDate)}
            />
            <DetailItem
              icon={Wallet}
              label="Бюджет"
              value={formatCurrency(campaign.budget)}
            />
            <DetailItem
              icon={Target}
              label="Сгенерировано лидов"
              value={String(campaign.leadsGenerated)}
            />
            <DetailItem
              icon={TrendingUp}
              label="Конверсий"
              value={String(campaign.conversions)}
            />
          </div>

          {/* Channels */}
          {campaign.channels.length > 0 && (
            <div className="mt-6 flex items-start gap-2.5">
              <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-text-subtle" />
              <div className="flex flex-wrap gap-1.5">
                {campaign.channels.map((ch) => (
                  <span
                    key={ch}
                    className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            </div>
          )}
        </BentoCard>

        {/* SMALL × 4 — Stat cards */}
        {([
          {
            label: 'Бюджет',
            value: formatCurrency(campaign.budget),
            icon: Wallet,
            color: 'text-blue-600 bg-blue-50',
            sub: `Потрачено ${formatCurrency(campaign.spent)}`,
          },
          {
            label: 'Прогресс',
            value: `${progress}%`,
            icon: BarChart3,
            color: 'text-blue-600 bg-blue-50',
            sub: `${formatCurrency(campaign.spent)} / ${formatCurrency(campaign.budget)}`,
          },
          {
            label: 'Лидов',
            value: campaign.leadsGenerated.toLocaleString(),
            icon: Target,
            color: 'text-emerald-600 bg-emerald-50',
            sub: `${campaign.conversions} конверсий`,
          },
          {
            label: 'CR',
            value: `${conversionRate}%`,
            icon: TrendingUp,
            color: 'text-amber-600 bg-amber-50',
            sub: 'Conversion Rate',
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
              {stat.sub && (
                <p className="text-[10px] text-text-subtle">{stat.sub}</p>
              )}
            </div>
          </BentoCard>
        ))}
      </div>
    </AppShell>
  );
}