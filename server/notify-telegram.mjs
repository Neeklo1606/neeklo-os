import { loadConfig } from './config.mjs';
import { createOpenRouterClient } from './openrouter.mjs';
import { updateSignal } from './radar-db.mjs';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

// Generic per-solution-type description — distinct from verticals.mjs's
// productArchetype (which is scoped to the CLIENT's business vertical, e.g.
// "dealer cabinet" for manufacturers). This is scoped to what the signal
// itself asked for, since that's what "productArchetype по типу запроса"
// means at notification time — we usually don't know the author's vertical
// yet, only what they said they need.
const PRODUCT_ARCHETYPE_BY_SOLUTION_TYPE = {
  платформа: 'Платформа под конкретный процесс — без лишних модулей и настройки под чужой шаблон',
  crm: 'CRM с воронкой, напоминаниями и историей по каждому клиенту',
  бот: 'Telegram-бот для приёма заявок и общения с клиентами без потери лидов',
  сайт: 'Сайт с формой заявки, аналитикой и без размытого УТП',
  кабинет: 'Личный кабинет с персональными ценами и историей заказов',
  каталог: 'Онлайн-каталог с быстрым поиском, фильтрами и актуальными остатками',
  бронирование: 'Онлайн-бронирование с календарём занятости и оплатой',
  автоматизация: 'Автоматизация рутинных процессов между уже используемыми системами',
};
const DEFAULT_PRODUCT_ARCHETYPE = 'Решение под конкретную задачу — обсудим детали в переписке';

let cachedOpenrouter = null;
function getOpenrouter() {
  if (!cachedOpenrouter) {
    cachedOpenrouter = createOpenRouterClient(loadConfig());
  }
  return cachedOpenrouter;
}

/** @param {string} value */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Never throws — a failed notification is a logged non-event, not a reason
 * to break the radar-check run that triggered it.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.error('[notify-telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured — skipping send');
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      console.error('[notify-telegram] sendMessage rejected:', data?.description ?? res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notify-telegram] sendMessage failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

const DRAFT_PROMPT = (signal) => `Напиши черновик первого сообщения автору этого поста в Telegram-чате.

Принципы (строго соблюдать):
- Не продавать сайт/бот/CRM/AI в первом сообщении
- Начинать с наблюдаемого факта из его сообщения, не с представления себя
- Формулировать как гипотезу, не как обвинение или диагноз
- В конце — ровно один квалифицирующий вопрос
- Без давления и без ложной срочности
- До 350 символов, обычный текст, без кавычек и markdown

Сообщение автора: «${signal.text}»

Ответь только текстом черновика, без пояснений.`;

/** @param {{ text?: string }} signal */
async function draftReply(signal) {
  try {
    const { content } = await getOpenrouter().chat(
      [{ role: 'user', content: DRAFT_PROMPT(signal) }],
      { temperature: 0.3, systemPrompt: null },
    );
    return content.trim().slice(0, 350);
  } catch (err) {
    console.error('[notify-telegram] draft reply failed:', err instanceof Error ? err.message : err);
    return '';
  }
}

const MSK_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** @param {string | null | undefined} iso */
export function formatMsk(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${MSK_FORMATTER.format(date)} МСК`;
}

/** @param {{ criterion: string, points: number, matched: boolean }[] | undefined} breakdown */
function topCriteria(breakdown) {
  if (!Array.isArray(breakdown)) return '—';
  const top = breakdown
    .filter((r) => r.matched)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((r) => r.criterion);
  return top.length > 0 ? top.join(', ') : '—';
}

/**
 * @param {import('./radar-db.mjs').RadarSignal} signal
 * @param {{ name?: string } | null} company
 * @param {string} messageDraft
 */
function buildHotSignalMessage(signal, company, messageDraft) {
  const solutionType = signal.aiAnalysis?.solutionType;
  const header = solutionType ?? 'запрос на исполнителя';
  const authorLine = company?.name || signal.author_name || `@${signal.channel}`;
  const sourceLine = signal.source_name ?? 'telegram';
  const messageLink = `https://t.me/${signal.channel}/${signal.telegram_message_id}`;
  const productArchetype = PRODUCT_ARCHETYPE_BY_SOLUTION_TYPE[solutionType] ?? DEFAULT_PRODUCT_ARCHETYPE;
  const signalText = String(signal.text ?? '').slice(0, 500);

  return [
    `🔥 <b>Горячий сигнал: ${escapeHtml(header)}</b>`,
    '',
    `Компания / автор: ${escapeHtml(authorLine)}`,
    `Источник: ${escapeHtml(sourceLine)}`,
    `Дата: ${formatMsk(signal.date ?? signal.foundAt)}`,
    `Оценка: <b>${signal.signal_score ?? 0}</b>/100`,
    `Почему релевантно: ${escapeHtml(topCriteria(signal.breakdown))}`,
    '',
    'Суть запроса:',
    `«${escapeHtml(signalText)}»`,
    '',
    'Что можем предложить:',
    escapeHtml(productArchetype),
    '',
    `<a href="${messageLink}">Открыть источник</a>`,
    '',
    'Черновик ответа:',
    `«${escapeHtml(messageDraft)}»`,
  ].join('\n');
}

/**
 * Sends the hot-signal Telegram alert for a category-A signal — a no-op
 * (returns false) for any other category or if this signal was already
 * notified. Persisting notifiedAt is best-effort: a signal that isn't a
 * real persisted record yet (e.g. the test-notification route) still
 * sends the message, it just can't mark itself as notified afterward.
 * @param {import('./radar-db.mjs').RadarSignal} signal
 * @param {{ name?: string } | null} [company]
 * @returns {Promise<boolean>}
 */
export async function notifyHotSignal(signal, company = null) {
  if (signal?.category !== 'A') return false;
  if (signal?.notifiedAt) return false;

  const messageDraft = await draftReply(signal);
  const text = buildHotSignalMessage(signal, company, messageDraft);
  const sent = await sendTelegramMessage(text);

  if (sent && signal?.id) {
    try {
      updateSignal(signal.id, { notifiedAt: new Date().toISOString() });
    } catch (err) {
      // Signal not in the store (e.g. a synthetic test signal) — the
      // notification itself still went out, nothing to roll back.
      console.error('[notify-telegram] could not persist notifiedAt:', err instanceof Error ? err.message : err);
    }
  }

  return sent;
}
