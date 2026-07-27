import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  Target,
  Users,
  Mail,
  Globe,
  MapPin,
  Wallet,
  Search,
  ChevronDown,
  Filter,
  Plus,
  Copy,
  Download,
} from 'lucide-react';
import type { Company, CompanyStatus } from '../data/mock';
import { SOURCE_CONFIG } from '../data/mock';
import { StatusPill } from '../components/ui/StatusPill';
import { BentoCard } from '../components/ui/BentoCard';
import { Modal } from '../components/ui/Modal';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useCopy } from '../hooks/useCopy';
import { exportToCsv, type CsvColumn } from '../lib/exportCsv';
import { formatDate } from '../lib/utils';
import { toast } from 'sonner';

function SourceBadge({ source }: { source: string }) {
  const config = SOURCE_CONFIG[source as keyof typeof SOURCE_CONFIG] ?? SOURCE_CONFIG.manual;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        border: `1px solid ${config.color}`,
        color: config.color,
      }}
    >
      {config.emoji} {config.label}
    </span>
  );
}

/* ---------- Column definitions for CSV export ---------- */
const csvColumns: CsvColumn<Company>[] = [
  { key: 'name', label: 'Компания' },
  { key: 'industry', label: 'Отрасль' },
  { key: 'city', label: 'Город' },
  { key: 'status', label: 'Статус', format: (v) => ({
    active: 'Активна',
    inactive: 'Неактивна',
    lead: 'Лид',
    new: 'Новый',
    approved: 'Одобрено',
    queued: 'В очереди',
    sent: 'Отправлено',
    replied: 'Ответил',
    qualified: 'Квалифицирован',
    skipped: 'Пропущен',
  })[v as CompanyStatus] ?? String(v) },
  { key: 'employees', label: 'Сотрудников' },
  { key: 'revenue', label: 'Выручка' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Сайт' },
];

/* ---------- Company card ---------- */
function CompanyCard({ company }: { company: Company }) {
  const navigate = useNavigate();
  const copy = useCopy();

  return (
    <BentoCard hover className="flex h-full flex-col p-5" onClick={() => navigate(`/companies/${company.id}`)}>
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); copy(`${company.name} — ${company.email}`, company.name); }}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg px-2 text-xs font-medium text-text-subtle transition-colors hover:bg-muted hover:text-blue-600 min-h-[44px] min-w-[44px]"
            aria-label="Скопировать компанию"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </BentoCard>
  );
}

/* ---------- Company table ---------- */
function CompanyTable({ companies }: { companies: Company[] }) {
  const navigate = useNavigate();
  const copy = useCopy();

  return (
    <BentoCard className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-muted">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Компания</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Источник</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Телефон</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Telegram</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Город</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Сотрудников</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Выручка</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Статус</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Лидов</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body">Дата</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-body" />
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
                <td className="whitespace-nowrap px-4 py-3">
                  <SourceBadge source={company.source ?? 'manual'} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {!company.phone ? (
                    <span className="text-text-subtle">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copy(company.phone, 'Телефон скопирован');
                      }}
                      className="flex items-center gap-1.5 text-xs font-mono text-text-body hover:text-accent transition-colors"
                    >
                      {company.phone}
                      <Copy size={10} className="opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {!company.telegram ? (
                    <span className="text-text-subtle">—</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copy(company.telegram!, 'Telegram скопирован');
                      }}
                      className="flex items-center gap-1.5 text-xs font-mono text-text-body hover:text-accent transition-colors"
                    >
                      {company.telegram}
                      <Copy size={10} className="opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.city}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.employees}</td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-foreground">{company.revenue}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusPill status={company.status} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{company.activeLeads}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">{formatDate(company.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); copy(`${company.name} — ${company.email}`, company.name); }}
                    className="inline-flex cursor-pointer items-center justify-center rounded-md p-2 text-text-subtle opacity-0 transition-all hover:bg-muted hover:text-blue-600 group-hover:opacity-100 min-h-[44px] min-w-[44px]"
                    aria-label="Скопировать компанию"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}

