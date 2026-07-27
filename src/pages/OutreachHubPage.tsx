import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Megaphone,
  Search,
  ChevronDown,
  Mail,
  Globe,
  MapPin,
  Users,
  Wallet,
  Target,
  TrendingUp,
  Filter,
  Eye,
  BarChart3,
  Database,
  Send,
  MessageSquare,
} from 'lucide-react';
import { type Company, type Campaign } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useCampaignsStore } from '../lib/stores/campaignsStore';
import { StatusPill } from '../components/ui/StatusPill';
import { BentoCard } from '../components/ui/BentoCard';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function CompanyCard({ company }: { company: Company }) {
  const navigate = useNavigate();
  return (
    <BentoCard hover className="flex h-full flex-col p-5" onClick={() => navigate(`/outreach/companies/${company.id}`)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-blue-200">
            <img
              src={company.avatar}
              alt={company.name}
              className="h-full w-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=2563eb&color=fff`; }}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{company.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{company.industry}</p>
          </div>
        </div>
        <StatusPill status={company.status} />
      </div>

      {/* Details */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-text-body">
        <div className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span className="truncate">{company.city}</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span>{company.employees} чел.</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span className="truncate">{company.email}</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span className="truncate">{company.website}</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span>{company.revenue}</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 shrink-0 text-text-subtle" />
          <span>{company.activeLeads} лидов</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-[11px] text-text-subtle">С {formatDate(company.createdAt)}</span>
        <span className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50">
          <Eye className="h-3.5 w-3.5" />
          Открыть
        </span>
      </div>
    </BentoCard>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const progress = campaign.budget > 0 ? Math.round((campaign.spent / campaign.budget) * 100) : 0;
  const conversionRate = campaign.leadsGenerated > 0 ? Math.round((campaign.conversions / campaign.leadsGenerated) * 100) : 0;

  return (
    <BentoCard hover className="flex h-full flex-col p-5" onClick={() => navigate(`/campaigns/${campaign.id}`)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{campaign.name}</h3>
            <StatusPill status={campaign.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{campaign.description}</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-xs font-semibold text-foreground">{campaign.leadsGenerated}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Лидов</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-xs font-semibold text-foreground">{campaign.conversions}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Конверсий</p>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <p className="text-xs font-semibold text-foreground">{conversionRate}%</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">CR</p>
        </div>
      </div>

      {/* Budget bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Бюджет</span>
          <span>{formatCurrency(campaign.spent)} / {formatCurrency(campaign.budget)}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Channels & date */}
      <div className="mt-auto flex items-center justify-between pt-4">
        <div className="flex flex-wrap gap-1">
          {campaign.channels.map((ch) => (
            <span
              key={ch}
              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
            >
              {ch}
            </span>
          ))}
        </div>
        <span className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50">
          <Eye className="h-3.5 w-3.5" />
          Подробнее
        </span>
      </div>
    </BentoCard>
  );
}

function CompanyTable({ companies }: { companies: Company[] }) {
  const navigate = useNavigate();
  return (
    <BentoCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Компания</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Город</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Сотрудников</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Выручка</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Статус</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Лидов</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">Дата</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.map((company) => (
              <tr key={company.id} className="group cursor-pointer transition-colors hover:bg-muted" onClick={() => navigate(`/companies/${company.id}`)}>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-blue-200">
                      <img
                        src={company.avatar}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(company.name)}&background=2563eb&color=fff&size=32`; }}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{company.name}</p>
                      <p className="text-xs text-muted-foreground">{company.industry}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.city}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.employees}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">{company.revenue}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusPill status={company.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.activeLeads}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">{formatDate(company.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}

function CampaignTable({ campaigns }: { campaigns: Campaign[] }) {
  const navigate = useNavigate();
  return (
    <BentoCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Название</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Статус</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">Бюджет</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">Потрачено</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">Лидов</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">CR</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Каналы</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Период</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((campaign) => {
              const conversionRate = campaign.leadsGenerated > 0
                ? Math.round((campaign.conversions / campaign.leadsGenerated) * 100)
                : 0;
              return (
                <tr key={campaign.id} className="group cursor-pointer transition-colors hover:bg-muted" onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{campaign.name}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground max-w-[240px]">{campaign.description}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusPill status={campaign.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-text-body">{formatCurrency(campaign.budget)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-text-body">{formatCurrency(campaign.spent)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-text-body">{campaign.leadsGenerated}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-foreground">{conversionRate}%</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {campaign.channels.map((ch) => (
                        <span key={ch} className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    <div>{formatDate(campaign.startDate)}</div>
                    <div>— {formatDate(campaign.endDate)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}

type ViewMode = 'grid' | 'table';

export function OutreachHubPage() {
  const companies = useCompaniesStore((s) => s.companies);
  const campaigns = useCampaignsStore((s) => s.campaigns);
  const [tab, setTab] = useState<'companies' | 'campaigns'>('companies');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [search, companies]);

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.channels.some((ch) => ch.toLowerCase().includes(q)),
    );
  }, [search, campaigns]);

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
              <h1 className="text-sm font-bold text-foreground">Outreach Hub</h1>
              <p className="text-[10px] text-muted-foreground">Аутрич и кампании</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="ml-8 flex items-center gap-1 rounded-xl bg-muted p-1">
            <button
              onClick={() => setTab('companies')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'companies'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-text-body hover:text-foreground'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Компании
              <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-body">{companies.length}</span>
            </button>
            <button
              onClick={() => setTab('campaigns')}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === 'campaigns'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-text-body hover:text-foreground'
              }`}
            >
              <Megaphone className="h-4 w-4" />
              Кампании
              <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-body">{campaigns.length}</span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'companies' ? 'Поиск компаний...' : 'Поиск кампаний...'}
                className="h-9 w-56 rounded-xl border border-[rgba(0,0,0,0.08)] bg-muted pl-9 pr-3 text-sm text-foreground placeholder-text-subtle outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`inline-flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-muted-foreground hover:text-text-body'
                }`}
                aria-label="Сетка"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.4"/>
                  <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor"/>
                  <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor"/>
                  <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.4"/>
                </svg>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`inline-flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                  viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-muted-foreground hover:text-text-body'
                }`}
                aria-label="Таблица"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="14" height="4" rx="1" fill="currentColor"/>
                  <rect x="1" y="6" width="14" height="4" rx="1" fill="currentColor" opacity="0.4"/>
                  <rect x="1" y="11" width="14" height="4" rx="1" fill="currentColor" opacity="0.4"/>
                </svg>
              </button>
            </div>

            <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md">
              <Filter className="h-4 w-4" />
              Фильтры
              <ChevronDown className="h-3.5 w-3.5 text-text-subtle" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        {tab === 'companies' && (
          <>
            {/* Summary stats — user spec: Database / Send / MessageSquare / TrendingUp */}
            <div className="mb-6 grid grid-cols-12 gap-[14px]">
              {(() => {
                const totalCompanies = companies.length;
                const sentCount = new Set(campaigns.map((c) => c.companyId)).size;
                const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
                const totalLeads = campaigns.reduce((s, c) => s + c.leadsGenerated, 0);
                const conversionRate = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0;
                const totalCrmLeads = companies.reduce((s, c) => s + c.activeLeads, 0);

                return [
                  { label: 'Компаний', value: totalCompanies, suffix: '+25 сегодня', icon: Database, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Отправлено', value: sentCount, suffix: 'за всё время', icon: Send, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Ответили', value: totalConversions, suffix: `конверсия ${conversionRate}%`, icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'В CRM', value: totalCrmLeads, suffix: 'из аутрича → лиды', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
                ].map((stat) => (
                  <BentoCard key={stat.label} className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-4 p-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${stat.color}`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-2xl font-bold ${stat.label === 'В CRM' ? 'text-accent-green' : 'text-foreground'}`}>{stat.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="mt-0.5 text-[10px] text-text-subtle">{stat.suffix}</p>
                    </div>
                  </BentoCard>
                ));
              })()}
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-12 gap-[14px] items-stretch">
                {filteredCompanies.map((company) => (
                  <div key={company.id} className="col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3">
                    <CompanyCard company={company} />
                  </div>
                ))}
              </div>
            ) : (
              <CompanyTable companies={filteredCompanies} />
            )}

            {filteredCompanies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Building2 className="h-12 w-12 text-text-subtle" />
                <p className="mt-4 text-sm font-medium text-text-body">Компании не найдены</p>
                <p className="mt-1 text-xs text-text-subtle">Попробуйте изменить параметры поиска</p>
              </div>
            )}
          </>
        )}

        {tab === 'campaigns' && (
          <>
            {/* Summary stats — 12-col grid */}
            <div className="mb-6 grid grid-cols-12 gap-[14px]">
              {[
                { label: 'Всего кампаний', value: campaigns.length, icon: Megaphone, color: 'text-blue-600 bg-blue-50' },
                { label: 'Активных', value: campaigns.filter((c) => c.status === 'active').length, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Всего лидов', value: campaigns.reduce((s, c) => s + c.leadsGenerated, 0), icon: Target, color: 'text-blue-600 bg-blue-50' },
                { label: 'Бюджет всего', value: formatCurrency(campaigns.reduce((s, c) => s + c.budget, 0)), icon: Wallet, color: 'text-amber-600 bg-amber-50' },
              ].map((stat) => (
                <BentoCard key={stat.label} className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-center gap-3 p-5">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{stat.value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </BentoCard>
              ))}
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-12 gap-[14px] items-stretch">
                {filteredCampaigns.map((campaign) => (
                  <div key={campaign.id} className="col-span-12 sm:col-span-6 lg:col-span-4">
                    <CampaignCard campaign={campaign} />
                  </div>
                ))}
              </div>
            ) : (
              <CampaignTable campaigns={filteredCampaigns} />
            )}

            {filteredCampaigns.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Megaphone className="h-12 w-12 text-text-subtle" />
                <p className="mt-4 text-sm font-medium text-text-body">Кампании не найдены</p>
                <p className="mt-1 text-xs text-text-subtle">Попробуйте изменить параметры поиска</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}