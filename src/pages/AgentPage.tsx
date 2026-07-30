import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Loader2,
  Send,
  RefreshCw,
  Sparkles,
  Database,
  MessageSquare,
  Plus,
  Workflow,
  Braces,
  AlertTriangle,
  Radar,
  Map,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  agentChat,
  createAgentSession,
  fetchAgentSession,
  fetchAgentSessions,
  getRunPlanStatus,
  updateAgentSession,
  validateOrgs,
} from '../lib/agent/api';
import type {
  AgentAction,
  AgentSession,
  AgentSessionSummary,
  ChatMessage,
  RunPlanStatus,
  ValidateOrgsResponse,
} from '../lib/agent/types';
import { jsonRowsToCompanies } from '../lib/companies/fromAgentJson';
import { useCompaniesStore } from '../lib/stores/companiesStore';
import { fetchCompanies } from '../lib/companies/api';
import {
  createRadarSource,
  fetchRadarSignals,
  fetchRadarStatus,
  triggerRadarCheckNow,
} from '../lib/radar/api';
import { fetchCartographerRun, startCartographerRun } from '../lib/cartographer/api';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Human-readable label for the confirmation card — matches server/agent-prompt.mjs's action types. */
function describeAction(action: AgentAction): string {
  switch (action.type) {
    case 'radar.addChannel':
      return `Радар: добавить канал @${String(action.params.username ?? '?')}`;
    case 'radar.check':
      return 'Радар: запустить проверку сейчас';
    case 'radar.newSignals':
      return 'Радар: показать новые сигналы';
    case 'cartographer.run':
      return `Картограф: собрать ${action.params.limit ?? 10} компаний — «${action.params.niche ?? '?'}» в ${action.params.region ?? '?'}`;
    case 'companies.top':
      return `Показать топ-${action.params.limit ?? 10} компаний по score`;
    default:
      return 'Выполнить действие';
  }
}

/** Dispatches a confirmed action to the real API and returns an inline-renderable result string. */
async function executeAgentAction(action: AgentAction): Promise<string> {
  switch (action.type) {
    case 'radar.addChannel': {
      const username = String(action.params.username ?? '').trim().replace(/^@/, '');
      if (!username) throw new Error('Не указан username канала');
      const { source } = await createRadarSource({ type: 'telegram', identifier: username });
      return `✅ Канал @${source.identifier} добавлен в Радар.`;
    }

    case 'radar.check': {
      const { started, reason } = await triggerRadarCheckNow();
      if (!started) return `Проверка не запущена: ${reason ?? 'уже выполняется'}.`;
      for (let i = 0; i < 40; i += 1) {
        await sleep(3000);
        const status = await fetchRadarStatus();
        if (!status.running) break;
      }
      const { signals } = await fetchRadarSignals({ status: 'new' });
      return `✅ Проверка завершена. Новых сигналов: ${signals.length}.`;
    }

    case 'radar.newSignals': {
      const limit = Number(action.params.limit) || 10;
      const { signals } = await fetchRadarSignals({ status: 'new' });
      if (signals.length === 0) return 'Новых сигналов нет.';
      return signals
        .slice(0, limit)
        .map((s, i) => `${i + 1}. @${s.channel}: ${s.text.slice(0, 100)}${s.text.length > 100 ? '…' : ''}`)
        .join('\n');
    }

    case 'cartographer.run': {
      const niche = String(action.params.niche ?? '').trim();
      const region = String(action.params.region ?? '').trim();
      const limit = [10, 25, 50].includes(Number(action.params.limit)) ? Number(action.params.limit) : 10;
      if (!niche || !region) throw new Error('Нужны ниша и регион');
      const { runId, campaignId } = await startCartographerRun({ niche, region, limit, enrich: false });
      for (let i = 0; i < 60; i += 1) {
        await sleep(3000);
        const run = await fetchCartographerRun(runId);
        if (run.status === 'failed') throw new Error(run.error ?? 'Сбор завершился с ошибкой');
        if (run.status === 'completed') {
          return `✅ Готово: ${run.found} компаний найдено. Смотреть: /companies?campaignId=${campaignId}`;
        }
      }
      return 'Сбор ещё выполняется — результат появится на странице «Парсинг» позже.';
    }

    case 'companies.top': {
      const limit = Number(action.params.limit) || 10;
      const { companies } = await fetchCompanies();
      const top = [...companies].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
      if (top.length === 0) return 'Компаний пока нет.';
      return top.map((c, i) => `${i + 1}. ${c.name} — score ${c.score ?? '—'}`).join('\n');
    }

    default:
      throw new Error(`Неизвестное действие: ${action.type}`);
  }
}

interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'maps-search',
    title: 'Карты — поиск',
    description: 'Яндекс Карты, список org',
    prompt:
      'Найди 10 [ниша] в [город] на Яндекс Картах.\nВерни JSON массив с полями: name, address, city, rating, reviews, card_url.',
  },
  {
    id: 'rusprofile',
    title: 'RusProfile',
    description: 'ИНН, выручка, сотрудники',
    prompt:
      'Найди 20 компаний нише [ниша] в [город] на rusprofile.ru.\nВерни: name, inn, ogrn, revenue_m, employees, founded_year, address.',
  },
  {
    id: 'iphone',
    title: 'iPhone — Яндекс + 2GIS',
    description: '10 магазинов → карточки',
    prompt:
      'Найди 10 магазинов iPhone в Москве на Яндекс Картах и 10 на 2GIS.\nОбъедини, убери дубликаты. Верни: name, address, phone, website, rating.',
  },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarize(session: AgentSession): AgentSessionSummary {
  return {
    id: session.id,
    title: session.title,
    messageCount: session.messages.length,
    orgCount: session.executed.length,
    niche: session.niche,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function formatDate(iso: string) {
  return (iso || '').slice(0, 10) || 'Сегодня';
}

const STATUS_LABEL: Record<RunPlanStatus['status'], string> = {
  running: 'Проверка…',
  completed: 'Готово',
  failed: 'Ошибка',
};

type ActionState = { status: 'pending' | 'running' | 'done' | 'error' | 'cancelled'; result?: string };

const ACTION_ICON: Record<string, ComponentType<{ className?: string }>> = {
  'radar.addChannel': Radar,
  'radar.check': Radar,
  'radar.newSignals': Radar,
  'cartographer.run': Map,
  'companies.top': Map,
};

/** The confirm/cancel card for a control-surface action — never auto-executes. */
function ActionCard({
  message,
  state,
  onConfirm,
  onCancel,
}: {
  message: ChatMessage;
  state?: ActionState;
  onConfirm: (messageId: string, action: AgentAction) => void;
  onCancel: (messageId: string) => void;
}) {
  const action = message.action;
  if (!action) return null;
  const Icon = ACTION_ICON[action.type] ?? Sparkles;
  const status = state?.status ?? 'pending';

  return (
    <div className="max-w-[90%] rounded-xl border border-accent/30 bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-accent" />
        Выполнить: {describeAction(action)}
      </div>

      {status === 'pending' && (
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(message.id, action)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            <Check className="h-3.5 w-3.5" />
            Выполнить
          </button>
          <button
            type="button"
            onClick={() => onCancel(message.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Отмена
          </button>
        </div>
      )}

      {status === 'running' && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Выполняется…
        </p>
      )}

      {status === 'cancelled' && <p className="mt-2.5 text-xs text-muted-foreground">Отменено.</p>}

      {(status === 'done' || status === 'error') && (
        <p
          className={cn(
            'mt-2.5 whitespace-pre-wrap text-xs leading-relaxed',
            status === 'error' ? 'text-red-600' : 'text-foreground',
          )}
        >
          {state?.result}
        </p>
      )}
    </div>
  );
}

export function AgentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const addCompanies = useCompaniesStore((s) => s.addCompanies);

  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [niche, setNiche] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunPlanStatus | null>(null);
  const [validated, setValidated] = useState<ValidateOrgsResponse | null>(null);
  const [validating, setValidating] = useState(false);

  // Per-message state for the control-surface confirm/cancel cards —
  // keyed by message id, reset on reload (never auto-executed, so nothing
  // to persist: a pending action left un-confirmed is simply asked again).
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});

  const handleConfirmAction = useCallback(async (messageId: string, action: AgentAction) => {
    setActionStates((prev) => ({ ...prev, [messageId]: { status: 'running' } }));
    try {
      const result = await executeAgentAction(action);
      setActionStates((prev) => ({ ...prev, [messageId]: { status: 'done', result } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось выполнить действие';
      setActionStates((prev) => ({ ...prev, [messageId]: { status: 'error', result: message } }));
      toast.error(message);
    }
  }, []);

  const handleCancelAction = useCallback((messageId: string) => {
    setActionStates((prev) => ({ ...prev, [messageId]: { status: 'cancelled' } }));
  }, []);

  const sessionIdRef = useRef<string | null>(null);
  const nicheRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSentRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastUserTextRef = useRef<string>('');

  sessionIdRef.current = currentSessionId;
  nicheRef.current = niche;

  const online = Boolean(currentSessionId);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const applySession = useCallback((session: AgentSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setNiche(session.niche);
    setRunId(null);
    setRun(null);
    setValidated(null);
    setShowJson(false);
  }, []);

  const runValidation = useCallback(
    async (executed: RunPlanStatus['executed'], sessionId: string, nicheForRun: string | null) => {
      setValidating(true);
      try {
        const result = await validateOrgs(executed, nicheForRun ?? '', []);
        setValidated(result);
        await updateAgentSession(sessionId, { executed, niche: nicheForRun });
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, orgCount: executed.length } : s)),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Не удалось проверить данные');
      } finally {
        setValidating(false);
      }
    },
    [],
  );

  const startPolling = useCallback(
    (id: string, sessionId: string, nicheForRun: string | null) => {
      stopPolling();
      pollTimerRef.current = setInterval(async () => {
        try {
          const status = await getRunPlanStatus(id);
          setRun(status);
          if (status.status === 'completed') {
            stopPolling();
            const succeeded = status.executed.filter((e) => e.status !== 'failed');
            if (succeeded.length > 0) {
              await runValidation(succeeded, sessionId, nicheForRun);
            }
          } else if (status.status === 'failed') {
            stopPolling();
            toast.error(status.error ?? 'План парсинга завершился с ошибкой');
          }
        } catch (e) {
          stopPolling();
          toast.error(e instanceof Error ? e.message : 'Не удалось получить статус пайплайна');
        }
      }, 3000);
    },
    [runValidation, stopPolling],
  );

  const persistMessages = useCallback(
    async (sessionId: string, nextMessages: ChatMessage[], nicheValue: string | null) => {
      try {
        await updateAgentSession(sessionId, {
          messages: nextMessages,
          niche: nicheValue,
        });
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messageCount: nextMessages.length,
                  niche: nicheValue,
                  updatedAt: new Date().toISOString(),
                }
              : s,
          ),
        );
      } catch {
        /* history persistence is best-effort — chat stays usable if it fails */
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      lastUserTextRef.current = trimmed;

      let sessionId = sessionIdRef.current;
      if (!sessionId) {
        try {
          const { session } = await createAgentSession();
          sessionId = session.id;
          setSessions((prev) => [summarize(session), ...prev]);
          setCurrentSessionId(session.id);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Не удалось создать сессию');
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: `msg-${uid()}`,
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };

      const withUser = [...messages, userMsg];
      setMessages(withUser);
      setInput('');
      setIsSending(true);

      try {
        const res = await agentChat(
          withUser.map((m) => ({ role: m.role, content: m.content })),
          true,
        );

        const assistantMsg: ChatMessage = {
          id: `msg-${uid()}`,
          role: 'assistant',
          content: res.message || 'Готово.',
          timestamp: new Date().toISOString(),
          action: res.action ?? null,
        };
        const withAssistant = [...withUser, assistantMsg];
        setMessages(withAssistant);

        const nextNiche = res.niche ?? nicheRef.current;
        setNiche(nextNiche);
        await persistMessages(sessionId, withAssistant, nextNiche);

        if (res.runId) {
          setRunId(res.runId);
          setRun(null);
          setValidated(null);
          setShowJson(false);
          startPolling(res.runId, sessionId, nextNiche);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Ошибка агента';
        toast.error(msg);
        const errorMsg: ChatMessage = {
          id: `msg-${uid()}`,
          role: 'assistant',
          content: `Не удалось выполнить запрос: ${msg}`,
          timestamp: new Date().toISOString(),
        };
        const withError = [...withUser, errorMsg];
        setMessages(withError);
        await persistMessages(sessionId, withError, nicheRef.current);
      } finally {
        setIsSending(false);
      }
    },
    [isSending, messages, persistMessages, startPolling],
  );

  // Init: load sessions, select the most recent one, handle prefill/autoSend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingHistory(true);
      try {
        const { sessions: list } = await fetchAgentSessions();
        if (cancelled) return;
        setSessions(list);
        if (list.length > 0) {
          const { session } = await fetchAgentSession(list[0].id);
          if (cancelled) return;
          applySession(session);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Локальный агент недоступен');
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }

      const state = location.state as
        | { prefillMessage?: string; autoSend?: boolean }
        | null;
      if (state?.prefillMessage && !autoSentRef.current) {
        autoSentRef.current = true;
        if (state.autoSend) {
          await sendMessage(state.prefillMessage);
        } else {
          setInput(state.prefillMessage);
        }
        navigate(location.pathname, { replace: true, state: null });
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, run, validated]);

  const handleNewChat = useCallback(async () => {
    stopPolling();
    try {
      const { session } = await createAgentSession();
      setSessions((prev) => [summarize(session), ...prev]);
      applySession(session);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось создать чат');
    }
  }, [applySession, stopPolling]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      if (id === currentSessionId || isSending) return;
      stopPolling();
      try {
        const { session } = await fetchAgentSession(id);
        applySession(session);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Не удалось загрузить чат');
      }
    },
    [applySession, currentSessionId, isSending, stopPolling],
  );

  const reloadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const { sessions: list } = await fetchAgentSessions();
      setSessions(list);
      if (currentSessionId) {
        const { session } = await fetchAgentSession(currentSessionId);
        setMessages(session.messages);
        setNiche(session.niche);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить историю');
    } finally {
      setLoadingHistory(false);
    }
  }, [currentSessionId]);

  const validCount = useMemo(
    () => validated?.items.filter((i) => i.valid).length ?? 0,
    [validated],
  );

  const jsonPayload = useMemo(() => {
    if (validated) {
      return validated.items.filter((i) => i.valid).map((i) => i.normalized);
    }
    return run?.executed ?? [];
  }, [validated, run]);

  const handleImportValidated = useCallback(async () => {
    if (!validated) return;
    const rows = validated.items
      .filter((i) => i.valid && i.normalized)
      .map((i) => i.normalized as Record<string, unknown>);
    if (!rows.length) {
      toast.error('Нет проверенных компаний для импорта');
      return;
    }
    setImporting(true);
    try {
      const companies = jsonRowsToCompanies(rows, niche ?? undefined);
      const { created, skipped } = await addCompanies(companies);
      toast.success(`✅ Импортировано ${created.length} компаний в базу`, {
        description: skipped > 0 ? `${skipped} пропущено (дубликаты)` : undefined,
        action: { label: 'Открыть', onClick: () => navigate('/companies') },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  }, [validated, niche, addCompanies, navigate]);

  const handleRetry = useCallback(() => {
    if (!lastUserTextRef.current) return;
    sendMessage(lastUserTextRef.current);
  }, [sendMessage]);

  const pipelineActive = Boolean(runId);
  const pipelineProgress =
    run && run.jobsTotal > 0 ? Math.round((run.jobsDone / run.jobsTotal) * 100) : 0;
  const failedCount = run?.executed.filter((e) => e.status === 'failed').length ?? 0;
  const totalExecuted = run?.executed.length ?? 0;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Left: templates + history */}
      <aside className="hidden w-56 shrink-0 flex-col gap-3 overflow-hidden lg:flex">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Шаблоны
        </p>
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={isSending}
              onClick={() => setInput(t.prompt)}
              className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-accent/30 hover:bg-blue-50/50 disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-foreground">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            История чатов
          </p>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium text-accent hover:bg-blue-50/50"
          >
            <Plus className="h-3 w-3" />
            Новый чат
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">Пока пусто</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSession(s.id)}
                className={cn(
                  'w-full rounded-xl border px-2 py-2 text-left transition',
                  s.id === currentSessionId
                    ? 'border-accent/30 bg-blue-50/60'
                    : 'border-transparent hover:border-border hover:bg-muted/50',
                )}
              >
                <p className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {s.title}
                </p>
                <p className="mt-0.5 truncate pl-5 text-[10px] text-muted-foreground">
                  {s.messageCount} сообщ. · {formatDate(s.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Center: chat */}
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Parser Agent</h1>
              <p className="text-xs text-muted-foreground">
                Локальный агент · парсинг → JSON → Companies
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                online ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  online ? 'bg-emerald-500' : 'bg-muted-foreground',
                )}
              />
              {online ? 'Сессия активна' : 'Подключение…'}
            </span>
            <button
              type="button"
              onClick={reloadHistory}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label="Обновить историю"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loadingHistory && messages.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка истории…
            </div>
          ) : messages.length === 0 && !isSending ? (
            <div className="max-w-[90%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
              Я агент NEEKLO OS. Опиши задачу парсинга — например: «Найти 10 магазинов iPhone
              на Яндекс и 2GIS». Я верну JSON, готовый к импорту в Companies.
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <div
                  className={cn(
                    'max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    m.role === 'user' ? 'ml-auto bg-accent text-white' : 'bg-muted text-foreground',
                  )}
                >
                  {m.content}
                </div>
                {m.action && <ActionCard message={m} state={actionStates[m.id]} onConfirm={handleConfirmAction} onCancel={handleCancelAction} />}
              </div>
            ))
          )}

          {isSending && (
            <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Агент думает…
              </span>
            </div>
          )}

          {pipelineActive && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Workflow className="h-3.5 w-3.5 text-accent" />
                  Пайплайн
                </p>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                    run?.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : run?.status === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-accent',
                  )}
                >
                  {run ? STATUS_LABEL[run.status] : 'Проверка…'}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${run ? pipelineProgress : 5}%` }}
                />
              </div>

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {run
                  ? `${run.currentLabel ?? 'Обработка задач'} · ${run.jobsDone}/${run.jobsTotal}`
                  : 'Запуск задач парсинга…'}
              </p>

              {run?.status === 'failed' && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="flex items-start gap-1.5 text-xs font-medium text-red-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ⚠️ Сервис парсинга сейчас недоступен. {run.error ?? 'Неизвестная ошибка'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={isSending}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Повторить
                  </button>
                </div>
              )}

              {run?.status === 'completed' && (
                <div className="mt-3 border-t border-border pt-3">
                  {failedCount > 0 && (
                    <p className="mb-2 text-[11px] font-medium text-amber-700">
                      {failedCount} из {totalExecuted} источников не ответили
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleImportValidated}
                      disabled={importing || validating || validCount === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {importing || validating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Database className="h-3.5 w-3.5" />
                      )}
                      Проверить и импорт ({validCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowJson((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <Braces className="h-3.5 w-3.5" />
                      {showJson ? 'Скрыть JSON' : 'JSON'}
                    </button>
                    {validated && (
                      <span className="text-[11px] text-muted-foreground">{validated.summary}</span>
                    )}
                  </div>
                </div>
              )}

              {showJson && (
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-2 text-[10px] leading-relaxed text-foreground">
                  {JSON.stringify(jsonPayload, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder="Например: найти 10 магазинов iPhone на Яндекс и 2GIS…"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </section>

      {/* Right: info */}
      <aside className="hidden w-72 shrink-0 flex-col gap-3 xl:flex">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="text-xs leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">Как это работает</p>
              <p className="mt-1">
                Опиши задачу парсинга на русском. Агент спланирует и запустит парсинг, проверит
                результат и покажет кнопку{' '}
                <span className="font-medium text-foreground">«Проверить и импорт»</span> —
                карточки сохранятся в базу.
              </p>
            </div>
          </div>
        </div>

        {currentSessionId && (
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Сессия</p>
            <p className="mt-1 break-all">{currentSessionId}</p>
            {niche && <p className="mt-1">Ниша: {niche}</p>}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={isSending}
              onClick={() => setInput(t.prompt)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium"
            >
              {t.title}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