/* ---------- Add company dialog ---------- */
function AddCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addCompany = useCompaniesStore((s) => s.addCompany);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<CompanyStatus>('lead');
  const [employees, setEmployees] = useState(0);
  const [revenue, setRevenue] = useState('');
  const [description, setDescription] = useState('');
  const [nicheInput, setNicheInput] = useState('');
  const [niches, setNiches] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName('');
    setIndustry('');
    setWebsite('');
    setPhone('');
    setEmail('');
    setCity('');
    setStatus('lead');
    setEmployees(0);
    setRevenue('');
    setDescription('');
    setNiches([]);
    setNicheInput('');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Название обязательно';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const company: Company = {
      id: `company-${Date.now()}`,
      name: name.trim(),
      industry: industry.trim() || '—',
      website: website.trim(),
      phone: phone.trim(),
      email: email.trim(),
      status,
      employees,
      revenue: revenue.trim() || '—',
      city: city.trim() || '—',
      contacts: 0,
      activeLeads: 0,
      createdAt: new Date().toISOString(),
      avatar: name.trim().slice(0, 2).toUpperCase(),
      rating: 0,
      reviewCount: 0,
      niches: niches.length > 0 ? niches : [],
      description: description.trim() || undefined,
    };

    try {
      await addCompany(company);
      toast.success(`Компания «${company.name}» добавлена`);
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Новая компания">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Название <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ООО «Пример»"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {errors.name && <p className="mt-0.5 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Отрасль</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="IT / Разработка ПО"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Сайт</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="example.ru"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Телефон</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (495) 123-45-67"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@example.ru"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Город</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Москва"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Статус</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CompanyStatus)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="lead">Лид</option>
              <option value="active">Активна</option>
              <option value="inactive">Неактивна</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Сотрудников</label>
            <input
              type="number"
              min={0}
              value={employees}
              onChange={(e) => setEmployees(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Выручка</label>
            <input
              type="text"
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="450 млн ₽"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Ниши</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nicheInput}
                onChange={(e) => setNicheInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = nicheInput.trim(); if (t && !niches.includes(t)) { setNiches((p) => [...p, t]); setNicheInput(''); } } }}
                placeholder="ERP, CRM…"
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => { const t = nicheInput.trim(); if (t && !niches.includes(t)) { setNiches((p) => [...p, t]); setNicheInput(''); } }}
                className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
              >
                +
              </button>
            </div>
            {niches.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {niches.map((n) => (
                  <span key={n} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {n}
                    <button type="button" onClick={() => setNiches((p) => p.filter((x) => x !== n))} className="text-blue-400 hover:text-blue-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Краткое описание компании…"
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
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
            Создать компанию
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Page component ---------- */
type ViewMode = 'grid' | 'table';

export function CompaniesPage() {
  const companies = useCompaniesStore((s) => s.companies);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);

  const sources = ['all', '2gis', 'yandex', 'telegram', 'instagram', 'rusprofile', 'avito', 'manual'];
  const sourceLabels: Record<string, string> = {
    all: `Все (${companies.length})`,
    '2gis': '🗺 2GIS',
    yandex: '🔴 Яндекс',
    telegram: '✈️ Telegram',
    instagram: '📸 Instagram',
    rusprofile: '🏛 RusProfile',
    avito: '🛒 Avito',
    manual: '✏️ Вручную',
  };

  const filteredCompanies = useMemo(() => {
    let filtered = companies.filter(
      (c) => sourceFilter === 'all' || c.source === sourceFilter,
    );
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [companies, search, sourceFilter]);

  const activeCount = companies.filter((c) => c.status === 'active').length;
  const totalLeads = companies.reduce((s, c) => s + c.activeLeads, 0);
  const totalEmployees = companies.reduce((s, c) => s + c.employees, 0);

  return (
    <>
      {/* Source filter tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSourceFilter(s)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              sourceFilter === s
                ? 'bg-bento-dark text-white border-transparent'
                : 'bg-card text-text-muted border-border hover:text-text-primary'
            }`}
          >
            {sourceLabels[s]}
          </button>
        ))}
      </div>

      {/* Header toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">Компании</h1>
          <p className="text-xs text-muted-foreground">{companies.length} компаний в базе</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск компаний..."
              className="h-11 w-56 rounded-xl border border-[rgba(0,0,0,0.08)] bg-muted pl-9 pr-3 text-sm text-foreground placeholder-text-subtle outline-none transition-all focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-2 text-xs font-medium transition-all min-h-[44px] min-w-[44px] ${
                viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-muted-foreground hover:text-text-body'
              }`}
              aria-label="Сетка"
            >
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.4"/>
                <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor"/>
                <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor"/>
                <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.4"/>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex cursor-pointer items-center justify-center rounded-md px-3 py-2 text-xs font-medium transition-all min-h-[44px] min-w-[44px] ${
                viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-muted-foreground hover:text-text-body'
              }`}
              aria-label="Таблица"
            >
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="14" height="4" rx="1" fill="currentColor"/>
                <rect x="1" y="6" width="14" height="4" rx="1" fill="currentColor" opacity="0.4"/>
                <rect x="1" y="11" width="14" height="4" rx="1" fill="currentColor" opacity="0.4"/>
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportToCsv(companies, csvColumns, 'companies')}
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

          <button className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md min-h-[44px]">
            <Filter className="h-4 w-4" />
            Фильтры
            <ChevronDown className="h-3.5 w-3.5 text-text-subtle" />
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-12 gap-[14px]">
        {[
          { label: 'Всего компаний', value: companies.length, icon: Building2, color: 'text-blue-600 bg-blue-50' },
          { label: 'Активных', value: activeCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Всего лидов', value: totalLeads, icon: Target, color: 'text-blue-600 bg-blue-50' },
          { label: 'Всего сотрудников', value: totalEmployees, icon: Users, color: 'text-amber-600 bg-amber-50' },
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

      {/* Add company dialog */}
      <AddCompanyDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}