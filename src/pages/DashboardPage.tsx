import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart3,
  Building2,
  RadioTower,
  Sparkles,
  Signal,
  Map as MapIcon,
  RefreshCw,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { BentoCard } from '../components/ui/BentoCard';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useCampaignsStore } from '../lib/stores/campaignsStore';
import { fetchRadarSources, fetchRadarSignals, fetchRadarStatus, type RadarSource, type RadarSignal } from '../lib/radar/api';
import {
  fetchMorningReport,
  fetchWeeklyMetrics,
  sendReportNow,
  type MorningReport,
  type WeeklyMetrics,
} from '../lib/reports/api';
import { formatDate, formatRelativeTime } from '../lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

function KpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <BentoCard className="col-span-12 sm:col-span-6 lg:col-span-3 flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-4 font-heading text-3xl font-black tracking-tight text-foreground sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-xs text-text-subtle">{subtitle}</p>
    </BentoCard>
  );
}

/** Signals-found-per-day for the last 7 calendar days, keyed by ISO date (YYYY-MM-DD). */
function weeklyActivity(signals: RadarSignal[]): { date: string; label: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: string; label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const iso = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    days.push({ date: iso, label, count: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const s of signals) {
    if (!s.foundAt) continue;
    const iso = s.foundAt.slice(0, 10);
    const bucket = byDate.get(iso);
    if (bucket) bucket.count += 1;
  }
  return days;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const companies = useCompaniesStore((s) => s.companies);
  const campaigns = useCampaignsStore((s) => s.campaigns);

  const [newSignals, setNewSignals] = useState<RadarSignal[]>([]);
  const [allSignals, setAllSignals] = useState<RadarSignal[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [loadingRadar, setLoadingRadar] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const [morningReport, setMorningReport] = useState<MorningReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [sendingReport, setSendingReport] = useState(false);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetrics | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [loadingWeekly, setLoadingWeekly] = useState(false);

  const loadRadarData = useCallback(async () => {
    setLoadingRadar(true);
    try {
      const [newRes, allRes, sourcesRes, statusRes] = await Promise.all([
        fetchRadarSignals({ status: 'new' }),
        fetchRadarSignals(),
        fetchRadarSources(),
        fetchRadarStatus(),
      ]);
      setNewSignals(newRes.signals);
      setAllSignals(allRes.signals);
      setSources(sourcesRes.sources);
      setLastRunAt(statusRes.lastRunAt);
      setRefreshedAt(new Date().toISOString());
    } catch {
      // Radar service down/unreachable — KPIs fall back to 0 rather than
      // blocking the rest of the (real) dashboard data.
    } finally {
      setLoadingRadar(false);
    }
  }, []);

  useEffect(() => {
    loadRadarData();
  }, [loadRadarData]);

  useEffect(() => {
    fetchMorningReport()
      .then((res) => setMorningReport(res.report))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Не удалось загрузить утренний отчёт'))
      .finally(() => setLoadingReport(false));
  }, []);

  const loadWeekly = useCallback(() => {
    setLoadingWeekly(true);
    fetchWeeklyMetrics()
      .then((res) => setWeeklyMetrics(res.report))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Не удалось загрузить недельные метрики'))
      .finally(() => setLoadingWeekly(false));
  }, []);

  const toggleWeekly = () => {
    const next = !weeklyOpen;
    setWeeklyOpen(next);
    if (next && !weeklyMetrics) loadWeekly();
  };

  const handleSendMorningReport = async () => {
    setSendingReport(true);
    try {
      const res = await sendReportNow('morning');
      setMorningReport(res.report as MorningReport);
      if (res.sent) {
        toast.success('Утренний отчёт отправлен в Telegram');
      } else {
        toast.message('Отчёт собран, но Telegram не настроен (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось отправить отчёт');
    } finally {
      setSendingReport(false);
    }
  };

  const signals24h = useMemo(() => {
    const cutoff = Date.now() - DAY_MS;
    return newSignals.filter((s) => s.foundAt && new Date(s.foundAt).getTime() >= cutoff).length;
  }, [newSignals]);

  const activeChannels = useMemo(() => sources.filter((s) => s.active).length, [sources]);

  const score70Count = useMemo(() => companies.filter((c) => (c.score ?? 0) >= 70).length, [companies]);

  const enrichedCount = useMemo(() => companies.filter((c) => Boolean(c.enrichedAt)).length, [companies]);
  const enrichedPct = companies.length > 0 ? Math.round((enrichedCount / companies.length) * 100) : 0;

  const topCompanies = useMemo(
    () => [...companies].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5),
    [companies],
  );

  const recentSignals = useMemo(() => newSignals.slice(0, 5), [newSignals]);

  const activity = useMemo(() => weeklyActivity(allSignals), [allSignals]);
  const maxActivity = Math.max(1, ...activity.map((d) => d.count));

  const recentCartographerRuns = useMemo(
    () =>
      [...campaigns]
        .filter((c) => c.niche && c.region)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 5),
    [campaigns],
  );

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
              <p className="text-[10px] text-muted-foreground">Радар · Картограф · Компании</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {refreshedAt && (
              <span className="text-[11px] text-text-subtle">Обновлено: {formatRelativeTime(refreshedAt)}</span>
            )}
            <button
              onClick={loadRadarData}
              disabled={loadingRadar}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingRadar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        {/* Row 1: KPI cards */}
        <div className="mb-[14px] grid grid-cols-12 gap-[14px]">
          <KpiCard
            label="Сигналов новых"
            value={newSignals.length.toLocaleString()}
            subtitle={`за последние 24ч: ${signals24h}`}
            icon={Signal}
            color="text-blue-600 bg-blue-50"
          />
          <KpiCard
            label="Компаний в базе"
            value={companies.length.toLocaleString()}
            subtitle={`score 70+: ${score70Count}`}
            icon={Building2}
            color="text-amber-600 bg-amber-50"
          />
          <KpiCard
            label="Каналов на радаре"
            value={activeChannels.toLocaleString()}
            subtitle={`последняя проверка: ${lastRunAt ? formatRelativeTime(lastRunAt) : 'ещё не было'}`}
            icon={RadioTower}
            color="text-emerald-600 bg-emerald-50"
          />
          <KpiCard
            label="Обогащено"
            value={enrichedCount.toLocaleString()}
            subtitle={`${enrichedPct}% от базы`}
            icon={Sparkles}
            color="text-blue-600 bg-blue-50"
          />
        </div>

        {/* Row 2: recent signals + top companies */}
        <div className="mb-[14px] grid grid-cols-12 gap-[14px] items-stretch">
          <div className="col-span-12 lg:col-span-6">
            <BentoCard variant="white" className="flex h-full flex-col p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Signal className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Последние сигналы</h3>
                    <p className="text-[10px] text-muted-foreground">Новые, из Радара</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/radar')}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Все →
                </button>
              </div>

              <div className="mt-4 flex-1 space-y-1">
                {recentSignals.length === 0 ? (
                  <p className="py-6 text-center text-xs text-text-subtle">
                    {loadingRadar ? 'Загрузка…' : 'Новых сигналов нет'}
                  </p>
                ) : (
                  recentSignals.map((s) => (
                    <div key={s.id} className="rounded-xl px-3 py-2.5 transition-colors hover:bg-muted">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">@{s.channel}</span>
                        <span className="text-[10px] text-text-subtle">{formatRelativeTime(s.foundAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.text}</p>
                    </div>
                  ))
                )}
              </div>
            </BentoCard>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <BentoCard variant="white" className="flex h-full flex-col p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                    <Building2 className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Топ компаний по скору</h3>
                    <p className="text-[10px] text-muted-foreground">Из базы Companies</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/companies')}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Все →
                </button>
              </div>

              <div className="mt-4 flex-1 space-y-1">
                {topCompanies.length === 0 ? (
                  <p className="py-6 text-center text-xs text-text-subtle">Компаний пока нет</p>
                ) : (
                  topCompanies.map((company, idx) => (
                    <div
                      key={company.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
                      onClick={() => navigate(`/companies/${company.id}`)}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-text-subtle">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{company.industry}</p>
                      </div>
                      <ScoreBadge score={company.score ?? 0} />
                    </div>
                  ))
                )}
              </div>
            </BentoCard>
          </div>
        </div>

        {/* Row 3: weekly activity + recent cartographer runs */}
        <div className="grid grid-cols-12 gap-[14px] items-stretch">
          <div className="col-span-12 lg:col-span-6">
            <BentoCard variant="white" className="flex h-full flex-col p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Активность за неделю</h3>
                  <p className="text-[10px] text-muted-foreground">Сигналов найдено в день</p>
                </div>
              </div>

              <div className="mt-6 flex flex-1 items-end justify-between gap-2 px-1">
                {activity.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-[11px] font-semibold text-foreground">{d.count}</span>
                    <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-muted">
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-blue-500 to-blue-400 transition-all"
                        style={{ height: `${Math.max((d.count / maxActivity) * 100, d.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] capitalize text-text-subtle">{d.label}</span>
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <BentoCard variant="white" className="flex h-full flex-col p-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <MapIcon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Прогоны Картографа</h3>
                  <p className="text-[10px] text-muted-foreground">Последние сборы компаний</p>
                </div>
              </div>

              <div className="mt-4 flex-1 space-y-1">
                {recentCartographerRuns.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                    <p className="text-xs text-text-subtle">Прогонов ещё не было</p>
                    <button
                      onClick={() => navigate('/outreach/parse')}
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                    >
                      Запустить сбор →
                    </button>
                  </div>
                ) : (
                  recentCartographerRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
                      onClick={() => navigate(`/companies?campaignId=${run.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{run.niche}</p>
                        <p className="truncate text-xs text-muted-foreground">{run.region}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{run.leadsGenerated}</p>
                        <p className="text-[10px] text-muted-foreground">компаний</p>
                      </div>
                      <span className="w-20 shrink-0 text-right text-[10px] text-text-subtle">
                        {formatDate(run.startDate)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </BentoCard>
          </div>
        </div>

        {/* Row 4: daily report — server/jobs/daily-report.mjs */}
        <div className="mt-[14px] grid grid-cols-12 gap-[14px]">
          <div className="col-span-12">
            <BentoCard variant="white" className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Send className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Отчёты</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {morningReport ? `Утренний отчёт — ${formatRelativeTime(morningReport.generatedAt)}` : 'Утренний отчёт'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSendMorningReport}
                  disabled={sendingReport || loadingReport}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Отправить в Telegram
                </button>
              </div>

              {loadingReport ? (
                <p className="mt-6 py-6 text-center text-xs text-text-subtle">Загрузка…</p>
              ) : !morningReport ? (
                <p className="mt-6 py-6 text-center text-xs text-text-subtle">Не удалось загрузить отчёт</p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="rounded-xl bg-card-red/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-accent-red">A-сигналы за 24ч</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{morningReport.aSignals.count}</p>
                  </div>
                  <div className="rounded-xl bg-card-amber/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-accent-amber">B-сигналы за 24ч</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{morningReport.bSignals.count}</p>
                  </div>
                  <div className="rounded-xl bg-card-blue/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-accent-blue">Новые компании</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{morningReport.newCompanies.total}</p>
                    <p className="text-[10px] text-text-subtle">
                      A: {morningReport.newCompanies.aPriority} · B: {morningReport.newCompanies.bPriority}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Требует решения</p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {morningReport.decisionsNeeded.researchAPriority.length +
                        morningReport.decisionsNeeded.opportunitiesRequired.length +
                        morningReport.decisionsNeeded.unansweredASignals.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-card-green/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-accent-green">Просроченные follow-up</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{morningReport.overdueFollowUps.length}</p>
                  </div>
                </div>
              )}

              {morningReport && morningReport.aSignals.top.length > 0 && (
                <div className="mt-5 border-t border-border/40 pt-4">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                    Топ A-сигналов
                  </p>
                  <div className="space-y-1.5">
                    {morningReport.aSignals.top.map((s) => (
                      <div key={s.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{s.title}</p>
                          <p className="truncate text-[11px] text-text-subtle">{s.why}</p>
                        </div>
                        {s.link && (
                          <a href={s.link} target="_blank" rel="noreferrer" className="shrink-0 text-text-subtle hover:text-accent">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {morningReport && morningReport.recommendedActions.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700/70">
                    Рекомендуемые действия сегодня
                  </p>
                  <ul className="mt-2 space-y-1">
                    {morningReport.recommendedActions.map((action) => (
                      <li key={action} className="text-[13px] leading-relaxed text-amber-800">
                        • {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </BentoCard>
          </div>
        </div>

        {/* Row 5: weekly metrics table (server/jobs/daily-report.mjs's buildWeeklyMetrics) */}
        <div className="mt-[14px] grid grid-cols-12 gap-[14px]">
          <div className="col-span-12">
            <BentoCard variant="white" className="p-5">
              <button
                type="button"
                onClick={toggleWeekly}
                className="flex w-full cursor-pointer items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-foreground">Недельные метрики</h3>
                    <p className="text-[10px] text-muted-foreground">Лиды за последние 7 дней</p>
                  </div>
                </div>
                {weeklyOpen ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
              </button>

              {weeklyOpen && (
                <div className="mt-5">
                  {loadingWeekly ? (
                    <p className="py-6 text-center text-xs text-text-subtle">Загрузка…</p>
                  ) : !weeklyMetrics ? (
                    <p className="py-6 text-center text-xs text-text-subtle">Не удалось загрузить метрики</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        <div className="rounded-xl bg-muted p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Лидов всего</p>
                          <p className="mt-1 text-xl font-bold text-foreground">{weeklyMetrics.summary.totalLeads}</p>
                        </div>
                        <div className="rounded-xl bg-muted p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Квалиф. звонков</p>
                          <p className="mt-1 text-xl font-bold text-foreground">{weeklyMetrics.summary.qualifiedCalls}</p>
                        </div>
                        <div className="rounded-xl bg-muted p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Презентаций</p>
                          <p className="mt-1 text-xl font-bold text-foreground">{weeklyMetrics.summary.presentations}</p>
                        </div>
                        <div className="rounded-xl bg-card-green/40 p-3">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-accent-green">Сделок</p>
                          <p className="mt-1 text-xl font-bold text-foreground">{weeklyMetrics.summary.deals}</p>
                        </div>
                        <div
                          className={`rounded-xl p-3 ${weeklyMetrics.summary.leadsWithNoFollowUp > 0 ? 'bg-card-red/40' : 'bg-card-green/40'}`}
                        >
                          <p
                            className={`text-[10px] font-medium uppercase tracking-wide ${weeklyMetrics.summary.leadsWithNoFollowUp > 0 ? 'text-accent-red' : 'text-accent-green'}`}
                          >
                            Без follow-up
                          </p>
                          <p className="mt-1 text-xl font-bold text-foreground">{weeklyMetrics.summary.leadsWithNoFollowUp}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {Object.entries(weeklyMetrics.summary.byChannel).map(([channel, count]) => (
                          <span key={channel} className="rounded-full bg-muted px-3 py-1 text-xs text-text-body">
                            {channel}: <span className="font-semibold">{count}</span>
                          </span>
                        ))}
                      </div>

                      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                        <table className="min-w-full divide-y divide-gray-100">
                          <thead>
                            <tr className="bg-muted">
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Дата</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Канал</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Сегмент</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Стадия</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Причина отказа</th>
                              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-body">Комментарий</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {weeklyMetrics.rows.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-3 py-6 text-center text-xs text-text-subtle">
                                  Лидов за неделю нет
                                </td>
                              </tr>
                            ) : (
                              weeklyMetrics.rows.map((row, idx) => (
                                <tr key={idx}>
                                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-body">{formatDate(row.date)}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-body">{row.channel ?? '—'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-body">{row.segment ?? '—'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-body">{row.stage ?? '—'}</td>
                                  <td className="whitespace-nowrap px-3 py-2 text-xs text-text-body">{row.lossReason ?? '—'}</td>
                                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-text-body">{row.comment ?? '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </BentoCard>
          </div>
        </div>
      </main>
    </div>
  );
}
