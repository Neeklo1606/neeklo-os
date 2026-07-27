import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, X, Calendar, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';

type ProjectStatus = 'new' | 'in_progress' | 'review' | 'awaiting_payment' | 'done';

interface Project {
  id: string;
  clientName: string;
  projectType: string;
  totalAmount: number;
  receivedAmount: number;
  deadlineDisplay: string;
  deadline: Date;
  status: ProjectStatus;
  assignee: string;
}

const COLUMNS: { key: ProjectStatus; label: string; color: string }[] = [
  { key: 'new', label: 'Новый', color: '#2563EB' },
  { key: 'in_progress', label: 'В работе', color: '#D97706' },
  { key: 'review', label: 'Ревью', color: '#3B82F6' },
  { key: 'awaiting_payment', label: 'Ожидает оплату', color: '#DC2626' },
  { key: 'done', label: 'Завершён', color: '#059669' },
];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  review: 'Ревью',
  awaiting_payment: 'Ожидает оплату',
  done: 'Завершён',
};

function parseDeadline(display: string): Date {
  const [day, month] = display.split('.').map(Number);
  const now = new Date();
  const year = month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, month - 1, day);
}

const DEMO_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    clientName: 'ЮГ Акцент',
    projectType: 'AIOS',
    totalAmount: 480_000,
    receivedAmount: 0,
    deadlineDisplay: '25.09',
    deadline: parseDeadline('25.09'),
    status: 'in_progress',
    assignee: 'Игорь',
  },
  {
    id: 'proj-2',
    clientName: 'РУМИСЫ',
    projectType: 'Мультсериал',
    totalAmount: 350_000,
    receivedAmount: 50_000,
    deadlineDisplay: '01.08',
    deadline: parseDeadline('01.08'),
    status: 'in_progress',
    assignee: 'Данил',
  },
  {
    id: 'proj-3',
    clientName: 'РУДН ИИ',
    projectType: 'Образ. платформа',
    totalAmount: 150_000,
    receivedAmount: 75_000,
    deadlineDisplay: '15.07',
    deadline: parseDeadline('15.07'),
    status: 'review',
    assignee: 'Игорь',
  },
  {
    id: 'proj-4',
    clientName: 'FITTERA',
    projectType: 'Сайт',
    totalAmount: 120_000,
    receivedAmount: 0,
    deadlineDisplay: '20.07',
    deadline: parseDeadline('20.07'),
    status: 'new',
    assignee: 'Никита',
  },
  {
    id: 'proj-5',
    clientName: 'ОМТС',
    projectType: 'Автоматизация',
    totalAmount: 80_000,
    receivedAmount: 0,
    deadlineDisplay: '30.06',
    deadline: parseDeadline('30.06'),
    status: 'awaiting_payment',
    assignee: 'Никита',
  },
  {
    id: 'proj-6',
    clientName: 'Академика',
    projectType: 'Правки',
    totalAmount: 47_000,
    receivedAmount: 0,
    deadlineDisplay: '28.06',
    deadline: parseDeadline('28.06'),
    status: 'awaiting_payment',
    assignee: 'Игорь',
  },
];

function notesKey(id: string) {
  return `osnee-project-notes-${id}`;
}

function isOverdue(deadline: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return d < today;
}

function assigneeStyle(name: string): string {
  if (name === 'Игорь') return 'bg-blue-50 text-blue-700';
  if (name === 'Данил') return 'bg-amber-50 text-amber-700';
  return 'bg-blue-50 text-blue-700';
}

function statusBadgeStyle(status: ProjectStatus): string {
  switch (status) {
    case 'new':
      return 'bg-blue-50 text-blue-700';
    case 'in_progress':
      return 'bg-amber-50 text-amber-700';
    case 'review':
      return 'bg-blue-50 text-blue-700';
    case 'awaiting_payment':
      return 'bg-red-50 text-red-700';
    case 'done':
      return 'bg-emerald-50 text-emerald-700';
  }
}

function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const progress =
    project.totalAmount > 0
      ? Math.min(100, Math.round((project.receivedAmount / project.totalAmount) * 100))
      : 0;
  const overdue = isOverdue(project.deadline);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-[rgba(0,0,0,0.055)] bg-card p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{project.clientName}</p>
          <p className="truncate text-xs text-muted-foreground">{project.projectType}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
            statusBadgeStyle(project.status),
          )}
        >
          {STATUS_LABELS[project.status]}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">{formatCurrency(project.totalAmount)}</span>
          <span className="text-muted-foreground">
            {formatCurrency(project.receivedAmount)} получено
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span
          className={cn(
            'inline-flex items-center gap-1 font-mono',
            overdue ? 'font-semibold text-red-600' : 'text-muted-foreground',
          )}
        >
          <Calendar className="h-3 w-3" />
          {project.deadlineDisplay}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
            assigneeStyle(project.assignee),
          )}
        >
          <User className="h-3 w-3" />
          {project.assignee}
        </span>
      </div>
    </button>
  );
}

