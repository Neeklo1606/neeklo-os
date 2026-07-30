import { loadConfig } from '../config.mjs';
import { createOpenRouterClient } from '../openrouter.mjs';
import { createParserClient, isUrlShaped } from '../parser.mjs';
import { classifyIntent } from '../classify-intent.mjs';
import { scoreSignal, urgencyForCategory, recommendedActionForCategory, evidenceFromBreakdown } from '../score-signal.mjs';
import { notifyHotSignal } from '../notify-telegram.mjs';
import { extractAvitoListings, extractArticles } from '../extract-entities.mjs';
import {
  listActiveSources,
  listActiveKeywords,
  isDuplicateSignal,
  isDuplicateSignalByUrl,
  createSignals,
  updateSource,
} from '../radar-db.mjs';

// docs: neekloai.ru runs one sequential queue worker — jobs must run one at
// a time, not in parallel. 2s is the floor between calls regardless of
// source type.
const REQUEST_DELAY_MS = 2000;
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
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../radar-db.mjs').RadarSource} source
 * @param {string[]} keywords
 */
async function checkTelegramSource(parser, source, keywords) {
  const newSignals = [];
  const result = await parser.parseTelegramChannel(source.identifier, {
    limit: 50,
    mode: source.lastItemId ? 'incremental' : 'latest',
    wait: true,
    timeoutMs: 120000,
  });

  const posts = Array.isArray(result?.posts) ? result.posts : [];
  let maxMessageId = typeof source.lastItemId === 'number' ? source.lastItemId : 0;

  for (const post of posts) {
    const messageId = post?.telegram_message_id;
    if (messageId == null) continue;
    if (typeof messageId === 'number' && messageId > maxMessageId) maxMessageId = messageId;

    if (isDuplicateSignal(source.identifier, messageId)) continue;

    const text = String(post?.text ?? post?.rawText ?? '');
    const matchedKeywords = matchKeywords(text, keywords);
    if (matchedKeywords.length === 0) continue;

    newSignals.push({
      channel: source.identifier,
      telegram_message_id: messageId,
      text,
      date: post?.date ?? post?.publishedAt ?? null,
      mediaUrl: post?.mediaUrl ?? null,
      views: typeof post?.views === 'number' ? post.views : null,
      matchedKeywords,
      foundAt: new Date().toISOString(),
      // Public channel posts rarely carry a per-message author (the
      // channel itself is the byline) — left null rather than guessed
      // when the parser doesn't supply one.
      author_name: post?.author ?? post?.authorName ?? null,
      source_name: 'telegram',
    });
  }

  updateSource(source.id, { lastItemId: maxMessageId, lastCheckedAt: new Date().toISOString() });
  return newSignals;
}

/**
 * Avito search pages hit the same degenerate fixed-taxonomy entities every
 * other search-page source does (confirmed live) — structured entities are
 * tried first per the spec anyway, in case the API's response ever stops
 * being degenerate, but in practice the HTML-extraction fallback is what
 * actually produces listings right now.
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {import('../radar-db.mjs').RadarSource} source
 * @param {string[]} keywords
 */
async function checkAvitoSource(parser, openrouter, source, keywords) {
  const newSignals = [];
  const data = await parser.parseUrl(source.identifier, { timeoutMs: 120000 });

  if (data?.fetched === false || data?.error || data?.authRequired) {
    updateSource(source.id, { lastCheckedAt: new Date().toISOString() });
    return newSignals;
  }

  const entities = Array.isArray(data?.entities) ? data.entities : [];
  let listings = entities
    .filter((e) => e?.kind === 'marketplace-product' && typeof e?.fields?.title === 'string' && isUrlShaped(e?.source))
    .map((e) => ({
      title: e.fields.title,
      description: typeof e.fields.description === 'string' ? e.fields.description : null,
      url: e.source,
    }));

  if (listings.length === 0) {
    const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
    listings = rawHtml ? await extractAvitoListings(rawHtml, { niche: source.label ?? '' }, openrouter) : [];
  }

  for (const listing of listings) {
    const url = listing?.url;
    if (!url || isDuplicateSignalByUrl(url)) continue;
    const text = [listing.title, listing.description].filter(Boolean).join('\n').trim();
    if (!text) continue;

    newSignals.push({
      channel: source.identifier,
      source_url: url,
      text,
      date: null,
      matchedKeywords: matchKeywords(text, keywords),
      foundAt: new Date().toISOString(),
      author_name: null,
      source_name: 'avito',
    });
  }

  updateSource(source.id, { lastCheckedAt: new Date().toISOString() });
  return newSignals;
}

/**
 * Shared for vc/habr — both are simple "fetch search URL, extract article
 * cards" sources, just with a different site name for the extraction
 * prompt. Neither had real content to extract when tested live (see
 * extractArticles' own doc comment) — wired up and ready, not confirmed
 * producing signals yet.
 * @param {import('../parser.mjs').ReturnType<typeof import('../parser.mjs').createParserClient>} parser
 * @param {import('../openrouter.mjs').ReturnType<typeof import('../openrouter.mjs').createOpenRouterClient>} openrouter
 * @param {import('../radar-db.mjs').RadarSource} source
 * @param {string[]} keywords
 * @param {string} siteName
 */
