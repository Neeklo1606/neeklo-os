import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Inbox, MessageSquare, Clock, ArrowRight, Copy as CopyIcon, Send as SendIcon, Phone as PhoneIcon } from 'lucide-react';
import { toast } from 'sonner';
import { SOURCE_CONFIG, type Company, type CompanyStatus, type Lead } from '../data/mock';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { useLeadsStore } from '../lib/stores/leadsStore';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { StatusPill } from '../components/ui/StatusPill';

type QueueTab = 'approved' | 'queued' | 'sent' | 'replied';

const TABS: { key: QueueTab; label: string }[] = [
  { key: 'approved', label: 'Одобрено' },
  { key: 'queued', label: 'В очереди' },
  { key: 'sent', label: 'Отправлено' },
  { key: 'replied', label: 'Ответили' },
];

function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return '1 день назад';
  if (days < 5) return `${days} дня назад`;
  return `${days} дн. назад`;
}

function companyScore(company: Company): number {
  if (company.score != null) return company.score;
  if (company.icpScore != null) return company.icpScore;
  if (company.rating > 0) return Math.round(company.rating * 20);
  return 0;
}

function handleCopyText(text: string) {
  navigator.clipboard.writeText(text);
  toast('📋 Текст скопирован — вставь в Telegram');
}

function handleOpenTelegram(handle: string) {
  const clean = handle.replace('@', '');
  window.open(`https://t.me/${clean}`, '_blank');
}

