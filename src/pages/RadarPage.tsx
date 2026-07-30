import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Loader2, Copy, ExternalLink, CheckCircle2, SkipForward, UserPlus, Plus, ClipboardPaste, Trash2, X } from 'lucide-react';
import { BentoCard } from '../components/ui/BentoCard';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useCopy } from '../hooks/useCopy';
import { cn, formatRelativeTime } from '../lib/utils';
import {
  fetchRadarStatus,
  triggerRadarCheckNow,
  fetchRadarSignals,
  updateRadarSignal,
  convertSignalToLead,
  fetchRadarSources,
  createRadarSource,
  createRadarSourcesBulk,
  updateRadarSource,
  deleteRadarSource,
  fetchRadarKeywords,
  createRadarKeyword,
  deleteRadarKeyword,
  type RadarStatus,
  type RadarSignal,
  type RadarSource,
  type RadarSourceType,
  type RadarKeyword,
  type RadarCategory,
} from '../lib/radar/api';

type Tab = 'signals' | 'sources' | 'keywords';

const SOURCE_TYPE_LABELS: Record<RadarSourceType, string> = {
  telegram: 'Telegram',
  avito: 'Avito',
  vc: 'VC.ru',
  habr: 'Habr',
  custom: 'Другое',
};
const SOURCE_TYPE_ORDER: RadarSourceType[] = ['telegram', 'avito', 'vc', 'habr', 'custom'];

const KEYWORD_CATEGORIES = ['Прямой запрос', 'Боль-сигнал', 'Ниша + инструмент', 'Сравнение цен'] as const;

/* ---------- shared bits ---------- */

const CATEGORY_STYLES: Record<RadarCategory, string> = {
  A: 'bg-card-red text-accent-red',
  B: 'bg-card-amber text-accent-amber',
  C: 'bg-card-blue text-accent-blue',
  D: 'bg-muted text-muted-foreground',
};

