import { loadConfig } from '../config.mjs';
import { createOpenRouterClient } from '../openrouter.mjs';
import { createParserClient } from '../parser.mjs';
import { classifyIntent } from '../classify-intent.mjs';
import {
  listActiveChannels,
  listActiveKeywords,
  isDuplicateSignal,
  createSignals,
  updateChannel,
} from '../radar-db.mjs';

const CHANNEL_DELAY_MS = 2000;
const CLASSIFY_DELAY_MS = 500;
const MAX_CLASSIFY_PER_RUN = 50;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Lazily built once and reused across runs — index.mjs's main() has already
// called loadEnvFile() by the time any cron tick or manual trigger fires,
// so process.env is populated and loadConfig() here is safe.
let cachedClients = null;
function getClients() {
  if (!cachedClients) {
    const config = loadConfig();
    const openrouter = createOpenRouterClient(config);
    const parser = createParserClient(config, openrouter);
    cachedClients = { parser, openrouter };
  }
  return cachedClients;
}

/** @param {string} text @param {string[]} keywords */
function matchKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((k) => k && lower.includes(k));
}

/**
 * Signal Catcher core: polls active Telegram channels for new posts and
 * records any that mention an active keyword phrase.
 * @param {{ manual?: boolean }} [opts]
 */
export async function runRadarCheck({ manual = false } = {}) {
  const { parser, openrouter } = getClients();
  const channels = listActiveChannels();
  const keywords = listActiveKeywords()
    .map((k) => String(k.phrase ?? '').toLowerCase().trim())
    .filter(Boolean);

  console.log(`[radar] run start (${manual ? 'manual' : 'scheduled'}) — ${channels.length} channel(s), ${keywords.length} keyword(s)`);

  const newSignals = [];
  const errors = [];

  for (let i = 0; i < channels.length; i += 1) {
    const channel = channels[i];
    try {
      // Docs (NEEKLO_USER_GUIDE.ru.md §4.7): the parser has one sequential
      // queue worker — jobs must run one at a time, not in parallel.
      const result = await parser.parseTelegramChannel(channel.username, {
        limit: 50,
        mode: channel.lastMessageId ? 'incremental' : 'latest',
        wait: true,
        timeoutMs: 120000,
      });

      const posts = Array.isArray(result?.posts) ? result.posts : [];
      let maxMessageId = typeof channel.lastMessageId === 'number' ? channel.lastMessageId : 0;

      for (const post of posts) {
        const messageId = post?.telegram_message_id;
        if (messageId == null) continue;
        if (typeof messageId === 'number' && messageId > maxMessageId) maxMessageId = messageId;

        if (isDuplicateSignal(channel.username, messageId)) continue;

        const text = String(post?.text ?? post?.rawText ?? '');
        const matchedKeywords = matchKeywords(text, keywords);
        if (matchedKeywords.length === 0) continue;

        newSignals.push({
          channel: channel.username,
          telegram_message_id: messageId,
          text,
          date: post?.date ?? post?.publishedAt ?? null,
          mediaUrl: post?.mediaUrl ?? null,
          views: typeof post?.views === 'number' ? post.views : null,
          matchedKeywords,
          foundAt: new Date().toISOString(),
        });
      }

      updateChannel(channel.id, { lastMessageId: maxMessageId, lastCheckedAt: new Date().toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[radar] channel "${channel.username}" failed:`, message);
      errors.push({ channel: channel.username, error: message });
    }

    if (i < channels.length - 1) {
      await sleep(CHANNEL_DELAY_MS);
    }
  }

  // Intent classification — only for signals that already matched a keyword
  // (newSignals is exactly that set; nothing else gets classified). Capped
  // to bound LLM cost if a keyword turns out too broad for one run.
  let toClassify = newSignals;
  if (newSignals.length > MAX_CLASSIFY_PER_RUN) {
    console.warn(
      `[radar] ${newSignals.length} signals matched this run — classifying only the first ${MAX_CLASSIFY_PER_RUN}, rest saved unclassified (status='new') to avoid runaway LLM cost`,
    );
    toClassify = newSignals.slice(0, MAX_CLASSIFY_PER_RUN);
  }

  for (let i = 0; i < toClassify.length; i += 1) {
    const signal = toClassify[i];
    const { intent, reason } = await classifyIntent(openrouter, signal.text);
    signal.aiIntent = intent;
    signal.aiReason = reason;
    signal.status = intent === 'no' ? 'irrelevant' : 'new';

    if (i < toClassify.length - 1) {
      await sleep(CLASSIFY_DELAY_MS);
    }
  }
  // Signals beyond the cap are saved as-is — no aiIntent/aiReason, status
  // defaults to 'new' so a human reviews them rather than guessing intent
  // we never actually computed.
  for (const signal of newSignals.slice(MAX_CLASSIFY_PER_RUN)) {
    signal.status = 'new';
  }

  let found = 0;
  if (newSignals.length > 0) {
    const { created } = createSignals(newSignals);
    found = created.length;
  }

  console.log(`[radar] run done — checked=${channels.length} found=${found} errors=${errors.length}`);
  return { checked: channels.length, found, errors };
}
