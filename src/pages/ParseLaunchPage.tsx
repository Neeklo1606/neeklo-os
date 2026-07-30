import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCircle2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  startCartographerRun,
  fetchCartographerRun,
  fetchVerticals,
  type CartographerRun,
  type CartographerStage,
  type Vertical,
  type ExclusionFilters,
} from '../lib/cartographer/api';

type PageState = 'form' | 'running';
type StepStatus = 'pending' | 'active' | 'done';
type LimitOption = 10 | 25 | 50;

const LIMIT_OPTIONS: LimitOption[] = [10, 25, 50];
const POLL_INTERVAL_MS = 3000;

const STEPS_WITH_ENRICH: { key: CartographerStage; label: string }[] = [
  { key: 'search', label: 'Поиск компаний' },
  { key: 'extract', label: 'Извлечение данных' },
  { key: 'exclude', label: 'Фильтрация' },
  { key: 'phones', label: 'Дозапрос телефонов' },
  { key: 'enrich', label: 'Проверка сайтов' },
  { key: 'score', label: 'Скоринг' },
];
const STEPS_WITHOUT_ENRICH: { key: CartographerStage; label: string }[] = [
  { key: 'search', label: 'Поиск компаний' },
  { key: 'extract', label: 'Извлечение данных' },
  { key: 'exclude', label: 'Фильтрация' },
  { key: 'phones', label: 'Дозапрос телефонов' },
];

const EXCLUSION_OPTIONS: { key: keyof ExclusionFilters; label: string }[] = [
  { key: 'retailOnly', label: 'Мелкую розницу без оптового направления' },
  { key: 'noWebsite', label: 'Компании без сайта' },
  { key: 'federalCorp', label: 'Федеральные корпорации без локального ЛПР' },
  { key: 'microBusiness', label: 'Микробизнес (1 сотрудник, нет признаков процесса)' },
  { key: 'duplicates', label: 'Дубликаты по домену/телефону/названию' },
];

/**
 * Pre-checks each of the 5 fixed exclusion boxes based on whether the
 * selected vertical's own excludeIf text (free-form per vertical, e.g.
 * manufacturers: ['розница без опта', 'нет сайта', 'федеральная
 * корпорация']) actually mentions that concept — a vertical whose
 * excludeIf doesn't mention retail/website/federal/micro-business at all
 * (glamping's is "менее 3 объектов" / "только через агрегатор", neither
 * matches any of the 5) genuinely defaults those boxes unchecked rather
 * than pretending a match exists. "Дубликаты" has no vertical-text
 * equivalent at all — it's data hygiene, not a business judgment call, so
 * it defaults on regardless of vertical.
 */
