import { useMemo, useState, type ComponentType, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Brain, Plus, Trash2, Sparkles, CheckSquare, Shield } from 'lucide-react';
import { cn } from '../lib/utils';

interface Idea {
  id: string;
  text: string;
  createdAt: string;
}

type TaskCategory = 'business' | 'personal';
type TaskTab = 'all' | TaskCategory;

interface Task {
  id: string;
  text: string;
  category: TaskCategory;
  dueDate?: string;
  done: boolean;
}

const HARD_DEADLINES = [
  { title: 'ЮГ Акцент — договор', date: '28 июн' },
  { title: 'РУМИСЫ — счёт', date: '30 июн' },
  { title: 'РУДН — финал', date: '2 июл' },
  { title: 'FITTERA — предоплата', date: '5 июл' },
];

const SERVICES = [
  { name: 'Кредиты', amount: 70_000, letter: 'К', color: 'bg-red-100 text-red-700' },
  { name: 'ФОТ', amount: 85_000, letter: 'Ф', color: 'bg-amber-100 text-amber-700' },
  { name: 'Подписки', amount: 35_000, letter: 'П', color: 'bg-blue-100 text-blue-700' },
  { name: 'Жильё Бали', amount: 65_000, letter: 'Ж', color: 'bg-emerald-100 text-emerald-700' },
];

function formatIdeaDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function ColumnShell({
  title,
  icon: Icon,
  iconBg,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-[32rem] flex-col rounded-2xl border border-border bg-card lg:min-h-[calc(100vh-10rem)]">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconBg)}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <h2 className="font-heading text-base font-bold text-text-primary">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </section>
  );
}

function DreamColumn() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState('');

  const addIdea = () => {
    const text = draft.trim();
    if (!text) return;
    setIdeas((prev) => [
      { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    setDraft('');
  };

  return (
    <ColumnShell title="Мечтай" icon={Sparkles} iconBg="bg-card-blue text-accent">
      <form
        className="flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          addIdea();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Запиши мысль..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-sm text-text-body placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent/90"
          aria-label="Добавить мысль"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {ideas.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">Пока пусто — запиши первую идею</p>
        )}
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className="group rounded-xl border border-border/60 bg-bento-base p-3.5 transition-colors hover:border-border"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-text-body">{idea.text}</p>
              <button
                type="button"
                onClick={() => setIdeas((prev) => prev.filter((i) => i.id !== idea.id))}
                className="shrink-0 rounded-lg p-1.5 text-text-muted opacity-0 transition-all hover:bg-card hover:text-accent-red group-hover:opacity-100"
                aria-label="Удалить"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="mt-2 inline-block rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-text-muted">
              {formatIdeaDate(idea.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </ColumnShell>
  );
}

function DoColumn() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');
  const [dueDraft, setDueDraft] = useState('');
  const [tab, setTab] = useState<TaskTab>('all');

  const tabs: { key: TaskTab; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'business', label: 'Бизнес' },
    { key: 'personal', label: 'Личное' },
  ];

  const addTask = () => {
    const text = draft.trim();
    if (!text) return;
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text,
        category: tab === 'personal' ? 'personal' : 'business',
        dueDate: dueDraft.trim() || undefined,
        done: false,
      },
    ]);
    setDraft('');
    setDueDraft('');
  };

  const filteredTasks = useMemo(() => {
    const list = tab === 'all' ? tasks : tasks.filter((t) => t.category === tab);
    return [...list].sort((a, b) => Number(a.done) - Number(b.done));
  }, [tasks, tab]);

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  return (
    <ColumnShell title="Делай" icon={CheckSquare} iconBg="bg-card-green text-accent-green">
      <div className="mb-3 inline-flex gap-1 rounded-xl border border-border bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.key
                ? 'bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-body',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTask();
            }
          }}
          placeholder="Новая задача..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-sm text-text-body placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          value={dueDraft}
          onChange={(e) => setDueDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTask();
            }
          }}
          placeholder="Срок"
          className="h-10 w-20 shrink-0 rounded-xl border border-border bg-muted px-2 text-sm text-text-body placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-24"
        />
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">Enter — сохранить</p>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {filteredTasks.length === 0 && (
          <p className="py-8 text-center text-sm text-text-muted">Нет задач в этом разделе</p>
        )}
        {filteredTasks.map((task) => (
          <label
            key={task.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 px-3.5 py-3 transition-colors hover:border-border',
              task.done ? 'bg-muted/60' : 'bg-bento-base',
            )}
          >
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-accent"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm text-text-body',
                  task.done && 'text-text-muted line-through',
                )}
              >
                {task.text}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                    task.category === 'business'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-amber-50 text-amber-700',
                  )}
                >
                  {task.category === 'business' ? 'Бизнес' : 'Личное'}
                </span>
                {task.dueDate && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                    {task.dueDate}
                  </span>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>
    </ColumnShell>
  );
}

function ControlColumn() {
  const total = SERVICES.reduce((sum, s) => sum + s.amount, 0);

  return (
    <ColumnShell title="Контроль" icon={Shield} iconBg="bg-card-amber text-accent-amber">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          Жёсткие дедлайны
        </p>
        <ul className="mt-3 space-y-2">
          {HARD_DEADLINES.map((item) => (
            <li
              key={item.title}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bento-base px-3.5 py-3"
            >
              <span className="min-w-0 text-sm font-medium text-text-body">{item.title}</span>
              <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-red-600">
                {item.date}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
          Сервисы и оплаты
        </p>
        <ul className="mt-3 space-y-2">
          {SERVICES.map((service) => (
            <li
              key={service.name}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-bento-base px-3.5 py-3"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                  service.color,
                )}
              >
                {service.letter}
              </div>
              <span className="min-w-0 flex-1 text-sm font-medium text-text-body">{service.name}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(service.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto rounded-xl border border-border bg-muted px-4 py-3.5">
        <p className="text-xs text-text-muted">Итого</p>
        <p className="mt-0.5 font-heading text-xl font-black tabular-nums text-text-primary">
          {formatCurrency(total)}
          <span className="ml-1 text-sm font-medium text-text-muted">/мес</span>
        </p>
      </div>
    </ColumnShell>
  );
}

export function BrainHudPage() {
  return (
    <div className="min-h-screen bg-page">
      <header className="sticky inset-x-0 top-0 z-50 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm font-black tracking-tight text-foreground">
                BRAIN HUD
              </h1>
              <p className="text-[10px] text-muted-foreground">Мечтай · Делай · Контроль</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          <DreamColumn />
          <DoColumn />
          <ControlColumn />
        </div>
      </main>
    </div>
  );
}