async function checkArticleSource(parser, openrouter, source, keywords, siteName) {
  const newSignals = [];
  const data = await parser.parseUrl(source.identifier, { timeoutMs: 120000 });

  if (data?.fetched === false || data?.error || data?.authRequired) {
    updateSource(source.id, { lastCheckedAt: new Date().toISOString() });
    return newSignals;
  }

  const rawHtml = data?.parsed?.source ?? data?.entities?.[0]?.source ?? '';
  const articles = rawHtml ? await extractArticles(rawHtml, { siteName }, openrouter) : [];

  for (const article of articles) {
    const url = article?.url;
    if (!url || isDuplicateSignalByUrl(url)) continue;
    const text = [article.title, article.snippet].filter(Boolean).join('\n').trim();
    if (!text) continue;

    newSignals.push({
      channel: source.identifier,
      source_url: url,
      text,
      date: null,
      matchedKeywords: matchKeywords(text, keywords),
      foundAt: new Date().toISOString(),
      author_name: null,
      source_name: siteName.toLowerCase(),
    });
  }

  updateSource(source.id, { lastCheckedAt: new Date().toISOString() });
  return newSignals;
}

/**
 * Signal Catcher core: polls active sources (Telegram channels, Avito/VC.ru/
 * Habr searches) and records anything that mentions an active keyword
 * phrase (Telegram) or was returned by a keyword-specific search URL
 * (Avito/VC.ru/Habr — the search itself already filters by keyword, so a
 * matchKeywords miss there just means the tag list is empty, not that the
 * signal gets dropped).
 * @param {{ manual?: boolean, sourceTypes?: string[] }} [opts]
 */
export async function runRadarCheck({ manual = false, sourceTypes } = {}) {
  const { parser, openrouter } = getClients();
  const types = sourceTypes ?? ['telegram', 'avito', 'vc', 'habr', 'custom'];
  const sources = listActiveSources().filter((s) => types.includes(s.type));
  const keywords = listActiveKeywords()
    .map((k) => String(k.phrase ?? '').toLowerCase().trim())
    .filter(Boolean);

  console.log(
    `[radar] run start (${manual ? 'manual' : 'scheduled'}, types=${types.join(',')}) — ${sources.length} source(s), ${keywords.length} keyword(s)`,
  );

  const newSignals = [];
  const errors = [];

  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    try {
      let signals;
      switch (source.type) {
        case 'telegram':
          signals = await checkTelegramSource(parser, source, keywords);
          break;
        case 'avito':
          signals = await checkAvitoSource(parser, openrouter, source, keywords);
          break;
        case 'vc':
          signals = await checkArticleSource(parser, openrouter, source, keywords, 'VC.ru');
          break;
        case 'habr':
          signals = await checkArticleSource(parser, openrouter, source, keywords, 'Habr');
          break;
        default:
          signals = [];
      }
      newSignals.push(...signals);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[radar] source "${source.identifier}" (${source.type}) failed:`, message);
      errors.push({ source: source.identifier, type: source.type, error: message });
    }

    if (i < sources.length - 1) {
      await sleep(REQUEST_DELAY_MS);
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
    const aiAnalysis = await classifyIntent(openrouter, signal.text);
    const { score, category, breakdown } = scoreSignal(signal, aiAnalysis);

    signal.aiAnalysis = aiAnalysis;
    signal.aiReason = aiAnalysis.reason;
    signal.signal_score = score;
    signal.category = category;
    signal.breakdown = breakdown;
    signal.urgency = urgencyForCategory(category);
    signal.recommended_action = recommendedActionForCategory(category);
    signal.evidence = evidenceFromBreakdown(breakdown);
    // Category D — archived automatically. Still saved (training data for
    // future scoring tweaks), just excluded from the work queue by status
    // rather than by a separate visibility flag.
    signal.status = category === 'D' ? 'archived' : 'new';

    if (i < toClassify.length - 1) {
      await sleep(CLASSIFY_DELAY_MS);
    }
  }
  // Signals beyond the cap are saved as-is — no aiAnalysis/signal_score,
  // status defaults to 'new' so a human reviews them rather than guessing
  // a score we never actually computed.
  for (const signal of newSignals.slice(MAX_CLASSIFY_PER_RUN)) {
    signal.status = 'new';
  }

  let found = 0;
  if (newSignals.length > 0) {
    const { created } = createSignals(newSignals);
    found = created.length;

    // Hot-signal alerts — only category A, one notification per signal
    // (notifyHotSignal itself is the dedup guard via notifiedAt). Never
    // notify for B/C/D. Runs after createSignals so each signal has its
    // real id for the notified-state write-back.
    for (const signal of created) {
      if (signal.category !== 'A') continue;
      try {
        await notifyHotSignal(signal);
      } catch (err) {
        // notifyHotSignal itself doesn't throw, but this loop must never
        // let one bad signal stop notifying the rest of the batch.
        console.error(`[radar] notifyHotSignal failed for ${signal.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log(`[radar] run done (types=${types.join(',')}) — checked=${sources.length} found=${found} errors=${errors.length}`);
  return { checked: sources.length, found, errors };
}
