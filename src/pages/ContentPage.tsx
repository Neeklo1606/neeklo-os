import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Film, Plus, Trash2, CalendarDays } from 'lucide-react';
import { cn } from '../lib/utils';

type ContentTab = 'ideas' | 'calendar';
type ContentFormat = 'Reels' | 'TG' | 'Instagram';
type ContentStatus = 'idea' | 'in_progress' | 'ready' | 'published';

interface ContentIdea {
  id: string;
  title: string;
  format: ContentFormat;
  status: ContentStatus;
  scheduledDay: number | null;
}

const STORAGE_KEY = 'osnee-content-ideas';

const STATUS_ORDER: ContentStatus[] = ['idea', 'in_progress', 'ready', 'published'];

const STATUS_LABELS: Record<ContentStatus, string> = {
  idea: 'Идея',
  in_progress: 'В работе',
  ready: 'Готово',
  published: 'Опубликовано',
};

const STARTER_IDEAS: ContentIdea[] = [
  {
    id: 'content-1',
    title: 'Как AI-агент спас клинику от потери пациентов',
    format: 'Reels',
    status: 'in_progress',
    scheduledDay: 2,
  },
  {
    id: 'content-2',
    title: 'Строю AI-систему для бизнеса открыто',
    format: 'Reels',
    status: 'idea',
    scheduledDay: null,
  },
  {
    id: 'content-3',
    title: 'Кейс ЮГ Акцент — AIOS для агентства',
    format: 'TG',
    status: 'idea',
    scheduledDay: 0,
  },
  {
    id: 'content-4',
    title: 'Как мы спарсили 1000 стоматологий за 30 минут',
    format: 'Instagram',
    status: 'ready',
    scheduledDay: 4,
  },
  {
    id: 'content-5',
    title: '5 причин почему боты не работают',
    format: 'TG',
    status: 'idea',
    scheduledDay: null,
  },
  {
    id: 'content-6',
    title: 'Мой день основателя на Бали',
    format: 'Reels',
    status: 'idea',
    scheduledDay: null,
  },
];

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function loadIdeas(): ContentIdea[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ContentIdea[];
  } catch {
    /* ignore */
  }
  return STARTER_IDEAS;
}

function getWeekDates(): Date[] {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatBadgeStyle(format: ContentFormat): string {
  switch (format) {
    case 'Reels':
      return 'bg-rose-50 text-rose-700';
    case 'TG':
      return 'bg-sky-50 text-sky-700';
    case 'Instagram':
      return 'bg-blue-50 text-blue-700';
  }
}

function statusBadgeStyle(status: ContentStatus): string {
  switch (status) {
    case 'idea':
      return 'bg-muted text-text-muted';
    case 'in_progress':
      return 'bg-amber-50 text-amber-700';
    case 'ready':
      return 'bg-blue-50 text-blue-700';
    case 'published':
      return 'bg-emerald-50 text-emerald-700';
  }
}

function nextStatus(status: ContentStatus): ContentStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

function IdeaCardContent({
  idea,
  onCycleStatus,
  onDelete,
  compact,
}: {
  idea: ContentIdea;
  onCycleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 flex-1 font-medium text-text-primary', compact ? 'text-xs' : 'text-sm')}>
          {idea.title}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(idea.id);
          }}
          className="shrink-0 rounded-lg p-1 text-text-muted opacity-0 transition-all hover:bg-card hover:text-accent-red group-hover:opacity-100"
          aria-label="Удалить"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-medium', formatBadgeStyle(idea.format))}>
          {idea.format}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCycleStatus(idea.id);
          }}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80',
            statusBadgeStyle(idea.status),
          )}
        >
          {STATUS_LABELS[idea.status]}
        </button>
      </div>
    </>
  );
}

