import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, X, Copy, ShieldAlert } from 'lucide-react';
import { BentoCard } from '../components/ui/BentoCard';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useCopy } from '../hooks/useCopy';
import { cn } from '../lib/utils';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { fetchOpportunities, updateOpportunityApi } from '../lib/opportunities/api';
import { fetchVerticals, type Vertical } from '../lib/cartographer/api';
import type { Opportunity } from '../data/mock';

type ApprovalFilter = 'all' | 'required' | 'approved' | 'rejected';

const APPROVAL_LABELS: Record<string, string> = {
  required: 'Требует решения',
  approved: 'Одобрено',
  rejected: 'Отклонено',
};

const APPROVAL_STYLES: Record<string, string> = {
  required: 'bg-card-amber text-accent-amber',
  approved: 'bg-card-green text-accent-green',
  rejected: 'bg-muted text-muted-foreground',
};

const PRIORITY_STYLES: Record<string, string> = {
  A: 'bg-card-red text-accent-red',
  B: 'bg-card-amber text-accent-amber',
  C: 'bg-card-blue text-accent-blue',
  D: 'bg-muted text-muted-foreground',
};

function ApprovalBadge({ status }: { status?: Opportunity['human_approval'] }) {
  const key = status ?? 'required';
  return <Badge className={APPROVAL_STYLES[key]}>{APPROVAL_LABELS[key]}</Badge>;
}

function PriorityBadge({ priority }: { priority?: Opportunity['sales_priority'] | null }) {
  if (!priority) return <span className="text-text-subtle">—</span>;
  return <Badge className={PRIORITY_STYLES[priority]}>{priority}</Badge>;
}

const NO_AUTO_SEND_NOTICE = 'Отправка только вручную — система не отправляет сообщения сама';