function defaultExclusionsForVertical(vertical: Vertical | null): ExclusionFilters {
  const text = (vertical?.excludeIf ?? []).join(' ').toLowerCase();
  return {
    retailOnly: /розниц/.test(text),
    noWebsite: /сайт/.test(text),
    federalCorp: /федерал|корпораци/.test(text),
    microBusiness: /один сотрудник|микробизнес/.test(text),
    duplicates: true,
  };
}

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
  const [verticals, setVerticals] = useState<Record<string, Vertical> | null>(null);
  const [secondPriority, setSecondPriority] = useState<string[]>([]);
  const [verticalsLoading, setVerticalsLoading] = useState(true);
  const [selectedVerticalKey, setSelectedVerticalKey] = useState('');
  const [selectedSubsegment, setSelectedSubsegment] = useState('');
  const [showSecondPriority, setShowSecondPriority] = useState(false);
  const [exclude, setExclude] = useState<ExclusionFilters>(defaultExclusionsForVertical(null));
  const [showExcluded, setShowExcluded] = useState(false);
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

  useEffect(() => {
    fetchVerticals()
      .then((res) => {
        setVerticals(res.verticals);
        setSecondPriority(res.secondPriority);
      })
      .catch(() => toast.error('Не удалось загрузить список ниш'))
      .finally(() => setVerticalsLoading(false));
  }, []);

  const activeVerticals = verticals
    ? Object.entries(verticals).filter(([, v]) => v.active)
    : [];
  const selectedVertical = selectedVerticalKey ? (verticals?.[selectedVerticalKey] ?? null) : null;
  // Subsegment narrows the search; without one, the vertical's own label
  // is the niche (matches subsegments' role as the taxonomy's display layer).
  const niche = selectedSubsegment || selectedVertical?.label || '';

  const handleVerticalSelect = (key: string) => {
    const nextKey = key === selectedVerticalKey ? '' : key;
    setSelectedVerticalKey(nextKey);
    setSelectedSubsegment('');
    setExclude(defaultExclusionsForVertical(nextKey ? (verticals?.[nextKey] ?? null) : null));
  };

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
        verticalKey: selectedVerticalKey || undefined,
        exclude,
      });

      setRun({
        id: runId,
        status: 'running',
        stage: 'search',
        found: 0,
        excludedCount: 0,
        excluded: [],
        phonesTotal: 0,
        phonesFetched: 0,
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
              {/* Field 1 — Vertical */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Вертикаль
                </p>
                {verticalsLoading ? (
                  <p className="text-sm text-text-muted">Загрузка ниш…</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {activeVerticals.map(([key, v]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleVerticalSelect(key)}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-colors',
                          selectedVerticalKey === key
                            ? 'border-accent bg-card-blue'
                            : 'border-border bg-bento-base hover:border-accent/40',
                        )}
                      >
                        <p className="text-sm font-medium text-text-primary">{v.label}</p>
                        <p className="mt-0.5 text-xs text-text-muted">{v.subsegments.length} подсегментов</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subsegment — optional narrowing within the selected vertical */}
              {selectedVertical && (
                <div>
                  <label
                    htmlFor="subsegment"
                    className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted"
                  >
                    Подсегмент (необязательно)
                  </label>
                  <select
                    id="subsegment"
                    value={selectedSubsegment}
                    onChange={(e) => setSelectedSubsegment(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-bento-base px-4 text-sm text-text-primary transition-colors focus:border-accent focus:outline-none"
                  >
                    <option value="">Вся вертикаль — {selectedVertical.label}</option>
                    {selectedVertical.subsegments.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Context — what the system looks for + the product it implies */}
              {selectedVertical && (
                <div className="rounded-xl border border-border bg-bento-base p-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Что ищет система
                  </p>
                  <ul className="mt-2 space-y-1">
                    {selectedVertical.lookFor.map((hint) => (
                      <li key={hint} className="flex items-start gap-1.5 text-xs text-text-body">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {hint}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Продукт
                  </p>
                  <p className="mt-1 text-xs text-text-body">{selectedVertical.productArchetype}</p>
                </div>
              )}

              {/* Exclude — controls server/jobs/cartographer-run.mjs's exclusion
                  filter; collecting everything unfiltered is explicitly the
                  wrong outcome here, not just noisy. */}
              {selectedVertical && (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Исключить
                  </p>
                  <div className="flex flex-col gap-2 rounded-xl border border-border bg-bento-base p-3">
                    {EXCLUSION_OPTIONS.map((opt) => (
                      <label key={opt.key} className="flex cursor-pointer items-start gap-2.5 text-sm text-text-body">
                        <input
                          type="checkbox"
                          checked={exclude[opt.key]}
                          onChange={(e) => setExclude({ ...exclude, [opt.key]: e.target.checked })}
                          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Second-priority niches — reference only, not selectable */}
              {secondPriority.length > 0 && (
                <details
                  className="rounded-xl border border-border bg-bento-base"
                  open={showSecondPriority}
                  onToggle={(e) => setShowSecondPriority((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-medium text-text-muted">
                    Второй приоритет — не для массовой работы
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', showSecondPriority && 'rotate-180')}
                    />
                  </summary>
                  <div className="flex flex-wrap gap-2 px-3 pb-3">
                    {secondPriority.map((n) => (
                      <span
                        key={n}
                        className="cursor-not-allowed rounded-full border border-border bg-card px-3 py-1 text-xs text-text-subtle opacity-60"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </details>
              )}

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
                              {step.key === 'exclude' && status !== 'pending' && (
                                <p className="mt-0.5 text-xs text-text-muted">
                                  исключено: {run?.excludedCount ?? 0} (не соответствуют критериям)
                                </p>
                              )}
                              {step.key === 'phones' && status !== 'pending' && (
                                <p className="mt-0.5 text-xs text-text-muted">
                                  дозапрошено: {run?.phonesFetched ?? 0} / {run?.phonesTotal ?? 0}
                                </p>
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
                {(run?.excludedCount ?? 0) > 0 && (
                  <details
                    className="mt-4 w-full rounded-xl border border-border bg-bento-base text-left"
                    open={showExcluded}
                    onToggle={(e) => setShowExcluded((e.target as HTMLDetailsElement).open)}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm text-text-muted">
                      Исключено: {run?.excludedCount} (не соответствуют критериям)
                      <ChevronDown className={cn('h-4 w-4 transition-transform', showExcluded && 'rotate-180')} />
                    </summary>
                    <ul className="flex flex-col gap-1 px-3 pb-3">
                      {(run?.excluded ?? []).map((e, i) => (
                        <li key={`${e.name}-${i}`} className="text-xs text-text-muted">
                          <span className="font-medium text-text-body">{e.name}</span> — {e.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
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
