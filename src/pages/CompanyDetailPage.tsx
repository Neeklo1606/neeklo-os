import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
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
  Sparkles,
  Loader2,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { SOURCE_CONFIG, type Company, type CompanyScoreBreakdown, type CompanyStatus, type DigitalAudit } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { fetchAudit } from '../lib/companies/audits-api';
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

function companyScore(company: Company): number {
  if (company.score != null) return company.score;
  if (company.icpScore != null) return company.icpScore;
  if (company.rating > 0) return Math.round(company.rating * 20);
  return 0;
}

// Real breakdown shape comes straight from server/score-company.mjs's
// scoreCompany() — no static criteria list here anymore, we just render
// whatever criteria the backend actually scored.
function resolveBreakdown(company: Company): CompanyScoreBreakdown {
  return company.score_breakdown ?? {};
}

const DETECTED_SIGNALS: { key: keyof Company; label: string }[] = [
  { key: 'hasOnlineBooking', label: 'Онлайн-запись' },
  { key: 'hasContactForm', label: 'Форма заявки' },
  { key: 'hasAnalytics', label: 'Аналитика (метрика/gtag)' },
  { key: 'hasAds', label: 'Реклама (RTB/adfox/utm)' },
  { key: 'socialVk', label: 'Есть VK' },
  { key: 'socialTelegram', label: 'Есть Telegram-канал' },
];

const AUDIT_SIGNALS: { key: keyof DigitalAudit; label: string }[] = [
  { key: 'website_exists', label: 'Сайт существует' },
  { key: 'https', label: 'HTTPS' },
  { key: 'form_exists', label: 'Форма на сайте' },
  { key: 'booking_exists', label: 'Онлайн-запись' },
  { key: 'catalog_exists', label: 'Каталог' },
  { key: 'personal_account_exists', label: 'Личный кабинет' },
  { key: 'dealer_section_exists', label: 'Дилерский раздел' },
  { key: 'analytics_detected', label: 'Аналитика' },
  { key: 'crm_widget_detected', label: 'CRM-виджет' },
];

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-50 text-green-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-gray-100 text-text-muted',
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'высокая',
  medium: 'средняя',
  low: 'низкая',
};

