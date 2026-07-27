import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ParseSource } from '../data/mock';
import { SOURCE_CONFIG } from '../data/mock';

type PageState = 'form' | 'parsing';
type StepStatus = 'pending' | 'active' | 'done';
type MinRating = 3.5 | 4.0 | 4.5;

const NICHES = [
  'Стоматологии',
  'Медицинские клиники',
  'Агентства недвижимости',
  'Онлайн-школы / EdTech',
  'Турагентства',
  'Фитнес-клубы',
  'Автосервисы',
  'Юридические компании',
  'Строительство и ремонт',
] as const;

const PARSE_SOURCES: Exclude<ParseSource, 'manual'>[] = [
  '2gis',
  'yandex',
  'telegram',
  'instagram',
  'rusprofile',
  'avito',
];

const STEPS = [
  { label: 'Подключение к источнику' },
  { label: 'Поиск компаний по нише', detail: '+247 найдено' },
  { label: 'Сбор контактных данных' },
  { label: 'AI-скоринг (Claude)', detail: 'avg score: 69' },
  { label: 'Генерация аутрич-текстов' },
  { label: 'Сохранение в базу' },
] as const;

const STEP_DELAYS = [1500, 3000, 5000, 7500, 10000, 11500];

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

export function ParseLaunchPage() {
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('form');
  const [niche, setNiche] = useState('');
  const [source, setSource] = useState<Exclude<ParseSource, 'manual'> | ''>('');
  const [city, setCity] = useState('');
  const [minRating, setMinRating] = useState<MinRating>(4.0);

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    () => STEPS.map((_, i) => (i === 0 ? 'active' : 'pending')),
  );
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const showRating = source === '2gis' || source === 'yandex';

  useEffect(() => {
    if (pageState !== 'parsing') return;

    setStepStatuses(STEPS.map((_, i) => (i === 0 ? 'active' : 'pending')));
    setProgress(0);
    setIsComplete(false);

    const timers: ReturnType<typeof setTimeout>[] = [];

    STEP_DELAYS.forEach((delay, index) => {
      timers.push(
        setTimeout(() => {
          setStepStatuses((prev) => {
            const next = [...prev];
            for (let i = 0; i <= index; i++) {
              next[i] = 'done';
            }
            if (index + 1 < STEPS.length) {
              next[index + 1] = 'active';
            }
            return next;
          });
          setProgress(((index + 1) / STEPS.length) * 100);

          if (index === STEPS.length - 1) {
            setIsComplete(true);
          }
        }, delay),
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [pageState]);

  const buildParserPrompt = () => {
    return `Запусти парсинг.
Ниша: ${niche}
Источник: ${source}
Город: ${city || 'не указан'}

Используй API парсера. Верни 20+ компаний в виде JSON массива.
Структура: { name, source: '${source}', niche: '${niche}', city, address, phone, website, rating, reviews, status: 'new' }`;
  };

  const goToAgent = () => {
    navigate('/outreach/agent', {
      state: { prefillMessage: buildParserPrompt(), autoSend: true },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!niche || !source) return;
    setPageState('parsing');
  };

  const selectedSourceConfig = source ? SOURCE_CONFIG[source] : null;

  return (
    <div className="min-h-screen bg-bento-base py-12">
      <div className="mx-auto max-w-xl px-4">
        {pageState === 'form' ? (
          <div className="rounded-2xl border border-border bg-card p-8">
            <header>
              <h1 className="font-heading text-[28px] font-black tracking-tight text-text-primary">
                НОВЫЙ ПАРСИНГ
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                Найдём и проскорим компании для холодного аутрича
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

              {/* Field 2 — Source */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Источник парсинга
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {PARSE_SOURCES.map((key) => {
                    const config = SOURCE_CONFIG[key];
                    const isSelected = source === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSource(key)}
                        className={cn(
                          'cursor-pointer rounded-xl border p-3 text-center transition-colors',
                          isSelected
                            ? 'border-accent bg-card-blue'
                            : 'border-border bg-bento-base hover:border-accent/40',
                        )}
                      >
                        <span className="text-xl">{config.emoji}</span>
                        <p className="mt-1 text-xs font-medium text-text-body">{config.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 3 — City */}
              <div>
                <label
                  htmlFor="city"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-widest text-text-muted"
                >
                  Город (или несколько через запятую)
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Москва"
                  className="h-11 w-full rounded-xl border border-border bg-bento-base px-4 text-sm text-text-primary placeholder:text-text-subtle transition-colors focus:border-accent focus:outline-none"
                />
              </div>

              {/* Field 4 — Min rating */}
              {showRating && (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                    Мин. рейтинг
                  </p>
                  <div className="inline-flex gap-1 rounded-xl bg-bento-base p-1">
                    {([3.5, 4.0, 4.5] as MinRating[]).map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setMinRating(rating)}
                        className={cn(
                          'h-8 rounded-lg px-4 text-sm font-medium transition-all',
                          minRating === rating
                            ? 'bg-card text-text-primary shadow-sm'
                            : 'text-text-muted hover:text-text-body',
                        )}
                      >
                        {rating}+
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={!niche || !source}
                className="mt-6 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ▶ Запустить парсинг
              </button>
              <p className="mt-2 text-center text-xs text-text-subtle">
                ~200–500 компаний · 15–30 минут
              </p>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8">
            {!isComplete ? (
              <>
                <header>
                  <h2 className="font-heading text-[22px] font-bold text-text-primary">
                    Парсинг запущен
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {niche && (
                      <span className="rounded-full bg-bento-base px-3 py-1 text-xs font-medium text-text-body">
                        {niche}
                      </span>
                    )}
                    {selectedSourceConfig && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          border: `1px solid ${selectedSourceConfig.color}`,
                          color: selectedSourceConfig.color,
                        }}
                      >
                        {selectedSourceConfig.emoji} {selectedSourceConfig.label}
                      </span>
                    )}
                    {city && (
                      <span className="rounded-full bg-bento-base px-3 py-1 text-xs font-medium text-text-body">
                        {city}
                      </span>
                    )}
                  </div>
                </header>

                <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-bento-base">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <ul className="mt-8 space-y-4">
                  {STEPS.map((step, index) => {
                    const status = stepStatuses[index];
                    return (
                      <li key={step.label} className="flex items-start gap-3">
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
                          {'detail' in step && status === 'done' && (
                            <p className="mt-0.5 text-xs text-text-muted">{step.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="flex flex-col items-center py-6 text-center">
                <CheckCircle2 className="h-16 w-16 text-accent-green" strokeWidth={1.5} />
                <h2 className="mt-4 font-heading text-[22px] font-bold text-text-primary">
                  Готово! 247 компаний
                </h2>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {['247 найдено', '72 score 70+', 'avg: 69'].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-border bg-bento-base px-3 py-1.5 text-xs font-medium text-text-body"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={goToAgent}
                    className="h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
                  >
                    → Запустить в агенте
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/companies')}
                    className="h-11 rounded-xl border border-border bg-card px-6 text-sm font-semibold text-text-primary transition-colors hover:bg-muted"
                  >
                    Смотреть компании
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