function EmptyState({
  tab,
  onNavigateCompanies,
}: {
  tab: QueueTab;
  onNavigateCompanies: () => void;
}) {
  const config: Record<
    QueueTab,
    { icon: React.ElementType; title: string; action?: { label: string; onClick: () => void } }
  > = {
    approved: {
      icon: Inbox,
      title: 'Нет одобренных компаний',
      action: { label: '→ К компаниям', onClick: onNavigateCompanies },
    },
    queued: {
      icon: Clock,
      title: 'Очередь пуста · одобри компании',
    },
    sent: {
      icon: Send,
      title: 'Ещё ничего не отправлено',
    },
    replied: {
      icon: MessageSquare,
      title: 'Ответов пока нет · обычно 24–48ч',
    },
  };

  const { icon: Icon, title, action } = config[tab];

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon className="h-12 w-12 text-text-subtle" strokeWidth={1.5} />
      <p className="mt-4 text-sm font-medium text-text-body">{title}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-text-body transition-colors hover:bg-muted"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function MessageCard({
  company,
  activeTab,
  onUpdateStatus,
  onCreateLead,
}: {
  company: Company;
  activeTab: QueueTab;
  onUpdateStatus: (id: string, status: CompanyStatus) => void;
  onCreateLead: (id: string) => void;
}) {
  const navigate = useNavigate();
  const sourceKey = company.source ?? 'manual';
  const sourceConfig = SOURCE_CONFIG[sourceKey];
  const niche = company.niches[0] ?? company.industry;
  const dateStr = company.last_touch ?? company.createdAt;

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-5">
      {/* Row 1 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ScoreBadge score={companyScore(company)} />
          <span className="font-heading text-[15px] font-bold text-text-primary">{company.name}</span>
          <span className="text-xs text-text-muted">
            {sourceConfig.emoji} {niche}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={company.status} />
          <span className="font-mono text-[10px] text-text-subtle">{formatRelativeDate(dateStr)}</span>
        </div>
      </div>

      {/* Row 2 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {company.phone && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(company.phone);
              toast('📋 Телефон скопирован');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-bento-base px-3 py-1.5 font-mono text-xs text-text-body transition-colors hover:bg-card-blue"
          >
            📞 {company.phone}
          </button>
        )}
        {company.telegram && (
          <a
            href={`https://t.me/${company.telegram.replace('@', '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-bento-base px-3 py-1.5 text-xs text-sky-600 transition-colors hover:bg-card-blue"
          >
            ✈️ {company.telegram}
          </a>
        )}
      </div>

      {/* Row 3 */}
      <div className="mt-3 rounded-xl bg-bento-base p-4">
        {company.outreach_text ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-text-body">{company.outreach_text}</p>
        ) : (
          <p className="text-sm italic text-text-muted">Текст не сгенерирован</p>
        )}
      </div>

      {/* Utility buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        {company.outreach_text && (
          <button
            type="button"
            onClick={() => handleCopyText(company.outreach_text!)}
            className="flex h-8 items-center gap-1.5 rounded-xl bg-muted px-3 text-xs font-medium text-text-body transition-colors hover:bg-border"
          >
            <CopyIcon size={12} />
            Скопировать текст
          </button>
        )}
        {company.telegram && (
          <button
            type="button"
            onClick={() => handleOpenTelegram(company.telegram!)}
            className="flex h-8 items-center gap-1.5 rounded-xl bg-sky-50 px-3 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
          >
            <SendIcon size={12} />
            Открыть {company.telegram.startsWith('@') ? company.telegram : `@${company.telegram}`}
          </button>
        )}
        {company.phone && (
          <a
            href={`tel:${company.phone}`}
            className="flex h-8 items-center gap-1.5 rounded-xl bg-green-50 px-3 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <PhoneIcon size={12} />
            {company.phone}
          </a>
        )}
      </div>

      {/* Row 4 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(`/companies/${company.id}`)}
          className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-accent"
        >
          → Карточка
        </button>

        <div>
          {activeTab === 'approved' && (
            <button
              type="button"
              onClick={() => {
                onUpdateStatus(company.id, 'queued');
                toast.success('Добавлено в очередь');
              }}
              className="h-9 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
            >
              📬 В очередь
            </button>
          )}
          {activeTab === 'queued' && (
            <button
              type="button"
              onClick={() => {
                onUpdateStatus(company.id, 'sent');
                toast.success('Отмечено как отправлено');
              }}
              className="h-9 rounded-xl border border-green-200 bg-green-50 px-4 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
            >
              ✅ Отправлено
            </button>
          )}
          {activeTab === 'sent' && (
            <button
              type="button"
              onClick={() => {
                onUpdateStatus(company.id, 'replied');
                toast.success('Ответ зафиксирован!');
              }}
              className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              💬 Ответил
            </button>
          )}
          {activeTab === 'replied' && (
            <button
              type="button"
              onClick={() => onCreateLead(company.id)}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              ⭐ Создать лид →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function QueuePage() {
  const navigate = useNavigate();
  const companies = useCompaniesStore((s) => s.companies);
  const updateStatus = useCompaniesStore((s) => s.updateStatus);
  const addLead = useLeadsStore((s) => s.addLead);
  const [activeTab, setActiveTab] = useState<QueueTab>('approved');
  const [creatingLead, setCreatingLead] = useState<string | null>(null);

  const modalCompany = creatingLead
    ? companies.find((c) => c.id === creatingLead)
    : undefined;

  const counts = useMemo(
    () => ({
      approved: companies.filter((c) => c.status === 'approved').length,
      queued: companies.filter((c) => c.status === 'queued').length,
      sent: companies.filter((c) => c.status === 'sent').length,
      replied: companies.filter((c) => c.status === 'replied').length,
    }),
    [companies],
  );

  const filtered = useMemo(
    () => companies.filter((c) => c.status === activeTab),
    [companies, activeTab],
  );

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky inset-x-0 top-0 z-50 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm font-black tracking-tight text-foreground">
                ОЧЕРЕДЬ ОТПРАВКИ
              </h1>
              <p className="text-[10px] text-muted-foreground">
                Одобренные тексты → отправь вручную → отметь → обработай ответы
              </p>
            </div>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => navigate('/companies')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" />
              Компании
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <div className="mb-4 mt-6 inline-flex gap-1 rounded-2xl border border-border bg-card p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={
                activeTab === tab.key
                  ? 'rounded-xl bg-bento-dark px-4 py-1.5 text-sm font-medium text-white'
                  : 'px-4 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary'
              }
            >
              {tab.label} ({counts[tab.key]})
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <EmptyState tab={activeTab} onNavigateCompanies={() => navigate('/companies')} />
        ) : (
          filtered.map((company) => (
            <MessageCard
              key={company.id}
              company={company}
              activeTab={activeTab}
              onUpdateStatus={updateStatus}
              onCreateLead={setCreatingLead}
            />
          ))
        )}
      </main>

      {modalCompany && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreatingLead(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                СОЗДАТЬ ЛИД
              </p>
              <h2 className="mt-1 font-heading text-xl font-black text-text-primary">
                {modalCompany.name}
              </h2>
              <p className="mt-0.5 text-sm text-text-muted">
                {modalCompany.niches[0] ?? modalCompany.industry}
              </p>
            </div>

            <div className="mb-5 flex flex-wrap gap-2">
              {modalCompany.phone && (
                <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-text-muted">
                  📞 {modalCompany.phone}
                </span>
              )}
              {modalCompany.telegram && (
                <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs text-sky-700">
                  ✈️ {modalCompany.telegram}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="lead-contact"
                  className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-text-muted"
                >
                  ИМЯ КОНТАКТА
                </label>
                <input
                  type="text"
                  id="lead-contact"
                  placeholder="Иван Петров"
                  className="h-10 w-full rounded-xl border border-border bg-muted px-3 text-sm transition-colors focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="lead-amount"
                  className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-text-muted"
                >
                  СУММА СДЕЛКИ (₽)
                </label>
                <input
                  type="number"
                  id="lead-amount"
                  placeholder="120000"
                  className="h-10 w-full rounded-xl border border-border bg-muted px-3 text-sm transition-colors focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="lead-note"
                  className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-text-muted"
                >
                  КОММЕНТАРИЙ
                </label>
                <textarea
                  id="lead-note"
                  rows={2}
                  placeholder="Ответил на аутрич, интересует AI-агент записи..."
                  className="w-full resize-none rounded-xl border border-border bg-muted p-3 text-sm transition-colors focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setCreatingLead(null)}
                className="h-11 flex-1 rounded-xl border border-border text-sm text-text-muted transition-colors hover:bg-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  const contactName =
                    (document.getElementById('lead-contact') as HTMLInputElement)?.value ||
                    modalCompany.name;
                  const amount = parseInt(
                    (document.getElementById('lead-amount') as HTMLInputElement)?.value || '0',
                    10,
                  );
                  const note =
                    (document.getElementById('lead-note') as HTMLTextAreaElement)?.value || '';
                  const niche = modalCompany.niches[0] ?? modalCompany.industry;

                  const newLead: Lead = {
                    id: crypto.randomUUID(),
                    name: contactName,
                    company: modalCompany.name,
                    email: modalCompany.email || '',
                    phone: modalCompany.phone || '',
                    status: 'new',
                    priority: 'medium',
                    value: amount,
                    assignedTo: 'Никита',
                    createdAt: new Date().toISOString(),
                    tags: [niche, ...(note ? [note] : [])].filter(Boolean),
                    avatar: contactName.slice(0, 2).toUpperCase(),
                  };

                  try {
                    await addLead(newLead);
                    await updateStatus(modalCompany.id, 'lead');
                    setCreatingLead(null);
                    toast.success('🎉 Лид создан из аутрича!', {
                      action: {
                        label: 'Открыть CRM',
                        onClick: () => navigate('/leads'),
                      },
                    });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
                  }
                }}
                className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90"
              >
                Создать лид →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