function ProjectDetailPanel({
  project,
  onClose,
  onReceivePayment,
}: {
  project: Project;
  onClose: () => void;
  onReceivePayment: (id: string) => void;
}) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setNotes(localStorage.getItem(notesKey(project.id)) ?? '');
  }, [project.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(notesKey(project.id), notes);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [notes, project.id]);

  const progress =
    project.totalAmount > 0
      ? Math.min(100, Math.round((project.receivedAmount / project.totalAmount) * 100))
      : 0;
  const overdue = isOverdue(project.deadline);
  const remaining = project.totalAmount - project.receivedAmount;
  const fullyPaid = remaining <= 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Проект</p>
            <h2 className="font-heading text-lg font-black text-text-primary">{project.clientName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-text-muted transition-colors hover:bg-muted"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Тип</p>
              <p className="mt-1 text-sm text-text-body">{project.projectType}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium',
                  statusBadgeStyle(project.status),
                )}
              >
                {STATUS_LABELS[project.status]}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                  assigneeStyle(project.assignee),
                )}
              >
                <User className="h-3 w-3" />
                {project.assignee}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs',
                  overdue ? 'bg-red-50 font-semibold text-red-600' : 'bg-muted text-text-muted',
                )}
              >
                <Calendar className="h-3 w-3" />
                {project.deadlineDisplay}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-bento-base p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Сумма проекта</span>
                <span className="font-heading text-lg font-bold text-text-primary">
                  {formatCurrency(project.totalAmount)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-text-muted">Получено</span>
                <span className="font-semibold text-accent-green">
                  {formatCurrency(project.receivedAmount)}
                </span>
              </div>
              {!fullyPaid && (
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-text-muted">Остаток</span>
                  <span className="font-semibold text-text-body">{formatCurrency(remaining)}</span>
                </div>
              )}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] text-text-muted">{progress}% оплачено</p>
            </div>

            <div>
              <label
                htmlFor="project-notes"
                className="text-[10px] font-mono uppercase tracking-widest text-text-muted"
              >
                Заметки
              </label>
              <textarea
                id="project-notes"
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Договорённости, контакты, следующие шаги..."
                className="mt-2 w-full resize-none rounded-xl border border-border bg-muted p-3 text-sm text-text-body placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-text-muted">Автосохранение в браузере</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border p-5">
          <button
            type="button"
            disabled={fullyPaid}
            onClick={() => onReceivePayment(project.id)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wallet className="h-4 w-4" />
            Получить оплату
          </button>
        </div>
      </aside>
    </>
  );
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(DEMO_PROJECTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId),
    [projects, selectedId],
  );

  const { totalPipeline, totalReceived } = useMemo(() => {
    return projects.reduce(
      (acc, p) => ({
        totalPipeline: acc.totalPipeline + p.totalAmount,
        totalReceived: acc.totalReceived + p.receivedAmount,
      }),
      { totalPipeline: 0, totalReceived: 0 },
    );
  }, [projects]);

  const projectsByStatus = useMemo(() => {
    const grouped = Object.fromEntries(COLUMNS.map((c) => [c.key, [] as Project[]])) as Record<
      ProjectStatus,
      Project[]
    >;
    for (const project of projects) {
      grouped[project.status]?.push(project);
    }
    return grouped;
  }, [projects]);

  const handleReceivePayment = useCallback((id: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return { ...p, receivedAmount: p.totalAmount };
      }),
    );
    toast.success('💰 Оплата получена!');
  }, []);

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky inset-x-0 top-0 z-30 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm font-black tracking-tight text-foreground">
                ПРОЕКТЫ
              </h1>
              <p className="text-[10px] text-muted-foreground">Клиентские проекты и оплаты</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        {/* Summary strip */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              Pipeline
            </p>
            <p className="mt-1 font-heading text-2xl font-black tabular-nums text-text-primary">
              {formatCurrency(totalPipeline)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
              Получено
            </p>
            <p className="mt-1 font-heading text-2xl font-black tabular-nums text-accent-green">
              {formatCurrency(totalReceived)}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {totalPipeline > 0
                ? `${Math.round((totalReceived / totalPipeline) * 100)}% от pipeline`
                : '—'}
            </p>
          </div>
        </div>

        {/* Kanban */}
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 240px)' }}>
          {COLUMNS.map((column) => {
            const columnProjects = projectsByStatus[column.key] ?? [];
            return (
              <div
                key={column.key}
                className="flex w-72 shrink-0 flex-col rounded-[2rem] bg-muted"
              >
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-card px-1.5 text-xs font-medium text-muted-foreground">
                    {columnProjects.length}
                  </span>
                </div>
                <div className="flex flex-col gap-3 px-3 pb-3">
                  {columnProjects.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-border py-8 text-center">
                      <p className="text-xs text-muted-foreground">Нет проектов</p>
                    </div>
                  ) : (
                    columnProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => setSelectedId(project.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedId(null)}
          onReceivePayment={handleReceivePayment}
        />
      )}
    </div>
  );
}
