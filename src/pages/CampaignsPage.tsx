import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Megaphone,
  TrendingUp,
  Target,
  Wallet,
  Search,
  ChevronDown,
  Filter,
  Eye,
  Plus,
  Download,
} from 'lucide-react';
import type { Campaign, CampaignStatus } from '../data/mock';
import { StatusPill } from '../components/ui/StatusPill';
import { BentoCard } from '../components/ui/BentoCard';
import { Modal } from '../components/ui/Modal';
import { useCampaignsStore } from '../lib/stores/campaignsStore';
import { exportToCsv, type CsvColumn } from '../lib/exportCsv';
import { formatCurrency, formatDate } from '../lib/utils';
import { toast } from 'sonner';

/* ---------- Column definitions for CSV export ---------- */
const csvColumns: CsvColumn<Campaign>[] = [
  { key: 'name', label: 'Название' },
  { key: 'status', label: 'Статус', format: (v) => ({ active: 'Активна', paused: 'Приостановлена', draft: 'Черновик', completed: 'Завершена' })[v as CampaignStatus] ?? String(v) },
  { key: 'budget', label: 'Бюджет', format: (v) => formatCurrency(Number(v)) },
  { key: 'spent', label: 'Потрачено', format: (v) => formatCurrency(Number(v)) },
  { key: 'leadsGenerated', label: 'Лидов' },
  { key: 'conversions', label: 'Конверсий' },
  { key: 'channels', label: 'Каналы', format: (v) => String((v as string[])?.join(', ') ?? v) },
  { key: 'startDate', label: 'Начало', format: (v) => formatDate(String(v)) },
  { key: 'endDate', label: 'Окончание', format: (v) => formatDate(String(v)) },
];

/* ---------- Campaign card ---------- */
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

/* ---------- Campaign table ---------- */
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

/* ---------- Add campaign dialog ---------- */
function AddCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addCampaign = useCampaignsStore((s) => s.addCampaign);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CampaignStatus>('draft');
  const [budget, setBudget] = useState(0);
  const [spent, setSpent] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setDescription('');
    setStatus('draft');
    setBudget(0);
    setSpent(0);
    setStartDate('');
    setEndDate('');
    setChannels([]);
    setChannelInput('');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Название обязательно';
    if (!startDate) newErrors.startDate = 'Дата начала обязательна';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const campaign: Campaign = {
      id: `camp-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      status,
      budget,
      spent,
      startDate: new Date(startDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : new Date(startDate).toISOString(),
      leadsGenerated: 0,
      conversions: 0,
      channels: channels.length > 0 ? channels : ['other'],
      companyId: '',
    };

    try {
      await addCampaign(campaign);
      toast.success(`Кампания «${campaign.name}» добавлена`);
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Новая кампания" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Название <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Летняя рассылка B2B"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {errors.name && <p className="mt-0.5 text-xs text-red-500">{errors.name}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Описание кампании…"
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Статус</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CampaignStatus)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="draft">Черновик</option>
              <option value="active">Активна</option>
              <option value="paused">Приостановлена</option>
              <option value="completed">Завершена</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Бюджет</label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Потрачено</label>
            <input
              type="number"
              min={0}
              value={spent}
              onChange={(e) => setSpent(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Дата начала <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.startDate && <p className="mt-0.5 text-xs text-red-500">{errors.startDate}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Дата окончания</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Каналы</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = channelInput.trim(); if (t && !channels.includes(t)) { setChannels((p) => [...p, t]); setChannelInput(''); } } }}
              placeholder="email, telegram, seo…"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => { const t = channelInput.trim(); if (t && !channels.includes(t)) { setChannels((p) => [...p, t]); setChannelInput(''); } }}
              className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
            >
              +
            </button>
          </div>
          {channels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {channels.map((ch) => (
                <span key={ch} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  {ch}
                  <button type="button" onClick={() => setChannels((p) => p.filter((x) => x !== ch))} className="text-blue-400 hover:text-blue-600">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted min-h-[44px]"
          >
            Отмена
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            Создать кампанию
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Page component ---------- */
type ViewMode = 'grid' | 'table';

export function CampaignsPage() {
  const campaigns = useCampaignsStore((s) => s.campaigns);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const filteredCampaigns = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.channels.some((ch) => ch.toLowerCase().includes(q)),
    );
  }, [campaigns, search]);

  const activeCount = campaigns.filter((c) => c.status === 'active').length;
  const totalLeads = campaigns.reduce((s, c) => s + c.leadsGenerated, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);

  return (
    <>
      {/* Header toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">Кампании</h1>
          <p className="text-xs text-muted-foreground">{campaigns.length} кампаний в работе</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск кампаний..."
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

          <button
            type="button"
            onClick={() => exportToCsv(campaigns, csvColumns, 'campaigns')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md min-h-[44px]"
            aria-label="Экспорт CSV"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Добавить
          </button>

          <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md">
            <Filter className="h-4 w-4" />
            Фильтры
            <ChevronDown className="h-3.5 w-3.5 text-text-subtle" />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-12 gap-[14px]">
        {[
          { label: 'Всего кампаний', value: campaigns.length, icon: Megaphone, color: 'text-blue-600 bg-blue-50' },
          { label: 'Активных', value: activeCount, icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Всего лидов', value: totalLeads, icon: Target, color: 'text-blue-600 bg-blue-50' },
          { label: 'Бюджет всего', value: formatCurrency(totalBudget), icon: Wallet, color: 'text-amber-600 bg-amber-50' },
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

      {/* Add campaign dialog */}
      <AddCampaignDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}