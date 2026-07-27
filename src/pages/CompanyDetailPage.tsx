import { useMemo, type ComponentType, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Phone,
  Send,
  Globe,
  MapPin,
  Copy,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Star,
  DollarSign,
  Check,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { SOURCE_CONFIG, type Company, type CompanyScoreBreakdown, type CompanyStatus } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { AppShell } from '../components/AppShell';
import { cn } from '../lib/utils';

const FUNNEL_STAGES: { key: CompanyStatus; label: string }[] = [
  { key: 'new', label: 'Новый' },
  { key: 'approved', label: 'Одобрен' },
  { key: 'queued', label: 'В очереди' },
  { key: 'sent', label: 'Отправлено' },
  { key: 'replied', label: 'Ответил' },
  { key: 'qualified', label: 'Квалифицирован' },
  { key: 'lead', label: 'В CRM' },
];

const SCORE_CRITERIA: {
  key: keyof CompanyScoreBreakdown;
  name: string;
  description: string;
  points: number;
}[] = [
  { key: 'no_online_booking', name: 'Нет онлайн-записи', description: 'Теряет заявки ночью', points: 25 },
  { key: 'high_rating', name: 'Рейтинг 4.5+', description: 'Клиенты доверяют', points: 20 },
  { key: 'has_website', name: 'Есть сайт', description: 'Точка интеграции', points: 15 },
  { key: 'no_telegram', name: 'Нет Telegram', description: 'Не автоматизирован', points: 15 },
  { key: 'revenue_10m_plus', name: 'Выручка от 10М ₽', description: 'Есть бюджет', points: 12 },
  { key: 'reviews_50_plus', name: '50+ отзывов', description: 'Активный бизнес', points: 5 },
];

function companyScore(company: Company): number {
  if (company.score != null) return company.score;
  if (company.icpScore != null) return company.icpScore;
  if (company.rating > 0) return Math.round(company.rating * 20);
  return 0;
}

function resolveBreakdown(company: Company): CompanyScoreBreakdown {
  if (company.score_breakdown) return company.score_breakdown;
  const score = companyScore(company);
  if (score > 60) {
    return {
      no_online_booking: true,
      high_rating: true,
      has_website: true,
      no_telegram: true,
      revenue_10m_plus: true,
      reviews_50_plus: true,
    };
  }
  return {
    no_online_booking: true,
    high_rating: true,
    has_website: true,
    no_telegram: false,
    revenue_10m_plus: false,
    reviews_50_plus: false,
  };
}

function funnelIndex(status: CompanyStatus): number {
  const idx = FUNNEL_STAGES.findIndex((s) => s.key === status);
  if (idx >= 0) return idx;
  if (status === 'active' || status === 'inactive') return 0;
  return 0;
}

function websiteDomain(website: string): string {
  if (!website) return '—';
  return website.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function copyText(value: string) {
  navigator.clipboard.writeText(value).then(() => toast('📋 Скопировано'));
}

function ContactRow({
  icon: Icon,
  label,
  children,
  copyValue,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  copyValue?: string;
}) {
  return (
    <div className="group flex items-center gap-3 border-b border-border/40 py-3 last:border-0">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-text-muted" />
      </div>
      <span className="w-16 shrink-0 font-mono text-[11px] text-text-muted">{label}</span>
      <div className="min-w-0 flex-1 text-sm text-text-body">{children}</div>
      {copyValue && (
        <button
          type="button"
          onClick={() => copyText(copyValue)}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={`Скопировать ${label}`}
        >
          <Copy className="h-3 w-3 text-text-muted hover:text-accent" />
        </button>
      )}
    </div>
  );
}

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companies = useCompaniesStore((s) => s.companies);
  const updateStatus = useCompaniesStore((s) => s.updateStatus);

  const companyIndex = useMemo(
    () => companies.findIndex((c) => c.id === companyId),
    [companies, companyId],
  );

  const company = companyIndex >= 0 ? companies[companyIndex] : undefined;

  const score = company ? companyScore(company) : 0;
  const breakdown = company ? resolveBreakdown(company) : {};
  const currentFunnelIdx = company ? funnelIndex(company.status) : 0;

  if (!company) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="font-heading text-xl font-bold text-text-primary">Компания не найдена</p>
          <button
            type="button"
            onClick={() => navigate('/companies')}
            className="mt-6 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-muted"
          >
            ← Назад к компаниям
          </button>
        </div>
      </AppShell>
    );
  }

  const sourceConfig = SOURCE_CONFIG[company.source ?? 'manual'];
  const niche = company.niches[0] ?? company.industry;
  const websiteUrl = company.website.startsWith('http')
    ? company.website
    : company.website
      ? `https://${company.website}`
      : '';

  const goPrev = () => {
    if (companyIndex > 0) navigate(`/companies/${companies[companyIndex - 1].id}`);
  };

  const goNext = () => {
    if (companyIndex < companies.length - 1) navigate(`/companies/${companies[companyIndex + 1].id}`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => navigate('/companies')}
          className="text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          ← Компании
        </button>

        <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-black text-text-primary">{company.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ border: `1px solid ${sourceConfig.color}`, color: sourceConfig.color }}
              >
                {sourceConfig.emoji} {sourceConfig.label}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-text-muted">{niche}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={companyIndex <= 0}
              className="flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm text-text-body transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Предыдущая компания"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4rem] text-center text-sm text-text-muted">
              {companyIndex + 1}/{companies.length}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={companyIndex >= companies.length - 1}
              className="flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm text-text-body transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Следующая компания"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* LEFT */}
          <div className="flex flex-col gap-5 lg:col-span-3">
            {/* Contacts */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="mb-4 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                Контакты
              </h2>

              <ContactRow icon={Phone} label="телефон" copyValue={company.phone || undefined}>
                {company.phone || '—'}
              </ContactRow>

              <ContactRow icon={Send} label="telegram" copyValue={company.telegram || undefined}>
                {company.telegram ? (
                  <a
                    href={`https://t.me/${company.telegram.replace('@', '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {company.telegram}
                  </a>
                ) : (
                  '—'
                )}
              </ContactRow>

              <ContactRow icon={Globe} label="сайт">
                {company.website ? (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {websiteDomain(company.website)}
                  </a>
                ) : (
                  '—'
                )}
              </ContactRow>

              <ContactRow icon={MapPin} label="адрес">
                {company.address || company.city || '—'}
              </ContactRow>

              <ContactRow icon={Star} label="рейтинг">
                {company.rating > 0
                  ? `★ ${company.rating} · ${company.reviewCount} отзывов`
                  : '—'}
              </ContactRow>

              <ContactRow icon={DollarSign} label="выручка">
                {company.revenue_m != null ? `${company.revenue_m}M ₽/год` : '—'}
              </ContactRow>
            </div>

            {/* Score */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Скоринг
                </h2>
                <ScoreBadge score={score} size="lg" />
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${score}%` }}
                />
              </div>

              <div className="mt-5 space-y-0">
                {SCORE_CRITERIA.map((criterion) => {
                  const met = Boolean(breakdown[criterion.key]);
                  return (
                    <div
                      key={criterion.key}
                      className="flex items-start gap-3 border-b border-border/40 py-3 last:border-0"
                    >
                      {met ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-text-primary">{criterion.name}</p>
                        <p className="text-[11px] text-text-muted">{criterion.description}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                          met ? 'bg-green-50 text-green-700' : 'bg-muted text-text-muted',
                        )}
                      >
                        +{met ? criterion.points : 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2">
            <div className="sticky top-6 flex flex-col gap-4 self-start">
              {/* Funnel */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  Воронка
                </h2>
                <div className="relative mt-4">
                  <div className="absolute bottom-4 left-[9px] top-4 w-px bg-border" />
                  {FUNNEL_STAGES.map((stage, idx) => {
                    const isPast = idx < currentFunnelIdx;
                    const isCurrent = idx === currentFunnelIdx;
                    return (
                      <div key={stage.key} className="relative z-10 flex items-center gap-3 py-2">
                        <div
                          className={cn(
                            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full',
                            isPast && 'bg-green-500',
                            isCurrent && 'bg-accent ring-4 ring-blue-500/15',
                            !isPast && !isCurrent && 'border-2 border-border bg-card',
                          )}
                        >
                          {isPast && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                          {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </div>
                        <span
                          className={cn(
                            'text-xs',
                            isPast && 'text-green-600',
                            isCurrent && 'font-medium text-text-primary',
                            !isPast && !isCurrent && 'text-text-muted',
                          )}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pain */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-amber-700/70">
                    AI-анализ боли
                  </span>
                </div>
                <p className="mt-3 text-[13px] italic leading-relaxed text-amber-800">
                  {company.pain_text || 'Анализ не проводился'}
                </p>
                <div className="mt-4 border-t border-amber-100 pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-amber-500/60">
                    Рекомендуем:
                  </p>
                  <span className="mt-1.5 inline-block rounded-xl bg-accent px-3 py-1.5 text-[13px] font-semibold text-white">
                    {company.recommended_offer || 'AI-решение для бизнеса'}
                  </span>
                </div>
              </div>

              {/* Outreach */}
              <div className="rounded-2xl bg-bento-dark p-6 text-white">
                <div className="flex items-center">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                    Аутрич-текст
                  </span>
                  <span className="ml-2 rounded-full bg-white/[0.08] px-2 text-[10px] text-white/50">
                    Claude Sonnet
                  </span>
                </div>

                <p className="mt-4 text-[13px] leading-relaxed text-white/80">
                  {company.outreach_text || 'Текст не сгенерирован'}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (company.outreach_text) {
                        navigator.clipboard.writeText(company.outreach_text).then(() =>
                          toast('📋 Текст скопирован в буфер!'),
                        );
                      }
                    }}
                    disabled={!company.outreach_text}
                    className="flex h-9 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                  >
                    📋 Скопировать
                  </button>
                  {company.telegram && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(`https://t.me/${company.telegram!.replace('@', '')}`, '_blank')
                      }
                      className="flex h-9 items-center gap-2 rounded-xl bg-sky-500/20 px-3 text-sm text-sky-300 transition-colors hover:bg-sky-500/30"
                    >
                      ✈ Telegram
                    </button>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-2.5">
                  <button
                    type="button"
                    disabled={company.status === 'approved'}
                    onClick={() => {
                      updateStatus(company.id, 'approved');
                      toast.success('Одобрено! Готово к отправке');
                    }}
                    className="h-11 w-full rounded-xl bg-green-600 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-600/60"
                  >
                    {company.status === 'approved' ? '✓ Одобрено' : '✅ Одобрить'}
                  </button>

                  <button
                    type="button"
                    disabled={['queued', 'sent', 'replied'].includes(company.status)}
                    onClick={() => {
                      updateStatus(company.id, 'queued');
                      toast.success('Добавлено в очередь отправки');
                    }}
                    className="h-11 w-full rounded-xl bg-sky-600 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-600/60"
                  >
                    📬 В очередь
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateStatus(company.id, 'skipped');
                      toast('Пропущено');
                    }}
                    className="h-10 w-full rounded-xl bg-white/10 text-sm text-white/50 transition-colors hover:bg-white/15"
                  >
                    ⏭ Пропустить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