function OpportunityDetailModal({
  opportunity,
  companyName,
  verticalLabel,
  onClose,
  onUpdated,
}: {
  opportunity: Opportunity;
  companyName: string;
  verticalLabel: string;
  onClose: () => void;
  onUpdated: (updated: Opportunity) => void;
}) {
  const [draftText, setDraftText] = useState(opportunity.message_draft ?? '');
  const [saving, setSaving] = useState(false);
  const copy = useCopy();

  useEffect(() => {
    setDraftText(opportunity.message_draft ?? '');
  }, [opportunity.opportunity_id, opportunity.message_draft]);

  const save = async (extra?: Partial<Opportunity>, successMessage?: string) => {
    setSaving(true);
    try {
      const { opportunity: updated } = await updateOpportunityApi(opportunity.opportunity_id, {
        message_draft: draftText,
        ...extra,
      });
      onUpdated(updated);
      if (successMessage) toast.success(successMessage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={companyName} size="xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{verticalLabel}</Badge>
          <PriorityBadge priority={opportunity.sales_priority} />
          {opportunity.fit_score != null && (
            <span className="font-mono text-xs text-text-muted">fit_score {opportunity.fit_score}</span>
          )}
          <ApprovalBadge status={opportunity.human_approval} />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="text-[13px] font-medium text-amber-800">{NO_AUTO_SEND_NOTICE}</span>
        </div>

        {opportunity.problem_hypothesis && (
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
              Гипотеза проблемы
            </p>
            <p className="text-[13px] leading-relaxed text-text-body">{opportunity.problem_hypothesis}</p>
          </div>
        )}

        {opportunity.evidence_summary && (
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
              Подтверждающие признаки
            </p>
            <p className="text-[13px] leading-relaxed text-text-body">{opportunity.evidence_summary}</p>
          </div>
        )}

        {opportunity.personalized_angle && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700/70">
              Персональный повод
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-amber-800">{opportunity.personalized_angle}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {opportunity.recommended_offer && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Первый оффер
              </p>
              <p className="text-[13px] leading-relaxed text-text-body">{opportunity.recommended_offer}</p>
            </div>
          )}
          {opportunity.potential_budget_range && (
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                Гипотеза бюджета
              </p>
              <p className="text-[13px] leading-relaxed text-text-body">{opportunity.potential_budget_range}</p>
            </div>
          )}
        </div>

        {opportunity.next_step && (
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
              Следующий шаг
            </p>
            <p className="text-[13px] leading-relaxed text-text-body">{opportunity.next_step}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
            Черновик первого сообщения
          </p>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={8}
            maxLength={700}
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] leading-relaxed text-text-body placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-right text-[11px] text-text-subtle">{draftText.length}/700</p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ human_approval: 'approved' }, 'Черновик одобрен для ручной отправки')}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Одобрить
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save(undefined, 'Изменения сохранены')}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-text-body transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            Изменить
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ human_approval: 'rejected' }, 'Отклонено')}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Отклонить
          </button>
          <button
            type="button"
            onClick={() => copy(draftText, 'текст сообщения')}
            className="ml-auto inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-text-body transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            Скопировать текст
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function OpportunitiesPage() {
  const companies = useCompaniesStore((s) => s.companies);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [verticals, setVerticals] = useState<Record<string, Vertical>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ApprovalFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchOpportunities(), fetchVerticals()])
      .then(([oppRes, vertRes]) => {
        setOpportunities(oppRes.opportunities);
        setVerticals(vertRes.verticals);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Не удалось загрузить возможности'))
      .finally(() => setLoading(false));
  }, []);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const counts = useMemo(
    () => ({
      all: opportunities.length,
      required: opportunities.filter((o) => (o.human_approval ?? 'required') === 'required').length,
      approved: opportunities.filter((o) => o.human_approval === 'approved').length,
      rejected: opportunities.filter((o) => o.human_approval === 'rejected').length,
    }),
    [opportunities],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return opportunities;
    return opportunities.filter((o) => (o.human_approval ?? 'required') === filter);
  }, [opportunities, filter]);

  const selected = opportunities.find((o) => o.opportunity_id === selectedId) ?? null;

  const pills: { id: ApprovalFilter; label: string }[] = [
    { id: 'all', label: `Все (${counts.all})` },
    { id: 'required', label: `Требует решения (${counts.required})` },
    { id: 'approved', label: `Одобрено (${counts.approved})` },
    { id: 'rejected', label: `Отклонено (${counts.rejected})` },
  ];

  const handleUpdated = (updated: Opportunity) => {
    setOpportunities((prev) => prev.map((o) => (o.opportunity_id === updated.opportunity_id ? updated : o)));
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-heading text-[28px] font-black tracking-tight text-text-primary">ВОЗМОЖНОСТИ</h1>
        <p className="mt-1 text-sm text-text-muted">Персонализированные черновики аутрича по аудированным компаниям</p>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="text-[13px] font-medium text-amber-800">{NO_AUTO_SEND_NOTICE}</span>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {pills.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFilter(p.id)}
            className={cn(
              'flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              filter === p.id
                ? 'border-transparent bg-bento-dark text-white'
                : 'border-border bg-card text-text-muted hover:text-text-primary',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <BentoCard className="flex flex-col items-center justify-center gap-1 p-10 text-center">
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </BentoCard>
      ) : filtered.length === 0 ? (
        <BentoCard className="flex flex-col items-center justify-center gap-1 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Возможностей пока нет. Они появляются автоматически после аудита компаний с приоритетом A или B.
          </p>
        </BentoCard>
      ) : (
        <BentoCard className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Компания</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Вертикаль</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">fit_score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Приоритет</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Архетип</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Угол</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-body">Статус одобрения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((o) => {
                  const company = companyById.get(o.company_id);
                  const verticalLabel = company?.vertical ? verticals[company.vertical]?.label ?? company.vertical : '—';
                  return (
                    <tr
                      key={o.opportunity_id}
                      className="group cursor-pointer transition-colors hover:bg-muted"
                      onClick={() => setSelectedId(o.opportunity_id)}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="text-sm font-medium text-foreground">{company?.name ?? o.company_id}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-text-body">{verticalLabel}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-text-body">
                        {o.fit_score ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <PriorityBadge priority={o.sales_priority} />
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        {o.product_archetype ? (
                          <p className="truncate text-xs text-text-body" title={o.product_archetype}>
                            {o.product_archetype}
                          </p>
                        ) : (
                          <span className="text-text-subtle">—</span>
                        )}
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        {o.personalized_angle ? (
                          <p className="truncate text-xs text-text-body" title={o.personalized_angle}>
                            {o.personalized_angle}
                          </p>
                        ) : (
                          <span className="text-text-subtle">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <ApprovalBadge status={o.human_approval} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BentoCard>
      )}

      {selected && (
        <OpportunityDetailModal
          opportunity={selected}
          companyName={companyById.get(selected.company_id)?.name ?? selected.company_id}
          verticalLabel={
            companyById.get(selected.company_id)?.vertical
              ? verticals[companyById.get(selected.company_id)!.vertical!]?.label ?? companyById.get(selected.company_id)!.vertical!
              : '—'
          }
          onClose={() => setSelectedId(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