const MOBILE_STATUS_LABELS: Record<string, string> = {
  good: 'без проблем',
  issues: 'есть проблемы',
  unknown: 'не определено',
};

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
  const enrichCompany = useCompaniesStore((s) => s.enrichCompany);
  const [enriching, setEnriching] = useState(false);
  const [audit, setAudit] = useState<DigitalAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const companyIndex = useMemo(
    () => companies.findIndex((c) => c.id === companyId),
    [companies, companyId],
  );

  const company = companyIndex >= 0 ? companies[companyIndex] : undefined;

  useEffect(() => {
    if (!companyId) {
      setAudit(null);
      return;
    }
    let cancelled = false;
    setAuditLoading(true);
    fetchAudit(companyId)
      .then((result) => {
        if (!cancelled) setAudit(result);
      })
      .catch(() => {
        if (!cancelled) setAudit(null);
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

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

  const handleReEnrich = async () => {
    setEnriching(true);
    try {
      await enrichCompany(company.id);
      const freshAudit = await fetchAudit(company.id).catch(() => null);
      setAudit(freshAudit);
      toast.success('Сайт проверен заново');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обогатить компанию');
    } finally {
      setEnriching(false);
    }
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

            {/* Аудит — score breakdown + AI audit + detected signals */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Аудит
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReEnrich}
                    disabled={enriching}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-text-body transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Обогатить заново
                  </button>
                  <ScoreBadge score={score} size="lg" />
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${score}%` }}
                />
              </div>

              <div className="mt-5 space-y-0">
                {Object.entries(breakdown).length === 0 && (
                  <p className="py-3 text-[13px] text-text-muted">Скоринг ещё не рассчитан</p>
                )}
                {Object.entries(breakdown).map(([key, criterion]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 border-b border-border/40 py-3 last:border-0"
                  >
                    {criterion.met ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-text-primary">{criterion.label}</p>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                        criterion.met ? 'bg-green-50 text-green-700' : 'bg-muted text-text-muted',
                      )}
                    >
                      +{criterion.points}
                    </span>
                  </div>
                ))}
              </div>

              {company.auditText && (
                <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700/70">
                    AI-аудит сайта
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-amber-800">{company.auditText}</p>
                </div>
              )}

              <div className="mt-5 border-t border-border/40 pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  Обнаруженные признаки
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {DETECTED_SIGNALS.map(({ key, label }) => {
                    const met = Boolean(company[key]);
                    return (
                      <div key={String(key)} className="flex items-center gap-2 py-0.5">
                        {met ? (
                          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                        )}
                        <span className={cn('text-[12px]', met ? 'text-text-primary' : 'text-text-muted')}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {!company.enrichedAt && (
                  <p className="mt-3 text-[12px] text-text-subtle">Сайт ещё не проверялся</p>
                )}
              </div>
            </div>

            {/* Цифровой аудит — full server/audit-db.mjs record, fetched separately per company */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                  Цифровой аудит
                </h2>
                {audit?.audit_confidence && (
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      CONFIDENCE_STYLES[audit.audit_confidence],
                    )}
                  >
                    Уверенность: {CONFIDENCE_LABELS[audit.audit_confidence]}
                  </span>
                )}
              </div>

              {auditLoading && <p className="mt-4 text-[13px] text-text-muted">Загрузка...</p>}

              {!auditLoading && !audit && (
                <p className="mt-4 text-[13px] text-text-muted">Аудит ещё не проводился</p>
              )}

              {!auditLoading && audit && (
                <>
                  {audit.human_review_required && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                      <span className="text-[13px] font-medium text-red-700">Требует ручной проверки</span>
                    </div>
                  )}

                  {audit.observed_gap && (
                    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700/70">
                        Наблюдаемый разрыв (гипотеза)
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-amber-800">{audit.observed_gap}</p>
                    </div>
                  )}

                  {audit.key_conversion_path && (
                    <div className="mt-4">
                      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        Путь конверсии
                      </p>
                      <p className="text-[13px] leading-relaxed text-text-body">{audit.key_conversion_path}</p>
                    </div>
                  )}

                  <div className="mt-5 border-t border-border/40 pt-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                      Проверенные признаки
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {AUDIT_SIGNALS.map(({ key, label }) => {
                        const met = Boolean(audit[key]);
                        return (
                          <div key={String(key)} className="flex items-center gap-2 py-0.5">
                            {met ? (
                              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                            ) : (
                              <X className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                            )}
                            <span className={cn('text-[12px]', met ? 'text-text-primary' : 'text-text-muted')}>
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {audit.messenger_links && audit.messenger_links.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                          Мессенджеры
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {audit.messenger_links.map((link) => (
                            <a
                              key={link}
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] text-sky-600 hover:underline"
                            >
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {audit.growth_signals && audit.growth_signals.length > 0 && (
                      <div className="mt-3 flex items-start gap-2">
                        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                        <p className="text-[12px] text-text-body">
                          Сигналы роста: {audit.growth_signals.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>

                  {audit.mobile_status && (
                    <p className="mt-4 text-[12px] text-text-muted">
                      Мобильная версия:{' '}
                      <span className="font-medium text-text-body">
                        {MOBILE_STATUS_LABELS[audit.mobile_status]}
                      </span>
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4">
                    {audit.proof_url ? (
                      <a
                        href={audit.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] text-sky-600 hover:underline"
                      >
                        {audit.proof_url}
                      </a>
                    ) : (
                      <span className="text-[12px] text-text-subtle">Источник не указан</span>
                    )}
                    <span className="text-[11px] text-text-subtle">
                      Проверено: {new Date(audit.audited_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                </>
              )}
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