function CategoryBadge({ category, score }: { category?: RadarCategory; score?: number }) {
  if (!category) return null;
  return (
    <Badge className={CATEGORY_STYLES[category]}>
      {category} · {score ?? 0}
    </Badge>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-blue-600' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'default',
}: {
  icon: typeof ExternalLink;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'green' | 'amber' | 'primary';
}) {
  const toneClasses: Record<string, string> = {
    default: 'text-muted-foreground hover:bg-muted',
    green: 'text-accent-green hover:bg-card-green',
    amber: 'text-accent-amber hover:bg-card-amber',
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        toneClasses[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ---------- Tab 1: Сигналы ---------- */

function SignalCard({ signal, onChange }: { signal: RadarSignal; onChange: (s: RadarSignal) => void }) {
  const [expanded, setExpanded] = useState(false);
  const copy = useCopy();
  const messageLink = `https://t.me/${signal.channel}/${signal.telegram_message_id}`;

  const patch = useCallback(
    async (partial: Partial<RadarSignal>) => {
      const prev = signal;
      onChange({ ...signal, ...partial });
      try {
        const { signal: updated } = await updateRadarSignal(signal.id, partial);
        onChange(updated);
      } catch (e) {
        onChange(prev);
        toast.error(e instanceof Error ? e.message : 'Не удалось обновить сигнал');
      }
    },
    [signal, onChange],
  );

  const handleToLead = async () => {
    try {
      const { lead } = await convertSignalToLead(signal.id);
      onChange({ ...signal, leadId: lead.id });
      toast.success('Лид создан');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать лид');
    }
  };

  return (
    <BentoCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">@{signal.channel}</span>
          <span className="text-xs text-muted-foreground">{formatRelativeTime(signal.date ?? signal.foundAt)}</span>
        </div>
        <CategoryBadge category={signal.category} score={signal.signal_score} />
      </div>

      <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 block w-full text-left">
        <p className={cn('whitespace-pre-line text-sm text-text-body', !expanded && 'line-clamp-4')}>{signal.text}</p>
      </button>

      {signal.matchedKeywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {signal.matchedKeywords.map((k) => (
            <span key={k} className="rounded-full bg-card-amber px-2 py-0.5 text-[11px] font-medium text-accent-amber">
              {k}
            </span>
          ))}
        </div>
      )}

      {signal.aiReason && <p className="mt-2 text-xs italic text-text-muted">{signal.aiReason}</p>}
      {expanded && signal.evidence && (
        <p className="mt-2 text-xs text-text-muted">
          <span className="font-medium text-text-body">Основание:</span> {signal.evidence}
        </p>
      )}
      {expanded && signal.recommended_action && (
        <p className="mt-1 text-xs text-text-muted">
          <span className="font-medium text-text-body">Действие:</span> {signal.recommended_action}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3">
        <a href={messageLink} target="_blank" rel="noreferrer">
          <ActionButton icon={ExternalLink} label="Открыть в Telegram" />
        </a>
        <ActionButton icon={Copy} label="Скопировать текст" onClick={() => copy(signal.text, 'текст сигнала')} />
        <ActionButton
          icon={CheckCircle2}
          label="Ответил"
          tone="green"
          disabled={signal.status === 'replied'}
          onClick={() => patch({ status: 'replied' })}
        />
        <ActionButton
          icon={SkipForward}
          label="Не релевантно"
          disabled={signal.status === 'irrelevant'}
          onClick={() => patch({ status: 'irrelevant' })}
        />
        <ActionButton
          icon={UserPlus}
          label={signal.leadId ? 'Лид создан' : 'Создать лид'}
          tone="primary"
          disabled={Boolean(signal.leadId)}
          onClick={handleToLead}
        />
      </div>
    </BentoCard>
  );
}

function SignalsTab({ signals, setSignals }: { signals: RadarSignal[]; setSignals: (s: RadarSignal[]) => void }) {
  const [filter, setFilter] = useState<'new' | 'all' | 'replied' | 'irrelevant' | 'archived'>('new');

  const counts = useMemo(
    () => ({
      new: signals.filter((s) => s.status === 'new').length,
      all: signals.length,
      replied: signals.filter((s) => s.status === 'replied').length,
      irrelevant: signals.filter((s) => s.status === 'irrelevant').length,
      archived: signals.filter((s) => s.status === 'archived').length,
    }),
    [signals],
  );

  const filtered = useMemo(() => {
    const base = filter === 'all' ? signals : signals.filter((s) => s.status === filter);
    // Highest-priority signals first by default — matches the A/B/C/D
    // category thresholds (unscored signals sink to the bottom, not lost).
    return [...base].sort((a, b) => (b.signal_score ?? -1) - (a.signal_score ?? -1));
  }, [signals, filter]);

  const pills: { id: typeof filter; label: string }[] = [
    { id: 'new', label: `Новые (${counts.new})` },
    { id: 'all', label: `Все (${counts.all})` },
    { id: 'replied', label: `Отвечено (${counts.replied})` },
    { id: 'irrelevant', label: `Не релевантно (${counts.irrelevant})` },
    { id: 'archived', label: `Архив (${counts.archived})` },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {pills.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFilter(p.id)}
            className={cn(
              'flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              filter === p.id
                ? 'border-transparent bg-bento-dark text-white'
                : 'border-border bg-card text-text-muted hover:text-text-primary',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <BentoCard className="flex flex-col items-center justify-center gap-1 p-10 text-center">
          <p className="text-sm text-muted-foreground">Сигналов пока нет. Добавь каналы и запусти проверку.</p>
        </BentoCard>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              onChange={(updated) => setSignals(signals.map((x) => (x.id === updated.id ? updated : x)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Tab 2: Источники ---------- */

const SOURCE_TYPE_OPTIONS: { value: RadarSourceType; label: string }[] = [
  { value: 'telegram', label: 'Telegram-канал' },
  { value: 'avito', label: 'Avito (поиск)' },
  { value: 'vc', label: 'VC.ru (поиск)' },
  { value: 'habr', label: 'Habr (поиск)' },
  { value: 'custom', label: 'Другое' },
];

function AddSourceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: RadarSource) => void }) {
  const [type, setType] = useState<RadarSourceType>('telegram');
  const [identifier, setIdentifier] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const isTelegram = type === 'telegram';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = isTelegram ? identifier.trim().replace(/^@/, '') : identifier.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const { source } = await createRadarSource({
        type,
        identifier: clean,
        label: label.trim() || undefined,
        category: category.trim() || undefined,
      });
      onCreated(source);
      toast.success('Источник добавлен');
      setIdentifier('');
      setLabel('');
      setCategory('');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить источник');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Добавить источник">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Тип источника</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RadarSourceType)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {SOURCE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            {isTelegram ? 'Username канала' : 'Поисковая ссылка'}
          </label>
          <input
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={isTelegram ? 'durov или @durov' : 'https://www.avito.ru/moskva/predlozheniya_uslug?q=нужен+сайт'}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Название (опционально)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Категория (опционально)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="бизнес, IT-услуги, фриланс…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted min-h-[44px]">
            Отмена
          </button>
          <button type="submit" disabled={saving || !identifier.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px] disabled:opacity-50">
            Добавить
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BulkTelegramModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usernames = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (usernames.length === 0) return;
    setSaving(true);
    try {
      const { created, skipped } = await createRadarSourcesBulk(usernames);
      toast.success(`Добавлено ${created.length}${skipped ? `, пропущено ${skipped}` : ''}`);
      setText('');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить каналы');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Вставить список Telegram-каналов">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Вставь список каналов, по одному на строку (с @ или без) — только Telegram, для Avito/VC.ru/Habr
            добавляй по одному через «Добавить источник»
          </label>
          <textarea
            autoFocus
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'durov\n@ria_novosti_russya\nbiz_chat_moscow'}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted min-h-[44px]">
            Отмена
          </button>
          <button type="submit" disabled={saving || !text.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px] disabled:opacity-50">
            Добавить
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SourceRow({ source, onToggle, onDelete }: { source: RadarSource; onToggle: () => void; onDelete: () => void }) {
  const displayName = source.type === 'telegram' ? `@${source.identifier}` : source.label || source.identifier;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Toggle checked={source.active} onChange={onToggle} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            {source.category && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {source.category}
              </span>
            )}
          </div>
          {source.type !== 'telegram' && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{source.identifier}</p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Проверен: {source.lastCheckedAt ? formatRelativeTime(source.lastCheckedAt) : 'ещё не проверялся'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600"
        aria-label="Удалить источник"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SourcesTab({ sources, setSources }: { sources: RadarSource[]; setSources: (s: RadarSource[]) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const reload = async () => {
    const { sources: fresh } = await fetchRadarSources();
    setSources(fresh);
  };

  const toggleActive = async (source: RadarSource) => {
    const prev = sources;
    setSources(sources.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s)));
    try {
      await updateRadarSource(source.id, { active: !source.active });
    } catch (e) {
      setSources(prev);
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить источник');
    }
  };

  const handleDelete = async (source: RadarSource) => {
    const name = source.type === 'telegram' ? `@${source.identifier}` : source.label || source.identifier;
    if (!window.confirm(`Удалить источник «${name}»?`)) return;
    try {
      await deleteRadarSource(source.id);
      setSources(sources.filter((s) => s.id !== source.id));
      toast.success('Источник удалён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить источник');
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<RadarSourceType, RadarSource[]>();
    for (const type of SOURCE_TYPE_ORDER) map.set(type, []);
    for (const s of sources) {
      if (!map.has(s.type)) map.set(s.type, []);
      map.get(s.type)?.push(s);
    }
    return SOURCE_TYPE_ORDER.map((type) => ({ type, items: map.get(type) ?? [] })).filter((g) => g.items.length > 0);
  }, [sources]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          Добавить источник
        </button>
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2 text-sm font-medium text-text-body shadow-sm transition-all hover:bg-muted hover:shadow-md min-h-[44px]"
        >
          <ClipboardPaste className="h-4 w-4" />
          Вставить список Telegram
        </button>
      </div>

      {sources.length === 0 ? (
        <BentoCard className="flex flex-col items-center justify-center gap-1 p-10 text-center">
          <p className="text-sm text-muted-foreground">Источников пока нет.</p>
          <p className="mx-auto max-w-md text-xs text-muted-foreground">
            Telegram-каналы можно найти на tgstat.ru; для Avito/VC.ru/Habr добавь конкретную поисковую ссылку
          </p>
        </BentoCard>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((group) => (
            <div key={group.type}>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-text-muted">
                {SOURCE_TYPE_LABELS[group.type]} ({group.items.length})
              </p>
              <BentoCard className="overflow-hidden p-0">
                {group.items.map((s) => (
                  <SourceRow key={s.id} source={s} onToggle={() => toggleActive(s)} onDelete={() => handleDelete(s)} />
                ))}
              </BentoCard>
            </div>
          ))}
        </div>
      )}

      <AddSourceModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={(s) => setSources([...sources, s])} />
      <BulkTelegramModal open={bulkOpen} onClose={() => setBulkOpen(false)} onCreated={reload} />
    </div>
  );
}

/* ---------- Tab 3: Ключевые слова ---------- */

function KeywordGroup({
  category,
  keywords,
  onAdd,
  onRemove,
}: {
  category: string;
  keywords: RadarKeyword[];
  onAdd: (phrase: string) => void;
  onRemove: (id: string) => void;
}) {
  const [value, setValue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const phrase = value.trim();
    if (!phrase) return;
    onAdd(phrase);
    setValue('');
  };

  return (
    <BentoCard className="p-5">
      <h3 className="text-sm font-semibold text-foreground">{category}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {keywords.length === 0 && <p className="text-xs text-muted-foreground">Пока нет фраз</p>}
        {keywords.map((k) => (
          <span
            key={k.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-card-amber px-3 py-1 text-xs font-medium text-accent-amber"
          >
            {k.phrase}
            <button type="button" onClick={() => onRemove(k.id)} aria-label="Удалить фразу">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Новая фраза…"
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[40px]">
          +
        </button>
      </form>
    </BentoCard>
  );
}

function KeywordsTab({ keywords, setKeywords }: { keywords: RadarKeyword[]; setKeywords: (k: RadarKeyword[]) => void }) {
  const activeCount = keywords.filter((k) => k.active).length;

  const handleAdd = async (category: string, phrase: string) => {
    try {
      const { keyword } = await createRadarKeyword({ phrase, category });
      setKeywords([...keywords, keyword]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось добавить фразу');
    }
  };

  const handleRemove = async (id: string) => {
    const prev = keywords;
    setKeywords(keywords.filter((k) => k.id !== id));
    try {
      await deleteRadarKeyword(id);
    } catch (e) {
      setKeywords(prev);
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить фразу');
    }
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted-foreground">Всего активных фраз: {activeCount}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {KEYWORD_CATEGORIES.map((category) => (
          <KeywordGroup
            key={category}
            category={category}
            keywords={keywords.filter((k) => k.category === category)}
            onAdd={(phrase) => handleAdd(category, phrase)}
            onRemove={handleRemove}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export function RadarPage() {
  const [tab, setTab] = useState<Tab>('signals');
  const [status, setStatus] = useState<RadarStatus>({ lastRunAt: null, nextRunAt: null, running: false });
  const [checking, setChecking] = useState(false);
  const [signals, setSignals] = useState<RadarSignal[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [keywords, setKeywords] = useState<RadarKeyword[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    const [statusRes, signalsRes, sourcesRes, keywordsRes] = await Promise.all([
      fetchRadarStatus(),
      fetchRadarSignals(),
      fetchRadarSources(),
      fetchRadarKeywords(),
    ]);
    setStatus(statusRes);
    setSignals(signalsRes.signals);
    setSources(sourcesRes.sources);
    setKeywords(keywordsRes.keywords);
  }, []);

  useEffect(() => {
    loadAll().catch((e) => toast.error(e instanceof Error ? e.message : 'Не удалось загрузить данные Радара'));
  }, [loadAll]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const res = await triggerRadarCheckNow();
      if (!res.started) {
        toast.message(res.reason === 'already running' ? 'Проверка уже выполняется' : 'Проверка не запущена');
      }
      // Poll status until the run finishes, then refresh signals once.
      pollRef.current = setInterval(async () => {
        const s = await fetchRadarStatus();
        setStatus(s);
        if (!s.running) {
          if (pollRef.current) clearInterval(pollRef.current);
          setChecking(false);
          const { signals: fresh } = await fetchRadarSignals();
          setSignals(fresh);
        }
      }, 3000);
    } catch (e) {
      setChecking(false);
      toast.error(e instanceof Error ? e.message : 'Не удалось запустить проверку');
    }
  };

  const isRunning = checking || status.running;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'signals', label: 'Сигналы' },
    { id: 'sources', label: 'Источники' },
    { id: 'keywords', label: 'Ключевые слова' },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-black tracking-tight text-text-primary">РАДАР</h1>
          <p className="mt-1 text-sm text-text-muted">Ловец сигналов в Telegram</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-text-muted">
            Последняя проверка: {status.lastRunAt ? formatRelativeTime(status.lastRunAt) : 'ещё не было'}
          </span>
          <button
            type="button"
            onClick={handleCheckNow}
            disabled={isRunning}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md min-h-[44px] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Проверить сейчас
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-transparent bg-bento-dark text-white'
                : 'border-border bg-card text-text-muted hover:text-text-primary',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'signals' && <SignalsTab signals={signals} setSignals={setSignals} />}
      {tab === 'sources' && <SourcesTab sources={sources} setSources={setSources} />}
      {tab === 'keywords' && <KeywordsTab keywords={keywords} setKeywords={setKeywords} />}
    </div>
  );
}
