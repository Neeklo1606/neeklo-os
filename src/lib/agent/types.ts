export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface PlannedJob {
  label: string;
  body: Record<string, unknown>;
}

export interface ExecutedJob {
  label: string;
  jobId: string;
  status: string;
  source?: string;
  result?: ParserJobResult;
  error?: string;
}

export interface ParserJobResult {
  mode?: string;
  answer?: string;
  pages?: ParserPage[];
  count?: number;
  durationMs?: number;
  source?: string;
}

export interface ParserPage {
  url?: string;
  finalUrl?: string;
  ok?: boolean;
  blocked?: boolean;
  error?: string;
  data?: unknown;
  textPreview?: string;
  title?: string;
}

export interface AgentChatResponse {
  success: boolean;
  message: string;
  jobs: PlannedJob[];
  autoRun: boolean;
  niche?: string | null;
  runId?: string | null;
  executed?: ExecutedJob[];
  error?: string;
}

export interface RunPlanStatus {
  id: string;
  status: 'running' | 'completed' | 'failed';
  jobsTotal: number;
  jobsDone: number;
  executed: ExecutedJob[];
  niche?: string | null;
  error?: string | null;
  currentLabel?: string | null;
}

export type ParseSource = '2gis' | 'yandex' | 'telegram' | 'instagram' | 'rusprofile' | 'avito' | 'manual';

export interface ParserHealth {
  success?: boolean;
  cdp?: boolean;
  modes?: string[];
  service?: string;
}

export interface ExtractedOrg {
  name: string;
  address?: string;
  city?: string;
  phones: string[];
  emails: string[];
  website?: string;
  cardUrl?: string;
  rating?: number;
  reviewCount?: number;
  source?: ParseSource;
  niche?: string;
}

export interface ValidateOrgsResponse {
  success: boolean;
  summary: string;
  items: Array<{
    index: number;
    valid: boolean;
    confidence: number;
    issues: string[];
    normalized?: Record<string, unknown>;
  }>;
}

export interface AgentTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

export interface AgentSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  executed: ExecutedJob[];
  plannedJobs: PlannedJob[];
  niche: string | null;
  lastUserQuery: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  messageCount: number;
  orgCount: number;
  niche: string | null;
  createdAt: string;
  updatedAt: string;
}

export const AGENT_WELCOME =
  'Я агент NEEKLO OS. Опиши задачу — например: «Найти 10 компаний по продаже iPhone на Яндекс и 2GIS». Я спланирую парсинг, проверю данные и помогу создать карточки в Companies.';

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'site-contacts',
    title: 'Контакты с сайта',
    description: 'URL → телефоны, email, услуги',
    prompt: 'Спарси контакты и услуги с указанного сайта — name, phones[], emails[], website',
  },
  {
    id: 'maps-iphone',
    title: 'iPhone — Яндекс + 2GIS',
    description: '10 магазинов → карточки Companies',
    prompt:
      'Найти 10 компаний которые занимаются продажей iPhone в Москве на Яндекс Картах и 2GIS. Собери name, address, phones, website, rating и создай карточки компаний.',
  },
  {
    id: 'maps-search',
    title: 'Карты — поиск',
    description: 'Яндекс Карты, список org',
    prompt:
      'Найди 5 стоматологий в Москве на Яндекс Картах: name, address, rating, card_url (yandex.ru/maps/org/...)',
  },
  {
    id: 'maps-phones',
    title: 'Карты — телефоны',
    description: '2 шага: поиск + карточки',
    prompt:
      'Найди 5 стоматологий Москва с телефонами: сначала поиск на Яндекс Картах, потом открой карточки org и собери phones[]',
  },
  {
    id: 'wb',
    title: 'Wildberries',
    description: 'Товары по запросу',
    prompt: 'Спарси 20 ноутбуков на Wildberries по запросу «ноутбук», limit 20',
  },
  {
    id: 'telegram',
    title: 'Telegram канал',
    description: 'Последние посты',
    prompt: 'Спарси последние 30 постов указанного Telegram-канала',
  },
  {
    id: 'research',
    title: 'Research',
    description: 'Автопоиск без URL',
    prompt: 'Исследуй рынок CRM для стоматологий в России — 5 ключевых игроков с сайтами',
  },
];
