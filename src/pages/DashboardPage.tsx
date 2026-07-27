import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Building2,
  Megaphone,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  Clock,
  Zap,
  Eye,
  Calendar,
} from 'lucide-react';
import { BentoCard } from '../components/ui/BentoCard';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import type { Campaign } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useLeadsStore } from '../lib/stores/leadsStore';
import { useCampaignsStore } from '../lib/stores/campaignsStore';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  color,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  color: string;
  variant?: 'white' | 'purple' | 'blue' | 'green' | 'amber' | 'dark';
}) {
  const isUp = trend !== undefined && trend >= 0;
  return (
    <BentoCard variant={variant || 'white'} className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-4 font-heading text-3xl font-black tracking-tight text-foreground sm:text-4xl">{value}</p>
      {trend !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              isUp ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
          {trendLabel && <span className="text-xs text-text-subtle">{trendLabel}</span>}
        </div>
      )}
    </BentoCard>
  );
}

function CampaignMiniCard({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const progress = campaign.budget > 0 ? Math.round((campaign.spent / campaign.budget) * 100) : 0;
  const conversionRate =
    campaign.leadsGenerated > 0
      ? Math.round((campaign.conversions / campaign.leadsGenerated) * 100)
      : 0;

  return (
    <BentoCard
      hover
      className="flex h-full flex-col p-5"
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{campaign.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{campaign.description}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
            campaign.status === 'active'
              ? 'bg-emerald-50 text-emerald-600'
              : campaign.status === 'paused'
                ? 'bg-amber-50 text-amber-600'
                : campaign.status === 'completed'
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-gray-50 text-gray-500'
          }`}
        >
          {campaign.status === 'active'
            ? 'Активна'
            : campaign.status === 'paused'
              ? 'Пауза'
              : campaign.status === 'completed'
                ? 'Завершена'
                : 'Черновик'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted p-2 text-center">
          <p className="text-xs font-semibold text-foreground">{campaign.leadsGenerated}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Лидов</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-center">
          <p className="text-xs font-semibold text-foreground">{campaign.conversions}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Конв.</p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-center">
          <p className="text-xs font-semibold text-foreground">{conversionRate}%</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">CR</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Бюджет</span>
          <span>
            {formatCurrency(campaign.spent)} / {formatCurrency(campaign.budget)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-3">
        <div className="flex flex-wrap gap-1">
          {campaign.channels.slice(0, 2).map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
            >
              {ch}
            </span>
          ))}
          {campaign.channels.length > 2 && (
            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              +{campaign.channels.length - 2}
            </span>
          )}
        </div>
        <span className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50">
          <Eye className="h-3 w-3" />
          Детали
        </span>
      </div>
    </BentoCard>
  );
}

function LeadPipelineCard() {
  const leads = useLeadsStore((s) => s.leads);
  const pipelineData = useMemo(() => {
    const stages = [
      { key: 'new', label: 'Новые', color: 'bg-blue-500' },
      { key: 'contacted', label: 'На связи', color: 'bg-amber-400' },
      { key: 'qualified', label: 'Квалиф.', color: 'bg-emerald-500' },
      { key: 'proposal', label: 'Предлож.', color: 'bg-blue-500' },
      { key: 'closed-won', label: 'Успешно', color: 'bg-emerald-600' },
    ] as const;

    const total = leads.length;
    return stages.map((stage) => {
      const count = leads.filter((l) => l.status === stage.key).length;
      const pct = total > 0 ? (count / total) * 100 : 0;
      return { ...stage, count, pct };
    });
  }, [leads]);

  return (
    <BentoCard variant="white" className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Воронка лидов</h3>
            <p className="text-[10px] text-muted-foreground">Распределение по этапам</p>
          </div>
        </div>
        <span className="text-xs font-medium text-text-body">{leads.length} всего</span>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-center gap-3">
        {pipelineData.map((stage) => (
          <div key={stage.key}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{stage.label}</span>
              <span className="font-semibold text-foreground">
                {stage.count}
                <span className="ml-1 font-normal text-muted-foreground">
                  ({Math.round(stage.pct)}%)
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${stage.color}`}
                style={{ width: `${stage.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function TopCompaniesCard() {
  const navigate = useNavigate();
  const companies = useCompaniesStore((s) => s.companies);
  const topCompanies = useMemo(() => {
    return [...companies]
      .sort((a, b) => b.activeLeads - a.activeLeads)
      .slice(0, 5);
  }, [companies]);

  return (
    <BentoCard variant="white" className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <Building2 className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Топ компаний</h3>
            <p className="text-[10px] text-muted-foreground">По количеству активных лидов</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        {topCompanies.map((company, idx) => (
          <div
            key={company.id}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
            onClick={() => navigate(`/companies/${company.id}`)}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-text-subtle">
              {idx + 1}
            </span>
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-blue-200">
              <img
                src={company.avatar}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=2563eb&color=fff&size=32`;
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
              <p className="text-xs text-muted-foreground">{company.industry}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{company.activeLeads}</p>
              <p className="text-[10px] text-muted-foreground">лидов</p>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function RecentActivityCard() {
  const leads = useLeadsStore((s) => s.leads);
  const recentLeads = useMemo(() => {
    return [...leads]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [leads]);

  return (
    <BentoCard variant="white" className="flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Zap className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Последняя активность</h3>
            <p className="text-[10px] text-muted-foreground">Новые лиды и обновления</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-1">
        {recentLeads.map((lead) => (
          <div
            key={lead.id}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
          >
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full">
              <img
                src={lead.avatar}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=2563eb&color=fff&size=28`;
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{lead.name}</p>
              <p className="truncate text-xs text-muted-foreground">{lead.company}</p>
            </div>
            <div className="text-right">
              <ScoreBadge
                score={
                  lead.priority === 'high' ? 85 : lead.priority === 'medium' ? 55 : 20
                }
              />
              <p className="mt-0.5 text-[10px] text-text-subtle">
                {formatShortDate(lead.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function HeroNumbersCard() {
  const companies = useCompaniesStore((s) => s.companies);
  const leads = useLeadsStore((s) => s.leads);
  const campaigns = useCampaignsStore((s) => s.campaigns);
  const totalPipeline = leads.reduce((s, l) => s + l.value, 0);
  const wonLeads = leads.filter((l) => l.status === 'closed-won');
  const wonValue = wonLeads.reduce((s, l) => s + l.value, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  return (
    <BentoCard variant="dark" className="col-span-12 flex flex-col p-7 lg:col-span-8 lg:p-8">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <BarChart3 className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white/90">Общая сводка</h2>
          <p className="text-[10px] text-white/50">Ключевые показатели системы</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0 md:items-stretch">
        {/* Pipeline */}
        <div className="min-w-0 md:pr-8">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">Общий pipeline</p>
          <p className="mt-3 font-heading text-3xl font-black leading-tight tracking-tight text-white tabular-nums sm:text-4xl lg:text-[2.75rem]">
            {new Intl.NumberFormat('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
              .format(totalPipeline)
              .replace(',00', '')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
              <ArrowUpRight className="h-3 w-3" />
              +12%
            </span>
            <span className="text-[11px] text-white/40">за месяц</span>
          </div>
        </div>

        <div aria-hidden className="hidden md:block w-px self-stretch bg-white/10" />

        {/* Won */}
        <div className="min-w-0 md:px-8">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">Выиграно</p>
          <p className="mt-3 font-heading text-2xl font-black leading-tight tracking-tight text-white tabular-nums sm:text-3xl">
            {formatCurrency(wonValue)}
          </p>
          <p className="mt-3 text-[11px] text-white/40">
            {wonLeads.length} сделок закрыто
          </p>
        </div>

        <div aria-hidden className="hidden md:block w-px self-stretch bg-white/10" />

        {/* Budget */}
        <div className="min-w-0 md:pl-8">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">Освоение бюджета</p>
          <p className="mt-3 font-heading text-2xl font-black leading-tight tracking-tight text-white tabular-nums sm:text-3xl">
            {budgetUtilization}%
          </p>
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all"
                style={{ width: `${budgetUtilization}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between gap-4 text-[10px] text-white/40">
              <span className="truncate">{formatCurrency(totalSpent)}</span>
              <span className="shrink-0">{formatCurrency(totalBudget)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mini metrics row */}
      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 lg:grid-cols-4 lg:gap-x-10">
        {[
          { label: 'Активных кампаний', value: activeCampaigns, icon: Megaphone },
          { label: 'Всего компаний', value: companies.length, icon: Building2 },
          { label: 'Всего лидов', value: leads.length, icon: Users },
          {
            label: 'Конверсия',
            value: `${leads.length > 0 ? Math.round((wonLeads.length / leads.length) * 100) : 0}%`,
            icon: TrendingUp,
          },
        ].map((stat) => (
          <div key={stat.label} className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
              <stat.icon className="h-4 w-4 text-white/60" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold tabular-nums text-white">{stat.value}</p>
              <p className="truncate text-[11px] text-white/40">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function QuickActionsCard() {
  const navigate = useNavigate();
  const campaigns = useCampaignsStore((s) => s.campaigns);
  return (
    <BentoCard variant="blue" className="col-span-12 sm:col-span-6 lg:col-span-4 flex flex-col p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/30">
          <Zap className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-accent">Быстрые действия</h3>
          <p className="text-[10px] text-accent/60">Навигация по разделам</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {[
          { label: 'Все лиды', icon: Users, path: '/leads' },
          { label: 'Кампании', icon: Megaphone, path: '/campaigns' },
          { label: 'Компании', icon: Building2, path: '/companies' },
          { label: 'Brain HUD', icon: Activity, path: '/brain' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="inline-flex cursor-pointer items-center gap-2.5 rounded-xl bg-white/20 px-4 py-3 text-sm font-medium text-accent transition-all hover:bg-white/30"
          >
            <action.icon className="h-4 w-4 shrink-0" />
            {action.label}
          </button>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <div className="rounded-xl bg-white/20 p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent" />
            <span className="text-xs font-medium text-accent">Текущий квартал</span>
          </div>
          <p className="mt-1.5 font-heading text-xl font-bold text-accent">
            {new Intl.NumberFormat('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })
              .format(
                campaigns
                  .filter((c) => c.status === 'active')
                  .reduce((s, c) => s + c.budget, 0),
              )
              .replace(',00', '')}
          </p>
          <p className="text-[10px] text-accent/60">Активный бюджет</p>
        </div>
      </div>
    </BentoCard>
  );
}

export function DashboardPage() {
  const companies = useCompaniesStore((s) => s.companies);
  const leads = useLeadsStore((s) => s.leads);
  const campaigns = useCampaignsStore((s) => s.campaigns);
  const totalLeads = leads.length;
  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;
  const totalCompanies = companies.length;
  const wonLeads = leads.filter((l) => l.status === 'closed-won');
  const conversionRate =
    totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;

  const topCampaigns = useMemo(() => {
    return [...campaigns]
      .filter((c) => c.status === 'active')
      .sort((a, b) => b.leadsGenerated - a.leadsGenerated)
      .slice(0, 3);
  }, [campaigns]);

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="sticky inset-x-0 top-0 z-50 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Дашборд</h1>
              <p className="text-[10px] text-muted-foreground">Общая аналитика</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-text-subtle" />
              <span className="text-xs font-medium text-text-body">Июнь 2026</span>
            </div>
            <button
  onClick={() => {/* TODO: сформировать и скачать отчёт */}}
  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md"
>
              <Activity className="h-4 w-4" />
              Отчёт
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        {/* Row 1: Metric cards */}
        <div className="mb-[14px] grid grid-cols-12 gap-[14px]">
          <MetricCard
            label="Всего лидов"
            value={totalLeads.toLocaleString()}
            icon={Users}
            trend={18}
            trendLabel="за месяц"
            color="text-blue-600 bg-blue-50"
            variant="white"
          />
          <MetricCard
            label="Активных кампаний"
            value={activeCampaigns.toLocaleString()}
            icon={Megaphone}
            trend={33}
            trendLabel="за квартал"
            color="text-emerald-600 bg-emerald-50"
            variant="white"
          />
          <MetricCard
            label="Компаний в базе"
            value={totalCompanies.toLocaleString()}
            icon={Building2}
            trend={5}
            trendLabel="за месяц"
            color="text-amber-600 bg-amber-50"
            variant="white"
          />
          <MetricCard
            label="Конверсия в сделку"
            value={`${conversionRate}%`}
            icon={TrendingUp}
            trend={2}
            trendLabel="к прошлому кв."
            color="text-blue-600 bg-blue-50"
            variant="white"
          />
        </div>

        {/* Row 2: Hero numbers + Quick actions */}
        <div className="mb-[14px] grid grid-cols-12 gap-[14px] items-stretch">
          <HeroNumbersCard />
          <QuickActionsCard />
        </div>

        {/* Row 3: Pipeline + Top companies + Recent activity */}
        <div className="mb-[14px] grid grid-cols-12 gap-[14px] items-stretch">
          <div className="col-span-12 sm:col-span-6 lg:col-span-4">
            <LeadPipelineCard />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-4">
            <TopCompaniesCard />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-4">
            <RecentActivityCard />
          </div>
        </div>

        {/* Row 4: Top campaigns */}
        <div className="mb-[14px]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-text-subtle" />
              <h2 className="text-sm font-semibold text-foreground">Активные кампании</h2>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-text-body">
                {topCampaigns.length}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-[14px] items-stretch">
            {topCampaigns.map((campaign) => (
              <div key={campaign.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
                <CampaignMiniCard campaign={campaign} />
              </div>
            ))}
          </div>
          {topCampaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Megaphone className="h-10 w-10 text-text-subtle" />
              <p className="mt-3 text-sm font-medium text-text-body">Нет активных кампаний</p>
              <p className="mt-1 text-xs text-text-subtle">Создайте кампанию в Outreach Hub</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}