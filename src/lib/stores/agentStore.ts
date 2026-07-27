import { create } from 'zustand';
import type { AgentSession, AgentSessionSummary, ChatMessage, ExecutedJob, PlannedJob } from '../agent/types';
import {
  createAgentSession,
  deleteAgentSession,
  fetchAgentSession,
  fetchAgentSessions,
  updateAgentSession,
} from '../agent/api';

interface AgentStoreState {
  sessions: AgentSessionSummary[];
  activeSession: AgentSession | null;
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  ensureActiveSession: () => Promise<AgentSession>;
  selectSession: (id: string) => Promise<void>;
  createSession: () => Promise<AgentSession>;
  removeSession: (id: string) => Promise<void>;
  saveSession: (partial: {
    messages?: ChatMessage[];
    executed?: ExecutedJob[];
    plannedJobs?: PlannedJob[];
    niche?: string | null;
    lastUserQuery?: string;
  }) => Promise<void>;
}

export const useAgentStore = create<AgentStoreState>()((set, get) => ({
  sessions: [],
  activeSession: null,
  loading: false,
  hydrated: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null });
    try {
      const { sessions } = await fetchAgentSessions();
      set({ sessions, loading: false, hydrated: true });
    } catch (e) {
      set({
        loading: false,
        hydrated: true,
        error: e instanceof Error ? e.message : 'Failed to load agent sessions',
      });
    }
  },

  ensureActiveSession: async () => {
    const { activeSession, fetchSessions, createSession, selectSession } = get();
    if (activeSession) return activeSession;

    if (!get().hydrated) await fetchSessions();
    const list = get().sessions;
    if (list.length > 0) {
      await selectSession(list[0].id);
      const session = get().activeSession;
      if (session) return session;
    }
    return createSession();
  },

  selectSession: async (id) => {
    set({ loading: true, error: null });
    try {
      const { session } = await fetchAgentSession(id);
      set({ activeSession: session, loading: false });
      await get().fetchSessions();
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load session',
      });
      throw e;
    }
  },

  createSession: async () => {
    const { session } = await createAgentSession();
    set({ activeSession: session });
    await get().fetchSessions();
    return session;
  },

  removeSession: async (id) => {
    await deleteAgentSession(id);
    const { activeSession, sessions } = get();
    const wasActive = activeSession?.id === id;
    const remaining = sessions.filter((s) => s.id !== id);
    set({ sessions: remaining, activeSession: wasActive ? null : activeSession });
    if (wasActive) {
      if (remaining.length > 0) {
        await get().selectSession(remaining[0].id);
      } else {
        await get().createSession();
      }
    } else {
      await get().fetchSessions();
    }
  },

  saveSession: async (partial) => {
    const { activeSession } = get();
    if (!activeSession) return;
    const { session } = await updateAgentSession(activeSession.id, partial);
    set({ activeSession: session });
    await get().fetchSessions();
  },
}));
