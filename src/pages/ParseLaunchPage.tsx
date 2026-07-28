import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { startCartographerRun, fetchCartographerRun, type CartographerRun, type CartographerStage } from '../lib/cartographer/api';

type PageState = 'form' | 'running';
type StepStatus = 'pending' | 'active' | 'done';
type LimitOption = 10 | 25 | 50;

// The 10 priority niches — deterministic pipeline, no free-text niche input
// (unlike the LLM chat planner in AgentPage, which accepts anything).
const NICHES = [
  'Стоматологии и клиники',
  'Автосервисы',
  'Магазины с доставкой',
  'Глэмпинги и базы отдыха',
  'Производители и трейдеры',
  'Оптовая торговля продуктами',
  'Юридические и консалтинг',
  'Селлеры WB/Ozon',
  'Салоны красоты',
  'Промышленные B2B',
] as const;

const LIMIT_OPTIONS: LimitOption[] = [10, 25, 50];
const POLL_INTERVAL_MS = 3000;

const STEPS_WITH_ENRICH: { key: CartographerStage; label: string }[] = [
  { key: 'search', label: 'Поиск компаний' },
  { key: 'extract', label: 'Извлечение данных' },
  { key: 'enrich', label: 'Проверка сайтов' },
  { key: 'score', label: 'Скоринг' },
];
const STEPS_WITHOUT_ENRICH: { key: CartographerStage; label: string }[] = [
  { key: 'search', label: 'Поиск компаний' },
  { key: 'extract', label: 'Извлечение данных' },
];

function StepIndicator({ status }: { status: StepStatus }) {
  if (status === 'done') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-green text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'active') {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white animate-pulse">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card" />
  );
}

function DisabledSourceChip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="group relative cursor-not-allowed rounded-xl border border-border bg-bento-base p-3 text-center opacity-50">
      <span className="text-xl">{emoji}</span>
      <p className="mt-1 text-xs font-medium text-text-body">{label}</p>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-bento-dark px-2 py-1 text-[10px] text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        Временно недоступно
      </span>
    </div>
  );
}