function IdeasTab({
  ideas,
  draft,
  setDraft,
  onAdd,
  onCycleStatus,
  onDelete,
}: {
  ideas: ContentIdea[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  onCycleStatus: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder="Добавить идею..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 text-sm text-text-body placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={onAdd}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent/90"
          aria-label="Добавить"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className="group rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
          >
            <IdeaCardContent idea={idea} onCycleStatus={onCycleStatus} onDelete={onDelete} />
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarTab({
  ideas,
  weekDates,
  onCycleStatus,
  onDelete,
  onDragEnd,
}: {
  ideas: ContentIdea[];
  weekDates: Date[];
  onCycleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onDragEnd: (result: DropResult) => void;
}) {
  const backlog = ideas.filter((i) => i.scheduledDay === null);
  const byDay = (dayIndex: number) => ideas.filter((i) => i.scheduledDay === dayIndex);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-7 gap-2 overflow-x-auto pb-2">
        {weekDates.map((date, dayIndex) => (
          <div key={dayIndex} className="min-w-[8.5rem] flex-1">
            <div className="mb-2 text-center">
              <p className="text-xs font-semibold text-text-primary">{DAY_LABELS[dayIndex]}</p>
              <p className="text-[10px] text-text-muted">
                {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <Droppable droppableId={`day-${dayIndex}`}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'min-h-[10rem] rounded-xl border border-dashed p-2 transition-colors',
                    snapshot.isDraggingOver
                      ? 'border-accent bg-card-blue/50'
                      : 'border-border bg-bento-base',
                  )}
                >
                  {byDay(dayIndex).length === 0 && !snapshot.isDraggingOver && (
                    <p className="py-6 text-center text-[10px] text-text-muted">Перетащи идею</p>
                  )}
                  {byDay(dayIndex).map((idea, index) => (
                    <Draggable key={idea.id} draggableId={idea.id} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className={cn(
                            'group mb-2 rounded-xl border border-border bg-card p-2.5',
                            dragSnapshot.isDragging && 'shadow-lg ring-2 ring-blue-500/30',
                          )}
                          style={dragProvided.draggableProps.style}
                        >
                          <IdeaCardContent
                            idea={idea}
                            onCycleStatus={onCycleStatus}
                            onDelete={onDelete}
                            compact
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-text-muted">
          Не запланировано — перетащи на день
        </p>
        <Droppable droppableId="backlog" direction="horizontal">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                'flex min-h-[5rem] gap-2 overflow-x-auto rounded-xl border border-dashed p-3 transition-colors',
                snapshot.isDraggingOver ? 'border-accent bg-muted' : 'border-border bg-card',
              )}
            >
              {backlog.length === 0 && !snapshot.isDraggingOver && (
                <p className="flex flex-1 items-center justify-center text-xs text-text-muted">
                  Все идеи запланированы
                </p>
              )}
              {backlog.map((idea, index) => (
                <Draggable key={idea.id} draggableId={idea.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      {...dragProvided.dragHandleProps}
                      className={cn(
                        'group w-56 shrink-0 rounded-xl border border-border bg-bento-base p-3',
                        dragSnapshot.isDragging && 'shadow-lg ring-2 ring-blue-500/30',
                      )}
                      style={dragProvided.draggableProps.style}
                    >
                      <IdeaCardContent
                        idea={idea}
                        onCycleStatus={onCycleStatus}
                        onDelete={onDelete}
                        compact
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );
}

export function ContentPage() {
  const [tab, setTab] = useState<ContentTab>('ideas');
  const [ideas, setIdeas] = useState<ContentIdea[]>(loadIdeas);
  const [draft, setDraft] = useState('');

  const weekDates = useMemo(() => getWeekDates(), []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }, [ideas]);

  const addIdea = useCallback(() => {
    const title = draft.trim();
    if (!title) return;
    setIdeas((prev) => [
      {
        id: crypto.randomUUID(),
        title,
        format: 'Reels',
        status: 'idea',
        scheduledDay: null,
      },
      ...prev,
    ]);
    setDraft('');
  }, [draft]);

  const cycleStatus = useCallback((id: string) => {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: nextStatus(i.status) } : i)),
    );
  }, []);

  const deleteIdea = useCallback((id: string) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const destId = destination.droppableId;
    let scheduledDay: number | null = null;
    if (destId.startsWith('day-')) {
      scheduledDay = Number(destId.replace('day-', ''));
    }

    setIdeas((prev) =>
      prev.map((i) => (i.id === draggableId ? { ...i, scheduledDay } : i)),
    );
  }, []);

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky inset-x-0 top-0 z-30 border-b border-[rgba(0,0,0,0.055)] bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
              <Film className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-sm font-black tracking-tight text-foreground">
                CONTENT OS
              </h1>
              <p className="text-[10px] text-muted-foreground">Идеи и контент-календарь</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="mb-6 inline-flex gap-1 rounded-2xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setTab('ideas')}
            className={cn(
              'rounded-xl px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'ideas'
                ? 'bg-bento-dark text-white'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            Идеи
          </button>
          <button
            type="button"
            onClick={() => setTab('calendar')}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-medium transition-colors',
              tab === 'calendar'
                ? 'bg-bento-dark text-white'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Календарь
          </button>
        </div>

        {tab === 'ideas' ? (
          <IdeasTab
            ideas={ideas}
            draft={draft}
            setDraft={setDraft}
            onAdd={addIdea}
            onCycleStatus={cycleStatus}
            onDelete={deleteIdea}
          />
        ) : (
          <CalendarTab
            ideas={ideas}
            weekDates={weekDates}
            onCycleStatus={cycleStatus}
            onDelete={deleteIdea}
            onDragEnd={handleDragEnd}
          />
        )}
      </main>
    </div>
  );
}
