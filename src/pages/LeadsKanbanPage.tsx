import { useState, useCallback, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { Search, Plus, Filter, ArrowUpDown, User } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { cn, formatCurrency, formatDate, getInitials } from '../lib/utils';
import { STATUS_COLUMNS, type Lead, type LeadStatus } from '../data/mock';
import { useLeadsStore } from '../lib/stores/leadsStore';
import { StatusDropdown } from '../components/ui/StatusDropdown';
import { toast } from 'sonner';

type SortField = 'value' | 'createdAt' | 'priority';
type SortDir = 'asc' | 'desc';

const PRIORITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

function priorityColor(priority: string) {
  switch (priority) {
    case 'high': return 'text-red-600 bg-red-50 border-red-200';
    case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'low': return 'text-muted-foreground bg-muted border-border';
    default: return 'text-muted-foreground bg-muted border-border';
  }
}

function priorityLabel(priority: string) {
  switch (priority) {
    case 'high': return 'Высокий';
    case 'medium': return 'Средний';
    case 'low': return 'Низкий';
    default: return priority;
  }
}

function getLeadsByStatus(leads: Lead[]): Record<LeadStatus, Lead[]> {
  const initial: Record<LeadStatus, Lead[]> = {} as Record<LeadStatus, Lead[]>;
  for (const col of STATUS_COLUMNS) {
    initial[col.key] = [];
  }
  for (const lead of leads) {
    if (initial[lead.status]) {
      initial[lead.status].push(lead);
    }
  }
  return initial;
}

export function LeadsKanbanPage() {
  const leads = useLeadsStore((s) => s.leads);
  const updateLead = useLeadsStore((s) => s.updateLead);
  const addLead = useLeadsStore((s) => s.addLead);
  const fetchLeads = useLeadsStore((s) => s.fetchLeads);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modals & filters state
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createColumn, setCreateColumn] = useState<LeadStatus | null>(null);
  const [filterTag, setFilterTag] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      );
    }
    if (filterTag) {
      result = result.filter((l) => l.tags.includes(filterTag));
    }
    if (filterPriority !== 'all') {
      result = result.filter((l) => l.priority === filterPriority);
    }
    return result;
  }, [leads, searchQuery, filterTag, filterPriority]);

  const columns = useMemo(() => {
    const grouped = getLeadsByStatus(filteredLeads);
    for (const key of Object.keys(grouped) as LeadStatus[]) {
      grouped[key] = [...grouped[key]].sort((a, b) => {
        let cmp = 0;
        if (sortField === 'value') cmp = a.value - b.value;
        else if (sortField === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (sortField === 'priority') cmp = (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return grouped;
  }, [filteredLeads, sortField, sortDir]);

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const newStatus = destination.droppableId as LeadStatus;
    const oldStatus = source.droppableId as LeadStatus;

    updateLead(draggableId, { status: newStatus });

    const column = STATUS_COLUMNS.find((c) => c.key === newStatus);
    const label = column?.label ?? newStatus;

    toast(`Лид перемещён в «${label}»`, {
action: {
            label: 'Отменить',
            onClick: () => updateLead(draggableId, { status: oldStatus }),
          },
      duration: 5000,
    });
  }, [leads, updateLead]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const totalLeads = leads.length;
  const totalValue = leads.reduce((sum, l) => sum + l.value, 0);

  if (leads.length === 0) {
    return (
      <EmptyKanbanState
        onRefresh={() => fetchLeads()}
        onCreateNew={() => { setCreateColumn(null); setCreateOpen(true); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[rgba(0,0,0,0.055)] bg-card">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-foreground">Лиды</h1>
            <div className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
              <span className="font-medium text-foreground">{totalLeads}</span>
              <span>лидов</span>
              <span className="mx-1.5">·</span>
              <span className="font-medium text-foreground">{formatCurrency(totalValue)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Поиск лидов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-44 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground focus:border-bento focus:outline-none focus:ring-1 focus:ring-bento lg:w-60"
              />
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Фильтр</span>
            </button>
            <button
              type="button"
              onClick={() => { setCreateColumn(null); setCreateOpen(true); }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Добавить</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sort bar */}
      <div className="mx-auto max-w-screen-2xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>Сортировка:</span>
          {(['value', 'createdAt', 'priority'] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={cn(
                'rounded-md px-2.5 py-1.5 min-h-[44px] transition-colors',
                sortField === field
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'hover:bg-muted text-muted-foreground',
              )}
            >
              {field === 'value' && 'Сумма'}
              {field === 'createdAt' && 'Дата'}
              {field === 'priority' && 'Приоритет'}
              {sortField === field && (
                <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="mx-auto max-w-screen-2xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
          <div className="flex gap-5 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
            {STATUS_COLUMNS.map((column) => {
              const columnLeads = columns[column.key] || [];
              return (
                <div
                  key={column.key}
                  className="flex w-72 shrink-0 flex-col rounded-[2rem] bg-muted"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: column.color }}
                      />
                      <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                        {columnLeads.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCreateColumn(column.key); setCreateOpen(true); }}
                      className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={`Добавить лид в ${column.label}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Droppable area */}
                  <Droppable droppableId={column.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'flex flex-col gap-3 px-3 pb-3 transition-colors',
                          snapshot.isDraggingOver && 'bg-blue-50/50',
                        )}
                        style={{ minHeight: 80 }}
                      >
                        {columnLeads.length === 0 && !snapshot.isDraggingOver && (
                          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-8">
                            <p className="text-xs text-muted-foreground">Перетащите лид сюда</p>
                          </div>
                        )}
                        {columnLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  'rounded-[2rem] border border-[rgba(0,0,0,0.055)] bg-card p-4 transition-shadow cursor-pointer',
                                  snapshot.isDragging && 'shadow-lg ring-2 ring-blue-400',
                                  !snapshot.isDragging && 'hover:shadow-md',
                                )}
                                style={{
                                  ...provided.draggableProps.style,
                                }}
                              >
                                {/* Lead header */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                      {getInitials(lead.name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-foreground">
                                        {lead.name}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {lead.company}
                                      </p>
                                    </div>
                                  </div>
                                  <span
                                    className={cn(
                                      'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                      priorityColor(lead.priority),
                                    )}
                                  >
                                    {priorityLabel(lead.priority)}
                                  </span>
                                </div>

                                {/* Info row + StatusDropdown */}
                                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-semibold text-foreground">
                                    {formatCurrency(lead.value)}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {lead.assignedTo.split(' ')[0]}
                                  </span>
                                </div>

                                {/* Status dropdown */}
                                <div className="mt-2">
                                  <StatusDropdown
                                    current={lead.status}
                                    options={STATUS_COLUMNS.map((c) => ({
                                      value: c.key,
                                      label: c.label,
                                      color: c.color,
                                    }))}
                                    onChange={(newStatus) => {
                                      const oldStatus = lead.status;
                                      updateLead(lead.id, { status: newStatus as LeadStatus });
                                      const column = STATUS_COLUMNS.find((c) => c.key === newStatus);
                                      const label = column?.label ?? newStatus;
                                      toast(`Лид перемещён в «${label}»`, {
                                        action: {
                                          label: 'Отменить',
                                          onClick: () => updateLead(lead.id, { status: oldStatus }),
                                        },
                                        duration: 5000,
                                      });
                                    }}
                                  />
                                </div>

                                {/* Tags */}
                                {lead.tags.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {lead.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Date */}
                                <p className="mt-2 text-[10px] text-muted-foreground">
                                  {formatDate(lead.createdAt)}
                                </p>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {/* Filter modal */}
      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Фильтр лидов">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Тег</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilterTag('')}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  !filterTag
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                Все
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilterTag(tag)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    filterTag === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {tag}
                </button>
              ))}
              {allTags.length === 0 && (
                <span className="text-xs text-muted-foreground">Нет тегов</span>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Приоритет</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Все</option>
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => { setFilterTag(''); setFilterPriority('all'); }}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted min-h-[44px]"
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      </Modal>

      {/* Create lead modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый лид">
        <CreateLeadForm
          initialStatus={createColumn}
          onClose={() => setCreateOpen(false)}
          onCreated={async (lead) => {
            try {
              await addLead(lead);
              setCreateOpen(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
            }
          }}
        />
      </Modal>
    </div>
  );
}

function CreateLeadForm({
  initialStatus,
  onClose,
  onCreated,
}: {
  initialStatus: LeadStatus | null;
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<LeadStatus>(initialStatus || 'new');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [value, setValue] = useState(0);
  const [assignedTo, setAssignedTo] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t]);
      setTagInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const lead: Lead = {
      id: `lead-${Date.now()}`,
      name: name.trim(),
      company: company.trim() || '—',
      email: email.trim(),
      phone: phone.trim(),
      status,
      priority,
      value,
      assignedTo: assignedTo.trim() || 'Не назначен',
      tags,
      avatar: `https://i.pravatar.cc/150?u=lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    onCreated(lead);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Имя *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Иван Иванов"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Компания</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="ООО «Пример»"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="mail@example.com"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Телефон</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+7 (999) 123-45-67"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Сумма</label>
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Статус</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_COLUMNS.map((col) => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Приоритет</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Ответственный</label>
        <input
          type="text"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          placeholder="Иван Иванов"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Теги</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Добавить тег"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={addTag}
            className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
          >
            +
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  className="text-blue-400 hover:text-blue-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Заметки</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Дополнительная информация..."
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted min-h-[44px]"
        >
          Отмена
        </button>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 min-h-[44px]"
        >
          Создать лид
        </button>
      </div>
    </form>
  );
}

function EmptyKanbanState({ onRefresh, onCreateNew }: { onRefresh: () => void; onCreateNew: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <User className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Нет лидов</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Лидов пока нет. Добавьте первого лида или обновите данные из базы.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCreateNew}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <Plus className="h-4 w-4" />
            Добавить лида
          </button>
          <button
            onClick={onRefresh}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}