export function ParseLaunchPage() {
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('form');
  const [niche, setNiche] = useState('');
  const [region, setRegion] = useState('');
  const [limit, setLimit] = useState<LimitOption>(10);
  const [enrich, setEnrich] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [run, setRun] = useState<CartographerRun | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const steps = enrich ? STEPS_WITH_ENRICH : STEPS_WITHOUT_ENRICH;
  const stageIndex = run ? steps.findIndex((s) => s.key === run.stage) : -1;

  const stepStatus = (index: number): StepStatus => {
    if (run?.status === 'completed') return 'done';
    if (stageIndex < 0) return index === 0 ? 'active' : 'pending';
    if (index < stageIndex) return 'done';
    if (index === stageIndex) return 'active';
    return 'pending';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche || !region.trim() || submitting) return;

    setSubmitting(true);
    try {
      const { runId, campaignId } = await startCartographerRun({
        niche,
        region: region.trim(),
        limit,
        enrich,
      });

      setRun({
        id: runId,
        status: 'running',
        stage: 'search',
        found: 0,
        enriched: 0,
        campaignId,
        niche,
        region: region.trim(),
        error: null,
      });
      setPageState('running');

      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchCartographerRun(runId);
          setRun(status);
          if (status.status !== 'running' && pollRef.current) {
            clearInterval(pollRef.current);
          }
        } catch {
          // Transient poll failure — keep the interval running and retry
          // on the next tick rather than killing the progress UI.
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось запустить сбор');
    } finally {
      setSubmitting(false);
    }
  };

  const isComplete = run?.status === 'completed';
  const isFailed = run?.status === 'failed';

  return (
    <div className="min-h-screen bg-bento-base py-12">
      <div className="mx-auto max-w-xl px-4">
        {pageState === 'form' ? (
          <div className="rounded-2xl border border-border bg-card p-8">
            <header>
              <h1 className="font-heading text-[28px] font-black tracking-tight text-text-primary">
                НОВЫЙ СБОР
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Картограф — детерминированный сбор компаний через 2ГИС, без LLM-планировщика
              </p>
            </header>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
              {/* Field 1 — Niche */}
              <div>
                <label
                  htmlFor="niche"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted"
                >
                  Ниша
                </label>
                <select
                  id="niche"
                  required
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-bento-base px-4 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none"
                >
                  <option value="">Выберите нишу</option>
                  {NICHES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field 2 — Region */}
              <div>
                <label
                  htmlFor="region"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted"
                >
                  Регион
                </label>
                <input
                  id="region"
                  type="text"
                  required
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Краснодар"
                  className="h-11 w-full rounded-xl border border-border bg-bento-base px-4 text-sm text-text-primary placeholder:text-text-subtle transition-colors focus:border-accent focus:outline-none"
                />
              </div>

              {/* Field 3 — Source (only 2GIS is wired up) */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Источник
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-accent bg-card-blue p-3 text-center">
                    <span className="text-xl">🗺</span>
                    <p className="mt-1 text-xs font-medium text-text-body">2ГИС</p>
                  </div>
                  <DisabledSourceChip emoji="🔴" label="Яндекс.Карты" />
                  <DisabledSourceChip emoji="🛒" label="Avito" />
                </div>
              </div>

              {/* Field 4 — Limit */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Сколько собрать
                </p>
                <div className="inline-flex gap-1 rounded-xl bg-bento-base p-1">
                  {LIMIT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLimit(n)}
                      className={cn(
                        'h-8 rounded-lg px-4 text-sm font-medium transition-all',
                        limit === n
                          ? 'bg-card text-text-primary shadow-sm'
                          : 'text-text-muted hover:text-text-body',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 5 — Enrich toggle */}
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-text-body">
                <input
                  type="checkbox"
                  checked={enrich}
                  onChange={(e) => setEnrich(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                Сразу обогатить и проскорить
              </label>

              <button
                type="submit"
                disabled={!niche || !region.trim() || submitting}
                className="mt-2 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Запуск…' : '▶ Запустить сбор'}
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8">
            {!isComplete ? (
              <>
                <header>
                  <h2 className="font-heading text-[22px] font-bold text-text-primary">
                    {isFailed ? 'Сбор не удался' : 'Сбор запущен'}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-bento-base px-3 py-1 text-xs font-medium text-text-body">
                      {niche}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent px-3 py-1 text-xs font-medium text-accent">
                      🗺 2ГИС
                    </span>
                    <span className="rounded-full bg-bento-base px-3 py-1 text-xs font-medium text-text-body">
                      {region}
                    </span>
                  </div>
                </header>

                {isFailed ? (
                  <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {run?.error ?? 'Неизвестная ошибка'}
                  </p>
                ) : (
                  <>
                    <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-bento-base">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                        style={{ width: `${((Math.max(stageIndex, 0) + 1) / steps.length) * 100}%` }}
                      />
                    </div>

                    <ul className="mt-8 space-y-4">
                      {steps.map((step, index) => {
                        const status = stepStatus(index);
                        return (
                          <li key={step.key} className="flex items-start gap-3">
                            <StepIndicator status={status} />
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p
                                className={cn(
                                  'text-sm font-medium',
                                  status === 'pending' && 'text-text-subtle',
                                  status === 'active' && 'text-accent',
                                  status === 'done' && 'text-accent-green',
                                )}
                              >
                                {step.label}
                              </p>
                              {step.key === 'search' && status !== 'pending' && (
                                <p className="mt-0.5 text-xs text-text-muted">найдено: {run?.found ?? 0}</p>
                              )}
                              {step.key === 'enrich' && status !== 'pending' && (
                                <p className="mt-0.5 text-xs text-text-muted">
                                  обогащено: {run?.enriched ?? 0} / {run?.found ?? 0}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-16 w-16 text-accent-green" strokeWidth={1.5} />
                <h2 className="mt-4 font-heading text-[22px] font-bold text-text-primary">
                  Готово: {run?.found ?? 0} компаний
                </h2>
                {enrich && (
                  <p className="mt-1 text-sm text-text-muted">обогащено: {run?.enriched ?? 0}</p>
                )}
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/companies?campaignId=${encodeURIComponent(run?.campaignId ?? '')}`)}
                    className="h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
                  >
                    → Смотреть компании
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
